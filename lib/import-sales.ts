import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { syncSalesMaster } from "./sync-sales-master";

const REQUIRED_HEADERS = [
  "site_code",
  "site_desc",
  "sales_name",
  "order_date",
  "brand_name",
  "article_description",
  "quantity",
  "total_nett_amount_exc_tax",
  "cat",
] as const;

const INSERT_CHUNK_SIZE = 2_500;

export class ImportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportValidationError";
  }
}

const INDONESIAN_MONTHS: Record<string, number> = {
  JANUARI: 1,
  FEBRUARI: 2,
  MARET: 3,
  APRIL: 4,
  MEI: 5,
  JUNI: 6,
  JULI: 7,
  AGUSTUS: 8,
  SEPTEMBER: 9,
  OKTOBER: 10,
  NOVEMBER: 11,
  DESEMBER: 12,
};

type SheetRow = unknown[];
type TransactionInput = Omit<
  Prisma.SalesTransactionCreateManyInput,
  "importBatchId"
>;

export type ReportConfig = {
  categoryTargets: Record<string, Record<string, number>>;
  brandTargets: Record<string, Record<string, number>>;
  operatorTargets: Record<string, Record<string, number>>;
  racingTargets: Record<
    string,
    Record<string, { quantity?: number; amount?: number }>
  >;
};

export type ImportResult = {
  batchId: number | null;
  fileName: string;
  detectedType: "master" | "report";
  readRows: number;
  insertedRows: number;
  duplicateRows: number;
  stores: number;
  periodStart: string | null;
  periodEnd: string | null;
  report: { storeCode: string; month: number; year: number } | null;
};

function textValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("result" in value) return textValue(value.result);
    if ("text" in value) return String(value.text);
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText
        .map((part) =>
          typeof part === "object" && part && "text" in part
            ? String(part.text)
            : "",
        )
        .join("");
    }
  }
  return String(value).trim();
}

