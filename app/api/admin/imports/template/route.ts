import ExcelJS from "exceljs";
import type { NextRequest } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { noStoreJson } from "@/lib/api";

const HEADERS = [
  "sales_org", "sales_org_desc", "site_code", "site_desc", "sales_code",
  "sales_name", "pos_number", "order_date", "week", "item_group",
  "item_group_desc", "brand_name", "article_code", "article_description",
  "quantity", "price", "discount", "total_nett_amount_with_tax",
  "total_nett_amount_exc_tax", "CAT", "CAT 2", "BU DESC", "SL", "TSH",
];

export async function GET(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return noStoreJson({ message: "Sesi admin tidak valid." }, { status: 401 });
  }
  const workbook = new ExcelJS.Workbook();
  const master = workbook.addWorksheet("MASTER", { views: [{ state: "frozen", ySplit: 1 }] });
  master.addRow(HEADERS);
  master.addRow([
    "1000", "ERAFONE", "M221", "ERAFONE & MORE SANGATTA M221", "S001",
    "Nama Sales", "POS-001", new Date(Date.UTC(2026, 8, 1)), 1, "DEVICE",
    "SMARTPHONE", "SAMSUNG", "ART-001", "Contoh Smartphone", 1, 5000000,
    0, 5550000, 5000000, "DEVICE", "SMARTPHONE", "MOBILE", "Nama SL", "Nama TSH",
  ]);
  master.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  master.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE31E2F" } };
  for (const column of [3, 4, 6, 8, 12, 14, 15, 19, 20]) {
    master.getCell(1, column).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF9F1239" } };
  }
  master.columns.forEach((column) => { column.width = 22; });
  master.getColumn(8).numFmt = "dd/mm/yyyy";
  const guide = workbook.addWorksheet("PETUNJUK");
  [
    ["FORMAT IMPORT ACTUAL PENJUALAN"],
    ["Gunakan sheet MASTER dan letakkan header pada baris pertama."],
    ["Satu baris adalah satu transaksi/item penjualan."],
    ["Kolom wajib (header merah tua)", "site_code, site_desc, sales_name, order_date, brand_name, article_description, quantity, total_nett_amount_exc_tax, CAT"],
    ["Kolom opsional", "sales_org, sales_org_desc, sales_code, pos_number, week, item_group, item_group_desc, article_code, price, discount, total_nett_amount_with_tax, CAT 2, BU DESC, SL, TSH"],
    ["Kategori utama", "DEVICE, ACC & IOT, REPAIR CONTRACT, CARRIER, CE, LAPTOP"],
    ["Tanggal", "Gunakan tanggal Excel, DD/MM/YYYY, atau YYYY-MM-DD."],
    ["Nominal", "Gunakan angka tanpa Rp dan tanpa pemisah ribuan."],
    ["Validasi", "Jika satu baris wajib tidak valid, seluruh file ditolak. Pesan web akan menyebut nomor baris yang harus diperbaiki."],
    ["Duplikat", "Baris identik yang sudah pernah masuk akan dilewati otomatis."],
    ["Target", "Template ini mengimpor actual. Isi target melalui menu Target di web, atau unggah workbook report yang memiliki sheet TARGET dengan layout report asli."],
  ].forEach((row) => guide.addRow(row));
  guide.getColumn(1).width = 28;
  guide.getColumn(2).width = 110;
  guide.getRow(1).font = { bold: true, size: 16 };
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="template-import-sales-erafone.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
