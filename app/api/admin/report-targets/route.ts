import type { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, noStoreJson, revalidateDashboard } from "@/lib/api";
import { isAdminRequest } from "@/lib/auth";
import type { ReportConfig } from "@/lib/import-sales";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const targetSchema = z.object({
  storeCode: z.string().trim().min(1).max(40),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2200),
  salesName: z.string().trim().min(1).max(140),
  group: z.enum(["categoryTargets", "brandTargets", "operatorTargets", "racingTargets"]),
  key: z.string().trim().min(1).max(100),
  unit: z.enum(["amount", "quantity"]).optional(),
  value: z.coerce.number().min(0),
});

const emptyConfig = (): ReportConfig => ({
  categoryTargets: {}, brandTargets: {}, operatorTargets: {}, racingTargets: {},
});

async function options() {
  const [masters, rows] = await Promise.all([
    prisma.store.findMany({ include: { sales: { where: { aktif: true }, orderBy: { nama: "asc" } } }, orderBy: { kode: "asc" } }),
    prisma.salesTransaction.findMany({ distinct: ["siteCode", "salesName"], select: { siteCode: true, siteDesc: true, salesName: true } }),
  ]);
  const result = new Map(masters.map((store) => [store.kode, { code: store.kode, name: store.nama, sales: store.sales.map((sales) => sales.nama) }]));
  for (const row of rows) {
    const store = result.get(row.siteCode) || { code: row.siteCode, name: row.siteDesc, sales: [] };
    if (!store.sales.includes(row.salesName)) store.sales.push(row.salesName);
    store.sales.sort((a, b) => a.localeCompare(b, "id"));
    result.set(row.siteCode, store);
  }
  return Array.from(result.values());
}

export async function GET(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return noStoreJson({ message: "Sesi admin tidak valid." }, { status: 401 });
  }
  const url = new URL(request.url);
  const storeCode = url.searchParams.get("store") || "";
  const month = Number(url.searchParams.get("month"));
  const year = Number(url.searchParams.get("year"));
  const [stores, report, latestReport, latestTransaction] = await Promise.all([
    options(),
    storeCode && month && year
      ? prisma.reportDataset.findUnique({ where: { storeCode_month_year: { storeCode, month, year } } })
      : null,
    prisma.reportDataset.findFirst({ select: { storeCode: true, month: true, year: true }, orderBy: [{ year: "desc" }, { month: "desc" }] }),
    prisma.salesTransaction.findFirst({ select: { siteCode: true, orderDate: true }, orderBy: { orderDate: "desc" } }),
  ]);
  const defaultSelection = latestReport || (latestTransaction ? {
    storeCode: latestTransaction.siteCode,
    month: latestTransaction.orderDate.getUTCMonth() + 1,
    year: latestTransaction.orderDate.getUTCFullYear(),
  } : null);
  return noStoreJson({
    stores,
    defaultSelection,
    report: report ? { ...report, config: report.config as ReportConfig } : null,
  });
}

async function mutateTarget(input: z.infer<typeof targetSchema>, remove: boolean) {
  const existing = await prisma.reportDataset.findUnique({
    where: { storeCode_month_year: { storeCode: input.storeCode, month: input.month, year: input.year } },
  });
  const config = existing ? structuredClone(existing.config as ReportConfig) : emptyConfig();
  const key = input.key.trim().toUpperCase();
  if (input.group === "racingTargets") {
    const unit = input.unit || "amount";
    config.racingTargets[input.salesName] ||= {};
    config.racingTargets[input.salesName][key] ||= {};
    if (remove) delete config.racingTargets[input.salesName][key][unit];
    else config.racingTargets[input.salesName][key][unit] = input.value;
  } else {
    config[input.group][input.salesName] ||= {};
    if (remove) delete config[input.group][input.salesName][key];
    else config[input.group][input.salesName][key] = input.value;
  }
  if (existing) {
    return prisma.reportDataset.update({
      where: { id: existing.id },
      data: { config: config as Prisma.InputJsonValue, sourceFile: "Diedit melalui Admin" },
    });
  }
  let batch = await prisma.importBatch.findFirst({ where: { fileType: "targets" }, orderBy: { id: "asc" } });
  batch ||= await prisma.importBatch.create({ data: { fileName: "Target manual admin", fileType: "targets", rowCount: 0, insertedCount: 0 } });
  const store = (await options()).find((item) => item.code === input.storeCode);
  return prisma.reportDataset.create({
    data: {
      importBatchId: batch.id,
      storeCode: input.storeCode,
      storeName: store?.name || input.storeCode,
      month: input.month,
      year: input.year,
      sourceFile: "Dibuat melalui Admin",
      config: config as Prisma.InputJsonValue,
    },
  });
}

export async function PUT(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return noStoreJson({ message: "Sesi admin tidak valid." }, { status: 401 });
  }
  try {
    const input = targetSchema.parse(await request.json());
    await mutateTarget(input, false);
    revalidateDashboard();
    return noStoreJson({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return noStoreJson({ message: "Sesi admin tidak valid." }, { status: 401 });
  }
  try {
    const input = targetSchema.parse(await request.json());
    await mutateTarget(input, true);
    revalidateDashboard();
    return noStoreJson({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
