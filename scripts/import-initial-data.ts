import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { importSalesBuffer } from "../lib/import-sales";
import { prisma } from "../lib/prisma";

const FILES = [
  "REPORT M221 AGUSTUS 2026 UPDATE.xlsx",
  "MASTER KALIMANTAN 1-6 SEPTEMBER  2026.xlsx",
  "REPORT M221 SEPTEMBER 2026 UPDATE.xlsx",
];

async function main() {
  const dataDirectory = path.resolve(process.argv[2] || "data-awal");
  for (const fileName of FILES) {
    const filePath = path.join(dataDirectory, fileName);
    await access(filePath);
    console.log(`\nMembaca ${fileName} ...`);
    const result = await importSalesBuffer(await readFile(filePath), fileName);
    console.log(
      `  ${result.readRows.toLocaleString("id-ID")} dibaca, `
      + `${result.insertedRows.toLocaleString("id-ID")} baru, `
      + `${result.duplicateRows.toLocaleString("id-ID")} duplikat dilewati.`,
    );
  }

  const [transactions, stores, sales, batches, reports] = await Promise.all([
    prisma.salesTransaction.count(),
    prisma.store.count(),
    prisma.sales.count(),
    prisma.importBatch.count(),
    prisma.reportDataset.count(),
  ]);
  console.log("\nVerifikasi database lokal:");
  console.log(`  SalesTransaction : ${transactions.toLocaleString("id-ID")}`);
  console.log(`  Store            : ${stores.toLocaleString("id-ID")}`);
  console.log(`  Sales            : ${sales.toLocaleString("id-ID")}`);
  console.log(`  ImportBatch      : ${batches.toLocaleString("id-ID")}`);
  console.log(`  ReportDataset    : ${reports.toLocaleString("id-ID")}`);
  if (!transactions || reports < 2) {
    throw new Error("Verifikasi gagal: transaksi atau target report belum lengkap.");
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
