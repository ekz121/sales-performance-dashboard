import type { NextRequest } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { noStoreJson } from "@/lib/api";
import { readImportDraft, saveImportDraft } from "@/lib/import-drafts";
import {
  ImportValidationError,
  previewSalesBuffer,
  type HeaderMapping,
} from "@/lib/import-sales";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_FILE_SIZE = 15 * 1024 * 1024;

function mappingValue(value: FormDataEntryValue | null): HeaderMapping | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ImportValidationError("Pemetaan kolom tidak valid.");
  }
  return parsed as HeaderMapping;
}

export async function POST(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return noStoreJson({ message: "Sesi admin tidak valid." }, { status: 401 });
  }
  try {
    const formData = await request.formData();
    const uploaded = formData.get("file");
    const requestedDraft = String(formData.get("draftId") || "");
    let draftId = requestedDraft;
    let buffer: Buffer;
    let fileName: string;

    if (uploaded instanceof File && uploaded.size > 0) {
      if (uploaded.size > MAX_FILE_SIZE) {
        return noStoreJson({ message: "Ukuran file maksimal 15 MB untuk instalasi localhost." }, { status: 413 });
      }
      const saved = await saveImportDraft(
        uploaded.name,
        uploaded.type || "application/octet-stream",
        Buffer.from(await uploaded.arrayBuffer()),
      );
      draftId = saved.id;
      ({ buffer, meta: { fileName } } = await readImportDraft(draftId));
    } else if (draftId) {
      ({ buffer, meta: { fileName } } = await readImportDraft(draftId));
    } else {
      return noStoreJson({ message: "Pilih file Excel atau CSV terlebih dahulu." }, { status: 400 });
    }

    const preview = await previewSalesBuffer(buffer, fileName, {
      mapping: mappingValue(formData.get("mapping")),
      sheetName: String(formData.get("sheetName") || "") || undefined,
      headerRow: Number(formData.get("headerRow")) || undefined,
    });
    return noStoreJson({ draftId, ...preview });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "File tidak dapat dianalisis.";
    return noStoreJson({ message }, { status: error instanceof ImportValidationError ? 400 : 500 });
  }
}
