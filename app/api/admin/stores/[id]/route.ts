import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, noStoreJson, revalidateDashboard } from "@/lib/api";
import { isAdminRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  nama: z.string().trim().min(2).max(180).optional(),
  kode: z.string().trim().min(1).max(40).transform((value) => value.toUpperCase()).optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest(request))) return noStoreJson({ message: "Sesi admin tidak valid." }, { status: 401 });
  try {
    const id = Number((await params).id);
    const input = schema.parse(await request.json());
    const current = await prisma.store.findUnique({ where: { id } });
    if (!current) return noStoreJson({ message: "Store tidak ditemukan." }, { status: 404 });
    const nama = input.nama ?? current.nama;
    const kode = input.kode ?? current.kode;
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.store.update({ where: { id }, data: { nama, kode } });
      await tx.salesTransaction.updateMany({
        where: { siteCode: current.kode },
        data: { siteCode: kode, siteDesc: nama },
      });
      await tx.reportDataset.updateMany({
        where: { storeCode: current.kode },
        data: { storeCode: kode, storeName: nama },
      });
      return row;
    });
    revalidateDashboard();
    return noStoreJson(updated);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest(request))) return noStoreJson({ message: "Sesi admin tidak valid." }, { status: 401 });
  try {
    const id = Number((await params).id);
    const store = await prisma.store.findUnique({ where: { id }, include: { _count: { select: { sales: true } } } });
    if (!store) return noStoreJson({ message: "Store tidak ditemukan." }, { status: 404 });
    const [transactions, reports, targets, entries] = await Promise.all([
      prisma.salesTransaction.count({ where: { siteCode: store.kode } }),
      prisma.reportDataset.count({ where: { storeCode: store.kode } }),
      prisma.target.count({ where: { sales: { storeId: id } } }),
      prisma.dailyEntry.count({ where: { sales: { storeId: id } } }),
    ]);
    if (transactions || reports || targets || entries) {
      return noStoreJson({ message: "Store masih memiliki transaksi/target. Hapus batch atau data terkait terlebih dahulu agar histori dashboard tidak hilang." }, { status: 409 });
    }
    await prisma.$transaction([
      prisma.sales.deleteMany({ where: { storeId: id } }),
      prisma.store.delete({ where: { id } }),
    ]);
    revalidateDashboard();
    return noStoreJson({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
