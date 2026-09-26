import type { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { isAdminRequest } from "@/lib/auth";
import { apiError, noStoreJson, revalidateDashboard } from "@/lib/api";
import type { RacingDefinition, ReportConfig } from "@/lib/import-sales";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const periodSchema = z.object({
  storeCode: z.string().trim().min(1).max(40),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2200),
});
const definitionSchema = periodSchema.extend({
  key: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(180),
  unit: z.enum(["qty", "amount"]),
  brandIncludes: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  articleIncludes: z.array(z.string().trim().min(1).max(180)).max(20).default([]),
  category: z.string().trim().max(80).optional().nullable(),
  minUnitAmount: z.coerce.number().min(0).optional().nullable(),
  amountSource: z.enum(["net", "gross"]).default("net"),
});

const emptyConfig = (): ReportConfig => ({
  categoryTargets: {},
  brandTargets: {},
  operatorTargets: {},
  racingTargets: {},
  racingDefinitions: [],
});

function cleanKey(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
}

async function ensureReport(
  period: z.infer<typeof periodSchema>,
  config: ReportConfig,
  sourceFile: string,
) {
  const existing = await prisma.reportDataset.findUnique({
    where: { storeCode_month_year: period },
  });
  if (existing) {
    return prisma.reportDataset.update({
      where: { id: existing.id },
      data: { config: config as Prisma.InputJsonValue, sourceFile },
    });
  }
  let batch = await prisma.importBatch.findFirst({ where: { fileType: "targets" }, orderBy: { id: "asc" } });
  batch ||= await prisma.importBatch.create({
    data: { fileName: "Konfigurasi manual Admin", fileType: "targets", rowCount: 0, insertedCount: 0 },
  });
  const store = await prisma.store.findUnique({ where: { kode: period.storeCode } });
  return prisma.reportDataset.create({
    data: {
      ...period,
      storeName: store?.nama || period.storeCode,
      sourceFile,
      importBatchId: batch.id,
      config: config as Prisma.InputJsonValue,
    },
  });
}

export async function PUT(request: NextRequest) {
  if (!(await isAdminRequest(request))) return noStoreJson({ message: "Sesi admin tidak valid." }, { status: 401 });
  try {
    const input = definitionSchema.parse(await request.json());
    const period = { storeCode: input.storeCode, month: input.month, year: input.year };
    const existing = await prisma.reportDataset.findUnique({ where: { storeCode_month_year: period } });
    const config = existing ? structuredClone(existing.config as ReportConfig) : emptyConfig();
    const key = cleanKey(input.key);
    const definition: RacingDefinition = {
      key,
      label: input.label,
      unit: input.unit,
      brandIncludes: input.brandIncludes.map((item) => item.toUpperCase()),
      articleIncludes: input.articleIncludes.map((item) => item.toUpperCase()),
      category: input.category?.toUpperCase() || undefined,
      minUnitAmount: input.minUnitAmount || undefined,
      amountSource: input.amountSource,
    };
    config.racingDefinitions ||= [];
    const index = config.racingDefinitions.findIndex((item) => item.key === key);
    if (index >= 0) config.racingDefinitions[index] = definition;
    else config.racingDefinitions.push(definition);
    await ensureReport(period, config, "Racing diedit melalui Admin");
    revalidateDashboard();
    return noStoreJson({ ok: true, definition });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await isAdminRequest(request))) return noStoreJson({ message: "Sesi admin tidak valid." }, { status: 401 });
  try {
    const input = periodSchema.extend({ key: z.string().min(1) }).parse(await request.json());
    const period = { storeCode: input.storeCode, month: input.month, year: input.year };
    const existing = await prisma.reportDataset.findUnique({ where: { storeCode_month_year: period } });
    if (!existing) return noStoreJson({ message: "Konfigurasi periode tidak ditemukan." }, { status: 404 });
    const config = structuredClone(existing.config as ReportConfig);
    const key = cleanKey(input.key);
    config.racingDefinitions = (config.racingDefinitions || []).filter((item) => item.key !== key);
    for (const targets of Object.values(config.racingTargets || {})) delete targets[key];
    await ensureReport(period, config, "Racing diedit melalui Admin");
    revalidateDashboard();
    return noStoreJson({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  if (!(await isAdminRequest(request))) return noStoreJson({ message: "Sesi admin tidak valid." }, { status: 401 });
  try {
    const input = periodSchema.parse(await request.json());
    const previousMonth = input.month === 1 ? 12 : input.month - 1;
    const previousYear = input.month === 1 ? input.year - 1 : input.year;
    const [source, destination] = await Promise.all([
      prisma.reportDataset.findUnique({ where: { storeCode_month_year: { storeCode: input.storeCode, month: previousMonth, year: previousYear } } }),
      prisma.reportDataset.findUnique({ where: { storeCode_month_year: input } }),
    ]);
    if (!source) return noStoreJson({ message: "Konfigurasi Racing bulan sebelumnya tidak ditemukan." }, { status: 404 });
    const sourceConfig = source.config as ReportConfig;
    const config = destination ? structuredClone(destination.config as ReportConfig) : emptyConfig();
    config.racingDefinitions = structuredClone(sourceConfig.racingDefinitions || []);
    config.racingTargets = structuredClone(sourceConfig.racingTargets || {});
    await ensureReport(input, config, `Racing disalin dari ${previousMonth}/${previousYear}`);
    revalidateDashboard();
    return noStoreJson({ ok: true, copiedPrograms: config.racingDefinitions.length });
  } catch (error) {
    return apiError(error);
  }
}
