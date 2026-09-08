import { createHash, randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, noStoreJson, revalidateDashboard } from "@/lib/api";
import { isAdminRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncSalesMaster } from "@/lib/sync-sales-master";

export const dynamic = "force-dynamic";

export const transactionSchema = z.object({
  siteCode: z.string().trim().min(1).max(40),
  siteDesc: z.string().trim().min(1).max(180),
  salesCode: z.string().trim().max(40).nullish(),
  salesName: z.string().trim().min(1).max(140),
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  brandName: z.string().trim().min(1).max(100),
  articleCode: z.string().trim().max(60).nullish(),
  articleDescription: z.string().trim().min(1).max(220),
  quantity: z.coerce.number().int(),
  price: z.coerce.number().default(0),
  discount: z.coerce.number().default(0),
  totalNettAmountWithTax: z.coerce.number(),
  totalNettAmountExcTax: z.coerce.number(),
  category: z.string().trim().min(1).max(80),
  category2: z.string().trim().max(80).nullish(),
});

function serialize(row: Awaited<ReturnType<typeof prisma.salesTransaction.findFirst>>) {
  if (!row) return row;
  return {
    ...row,
    price: Number(row.price),
    discount: Number(row.discount),
    totalNettAmountWithTax: Number(row.totalNettAmountWithTax),
    totalNettAmountExcTax: Number(row.totalNettAmountExcTax),
  };
}

export async function GET(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return noStoreJson({ message: "Sesi admin tidak valid." }, { status: 401 });
  }
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = 50;
  const month = Number(url.searchParams.get("month"));
  const year = Number(url.searchParams.get("year"));
  const store = url.searchParams.get("store")?.trim();
  const query = url.searchParams.get("q")?.trim();
  const category = url.searchParams.get("category")?.trim();
  const where = {
    ...(store ? { siteCode: store } : {}),
    ...(category ? { category } : {}),
    ...(month && year
      ? { orderDate: { gte: new Date(Date.UTC(year, month - 1, 1)), lt: new Date(Date.UTC(year, month, 1)) } }
      : {}),
    ...(query
      ? { OR: [
          { salesName: { contains: query } },
          { brandName: { contains: query } },
          { articleDescription: { contains: query } },
          { articleCode: { contains: query } },
        ] }
      : {}),
  };
  const [rows, total, stores] = await Promise.all([
    prisma.salesTransaction.findMany({
      where,
      include: { importBatch: { select: { fileName: true } } },
      orderBy: [{ orderDate: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.salesTransaction.count({ where }),
    prisma.salesTransaction.findMany({
      distinct: ["siteCode"],
      select: { siteCode: true, siteDesc: true },
      orderBy: { siteCode: "asc" },
    }),
  ]);
  return noStoreJson({ rows: rows.map(serialize), total, page, pageSize, stores });
}

export async function POST(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return noStoreJson({ message: "Sesi admin tidak valid." }, { status: 401 });
  }
  try {
    const input = transactionSchema.parse(await request.json());
    let batch = await prisma.importBatch.findFirst({ where: { fileType: "manual" }, orderBy: { id: "asc" } });
    batch ||= await prisma.importBatch.create({ data: { fileName: "Input manual admin", fileType: "manual", rowCount: 0, insertedCount: 0 } });
    const created = await prisma.salesTransaction.create({
      data: {
        ...input,
        salesCode: input.salesCode || null,
        articleCode: input.articleCode || null,
        category2: input.category2 || null,
        orderDate: new Date(`${input.orderDate}T12:00:00.000Z`),
        importBatchId: batch.id,
        fingerprint: createHash("sha256").update(`manual:${randomUUID()}`).digest("hex"),
      },
      include: { importBatch: { select: { fileName: true } } },
    });
    await prisma.importBatch.update({ where: { id: batch.id }, data: { rowCount: { increment: 1 }, insertedCount: { increment: 1 } } });
    await syncSalesMaster([input]);
    revalidateDashboard();
    return noStoreJson(serialize(created), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
