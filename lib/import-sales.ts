import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { syncSalesMaster } from "./sync-sales-master";

export const REQUIRED_HEADERS = [
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

export const OPTIONAL_HEADERS = [
  "sales_org",
  "sales_org_desc",
  "sales_code",
  "pos_number",
  "week",
  "item_group",
  "item_group_desc",
  "article_code",
  "price",
  "discount",
  "total_nett_amount_with_tax",
  "cat_2",
  "bu_desc",
  "sl",
  "tsh",
] as const;

export type ImportField = (typeof REQUIRED_HEADERS)[number] | (typeof OPTIONAL_HEADERS)[number];
export type HeaderMapping = Partial<Record<ImportField, string>>;
export type ImportMode = "append" | "replace_range";

export type ImportOptions = {
  mapping?: HeaderMapping;
  sheetName?: string;
  headerRow?: number;
  mode?: ImportMode;
  saveProfile?: boolean;
};

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
  importMode: ImportMode;
  replacedRows: number;
  totalQuantity: number;
  totalNettAmount: number;
  report: { storeCode: string; month: number; year: number } | null;
};

export type ImportPreview = {
  fileName: string;
  sourceSheet: string;
  sheets: string[];
  headerRow: number;
  headers: string[];
  mapping: HeaderMapping;
  requiredFields: Array<{ key: (typeof REQUIRED_HEADERS)[number]; label: string }>;
  missingFields: string[];
  ready: boolean;
  validationError: string | null;
  readRows: number;
  duplicateRows: number;
  stores: number;
  periodStart: string | null;
  periodEnd: string | null;
  totalQuantity: number;
  totalNettAmount: number;
  dateGaps: string[];
  detectedType: "master" | "report";
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

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  site_code: "Kode store/site",
  site_desc: "Nama store/site",
  sales_name: "Nama sales",
  order_date: "Tanggal transaksi",
  brand_name: "Nama brand",
  article_description: "Deskripsi produk/artikel",
  quantity: "Quantity",
  total_nett_amount_exc_tax: "Net sales sebelum pajak",
  cat: "Kategori",
  sales_org: "Sales organization",
  sales_org_desc: "Nama sales organization",
  sales_code: "Kode sales",
  pos_number: "Nomor transaksi/POS",
  week: "Minggu",
  item_group: "Grup produk",
  item_group_desc: "Nama grup produk",
  article_code: "Kode artikel",
  price: "Harga",
  discount: "Diskon",
  total_nett_amount_with_tax: "Net sales termasuk pajak",
  cat_2: "Kategori 2",
  bu_desc: "Business unit",
  sl: "Sales leader",
  tsh: "Territory sales head",
};

const HEADER_ALIASES: Record<ImportField, string[]> = {
  site_code: ["site_code", "site", "kode_site", "store_code", "kode_store", "outlet_code", "kode_outlet", "branch_code"],
  site_desc: ["site_desc", "site_description", "nama_site", "store_name", "nama_store", "outlet_name", "nama_outlet", "branch_name"],
  sales_name: ["sales_name", "nama_sales", "sales", "salesperson", "sales_person", "promotor", "nama_promotor"],
  order_date: ["order_date", "tanggal_order", "transaction_date", "tanggal_transaksi", "sales_date", "tanggal", "date"],
  brand_name: ["brand_name", "nama_brand", "brand", "merk", "merek"],
  article_description: ["article_description", "article_desc", "deskripsi_artikel", "product_description", "product_name", "nama_produk", "artikel", "produk"],
  quantity: ["quantity", "qty", "jumlah", "unit", "sales_qty", "quantity_sold"],
  total_nett_amount_exc_tax: ["total_nett_amount_exc_tax", "total_net_amount_exc_tax", "nett_exc_tax", "net_exc_tax", "net_sales", "nett_sales", "sales_amount", "amount_exc_tax", "dpp"],
  cat: ["cat", "category", "kategori", "main_category", "kategori_utama"],
  sales_org: ["sales_org", "sales_organization"],
  sales_org_desc: ["sales_org_desc", "sales_organization_desc"],
  sales_code: ["sales_code", "kode_sales", "sales_id", "nik_sales"],
  pos_number: ["pos_number", "pos_no", "nomor_pos", "transaction_number", "nomor_transaksi", "receipt_number", "nomor_nota", "order_number"],
  week: ["week", "minggu", "week_number"],
  item_group: ["item_group", "product_group", "grup_produk"],
  item_group_desc: ["item_group_desc", "item_group_description", "nama_grup_produk"],
  article_code: ["article_code", "kode_artikel", "product_code", "sku", "sku_code"],
  price: ["price", "harga", "unit_price"],
  discount: ["discount", "diskon", "disc"],
  total_nett_amount_with_tax: ["total_nett_amount_with_tax", "total_net_amount_with_tax", "nett_with_tax", "gross_sales", "amount_with_tax"],
  cat_2: ["cat_2", "category_2", "kategori_2", "subcategory", "sub_category"],
  bu_desc: ["bu_desc", "business_unit", "business_unit_desc"],
  sl: ["sl", "sales_leader", "leader"],
  tsh: ["tsh", "territory_sales_head"],
};

