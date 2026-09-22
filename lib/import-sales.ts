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

export type RacingDefinition = {
  key: string;
  label: string;
  unit: "qty" | "amount";
  brandIncludes?: string[];
  articleIncludes?: string[];
  category?: string;
  minUnitAmount?: number;
  amountSource?: "net" | "gross";
};

export type ReportConfig = {
  categoryTargets: Record<string, Record<string, number>>;
  brandTargets: Record<string, Record<string, number>>;
  operatorTargets: Record<string, Record<string, number>>;
  racingTargets: Record<
    string,
    Record<string, { quantity?: number; amount?: number }>
  >;
  racingDefinitions?: RacingDefinition[];
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
  sourceSheet: string;
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

function headerRowIndex(rows: SheetRow[]) {
  for (let index = 0; index < Math.min(rows.length, 30); index += 1) {
    const headers = new Set(rows[index].map(normalizeHeader));
    if (REQUIRED_HEADERS.every((header) => headers.has(header))) return index;
  }
  return -1;
}

async function readXlsxSheets(buffer: Buffer) {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(buffer), {
    worksheets: "emit",
    sharedStrings: "cache",
    hyperlinks: "ignore",
    styles: "ignore",
    entries: "ignore",
  });
  const sheets = new Map<string, { name: string; rows: SheetRow[] }>();

  for await (const sheet of reader) {
    const originalName = String((sheet as unknown as { name?: string }).name || "").trim();
    const name = originalName.toUpperCase();
    const rows: SheetRow[] = [];
    for await (const row of sheet) {
      if (!row.hasValues) continue;
      const values: unknown[] = [];
      for (let column = 1; column <= row.cellCount; column += 1) {
        values.push(row.getCell(column).value);
      }
      rows.push(values);
    }
    sheets.set(name, { name: originalName || name, rows });
  }

  const transactionSheets = Array.from(sheets.values()).filter(
    ({ rows }) => headerRowIndex(rows) >= 0,
  );
  const selected = sheets.get("MASTER") || transactionSheets.sort(
    (left, right) => right.rows.length - left.rows.length,
  )[0];
  return {
    masterRows: selected?.rows || null,
    sourceSheet: selected?.name || "",
    targetRows: sheets.get("TARGET")?.rows || null,
    racingConfigRows: sheets.get("RACING_CONFIG")?.rows || null,
  };
}

