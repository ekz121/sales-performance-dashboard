import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

type MasterRow = Pick<
  Prisma.SalesTransactionCreateManyInput,
  "siteCode" | "siteDesc" | "salesName"
>;

type SalesMasterClient = Pick<Prisma.TransactionClient, "store" | "sales">;

/** Keeps the editable Store/Sales masters aligned with analytics transactions. */
export async function syncSalesMaster(
  rows: MasterRow[],
  client: SalesMasterClient = prisma,
) {
  const stores = Array.from(
    new Map(
      rows
        .filter((row) => row.siteCode && row.siteDesc)
        .map((row) => [
          row.siteCode,
          { kode: row.siteCode, nama: row.siteDesc },
        ]),
    ).values(),
  );

  if (!stores.length) return;

  await client.store.createMany({ data: stores, skipDuplicates: true });
  const stored = await client.store.findMany({
    where: { kode: { in: stores.map((store) => store.kode) } },
    select: { id: true, kode: true },
  });
  const storeIds = new Map(stored.map((store) => [store.kode, store.id]));
  const sales = Array.from(
    new Map(
      rows
        .filter((row) => row.salesName && storeIds.has(row.siteCode))
        .map((row) => {
          const storeId = storeIds.get(row.siteCode)!;
          return [
            `${storeId}:${row.salesName.toLocaleUpperCase("id")}`,
            { storeId, nama: row.salesName, aktif: true },
          ];
        }),
    ).values(),
  );

  if (sales.length) {
    await client.sales.createMany({ data: sales, skipDuplicates: true });
  }
}