const ALIAS_TO_FIELD = new Map<string, ImportField>();
for (const field of [...REQUIRED_HEADERS, ...OPTIONAL_HEADERS]) {
  for (const alias of HEADER_ALIASES[field]) ALIAS_TO_FIELD.set(normalizeHeader(alias), field);
}

function canonicalHeader(value: unknown, mapping: HeaderMapping = {}): string {
  const normalized = normalizeHeader(value);
  const mapped = Object.entries(mapping).find(([, source]) => normalizeHeader(source) === normalized)?.[0];
  return mapped || ALIAS_TO_FIELD.get(normalized) || normalized;
}

function bestHeaderRow(rows: SheetRow[], mapping: HeaderMapping = {}) {
  let best = { index: -1, score: -1, density: 0 };
  for (let index = 0; index < Math.min(rows.length, 100); index += 1) {
    const headers = new Set(rows[index].map((value) => canonicalHeader(value, mapping)));
    const score = REQUIRED_HEADERS.filter((header) => headers.has(header)).length;
    const density = rows[index].filter((value) => textValue(value)).length;
    if (score > best.score || (score === best.score && density > best.density)) {
      best = { index, score, density };
    }
    if (score === REQUIRED_HEADERS.length) return { index, score, density };
  }
  return best;
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

function headerRowIndex(rows: SheetRow[], mapping: HeaderMapping = {}, preferredRow?: number) {
  if (preferredRow && preferredRow >= 1 && preferredRow <= rows.length) {
    const headers = new Set(rows[preferredRow - 1].map((value) => canonicalHeader(value, mapping)));
    if (REQUIRED_HEADERS.every((header) => headers.has(header))) return preferredRow - 1;
  }
  const best = bestHeaderRow(rows, mapping);
  return best.score === REQUIRED_HEADERS.length ? best.index : -1;
}

async function readXlsxSheets(buffer: Buffer, options: ImportOptions = {}) {
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

  const candidates = Array.from(sheets.values()).map((sheet) => ({
    ...sheet,
    ...bestHeaderRow(sheet.rows, options.mapping),
  }));
  const requested = options.sheetName
    ? candidates.find((sheet) => sheet.name.toUpperCase() === options.sheetName!.trim().toUpperCase())
    : null;
  const complete = candidates.filter((sheet) => sheet.score === REQUIRED_HEADERS.length);
  const selected = requested || sheets.get("MASTER") || complete.sort(
    (left, right) => right.rows.length - left.rows.length,
  )[0] || candidates.sort((left, right) => right.score - left.score || right.rows.length - left.rows.length)[0];
  const selectedHeader = selected
    ? (options.headerRow ? options.headerRow - 1 : bestHeaderRow(selected.rows, options.mapping).index)
    : -1;
  return {
    masterRows: selected?.rows || null,
    sourceSheet: selected?.name || "",
    sheets: candidates.map((sheet) => sheet.name),
    headerRow: selectedHeader,
    headers: selectedHeader >= 0 ? selected!.rows[selectedHeader].map(textValue) : [],
    targetRows: sheets.get("TARGET")?.rows || null,
    racingConfigRows: sheets.get("RACING_CONFIG")?.rows || null,
  };
}

export function transactionRows(
  rows: SheetRow[],
  mapping: HeaderMapping = {},
  preferredHeaderRow?: number,
): TransactionInput[] {
  if (!rows.length) throw new ImportValidationError("File tidak memiliki baris data.");
  const headerIndex = headerRowIndex(rows, mapping, preferredHeaderRow);
  if (headerIndex < 0) {
    throw new ImportValidationError(
      `Kolom wajib belum lengkap pada 100 baris pertama: ${REQUIRED_HEADERS.join(", ")}. Gunakan pemetaan kolom di halaman import.`,
    );
  }
  const headers = rows[headerIndex].map((value) => canonicalHeader(value, mapping));
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

function transactionSales(master: SheetRow[], mapping: HeaderMapping = {}) {
  const headerIndex = headerRowIndex(master, mapping);
  if (headerIndex < 0) return new Set<string>();
  const headers = master[headerIndex].map((value) => canonicalHeader(value, mapping));
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

function extractRacing(
  target: SheetRow[],
  master: SheetRow[],
  explicitRows: SheetRow[] | null,
  mapping: HeaderMapping = {},
) {
  const explicit = parseExplicitRacing(explicitRows);
  if (explicit) return explicit;
  const targets: ReportConfig["racingTargets"] = {};
  const definitions = new Map<string, RacingDefinition>();
  const knownSales = transactionSales(master, mapping);
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
  mapping: HeaderMapping = {},
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
  const masterHeader = headerRowIndex(master, mapping);
  if (masterHeader >= 0) {
    const headers = master[masterHeader].map((value) => canonicalHeader(value, mapping));
    const codeColumn = headers.indexOf("site_code");
    const nameColumn = headers.indexOf("site_desc");
    const match = master.slice(masterHeader + 1).find((row) => upper(row[codeColumn]) === storeCode);
    if (match) storeName = textValue(match[nameColumn]) || storeName;
  }

  const categoryTargets = extractCategoryTargets(target);
  const brandTargets = extractBrandTargets(target);
  const operatorTargets = extractOperatorTargets(target);
  const racing = extractRacing(target, master, racingConfigRows, mapping);

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

type ParsedImport = {
  extension: "xlsx" | "csv";
  transactions: TransactionInput[];
  report: ReturnType<typeof extractReport>;
  sourceSheet: string;
  sheets: string[];
  headerRow: number;
  headers: string[];
  mapping: HeaderMapping;
  signature: string;
};

function suggestedMapping(headers: string[], supplied: HeaderMapping = {}): HeaderMapping {
  const result: HeaderMapping = { ...supplied };
  for (const raw of headers) {
    const field = ALIAS_TO_FIELD.get(normalizeHeader(raw));
    if (field && !result[field]) result[field] = raw;
  }
  return result;
}

function mappingSignature(headers: string[]) {
  return createHash("sha256")
    .update(JSON.stringify(headers.map(normalizeHeader)))
    .digest("hex");
}

async function inspectSource(buffer: Buffer, fileName: string, options: ImportOptions = {}) {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (!extension || !["xlsx", "csv"].includes(extension)) {
    throw new ImportValidationError("Format file harus .xlsx atau .csv.");
  }

  if (extension === "xlsx") {
    let sheets: Awaited<ReturnType<typeof readXlsxSheets>>;
    try {
      sheets = await readXlsxSheets(buffer, options);
    } catch {
      throw new ImportValidationError(
        "File Excel rusak, memakai password, atau bukan workbook .xlsx yang valid.",
      );
    }
    if (!sheets.masterRows) {
      throw new ImportValidationError(
        "Workbook tidak memiliki sheet yang dapat dibaca.",
      );
    }
    return {
      extension: extension as "xlsx",
      rows: sheets.masterRows,
      targetRows: sheets.targetRows,
      racingConfigRows: sheets.racingConfigRows,
      sourceSheet: sheets.sourceSheet,
      sheets: sheets.sheets,
      headerRow: sheets.headerRow + 1,
      headers: sheets.headers,
    };
  }

  const rows = parseCsv(buffer.toString("utf8"));
  const best = bestHeaderRow(rows, options.mapping);
  const headerIndex = options.headerRow ? options.headerRow - 1 : best.index;
  return {
    extension: extension as "csv",
    rows,
    targetRows: null,
    racingConfigRows: null,
    sourceSheet: "CSV",
    sheets: ["CSV"],
    headerRow: headerIndex + 1,
    headers: headerIndex >= 0 ? rows[headerIndex].map(textValue) : [],
  };
}

async function parseImport(
  buffer: Buffer,
  fileName: string,
  options: ImportOptions = {},
): Promise<ParsedImport> {
  let inspected = await inspectSource(buffer, fileName, options);
  let signature = mappingSignature(inspected.headers);
  let mapping = suggestedMapping(inspected.headers, options.mapping);

  if (!options.mapping || !Object.keys(options.mapping).length) {
    const profile = await prisma.importProfile.findUnique({ where: { signature } });
    if (profile) {
      const profileMapping = profile.mapping as HeaderMapping;
      inspected = await inspectSource(buffer, fileName, {
        ...options,
        mapping: profileMapping,
        sheetName: profile.sheetName || options.sheetName,
        headerRow: profile.headerRow || options.headerRow,
      });
      signature = mappingSignature(inspected.headers);
      mapping = suggestedMapping(inspected.headers, profileMapping);
    }
  }

  const transactions = transactionRows(inspected.rows, mapping, inspected.headerRow);
  const report = extractReport(
    inspected.targetRows,
    inspected.rows,
    fileName,
    inspected.racingConfigRows,
    mapping,
  );
  return {
    extension: inspected.extension,
    transactions,
    report,
    sourceSheet: inspected.sourceSheet,
    sheets: inspected.sheets,
    headerRow: inspected.headerRow,
    headers: inspected.headers,
    mapping,
    signature,
  };
}

async function existingFingerprints(transactions: TransactionInput[]) {
  const existing = new Set<string>();
  for (let index = 0; index < transactions.length; index += INSERT_CHUNK_SIZE) {
    const rows = await prisma.salesTransaction.findMany({
      where: { fingerprint: { in: transactions.slice(index, index + INSERT_CHUNK_SIZE).map((row) => row.fingerprint) } },
      select: { fingerprint: true },
    });
    for (const row of rows) existing.add(row.fingerprint);
  }
  return existing;
}

function transactionSummary(transactions: TransactionInput[]) {
  const timestamps = transactions.map((row) => new Date(row.orderDate).getTime());
  const periodStart = new Date(Math.min(...timestamps));
  const periodEnd = new Date(Math.max(...timestamps));
  const dates = new Set(transactions.map((row) => new Date(row.orderDate).toISOString().slice(0, 10)));
  const gaps: string[] = [];
  for (let cursor = periodStart.getTime(); cursor <= periodEnd.getTime(); cursor += 86_400_000) {
    const date = new Date(cursor).toISOString().slice(0, 10);
    if (!dates.has(date)) gaps.push(date);
  }
  return {
    periodStart,
    periodEnd,
    stores: new Set(transactions.map((row) => row.siteCode)).size,
    totalQuantity: transactions.reduce((sum, row) => sum + Number(row.quantity), 0),
    totalNettAmount: transactions.reduce((sum, row) => sum + Number(row.totalNettAmountExcTax), 0),
    dateGaps: gaps.slice(0, 31),
  };
}

export async function previewSalesBuffer(
  buffer: Buffer,
  fileName: string,
  options: ImportOptions = {},
): Promise<ImportPreview> {
  const inspected = await inspectSource(buffer, fileName, options);
  const signature = mappingSignature(inspected.headers);
  const profile = !options.mapping || !Object.keys(options.mapping).length
    ? await prisma.importProfile.findUnique({ where: { signature } })
    : null;
  const mapping = suggestedMapping(
    inspected.headers,
    options.mapping || (profile?.mapping as HeaderMapping | undefined) || {},
  );
  const missingFields = REQUIRED_HEADERS.filter((field) => !mapping[field]);
  const base = {
    fileName,
    sourceSheet: inspected.sourceSheet,
    sheets: inspected.sheets,
    headerRow: inspected.headerRow,
    headers: inspected.headers,
    mapping,
    requiredFields: REQUIRED_HEADERS.map((key) => ({ key, label: IMPORT_FIELD_LABELS[key] })),
    missingFields,
  };
  if (missingFields.length) {
    return {
      ...base,
      ready: false,
      validationError: "Petakan seluruh kolom wajib sebelum melanjutkan.",
      readRows: 0,
      duplicateRows: 0,
      stores: 0,
      periodStart: null,
      periodEnd: null,
      totalQuantity: 0,
      totalNettAmount: 0,
      dateGaps: [],
      detectedType: "master",
      report: null,
    };
  }
  try {
    const parsed = await parseImport(buffer, fileName, { ...options, mapping });
    const summary = transactionSummary(parsed.transactions);
    const existing = await existingFingerprints(parsed.transactions);
    return {
      ...base,
      sourceSheet: parsed.sourceSheet,
      headerRow: parsed.headerRow,
      mapping: parsed.mapping,
      ready: true,
      validationError: null,
      readRows: parsed.transactions.length,
      duplicateRows: existing.size,
      stores: summary.stores,
      periodStart: summary.periodStart.toISOString(),
      periodEnd: summary.periodEnd.toISOString(),
      totalQuantity: summary.totalQuantity,
      totalNettAmount: summary.totalNettAmount,
      dateGaps: summary.dateGaps,
      detectedType: parsed.report ? "report" : "master",
      report: parsed.report
        ? { storeCode: parsed.report.storeCode, month: parsed.report.month, year: parsed.report.year }
        : null,
    };
  } catch (error) {
    return {
      ...base,
      ready: false,
      validationError: error instanceof Error ? error.message : "File belum dapat divalidasi.",
      readRows: 0,
      duplicateRows: 0,
      stores: 0,
      periodStart: null,
      periodEnd: null,
      totalQuantity: 0,
      totalNettAmount: 0,
      dateGaps: [],
      detectedType: "master",
      report: null,
    };
  }
}

export async function importSalesBuffer(
  buffer: Buffer,
  fileName: string,
  options: ImportOptions = {},
) {
  const parsed = await parseImport(buffer, fileName, options);
  const { transactions, report, sourceSheet, extension } = parsed;
  const summary = transactionSummary(transactions);
  const { periodStart, periodEnd, totalQuantity, totalNettAmount } = summary;
  const mode: ImportMode = options.mode === "replace_range" ? "replace_range" : "append";

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
          })
        : null;
      const profile = options.saveProfile === false
        ? null
        : await database.importProfile.upsert({
            where: { signature: parsed.signature },
            create: {
              signature: parsed.signature,
              name: fileName.replace(/\.[^.]+$/, ""),
              sheetName: sourceSheet,
              headerRow: parsed.headerRow,
              mapping: parsed.mapping as Prisma.InputJsonValue,
            },
            update: {
              name: fileName.replace(/\.[^.]+$/, ""),
              sheetName: sourceSheet,
              headerRow: parsed.headerRow,
              mapping: parsed.mapping as Prisma.InputJsonValue,
            },
          });

      const batch = await database.importBatch.create({
        data: {
          fileName,
          fileType: extension,
          rowCount: transactions.length,
          insertedCount: 0,
          duplicateCount: 0,
          importMode: mode,
          totalQuantity,
          totalNettAmount,
          periodStart,
          periodEnd,
          profileId: profile?.id,
        },
      });

      let replacedRows = 0;
      let replacedBackup: unknown[] = [];
      if (mode === "replace_range") {
        const scopes = new Map<string, { start: Date; end: Date }>();
        for (const row of transactions) {
          const orderDate = new Date(row.orderDate);
          const existing = scopes.get(row.siteCode);
          if (!existing) scopes.set(row.siteCode, { start: orderDate, end: orderDate });
          else {
            if (orderDate < existing.start) existing.start = orderDate;
            if (orderDate > existing.end) existing.end = orderDate;
          }
        }
        const replaceWhere = {
          OR: Array.from(scopes, ([siteCode, scope]) => ({
            siteCode,
            orderDate: { gte: scope.start, lt: new Date(scope.end.getTime() + 86_400_000) },
          })),
        };
        const backupRows = await database.salesTransaction.findMany({ where: replaceWhere });
        replacedBackup = backupRows;
        replacedRows = backupRows.length;
        if (backupRows.length) {
          const affected = new Map<number, number>();
          for (const row of backupRows) {
            affected.set(row.importBatchId, (affected.get(row.importBatchId) || 0) + 1);
          }
          await database.salesTransaction.deleteMany({ where: replaceWhere });
          for (const [importBatchId, count] of affected) {
            await database.importBatch.update({
              where: { id: importBatchId },
              data: { insertedCount: { decrement: count } },
            });
          }
        }
      }

      if (replacedBackup.length || existingReport) {
        await database.importReplacementBackup.create({
          data: {
            importBatchId: batch.id,
            rowCount: replacedBackup.length,
            payload: JSON.stringify({ transactions: replacedBackup, report: existingReport }),
          },
        });
      }

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

      if (!insertedRows && !replacedRows && !report) {
        await database.importBatch.delete({ where: { id: batch.id } });
        return { batchId: null, insertedRows, replacedRows };
      }

      await database.importBatch.update({
        where: { id: batch.id },
        data: {
          insertedCount: insertedRows,
          duplicateCount: transactions.length - insertedRows,
        },
      });
      return { batchId: batch.id, insertedRows, replacedRows };
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
    importMode: mode,
    replacedRows: persisted.replacedRows,
    totalQuantity,
    totalNettAmount,
    report: report
      ? { storeCode: report.storeCode, month: report.month, year: report.year }
      : null,
  };
  return result;
}
