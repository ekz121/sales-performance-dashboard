import { describe, expect, it } from "vitest";
import { ImportValidationError, transactionRows } from "./import-sales";

const headers = [
  "SITE CODE",
  "site-desc",
  "sales/name",
  "order date",
  "brand.name",
  "article description",
  "quantity",
  "total nett amount exc tax",
  "CAT",
];

describe("transactionRows", () => {
  it("menerima variasi pemisah header yang umum", () => {
    const rows = transactionRows([
      headers,
      ["M221", "Erafone Sangatta", "Sales A", "01/09/2026", "SAMSUNG", "Galaxy Test", 1, 5_000_000, "DEVICE"],
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      siteCode: "M221",
      salesName: "Sales A",
      quantity: 1,
      totalNettAmountExcTax: 5_000_000,
      category: "DEVICE",
    });
  });

  it("menolak seluruh file dan menyebut nomor baris bila data wajib tidak valid", () => {
    expect(() => transactionRows([
      headers,
      ["M221", "Erafone Sangatta", "", "bukan tanggal", "", "", "abc", "Rp salah", ""],
    ])).toThrowError(ImportValidationError);

    expect(() => transactionRows([
      headers,
      ["M221", "Erafone Sangatta", "", "bukan tanggal", "", "", "abc", "Rp salah", ""],
    ])).toThrow(/baris 2.*Tidak ada data yang disimpan/);
  });
});
