import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const DRAFT_DIRECTORY = path.join(process.cwd(), "data", "import-drafts");
const ARCHIVE_DIRECTORY = path.join(process.cwd(), "data", "import-archive");
const MAX_AGE = 24 * 60 * 60 * 1_000;

type DraftMeta = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
};

function assertDraftId(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("ID draft import tidak valid.");
}

function paths(id: string) {
  assertDraftId(id);
  return {
    data: path.join(DRAFT_DIRECTORY, `${id}.bin`),
    meta: path.join(DRAFT_DIRECTORY, `${id}.json`),
  };
}

export async function cleanupImportDrafts() {
  await mkdir(DRAFT_DIRECTORY, { recursive: true });
  const now = Date.now();
  for (const entry of await readdir(DRAFT_DIRECTORY)) {
    const file = path.join(DRAFT_DIRECTORY, entry);
    try {
      if (now - (await stat(file)).mtimeMs > MAX_AGE) await unlink(file);
    } catch {
      // Draft yang sedang dipakai atau sudah terhapus dapat diabaikan.
    }
  }
}

export async function saveImportDraft(fileName: string, mimeType: string, buffer: Buffer) {
  await cleanupImportDrafts();
  const id = randomUUID();
  const target = paths(id);
  const meta: DraftMeta = {
    id,
    fileName: path.basename(fileName),
    mimeType,
    size: buffer.length,
    createdAt: new Date().toISOString(),
  };
  await Promise.all([
    writeFile(target.data, buffer),
    writeFile(target.meta, JSON.stringify(meta), "utf8"),
  ]);
  return meta;
}

export async function readImportDraft(id: string) {
  const target = paths(id);
  const [buffer, metaText] = await Promise.all([
    readFile(/* turbopackIgnore: true */ target.data),
    readFile(/* turbopackIgnore: true */ target.meta, "utf8"),
  ]);
  return { buffer, meta: JSON.parse(metaText) as DraftMeta };
}

export async function archiveImportDraft(id: string, batchId: number | null) {
  if (!batchId) return;
  const target = paths(id);
  const { meta } = await readImportDraft(id);
  const month = new Date().toISOString().slice(0, 7);
  const directory = path.join(ARCHIVE_DIRECTORY, month);
  await mkdir(directory, { recursive: true });
  const safeName = path.basename(meta.fileName).replace(/[^A-Za-z0-9._ -]/g, "_");
  await copyFile(target.data, path.join(directory, `${batchId}-${safeName}`));
}

export async function deleteImportDraft(id: string) {
  const target = paths(id);
  await Promise.allSettled([unlink(target.data), unlink(target.meta)]);
}