export function transactionRows(rows: SheetRow[]): TransactionInput[] {
  if (!rows.length) throw new ImportValidationError("File tidak memiliki baris data.");
  const headerIndex = headerRowIndex(rows);
  if (headerIndex < 0) {
    throw new ImportValidationError(
      `Kolom wajib tidak ditemukan pada 30 baris pertama: ${REQUIRED_HEADERS.join(", ")}. Unduh template agar nama kolom sesuai.`,
    );
  }
  const headers = rows[headerIndex].map(normalizeHeader);
  const column = new Map(headers.map((header, index) => [header, index]));
  const missing = REQUIRED_HEADERS.filter((header) => !column.has(header));
  if (missing.length) {
    throw new ImportValidationError(
      `Kolom wajib tidak ditemukan: ${missing.join(", ")}. Unduh template agar nama kolom sesuai.`,
    );
  }

  const get = (row: SheetRow, name: string) => row[column.get(name) ?? -1];
  const occurrences = new Map<string, number>();
  const output: TransactionInput[] = [];
  const invalidRows: string[] = [];
  let invalidCount = 0;

  for (const [index, row] of rows.slice(headerIndex + 1).entries()) {
    if (row.every((value) => !textValue(value))) continue;
    const excelRow = index + headerIndex + 2;
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

    // Fingerprint memakai identitas transaksi, bukan jumlah/urutan kolom workbook.
    // Dengan begitu baris yang sama pada MASTER regional dan report store tetap
    // dikenali sebagai duplikat walaupun salah satu file memiliki kolom tambahan.
    const stableValues = [
      siteCode,
      textValue(get(row, "sales_code")),
      salesName,
      textValue(get(row, "pos_number")),
      orderDate!.toISOString(),
      brandName,
      textValue(get(row, "article_code")),
      articleDescription,
      quantity,
      numberValue(get(row, "price")),
      numberValue(get(row, "discount")),
      numberValue(get(row, "total_nett_amount_with_tax")),
      nettExcTax,
      category,
    ];
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

function upper(value: unknown) {
  return textValue(value).trim().toUpperCase();
}

function keyValue(value: string) {
  return value.replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function transactionSales(master: SheetRow[]) {
  const headerIndex = headerRowIndex(master);
  if (headerIndex < 0) return new Set<string>();
  const headers = master[headerIndex].map(normalizeHeader);
  const salesColumn = headers.indexOf("sales_name");
  return new Set(
    master.slice(headerIndex + 1).map((row) => textValue(row[salesColumn]).trim()).filter(Boolean),
  );
}

function extractCategoryTargets(target: SheetRow[]) {
  const keys = ["ACC & IOT", "CARRIER", "CE", "DEVICE", "LAPTOP", "REPAIR CONTRACT"];
  const headerIndex = target.findIndex((row) => {
    const values = row.map(upper);
    return values[0] === "SALES NAME" && keys.filter((key) => values.includes(key)).length >= 3;
  });
  const result: ReportConfig["categoryTargets"] = {};
  if (headerIndex < 0) return result;
  const headers = target[headerIndex].map(upper);
  for (let index = headerIndex + 1; index < target.length; index += 1) {
    const sales = textValue(target[index][0]).trim();
    if (!sales || /TOTAL/i.test(sales)) break;
    result[sales] = {};
    for (const key of keys) {
      const column = headers.indexOf(key);
      if (column >= 0) result[sales][key] = numberValue(target[index][column]);
    }
  }
  return result;
}

function extractBrandTargets(target: SheetRow[]) {
  const result: ReportConfig["brandTargets"] = {};
  for (let rowIndex = 0; rowIndex < target.length; rowIndex += 1) {
    const labelColumn = target[rowIndex].findIndex((value) => upper(value) === "LABEL BARIS");
    if (labelColumn < 0) continue;
    const salesColumns = target[rowIndex]
      .map((value, column) => ({ sales: textValue(value).trim(), column }))
      .filter(({ sales, column }) => column > labelColumn && sales);
    for (const { sales } of salesColumns) result[sales] = {};
    for (let index = rowIndex + 1; index < target.length; index += 1) {
      const brand = upper(target[index][labelColumn]);
      if (!brand || /GRAND|TOTAL/.test(brand)) break;
      for (const { sales, column } of salesColumns) {
        result[sales][brand] = numberValue(target[index][column]);
      }
    }
    break;
  }
  return result;
}

function extractOperatorTargets(target: SheetRow[]) {
  const result: ReportConfig["operatorTargets"] = {};
  const operatorNames: Record<string, string> = {
    ISAT: "INDOSAT",
    INDOSAT: "INDOSAT",
    TELKOMSEL: "TELKOMSEL",
    "XL PRIO": "XL PRIO",
  };
  for (let rowIndex = 0; rowIndex < target.length; rowIndex += 1) {
    for (let column = 0; column < target[rowIndex].length; column += 1) {
      const title = upper(target[rowIndex][column]);
      const matched = Object.entries(operatorNames).find(([name]) => title === `TARGET ${name}`);
      if (!matched || upper(target[rowIndex + 1]?.[column]) !== "SALES NAME") continue;
      const key = matched[1];
      for (let index = rowIndex + 2; index < target.length; index += 1) {
        const sales = textValue(target[index][column]).trim();
        if (!sales || /TOTAL/i.test(sales)) break;
        result[sales] ||= {};
        result[sales][key] = numberValue(target[index][column + 1]);
      }
    }
  }
  return result;
}

function racingDefinition(
  program: string,
  header: string,
  unit: "qty" | "amount",
): RacingDefinition {
  const name = upper(header);
  if (program.includes("TECNO") && name.includes("CAMON")) {
    return { key: "CAMON_50", label: "Tecno Camon 50", unit: "qty", brandIncludes: ["TECNO"], articleIncludes: ["CAMON 50"] };
  }
  if (program.includes("TECNO") && name.includes("POVA")) {
    return { key: "POVA_8", label: "Tecno Pova 8", unit: "qty", brandIncludes: ["TECNO"], articleIncludes: ["POVA 8"] };
  }
  if (program.includes("VIVO") && name.replace(/\s/g, "").includes("ALLTYPE")) {
    return { key: "VIVO_ALL_TYPE", label: "Vivo All Type", unit: "qty", brandIncludes: ["VIVO"], category: "DEVICE" };
  }
  if (program.includes("VIVO") && /3\s*JT/.test(name)) {
    return { key: "VIVO_3JT_UP", label: "Vivo 3 Juta ke Atas", unit: "qty", brandIncludes: ["VIVO"], category: "DEVICE", minUnitAmount: 3_000_000 };
  }
  if (program.includes("MEDPOIN")) {
    return { key: "MEDPOIN", label: "Medpoint Booster", unit: "amount", brandIncludes: ["MEDPOIN"], amountSource: "gross" };
  }
  if (program.includes("OPPO") && name.includes("RENO")) {
    return { key: "OPPO_RENO_16", label: "OPPO Reno 16", unit: "qty", brandIncludes: ["OPPO"], articleIncludes: ["RENO 16"] };
  }
  if (program.includes("OPPO") && name.includes("IOT")) {
    return { key: "OPPO_IOT", label: "OPPO IoT", unit: "qty", brandIncludes: ["OPPO"], category: "ACC & IOT" };
  }
  if (program.includes("OPPO")) {
    return { key: "OPPO_ALL_TYPE", label: "OPPO All Type", unit, brandIncludes: ["OPPO"], category: "DEVICE" };
  }
  const cleanProgram = program.replace(/^TARGET\s+(?:RACING\s+)?/, "").trim();
  const cleanHeader = name.replace(/^TARGET\s+/, "").trim();
  return {
    key: keyValue(`${cleanProgram}_${cleanHeader}`),
    label: `${cleanProgram} ${cleanHeader}`.trim(),
    unit,
    brandIncludes: cleanProgram ? [cleanProgram.split(/\s+/).at(-1)!] : undefined,
  };
}

function parseExplicitRacing(rows: SheetRow[] | null) {
  if (!rows?.length) return null;
  const index = rows.findIndex((row) => row.map(normalizeHeader).includes("racing_key"));
  if (index < 0) return null;
  const headers = rows[index].map(normalizeHeader);
  const column = (name: string) => headers.indexOf(name);
  const targets: ReportConfig["racingTargets"] = {};
  const definitions = new Map<string, RacingDefinition>();
  const list = (value: unknown) => textValue(value).split(/[|;,]/).map((item) => item.trim().toUpperCase()).filter(Boolean);
  for (const row of rows.slice(index + 1)) {
    const key = keyValue(upper(row[column("racing_key")]));
    if (!key) continue;
    const primary = upper(row[column("primary_unit")]) === "AMOUNT" ? "amount" : "qty";
    definitions.set(key, {
      key,
      label: textValue(row[column("label")]) || key.replace(/_/g, " "),
      unit: primary,
      brandIncludes: list(row[column("brand_match")]),
      articleIncludes: list(row[column("article_match")]),
      category: upper(row[column("category_match")]) || undefined,
      minUnitAmount: numberValue(row[column("min_unit_amount")]) || undefined,
      amountSource: upper(row[column("amount_source")]) === "GROSS" ? "gross" : "net",
    });
    const sales = textValue(row[column("sales_name")]).trim();
    if (!sales) continue;
    targets[sales] ||= {};
    targets[sales][key] ||= {};
    const quantity = requiredNumber(row[column("target_quantity")]);
    const amount = requiredNumber(row[column("target_amount")]);
    if (quantity !== null) targets[sales][key].quantity = quantity;
    if (amount !== null) targets[sales][key].amount = amount;
  }
  return definitions.size ? { targets, definitions: Array.from(definitions.values()) } : null;
}

function extractRacing(target: SheetRow[], master: SheetRow[], explicitRows: SheetRow[] | null) {
  const explicit = parseExplicitRacing(explicitRows);
  if (explicit) return explicit;
  const targets: ReportConfig["racingTargets"] = {};
  const definitions = new Map<string, RacingDefinition>();
  const knownSales = transactionSales(master);
  for (let titleIndex = 0; titleIndex < target.length; titleIndex += 1) {
    const program = upper(target[titleIndex][0]);
    if (!/^TARGET\s+(?:RACING\s+)?(?:TECNO|VIVO|MEDPOIN|(?:FBE\s+)?OPPO)\b/.test(program)) continue;
    let headerIndex = titleIndex + 1;
    while (headerIndex < Math.min(target.length, titleIndex + 4)
      && !/SALES NAME|TARGET STORE/.test(upper(target[headerIndex][0]))) headerIndex += 1;
    if (headerIndex >= target.length || headerIndex >= titleIndex + 4) continue;
    const headers = target[headerIndex];
    for (let dataIndex = headerIndex + 1; dataIndex < target.length; dataIndex += 1) {
      const sales = textValue(target[dataIndex][0]).trim();
      if (!sales || /TOTAL|TARGET/i.test(sales)) break;
      if (knownSales.size && !knownSales.has(sales)) continue;
      for (let column = 1; column < headers.length; column += 1) {
        let heading = upper(headers[column]);
        // Header target MEDPOIN B:C memakai merged cell. Streaming Excel dapat
        // mengembalikan kolom C kosong walaupun nilainya berisi target quantity.
        if (!heading && program.includes("MEDPOIN") && column === 2) {
          heading = upper(headers[1]);
        }
        // Setiap blok Racing pada report dipisahkan oleh kolom kosong. Jangan
        // menyeberang ke blok operator/brand lain yang kebetulan satu baris.
        if (!heading) break;
        const value = requiredNumber(target[dataIndex][column]);
        if (value === null) continue;
        let unit: "qty" | "amount" = /AMT|AMOUNT/.test(heading) || value >= 100_000 ? "amount" : "qty";
        if (program.includes("MEDPOIN")) unit = column === 1 ? "amount" : "qty";
        const definition = racingDefinition(program, heading, unit);
        const existing = definitions.get(definition.key);
        definitions.set(definition.key, existing && existing.unit === "amount" ? existing : definition);
        targets[sales] ||= {};
        targets[sales][definition.key] ||= {};
        targets[sales][definition.key][unit === "qty" ? "quantity" : "amount"] = value;
      }
    }
  }
  return { targets, definitions: Array.from(definitions.values()) };
}

export function extractReport(
  target: SheetRow[] | null,
  master: SheetRow[],
  fileName: string,
  racingConfigRows: SheetRow[] | null = null,
): {
  storeCode: string;
  storeName: string;
  month: number;
  year: number;
  sourceFile: string;
  config: ReportConfig;
} | null {
  if (!target) return null;
  const title = target.slice(0, 5).flat().map(upper).find((value) => value.includes("TARGET ALL CAT")) || upper(cell(target, 1, 1));
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
  const masterHeader = headerRowIndex(master);
  if (masterHeader >= 0) {
    const headers = master[masterHeader].map(normalizeHeader);
    const codeColumn = headers.indexOf("site_code");
    const nameColumn = headers.indexOf("site_desc");
    const match = master.slice(masterHeader + 1).find((row) => upper(row[codeColumn]) === storeCode);
    if (match) storeName = textValue(match[nameColumn]) || storeName;
  }

  const categoryTargets = extractCategoryTargets(target);
  const brandTargets = extractBrandTargets(target);
  const operatorTargets = extractOperatorTargets(target);
  const racing = extractRacing(target, master, racingConfigRows);

  return {
    storeCode,
    storeName,
    month,
    year,
    sourceFile: fileName,
    config: {
      categoryTargets,
      brandTargets,
      operatorTargets,
      racingTargets: racing.targets,
      racingDefinitions: racing.definitions,
    },
  };
}

export async function importSalesBuffer(buffer: Buffer, fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (!extension || !["xlsx", "csv"].includes(extension)) {
    throw new ImportValidationError("Format file harus .xlsx atau .csv.");
  }

  let transactions: TransactionInput[];
  let report: ReturnType<typeof extractReport> = null;
  let sourceSheet = "CSV";

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
      throw new ImportValidationError(
        "Tidak ditemukan sheet berisi 9 kolom wajib transaksi. Nama sheet boleh apa saja; gunakan template untuk susunan header yang didukung.",
      );
    }
    sourceSheet = sheets.sourceSheet;
    transactions = transactionRows(sheets.masterRows);
    report = extractReport(
      sheets.targetRows,
      sheets.masterRows,
      fileName,
      sheets.racingConfigRows,
    );
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
    sourceSheet,
    report: report
      ? { storeCode: report.storeCode, month: report.month, year: report.year }
      : null,
  };
  return result;
}