function numberValue(value: unknown): number {
  if (typeof value === "object" && value && "result" in value) {
    return numberValue(value.result);
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = textValue(value)
    .replace(/\s/g, "")
    .replace(/[^0-9,.-]/g, "")
    .replace(/,(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateValue(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + value * 86_400_000);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const raw = textValue(value);
  const dmy = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  const parsed = dmy
    ? new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])))
    : new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeHeader(value: unknown) {
  return textValue(value)
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s./-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function requiredNumber(value: unknown): number | null {
  if (typeof value === "object" && value && "result" in value) {
    return requiredNumber(value.result);
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = textValue(value);
  if (!raw) return null;
  const normalized = raw
    .replace(/\s/g, "")
    .replace(/[^0-9,.-]/g, "")
    .replace(/,(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCsv(source: string): SheetRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === "," || char === ";" || char === "\t") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  if (value || row.length) {
    row.push(value.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

async function readXlsxSheets(buffer: Buffer) {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(buffer), {
    worksheets: "emit",
    sharedStrings: "cache",
    hyperlinks: "ignore",
    styles: "ignore",
    entries: "ignore",
  });
  let firstRows: SheetRow[] | null = null;
  let masterRows: SheetRow[] | null = null;
  let targetRows: SheetRow[] | null = null;

  for await (const sheet of reader) {
    const name = String((sheet as unknown as { name?: string }).name || "")
      .trim()
      .toUpperCase();
    const shouldRead = !firstRows || name === "MASTER" || name === "TARGET";
    if (!shouldRead) continue;
    const rows: SheetRow[] = [];
    for await (const row of sheet) {
      if (!row.hasValues) continue;
      const values: unknown[] = [];
      for (let column = 1; column <= row.cellCount; column += 1) {
        values.push(row.getCell(column).value);
      }
      rows.push(values);
    }
    firstRows ||= rows;
    if (name === "MASTER") masterRows = rows;
    if (name === "TARGET") targetRows = rows;
  }

  return { masterRows: masterRows || firstRows, targetRows };
}

export function transactionRows(rows: SheetRow[]): TransactionInput[] {
  if (!rows.length) throw new ImportValidationError("File tidak memiliki baris data.");
  const headers = rows[0].map(normalizeHeader);
  const column = new Map(headers.map((header, index) => [header, index]));
  const missing = REQUIRED_HEADERS.filter((header) => !column.has(header));
  if (missing.length) {
    throw new ImportValidationError(
      `Kolom wajib tidak ditemukan pada baris pertama sheet MASTER: ${missing.join(", ")}. Unduh template agar nama kolom sesuai.`,
    );
  }

  const get = (row: SheetRow, name: string) => row[column.get(name) ?? -1];
  const occurrences = new Map<string, number>();
  const output: TransactionInput[] = [];
  const invalidRows: string[] = [];
  let invalidCount = 0;

  for (const [index, row] of rows.slice(1).entries()) {
    if (row.every((value) => !textValue(value))) continue;
    const excelRow = index + 2;
    const orderDate = dateValue(get(row, "order_date"));
    const siteCode = textValue(get(row, "site_code"));
    const siteDesc = textValue(get(row, "site_desc"));
    const salesName = textValue(get(row, "sales_name"));
    const brandName = textValue(get(row, "brand_name"));
    const articleDescription = textValue(get(row, "article_description"));
    const category = textValue(get(row, "cat"));
    const quantity = requiredNumber(get(row, "quantity"));
    const nettExcTax = requiredNumber(get(row, "total_nett_amount_exc_tax"));
    const issues = [
      !siteCode && "site_code kosong",
      !siteDesc && "site_desc kosong",
      !salesName && "sales_name kosong",
      !orderDate && "order_date tidak valid",
      !brandName && "brand_name kosong",
      !articleDescription && "article_description kosong",
      quantity === null && "quantity bukan angka",
      nettExcTax === null && "total_nett_amount_exc_tax bukan angka",
      !category && "CAT kosong",
    ].filter(Boolean);
    if (issues.length) {
      invalidCount += 1;
      if (invalidRows.length < 8) {
        invalidRows.push(`baris ${excelRow}: ${issues.join(", ")}`);
      }
      continue;
    }

    const stableValues = headers.map((header) => textValue(get(row, header)));
    const base = createHash("sha256")
      .update(JSON.stringify(stableValues))
      .digest("hex");
    const occurrence = (occurrences.get(base) || 0) + 1;
    occurrences.set(base, occurrence);
    const fingerprint = createHash("sha256")
      .update(`${base}:${occurrence}`)
      .digest("hex");

    output.push({
      fingerprint,
      salesOrg: textValue(get(row, "sales_org")) || null,
      salesOrgDesc: textValue(get(row, "sales_org_desc")) || null,
      siteCode,
      siteDesc,
      salesCode: textValue(get(row, "sales_code")) || null,
      salesName,
      posNumber: textValue(get(row, "pos_number")) || null,
      orderDate: orderDate!,
      week: numberValue(get(row, "week")) || null,
      itemGroup: textValue(get(row, "item_group")) || null,
      itemGroupDesc: textValue(get(row, "item_group_desc")) || null,
      brandName,
      articleCode: textValue(get(row, "article_code")) || null,
      articleDescription,
      quantity: Math.round(quantity!),
      price: numberValue(get(row, "price")),
      discount: numberValue(get(row, "discount")),
      totalNettAmountWithTax: numberValue(
        get(row, "total_nett_amount_with_tax"),
      ),
      totalNettAmountExcTax: nettExcTax!,
      category,
      category2: textValue(get(row, "cat_2")) || null,
      businessUnit: textValue(get(row, "bu_desc")) || null,
      salesLeader: textValue(get(row, "sl")) || null,
      territorySalesHead: textValue(get(row, "tsh")) || null,
    });
  }

  if (invalidCount) {
    const remaining = invalidCount - invalidRows.length;
    throw new ImportValidationError(
      `${invalidCount} baris data tidak valid. ${invalidRows.join("; ")}${remaining > 0 ? `; dan ${remaining} baris lainnya` : ""}. Tidak ada data yang disimpan.`,
    );
  }

  if (!output.length) {
    throw new ImportValidationError("Tidak ada transaksi valid yang dapat diimpor.");
  }
  return output;
}

function cell(rows: SheetRow[], row: number, column: number) {
  return rows[row - 1]?.[column - 1];
}

function targetMap(
  rows: SheetRow[],
  salesRows: number[],
  salesColumn: number,
  definitions: Array<{ key: string; column: number }>,
) {
  const result: Record<string, Record<string, number>> = {};
  for (const row of salesRows) {
    const sales = textValue(cell(rows, row, salesColumn));
    if (!sales || /total/i.test(sales)) continue;
    result[sales] = {};
    for (const definition of definitions) {
      result[sales][definition.key] = numberValue(
        cell(rows, row, definition.column),
      );
    }
  }
  return result;
}

function extractReport(
  target: SheetRow[] | null,
  master: SheetRow[],
  fileName: string,
): {
  storeCode: string;
  storeName: string;
  month: number;
  year: number;
  sourceFile: string;
  config: ReportConfig;
} | null {
  if (!target) return null;
  const title = textValue(cell(target, 1, 1)).toUpperCase();
  const storeCode = title.match(/\b[A-Z]\d{3}\b/)?.[0] || "M221";
  const year = Number(title.match(/\b20\d{2}\b/)?.[0] || 0);
  const month =
    Object.entries(INDONESIAN_MONTHS).find(([name]) => title.includes(name))?.[1] ||
    0;
  if (!month || !year) {
    throw new ImportValidationError(
      "Periode pada judul sheet TARGET tidak dapat dikenali. Cantumkan nama bulan Indonesia dan tahun, misalnya AGUSTUS 2026.",
    );
  }

  let storeName = `ERAFONE & MORE ${storeCode}`;
  for (let row = 2; row <= master.length; row += 1) {
    if (textValue(cell(master, row, 3)).toUpperCase() === storeCode) {
      storeName = textValue(cell(master, row, 4)) || storeName;
      break;
    }
  }

  const categoryTargets = targetMap(target, [3, 4, 5, 6], 1, [
    { key: "ACC & IOT", column: 2 },
    { key: "CARRIER", column: 3 },
    { key: "CE", column: 4 },
    { key: "DEVICE", column: 5 },
    { key: "LAPTOP", column: 6 },
    { key: "REPAIR CONTRACT", column: 7 },
  ]);

  const brandTargets: Record<string, Record<string, number>> = {};
  for (let column = 13; column <= 16; column += 1) {
    const sales = textValue(cell(target, 1, column));
    if (!sales) continue;
    brandTargets[sales] = {};
    for (let row = 2; row <= 13; row += 1) {
      const brand = textValue(cell(target, row, 12)).toUpperCase();
      if (!brand || /GRAND|TOTAL/.test(brand)) continue;
      brandTargets[sales][brand] = numberValue(cell(target, row, column));
    }
  }

  const operatorTargets: Record<string, Record<string, number>> = {};
  const operatorDefinitions = [
    { rows: [12, 13, 14, 15], salesColumn: 5, valueColumn: 6, key: "INDOSAT" },
    { rows: [19, 20, 21, 22], salesColumn: 5, valueColumn: 6, key: "TELKOMSEL" },
    { rows: [26, 27, 28, 29], salesColumn: 5, valueColumn: 6, key: "XL PRIO" },
  ];
  for (const definition of operatorDefinitions) {
    for (const row of definition.rows) {
      const sales = textValue(cell(target, row, definition.salesColumn));
      if (!sales) continue;
      operatorTargets[sales] ||= {};
      operatorTargets[sales][definition.key] = numberValue(
        cell(target, row, definition.valueColumn),
      );
    }
  }

  const racingTargets: ReportConfig["racingTargets"] = {};
  for (const row of [11, 12, 13, 14]) {
    const sales = textValue(cell(target, row, 1));
    if (!sales) continue;
    racingTargets[sales] = {
      CAMON_50: { quantity: numberValue(cell(target, row, 2)) },
      POVA_8: { quantity: numberValue(cell(target, row, 3)) },
    };
  }
  for (const row of [19, 20, 21, 22]) {
    const sales = textValue(cell(target, row, 1));
    if (!sales) continue;
    racingTargets[sales] ||= {};
    racingTargets[sales].MEDPOIN = {
      amount: numberValue(cell(target, row, 2)),
      quantity: numberValue(cell(target, row, 3)),
    };
  }
  for (const row of [26, 27, 28, 29]) {
    const sales = textValue(cell(target, row, 1));
    if (!sales) continue;
    racingTargets[sales] ||= {};
    racingTargets[sales].OPPO = { amount: numberValue(cell(target, row, 2)) };
  }

  return {
    storeCode,
    storeName,
    month,
    year,
    sourceFile: fileName,
    config: { categoryTargets, brandTargets, operatorTargets, racingTargets },
  };
}

export async function importSalesBuffer(buffer: Buffer, fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (!extension || !["xlsx", "csv"].includes(extension)) {
    throw new ImportValidationError("Format file harus .xlsx atau .csv.");
  }

  let transactions: TransactionInput[];
  let report: ReturnType<typeof extractReport> = null;

  if (extension === "xlsx") {
    let sheets: Awaited<ReturnType<typeof readXlsxSheets>>;
    try {
      sheets = await readXlsxSheets(buffer);
    } catch {
      throw new ImportValidationError(
        "File Excel rusak, memakai password, atau bukan workbook .xlsx yang valid.",
      );
    }
    if (!sheets.masterRows) {
      throw new ImportValidationError("Sheet MASTER tidak ditemukan.");
    }
    transactions = transactionRows(sheets.masterRows);
    report = extractReport(sheets.targetRows, sheets.masterRows, fileName);
  } else {
    transactions = transactionRows(parseCsv(buffer.toString("utf8")));
  }

  const dates = transactions.map((row) => new Date(row.orderDate).getTime());
  const periodStart = new Date(Math.min(...dates));
  const periodEnd = new Date(Math.max(...dates));
  const persisted = await prisma.$transaction(
    async (database) => {
      const existingReport = report
        ? await database.reportDataset.findUnique({
            where: {
              storeCode_month_year: {
                storeCode: report.storeCode,
                month: report.month,
                year: report.year,
              },
            },
            select: { id: true },
          })
        : null;
      const batch = await database.importBatch.create({
        data: {
          fileName,
          fileType: extension,
          rowCount: transactions.length,
          insertedCount: 0,
          periodStart,
          periodEnd,
        },
      });

      let insertedRows = 0;
      for (let index = 0; index < transactions.length; index += INSERT_CHUNK_SIZE) {
        const inserted = await database.salesTransaction.createMany({
          data: transactions
            .slice(index, index + INSERT_CHUNK_SIZE)
            .map((row) => ({ ...row, importBatchId: batch.id })),
          skipDuplicates: true,
        });
        insertedRows += inserted.count;
      }

      await syncSalesMaster(transactions, database);

      if (report) {
        if (!insertedRows && existingReport) {
          await database.reportDataset.update({
            where: { id: existingReport.id },
            data: {
              storeName: report.storeName,
              sourceFile: report.sourceFile,
              config: report.config as Prisma.InputJsonValue,
            },
          });
        } else {
          await database.reportDataset.upsert({
            where: {
              storeCode_month_year: {
                storeCode: report.storeCode,
                month: report.month,
                year: report.year,
              },
            },
            create: {
              ...report,
              config: report.config as Prisma.InputJsonValue,
              importBatchId: batch.id,
            },
            update: {
              ...report,
              config: report.config as Prisma.InputJsonValue,
              importBatchId: batch.id,
            },
          });
        }
      }

      if (!insertedRows && (!report || existingReport)) {
        await database.importBatch.delete({ where: { id: batch.id } });
        return { batchId: null, insertedRows };
      }

      await database.importBatch.update({
        where: { id: batch.id },
        data: { insertedCount: insertedRows },
      });
      return { batchId: batch.id, insertedRows };
    },
    { maxWait: 10_000, timeout: 120_000 },
  );

  const result: ImportResult = {
    batchId: persisted.batchId,
    fileName,
    detectedType: report ? "report" : "master",
    readRows: transactions.length,
    insertedRows: persisted.insertedRows,
    duplicateRows: transactions.length - persisted.insertedRows,
    stores: new Set(transactions.map((row) => row.siteCode)).size,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    report: report
      ? { storeCode: report.storeCode, month: report.month, year: report.year }
      : null,
  };
  return result;
}
