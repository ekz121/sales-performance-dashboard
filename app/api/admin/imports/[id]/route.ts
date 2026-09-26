import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
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
        replacementBackup: { select: { payload: true, rowCount: true } },
        _count: { select: { transactions: true, reportDatasets: true } },
      },
    });
    if (!batch) {
      return noStoreJson({ message: "Riwayat import tidak ditemukan." }, { status: 404 });
    }
    const restoredRows = await prisma.$transaction(async (database) => {
      const backup = batch.replacementBackup
        ? JSON.parse(batch.replacementBackup.payload) as {
            transactions?: Array<Record<string, unknown>>;
            report?: Record<string, unknown> | null;
          }
        : null;
      await database.reportDataset.deleteMany({ where: { importBatchId: id } });
      await database.salesTransaction.deleteMany({ where: { importBatchId: id } });

      const transactions = (backup?.transactions || []).map((item) => {
        const { id: _rowId, ...row } = item;
        return {
          ...row,
          orderDate: new Date(String(row.orderDate)),
        } as Prisma.SalesTransactionCreateManyInput;
      });
      for (let index = 0; index < transactions.length; index += 2_500) {
        await database.salesTransaction.createMany({
          data: transactions.slice(index, index + 2_500),
          skipDuplicates: true,
        });
      }
      const counts = new Map<number, number>();
      for (const row of transactions) {
        counts.set(row.importBatchId, (counts.get(row.importBatchId) || 0) + 1);
      }
      for (const [importBatchId, count] of counts) {
        await database.importBatch.update({
          where: { id: importBatchId },
          data: { insertedCount: { increment: count } },
        });
      }

      if (backup?.report) {
        const report = backup.report;
        const storeCode = String(report.storeCode);
        const month = Number(report.month);
        const year = Number(report.year);
        const data = {
          importBatchId: Number(report.importBatchId),
          storeCode,
          storeName: String(report.storeName),
          month,
          year,
          sourceFile: String(report.sourceFile),
          config: report.config as Prisma.InputJsonValue,
        };
        await database.reportDataset.upsert({
          where: { storeCode_month_year: { storeCode, month, year } },
          create: data,
          update: data,
        });
      }

      await database.importBatch.delete({ where: { id } });
      return transactions.length;
    });
    revalidateDashboard();
    return noStoreJson({
      ok: true,
      fileName: batch.fileName,
      deletedTransactions: batch._count.transactions,
      deletedReports: batch._count.reportDatasets,
      restoredTransactions: restoredRows,
    });
  } catch (error) {
    return apiError(error);
  }
}
