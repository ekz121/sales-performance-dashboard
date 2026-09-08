import { createHash } from "node:crypto";
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
  batchId: number;
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
    .toLowerCase();
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

function worksheetRows(sheet: ExcelJS.Worksheet): SheetRow[] {
  const rows: SheetRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: unknown[] = [];
    for (let column = 1; column <= sheet.columnCount; column += 1) {
      values.push(row.getCell(column).value);
    }
    rows.push(values);
  });
  return rows;
}

function transactionRows(rows: SheetRow[]): TransactionInput[] {
  if (!rows.length) throw new Error("File tidak memiliki baris data.");
  const headers = rows[0].map(normalizeHeader);
  const column = new Map(headers.map((header, index) => [header, index]));
  const missing = REQUIRED_HEADERS.filter((header) => !column.has(header));
  if (missing.length) {
    throw new Error(`Kolom wajib tidak ditemukan: ${missing.join(", ")}.`);
  }

  const get = (row: SheetRow, name: string) => row[column.get(name) ?? -1];
  const occurrences = new Map<string, number>();
  const output: TransactionInput[] = [];

  for (const row of rows.slice(1)) {
    const orderDate = dateValue(get(row, "order_date"));
    const siteCode = textValue(get(row, "site_code"));
    const siteDesc = textValue(get(row, "site_desc"));
    const salesName = textValue(get(row, "sales_name"));
    if (!orderDate || !siteCode || !siteDesc || !salesName) continue;

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
      orderDate,
      week: numberValue(get(row, "week")) || null,
      itemGroup: textValue(get(row, "item_group")) || null,
      itemGroupDesc: textValue(get(row, "item_group_desc")) || null,
      brandName: textValue(get(row, "brand_name")) || "TANPA BRAND",
      articleCode: textValue(get(row, "article_code")) || null,
      articleDescription:
        textValue(get(row, "article_description")) || "Tanpa deskripsi",
      quantity: Math.round(numberValue(get(row, "quantity"))),
      price: numberValue(get(row, "price")),
      discount: numberValue(get(row, "discount")),
      totalNettAmountWithTax: numberValue(
        get(row, "total_nett_amount_with_tax"),
      ),
      totalNettAmountExcTax: numberValue(
        get(row, "total_nett_amount_exc_tax"),
      ),
      category: textValue(get(row, "cat")) || "OTHER",
      category2: textValue(get(row, "cat 2")) || null,
      businessUnit: textValue(get(row, "bu desc")) || null,
      salesLeader: textValue(get(row, "sl")) || null,
      territorySalesHead: textValue(get(row, "tsh")) || null,
    });
  }

  if (!output.length) {
    throw new Error("Tidak ada transaksi valid yang dapat diimpor.");
  }
  return output;
}

function cell(sheet: ExcelJS.Worksheet, row: number, column: number) {
  return sheet.getRow(row).getCell(column).value;
}

function targetMap(
  sheet: ExcelJS.Worksheet,
  salesRows: number[],
  salesColumn: number,
  definitions: Array<{ key: string; column: number }>,
) {
  const result: Record<string, Record<string, number>> = {};
  for (const row of salesRows) {
    const sales = textValue(cell(sheet, row, salesColumn));
    if (!sales || /total/i.test(sales)) continue;
    result[sales] = {};
    for (const definition of definitions) {
      result[sales][definition.key] = numberValue(
        cell(sheet, row, definition.column),
      );
    }
  }
  return result;
}

function extractReport(
  workbook: ExcelJS.Workbook,
  fileName: string,
): {
  storeCode: string;
  storeName: string;
  month: number;
  year: number;
  sourceFile: string;
  config: ReportConfig;
} | null {
  const target = workbook.getWorksheet("TARGET");
  if (!target) return null;
  const title = textValue(cell(target, 1, 1)).toUpperCase();
  const storeCode = title.match(/\b[A-Z]\d{3}\b/)?.[0] || "M221";
  const year = Number(title.match(/\b20\d{2}\b/)?.[0] || 0);
  const month =
    Object.entries(INDONESIAN_MONTHS).find(([name]) => title.includes(name))?.[1] ||
    0;
  if (!month || !year) {
    throw new Error("Periode pada sheet TARGET tidak dapat dikenali.");
  }

  const master = workbook.getWorksheet("MASTER");
  let storeName = `ERAFONE & MORE ${storeCode}`;
  if (master) {
    for (let row = 2; row <= master.rowCount; row += 1) {
      if (textValue(cell(master, row, 3)).toUpperCase() === storeCode) {
        storeName = textValue(cell(master, row, 4)) || storeName;
        break;
      }
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
    throw new Error("Format file harus .xlsx atau .csv.");
  }

  let transactions: TransactionInput[];
  let report: ReturnType<typeof extractReport> = null;

  if (extension === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Uint8Array.from(buffer).buffer);
    const master = workbook.getWorksheet("MASTER") || workbook.worksheets[0];
    if (!master) throw new Error("Sheet MASTER tidak ditemukan.");
    transactions = transactionRows(worksheetRows(master));
    report = extractReport(workbook, fileName);
  } else {
    transactions = transactionRows(parseCsv(buffer.toString("utf8")));
  }

  const dates = transactions.map((row) => new Date(row.orderDate).getTime());
  const periodStart = new Date(Math.min(...dates));
  const periodEnd = new Date(Math.max(...dates));
  const batch = await prisma.importBatch.create({
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
  for (let index = 0; index < transactions.length; index += 500) {
    const result = await prisma.salesTransaction.createMany({
      data: transactions.slice(index, index + 500).map((row) => ({
        ...row,
        importBatchId: batch.id,
      })),
      skipDuplicates: true,
    });
    insertedRows += result.count;
  }

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: { insertedCount: insertedRows },
  });

  if (report) {
    await prisma.reportDataset.upsert({
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

  const result: ImportResult = {
    batchId: batch.id,
    fileName,
    detectedType: report ? "report" : "master",
    readRows: transactions.length,
    insertedRows,
    duplicateRows: transactions.length - insertedRows,
    stores: new Set(transactions.map((row) => row.siteCode)).size,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    report: report
      ? { storeCode: report.storeCode, month: report.month, year: report.year }
      : null,
  };
  return result;
}
