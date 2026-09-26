"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Database,
  Download,
  FileSearch,
  History,
  LoaderCircle,
  RefreshCw,
  Target,
  Trash2,
  Upload,
} from "lucide-react";
import { apiFetch, notifyDashboardUpdate } from "@/lib/client-api";

type HeaderMapping = Record<string, string>;
type Preview = {
  draftId: string;
  fileName: string;
  sourceSheet: string;
  sheets: string[];
  headerRow: number;
  headers: string[];
  mapping: HeaderMapping;
  requiredFields: Array<{ key: string; label: string }>;
  missingFields: string[];
  ready: boolean;
  validationError: string | null;
  readRows: number;
  duplicateRows: number;
  stores: number;
  periodStart: string | null;
  periodEnd: string | null;
  totalQuantity: number;
  totalNettAmount: number;
  dateGaps: string[];
  detectedType: "master" | "report";
  report: { storeCode: string; month: number; year: number } | null;
};
type ImportResult = {
  batchId: number | null;
  fileName: string;
  detectedType: "master" | "report";
  readRows: number;
  insertedRows: number;
  duplicateRows: number;
  replacedRows: number;
  stores: number;
  periodStart: string | null;
  periodEnd: string | null;
  sourceSheet: string;
  importMode: "append" | "replace_range";
  totalQuantity: number;
  totalNettAmount: number;
  report: { storeCode: string; month: number; year: number } | null;
};
type Batch = {
  id: number;
  fileName: string;
  fileType: string;
  rowCount: number;
  insertedCount: number;
  duplicateCount: number;
  importMode: string;
  totalQuantity: number;
  totalNettAmount: number | string;
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: string;
  reportDatasets: Array<{ storeCode: string; month: number; year: number }>;
};

const number = new Intl.NumberFormat("id-ID");
const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
function date(value: string | null) {
  return value ? new Date(value).toLocaleDateString("id-ID", { timeZone: "UTC" }) : "-";
}

