import type { NextRequest } from "next/server";
import { apiError, noStoreJson, revalidateDashboard } from "@/lib/api";
import { isAdminRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { transactionSchema } from "../route";

const patchSchema = transactionSchema.partial();

function numeric(row: NonNullable<Awaited<ReturnType<typeof prisma.salesTransaction.findFirst>>>) {
  return {
    ...row,
    price: Number(row.price),
    discount: Number(row.discount),
    totalNettAmountWithTax: Number(row.totalNettAmountWithTax),
    totalNettAmountExcTax: Number(row.totalNettAmountExcTax),
  };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdminRequest(request))) {
    return noStoreJson({ message: "Sesi admin tidak valid." }, { status: 401 });
  }
  try {
    const id = Number((await params).id);
    const input = patchSchema.parse(await request.json());
    const updated = await prisma.salesTransaction.update({
      where: { id },
      data: {
        ...input,
        salesCode: input.salesCode === undefined ? undefined : input.salesCode || null,
        articleCode: input.articleCode === undefined ? undefined : input.articleCode || null,
        category2: input.category2 === undefined ? undefined : input.category2 || null,
        orderDate: input.orderDate ? new Date(`${input.orderDate}T12:00:00.000Z`) : undefined,
      },
      include: { importBatch: { select: { fileName: true } } },
    });
    revalidateDashboard();
    return noStoreJson(numeric(updated));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdminRequest(request))) {
    return noStoreJson({ message: "Sesi admin tidak valid." }, { status: 401 });
  }
  try {
    const id = Number((await params).id);
    const current = await prisma.salesTransaction.findUnique({ where: { id }, select: { importBatchId: true } });
    if (!current) return noStoreJson({ message: "Transaksi tidak ditemukan." }, { status: 404 });
    await prisma.$transaction([
      prisma.salesTransaction.delete({ where: { id } }),
      prisma.importBatch.update({ where: { id: current.importBatchId }, data: { insertedCount: { decrement: 1 } } }),
    ]);
    revalidateDashboard();
    return noStoreJson({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
