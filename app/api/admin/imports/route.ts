import type { NextRequest } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { apiError, noStoreJson, revalidateDashboard } from "@/lib/api";
import { archiveImportDraft, deleteImportDraft, readImportDraft } from "@/lib/import-drafts";
import {
  ImportValidationError,
  importSalesBuffer,
  type HeaderMapping,
  type ImportMode,
} from "@/lib/import-sales";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_FILE_SIZE = 15 * 1024 * 1024;

function parseMapping(value: FormDataEntryValue | null): HeaderMapping | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ImportValidationError("Pemetaan kolom tidak valid.");
  }
  return parsed as HeaderMapping;
}

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
    const draftId = String(formData.get("draftId") || "");
    let buffer: Buffer;
    let fileName: string;
    if (draftId) {
      ({ buffer, meta: { fileName } } = await readImportDraft(draftId));
    } else if (file instanceof File && file.size > 0) {
      if (file.size > MAX_FILE_SIZE) {
        return noStoreJson({ message: "Ukuran file maksimal 15 MB untuk instalasi localhost." }, { status: 413 });
      }
      buffer = Buffer.from(await file.arrayBuffer());
      fileName = file.name;
    } else {
      return noStoreJson({ message: "Pilih file Excel atau CSV terlebih dahulu." }, { status: 400 });
    }

    const result = await importSalesBuffer(
      buffer,
      fileName,
      {
        mapping: parseMapping(formData.get("mapping")),
        sheetName: String(formData.get("sheetName") || "") || undefined,
        headerRow: Number(formData.get("headerRow")) || undefined,
        mode: (String(formData.get("mode") || "append") === "replace_range"
          ? "replace_range"
          : "append") as ImportMode,
        saveProfile: true,
      },
    );
    if (draftId) {
      await archiveImportDraft(draftId, result.batchId);
      await deleteImportDraft(draftId);
    }
    revalidateDashboard();
    return noStoreJson(result, { status: 201 });
  } catch (error) {
    console.error(error);
    if (error instanceof ImportValidationError) {
      return noStoreJson({ message: error.message }, { status: 400 });
    }
    return apiError(error);
  }
}
