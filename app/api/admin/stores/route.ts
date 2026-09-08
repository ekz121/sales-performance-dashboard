import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, noStoreJson, revalidateDashboard } from "@/lib/api";
import { isAdminRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const schema = z.object({
  nama: z.string().trim().min(2, "Nama store minimal 2 karakter.").max(180),
  kode: z.string().trim().min(1, "Kode store wajib diisi.").max(40).transform((value) => value.toUpperCase()),
});

export async function GET(request: NextRequest) {
  if (!(await isAdminRequest(request))) return noStoreJson({ message: "Sesi admin tidak valid." }, { status: 401 });
  return noStoreJson(await prisma.store.findMany({
    include: { _count: { select: { sales: true } } },
    orderBy: [{ kode: "asc" }],
  }));
}

export async function POST(request: NextRequest) {
  if (!(await isAdminRequest(request))) return noStoreJson({ message: "Sesi admin tidak valid." }, { status: 401 });
  try {
    const created = await prisma.store.create({ data: schema.parse(await request.json()) });
    revalidateDashboard();
    return noStoreJson(created, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
