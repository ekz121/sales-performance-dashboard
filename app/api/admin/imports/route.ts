import type { NextRequest } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { noStoreJson, revalidateDashboard } from "@/lib/api";
import { importSalesBuffer } from "@/lib/import-sales";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return noStoreJson({ message: "Sesi admin tidak valid." }, { status: 401 });
  }

  const batches = await prisma.importBatch.findMany({
    take: 25,
    orderBy: { createdAt: "desc" },
    include: {
      reportDatasets: {
        select: { storeCode: true, month: true, year: true },
      },
    },
  });
  return noStoreJson(batches);
}

export async function POST(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return noStoreJson({ message: "Sesi admin tidak valid." }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return noStoreJson({ message: "Pilih file Excel atau CSV terlebih dahulu." }, { status: 400 });
    }
    if (file.size > 4 * 1024 * 1024) {
      return noStoreJson({ message: "Ukuran file maksimal 4 MB agar aman di localhost dan Netlify." }, { status: 413 });
    }

    const result = await importSalesBuffer(
      Buffer.from(await file.arrayBuffer()),
      file.name,
    );
    revalidateDashboard();
    return noStoreJson(result, { status: 201 });
  } catch (error) {
    console.error(error);
    return noStoreJson(
      {
        message:
          error instanceof Error
            ? error.message
            : "File gagal diproses. Periksa kembali format datanya.",
      },
      { status: 400 },
    );
  }
}
