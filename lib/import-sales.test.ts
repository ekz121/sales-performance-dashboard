import { describe, expect, it } from "vitest";
import { extractReport, ImportValidationError, transactionRows } from "./import-sales";

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

  it("menemukan header transaksi walau tidak berada pada baris pertama", () => {
    const rows = transactionRows([
      ["Laporan penjualan September"],
      [],
      headers,
      ["M221", "Erafone Sangatta", "Sales A", "01/09/2026", "VIVO", "Vivo V Test", 1, 3_500_000, "DEVICE"],
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].siteCode).toBe("M221");
  });

  it("menerima alias header Indonesia dan header setelah baris ke-30", () => {
    const intro = Array.from({ length: 40 }, (_, index) => [`Judul laporan ${index + 1}`]);
    const rows = transactionRows([
      ...intro,
      ["Kode Store", "Nama Store", "Nama Sales", "Tanggal Transaksi", "Merk", "Nama Produk", "Qty", "Net Sales", "Kategori"],
      ["M221", "Erafone Sangatta", "Sales A", "15/09/2026", "VIVO", "Vivo Test", 2, 6_000_000, "DEVICE"],
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ siteCode: "M221", quantity: 2, totalNettAmountExcTax: 6_000_000 });
  });

  it("menerima pemetaan manual untuk nama header yang sepenuhnya khusus", () => {
    const customHeaders = ["CabangX", "NamaCabangX", "PetugasX", "HariX", "MerekX", "BarangX", "UnitX", "OmzetX", "KelompokX"];
    const rows = transactionRows([
      customHeaders,
      ["M221", "Erafone Sangatta", "Sales A", "15/09/2026", "VIVO", "Vivo Test", 1, 3_000_000, "DEVICE"],
    ], {
      site_code: "CabangX", site_desc: "NamaCabangX", sales_name: "PetugasX",
      order_date: "HariX", brand_name: "MerekX", article_description: "BarangX",
      quantity: "UnitX", total_nett_amount_exc_tax: "OmzetX", cat: "KelompokX",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].brandName).toBe("VIVO");
  });

  it("memberi fingerprint sama untuk transaksi sama dengan kolom tambahan", () => {
    const data = ["M221", "Erafone Sangatta", "Sales A", "01/09/2026", "VIVO", "Vivo V Test", 1, 3_500_000, "DEVICE"];
    const basic = transactionRows([headers, data]);
    const extended = transactionRows([[...headers, "kolom tambahan"], [...data, "nilai lain"]]);
    expect(extended[0].fingerprint).toBe(basic[0].fingerprint);
  });
});

describe("extractReport", () => {
  it("membaca Racing September berdasarkan judul dan header yang berpindah", () => {
    const master = [
      headers,
      ["M221", "Erafone Sangatta", "Sales A", "01/09/2026", "VIVO", "Vivo V Test", 1, 3_500_000, "DEVICE"],
    ];
    const target: unknown[][] = Array.from({ length: 42 }, () => []);
    target[0] = ["TARGET ALL CAT ERAFONE & MORE SANGATTA M221 SEPTEMBER 2026"];
    target[8] = ["TARGET RACING VIVO"];
    target[9] = ["SALES NAME", "ALLTYPE", "3JT UP"];
    target[10] = ["Sales A", 9, 4];
    target[15] = ["TARGET RACING TECNO"];
    target[16] = ["SALES NAME", "CAMON 50", "POVA 8"];
    target[17] = ["Sales A", 4, 2];
    target[29] = ["TARGET MEDPOIN Q3"];
    target[30] = ["TARGET STORE", "TARGET BOOSTER", null];
    target[31] = ["Sales A", 3_750_000, 25];
    target[36] = ["TARGET RACING FBE OPPO"];
    target[37] = ["SALES NAME", "ALL TYPE QTY", "ALL TYPE AMT", "RENO 16", "IOT"];
    target[38] = ["Sales A", 25, 148_029_500, 10, 7];

    const report = extractReport(target, master, "report.xlsx");
    expect(report?.month).toBe(9);
    expect(report?.config.racingDefinitions?.map((item) => item.key)).toEqual([
      "VIVO_ALL_TYPE", "VIVO_3JT_UP", "CAMON_50", "POVA_8", "MEDPOIN",
      "OPPO_ALL_TYPE", "OPPO_RENO_16", "OPPO_IOT",
    ]);
    expect(report?.config.racingTargets["Sales A"]).toMatchObject({
      VIVO_ALL_TYPE: { quantity: 9 },
      VIVO_3JT_UP: { quantity: 4 },
      MEDPOIN: { amount: 3_750_000, quantity: 25 },
      OPPO_ALL_TYPE: { amount: 148_029_500, quantity: 25 },
      OPPO_RENO_16: { quantity: 10 },
      OPPO_IOT: { quantity: 7 },
    });
  });
});
