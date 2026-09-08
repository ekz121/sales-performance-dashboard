import type { NextRequest } from "next/server";
import { apiError, noStoreJson, revalidateDashboard } from "@/lib/api";
import { isAdminRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdminRequest(request))) {
    return noStoreJson({ message: "Sesi admin tidak valid." }, { status: 401 });
  }
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id < 1) {
      return noStoreJson({ message: "ID import tidak valid." }, { status: 400 });
    }
    const batch = await prisma.importBatch.findUnique({
      where: { id },
      select: {
        fileName: true,
        _count: { select: { transactions: true, reportDatasets: true } },
      },
    });
    if (!batch) {
      return noStoreJson({ message: "Riwayat import tidak ditemukan." }, { status: 404 });
    }
    await prisma.$transaction([
      prisma.reportDataset.deleteMany({ where: { importBatchId: id } }),
      prisma.salesTransaction.deleteMany({ where: { importBatchId: id } }),
      prisma.importBatch.delete({ where: { id } }),
    ]);
    revalidateDashboard();
    return noStoreJson({
      ok: true,
      fileName: batch.fileName,
      deletedTransactions: batch._count.transactions,
      deletedReports: batch._count.reportDatasets,
    });
  } catch (error) {
    return apiError(error);
  }
}