export default function ImportPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<HeaderMapping>({});
  const [sheetName, setSheetName] = useState("");
  const [headerRow, setHeaderRow] = useState(0);
  const [mode, setMode] = useState<"append" | "replace_range">("append");
  const [busy, setBusy] = useState<"preview" | "import" | "" | number>("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [inputKey, setInputKey] = useState(0);

  const firstDataDay = preview?.periodStart
    ? new Date(preview.periodStart).getUTCDate()
    : 1;
  const unusedHeaders = useMemo(() => preview?.headers.filter(Boolean) || [], [preview?.headers]);

  async function loadHistory() {
    try {
      setBatches(await apiFetch<Batch[]>("/api/admin/imports", { cache: "no-store" }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Riwayat import gagal dimuat.");
    }
  }
  useEffect(() => { void loadHistory(); }, []);

  async function analyze(useDraft = false) {
    if (!useDraft && !file) {
      setError("Pilih file Excel atau CSV terlebih dahulu.");
      return;
    }
    setBusy("preview");
    setError("");
    setNotice("");
    setResult(null);
    try {
      const formData = new FormData();
      if (useDraft && preview?.draftId) formData.set("draftId", preview.draftId);
      else if (file) formData.set("file", file);
      if (Object.keys(mapping).length) formData.set("mapping", JSON.stringify(mapping));
      if (sheetName) formData.set("sheetName", sheetName);
      if (headerRow) formData.set("headerRow", String(headerRow));
      const inspected = await apiFetch<Preview>("/api/admin/imports/preview", { method: "POST", body: formData });
      setPreview(inspected);
      setMapping(inspected.mapping);
      setSheetName(inspected.sourceSheet);
      setHeaderRow(inspected.headerRow);
      if (inspected.ready) setNotice("Analisis selesai. Periksa ringkasan lalu konfirmasi import ke MySQL.");
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Analisis file gagal.");
    } finally {
      setBusy("");
    }
  }

  async function commitImport() {
    if (!preview?.ready) return;
    if (mode === "replace_range" && !confirm(
      `Ganti transaksi ${preview.stores} store untuk rentang ${date(preview.periodStart)} sampai ${date(preview.periodEnd)}? Data lama akan dibackup dan dapat dipulihkan melalui rollback.`,
    )) return;
    setBusy("import");
    setError("");
    setNotice("");
    try {
      const formData = new FormData();
      formData.set("draftId", preview.draftId);
      formData.set("mapping", JSON.stringify(mapping));
      formData.set("sheetName", sheetName);
      formData.set("headerRow", String(headerRow));
      formData.set("mode", mode);
      const imported = await apiFetch<ImportResult>("/api/admin/imports", { method: "POST", body: formData });
      setResult(imported);
      setPreview(null);
      setFile(null);
      setMapping({});
      setSheetName("");
      setHeaderRow(0);
      setMode("append");
      setInputKey((value) => value + 1);
      notifyDashboardUpdate();
      await loadHistory();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Import gagal.");
    } finally {
      setBusy("");
    }
  }

  async function remove(batch: Batch) {
    if (!confirm(`Rollback import ${batch.fileName}? Data batch ini akan dihapus dan data yang sebelumnya diganti akan dipulihkan.`)) return;
    setBusy(batch.id);
    setError("");
    try {
      const response = await apiFetch<{ deletedTransactions: number; restoredTransactions: number }>(
        `/api/admin/imports/${batch.id}`,
        { method: "DELETE" },
      );
      notifyDashboardUpdate();
      await loadHistory();
      setNotice(`Rollback selesai: ${number.format(response.deletedTransactions)} baris dihapus dan ${number.format(response.restoredTransactions || 0)} baris lama dipulihkan.`);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Rollback gagal.");
    } finally {
      setBusy("");
    }
  }

  return <main className="min-h-screen pb-12">
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5">
        <div className="flex items-center gap-3">
          <span className="relative block h-12 w-12 overflow-hidden rounded-xl"><Image src="/erafone.png" alt="Logo Erafone" fill sizes="48px" className="object-cover" /></span>
          <div><p className="text-xs font-bold uppercase tracking-widest text-brand-600">Erafone &amp; More</p><h1 className="mt-1 text-xl font-bold">Import Excel Adaptif</h1></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin" className="btn-secondary"><ArrowLeft size={15} /> Admin</Link>
          <Link href="/admin/transactions" className="btn-secondary"><Database size={15} /> Transaksi</Link>
          <Link href="/admin/report-targets" className="btn-secondary"><Target size={15} /> Target &amp; Racing</Link>
          <Link href="/admin/racing" className="btn-secondary">Program Racing</Link>
          <Link href="/dashboard" className="btn-primary">Dashboard</Link>
        </div>
      </div>
    </header>

    <div className="mx-auto max-w-6xl px-5 py-7">
      <section className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3"><span className="rounded-xl bg-brand-50 p-3 text-brand-600"><Upload /></span><div><h2 className="font-bold">1. Pilih dan analisis file</h2><p className="mt-1 text-sm text-stone-500">XLSX/CSV maksimal 15 MB. File dianalisis dahulu dan belum mengubah dashboard.</p></div></div>
          <a href="/api/admin/imports/template" className="btn-secondary"><Download size={16} /> Unduh Template</a>
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <input key={inputKey} className="field h-auto flex-1 py-2" type="file" accept=".xlsx,.csv" onChange={(event) => { setFile(event.target.files?.[0] || null); setPreview(null); setMapping({}); setError(""); setNotice(""); }} />
          <button type="button" className="btn-primary min-w-48" disabled={!file || busy === "preview"} onClick={() => analyze(false)}>{busy === "preview" ? <LoaderCircle className="animate-spin" size={17} /> : <FileSearch size={17} />} Analisis File</button>
        </div>
      </section>

      {preview && <section className="card mt-5 overflow-hidden">
        <div className="border-b border-stone-200 p-5"><h2 className="font-bold">2. Pemetaan dan validasi</h2><p className="mt-1 text-sm text-stone-500">{preview.fileName} · sheet <strong>{preview.sourceSheet}</strong> · header baris {preview.headerRow}</p></div>
        <div className="grid gap-5 p-5 lg:grid-cols-[1fr_1.2fr]">
          <div className="space-y-4">
            <label><span className="label">Sheet transaksi</span><select className="field" value={sheetName} onChange={(event) => setSheetName(event.target.value)}>{preview.sheets.map((sheet) => <option key={sheet}>{sheet}</option>)}</select></label>
            <label><span className="label">Baris header</span><input className="field" type="number" min="1" max="100" value={headerRow || 1} onChange={(event) => setHeaderRow(Number(event.target.value))} /></label>
            <div className="rounded-xl border border-stone-200 p-4"><h3 className="font-bold">Kolom wajib</h3><div className="mt-3 grid gap-3">{preview.requiredFields.map((field) => <label key={field.key}><span className="label">{field.label}</span><select className={`field ${!mapping[field.key] ? "border-amber-400" : ""}`} value={mapping[field.key] || ""} onChange={(event) => setMapping((value) => ({ ...value, [field.key]: event.target.value }))}><option value="">— Pilih kolom Excel —</option>{unusedHeaders.map((header, index) => <option key={`${header}-${index}`} value={header}>{header || `Kolom ${index + 1}`}</option>)}</select></label>)}</div></div>
            <button type="button" className="btn-secondary w-full" disabled={busy === "preview"} onClick={() => analyze(true)}>{busy === "preview" ? <LoaderCircle className="animate-spin" size={16} /> : <RefreshCw size={16} />} Validasi Ulang</button>
          </div>

          <div className="space-y-4">
            {preview.validationError && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><div className="flex gap-2"><AlertTriangle className="shrink-0" size={18} /><p>{preview.validationError}</p></div></div>}
            {preview.ready && <>
              <div className="grid gap-3 sm:grid-cols-2"><Metric label="Baris dibaca" value={number.format(preview.readRows)} /><Metric label="Duplikat sudah ada" value={number.format(preview.duplicateRows)} /><Metric label="Store" value={number.format(preview.stores)} /><Metric label="Total quantity" value={number.format(preview.totalQuantity)} /><Metric label="Periode" value={`${date(preview.periodStart)} – ${date(preview.periodEnd)}`} /><Metric label="Total net exc. tax" value={rupiah.format(preview.totalNettAmount)} /></div>
              {firstDataDay > 1 && <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">Data dimulai tanggal <strong>{firstDataDay}</strong>. Dashboard tanggal 1–{firstDataDay - 1} akan menampilkan actual 0/Belum ada transaksi.</div>}
              {preview.dateGaps.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Ada tanggal kosong di dalam periode: {preview.dateGaps.map((item) => date(`${item}T00:00:00.000Z`)).join(", ")}.</div>}
              <fieldset className="rounded-xl border border-stone-200 p-4"><legend className="px-2 font-bold">Cara memasukkan data</legend><label className="mt-2 flex cursor-pointer gap-3"><input type="radio" checked={mode === "append"} onChange={() => setMode("append")} /><span><strong>Tambah aman (disarankan)</strong><small className="block text-stone-500">Tambah transaksi baru, lewati duplikat, dan jangan menghapus tanggal yang tidak ada di file.</small></span></label><label className="mt-4 flex cursor-pointer gap-3"><input type="radio" checked={mode === "replace_range"} onChange={() => setMode("replace_range")} /><span><strong>Ganti rentang file</strong><small className="block text-stone-500">Ganti data setiap store dari tanggal awal sampai akhir file. Data lama dibackup untuk rollback.</small></span></label></fieldset>
              <button type="button" className="btn-primary w-full" disabled={busy === "import"} onClick={commitImport}>{busy === "import" ? <LoaderCircle className="animate-spin" size={17} /> : <CheckCircle2 size={17} />} Konfirmasi Import ke MySQL</button>
            </>}
          </div>
        </div>
      </section>}

      {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {notice && <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}
      {result && <section className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-950"><h2 className="font-bold">Import berhasil dan dashboard telah diperbarui</h2><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><span>Dibaca: <strong>{number.format(result.readRows)}</strong></span><span>Baris aktif baru: <strong>{number.format(result.insertedRows)}</strong></span><span>Duplikat: <strong>{number.format(result.duplicateRows)}</strong></span><span>Diganti: <strong>{number.format(result.replacedRows)}</strong></span><span>Quantity: <strong>{number.format(result.totalQuantity)}</strong></span><span>Net: <strong>{rupiah.format(result.totalNettAmount)}</strong></span><span>Store: <strong>{number.format(result.stores)}</strong></span><span>Periode: <strong>{date(result.periodStart)} – {date(result.periodEnd)}</strong></span></div></section>}

      <section className="card mt-5 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-stone-200 px-5 py-4"><History size={18} className="text-brand-600" /><div><h2 className="font-bold">Riwayat Import &amp; Rollback</h2><p className="mt-1 text-xs text-stone-500">Rollback juga memulihkan data lama yang diganti.</p></div></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-sm"><thead className="bg-stone-50 text-left text-xs uppercase text-stone-500"><tr>{["Waktu","File","Mode","Periode","Dibaca","Aktif","Duplikat","Net File","Target","Aksi"].map((head) => <th key={head} className="px-4 py-3">{head}</th>)}</tr></thead><tbody>{batches.length ? batches.map((batch) => <tr key={batch.id} className="border-t border-stone-100"><td className="px-4 py-3">{new Date(batch.createdAt).toLocaleString("id-ID")}</td><td className="max-w-56 truncate px-4 py-3 font-medium" title={batch.fileName}>{batch.fileName}</td><td className="px-4 py-3">{batch.importMode === "replace_range" ? "Ganti rentang" : "Tambah"}</td><td className="px-4 py-3">{date(batch.periodStart)} – {date(batch.periodEnd)}</td><td className="px-4 py-3 text-right">{number.format(batch.rowCount)}</td><td className="px-4 py-3 text-right text-emerald-700">{number.format(batch.insertedCount)}</td><td className="px-4 py-3 text-right">{number.format(batch.duplicateCount || 0)}</td><td className="px-4 py-3 text-right">{rupiah.format(Number(batch.totalNettAmount || 0))}</td><td className="px-4 py-3">{batch.reportDatasets.map((item) => `${item.storeCode} · ${item.month}/${item.year}`).join(", ") || "-"}</td><td className="px-4 py-3"><button className="btn-secondary h-9 px-2 text-red-600" disabled={busy === batch.id} onClick={() => remove(batch)}>{busy === batch.id ? <LoaderCircle size={14} className="animate-spin" /> : <Trash2 size={14} />} Rollback</button></td></tr>) : <tr><td colSpan={10} className="p-10 text-center text-stone-500">Belum ada riwayat import.</td></tr>}</tbody></table></div>
      </section>
    </div>
  </main>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-stone-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-stone-500">{label}</p><p className="mt-1 font-black text-stone-900">{value}</p></div>;
}
