"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Database, Download, FileSpreadsheet, History, LoaderCircle, Target, Trash2, Upload } from "lucide-react";
import { ApiResponseError, apiFetch, notifyDashboardUpdate } from "@/lib/client-api";

type Batch = {
  id: number; fileName: string; fileType: string; rowCount: number; insertedCount: number;
  periodStart: string | null; periodEnd: string | null; createdAt: string;
  reportDatasets: Array<{ storeCode: string; month: number; year: number }>;
};
type ImportResult = {
  fileName: string; detectedType: "master" | "report"; readRows: number; insertedRows: number;
  duplicateRows: number; stores: number; periodStart: string | null; periodEnd: string | null;
  sourceSheet: string;
  report: { storeCode: string; month: number; year: number } | null;
};

const number = new Intl.NumberFormat("id-ID");
function date(value: string | null) { return value ? new Date(value).toLocaleDateString("id-ID", { timeZone: "UTC" }) : "-"; }
function wait(milliseconds: number) { return new Promise((resolve) => window.setTimeout(resolve, milliseconds)); }

export default function ImportPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  async function loadHistory(showError = true) {
    try {
      const rows = await apiFetch<Batch[]>("/api/admin/imports", { cache: "no-store" });
      setBatches(rows);
      return rows;
    } catch (loadError) {
      if (showError) setError(loadError instanceof Error ? loadError.message : "Riwayat gagal dimuat.");
      return [];
    } finally { setLoading(false); }
  }
  useEffect(() => { void loadHistory(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = formData.get("file");
    if (!(file instanceof File)) { setError("Pilih file Excel atau CSV terlebih dahulu."); return; }
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["xlsx", "csv"].includes(extension)) { setError("Format file harus .xlsx atau .csv."); return; }
    if (file.size > 4 * 1024 * 1024) { setError("Ukuran file melebihi 4 MB. Pecah file per periode/store lalu unggah terpisah."); return; }
    const startedAt = Date.now();
    setUploading(true); setError(""); setNotice(""); setResult(null);
    try {
      const imported = await apiFetch<ImportResult>("/api/admin/imports", { method: "POST", body: formData });
      setResult(imported); form.reset(); notifyDashboardUpdate(); await loadHistory(false);
    } catch (uploadError) {
      const mayHaveFinished = uploadError instanceof ApiResponseError
        && (uploadError.status === 0 || uploadError.status >= 500);
      let recovered: Batch | undefined;
      if (mayHaveFinished) {
        for (let attempt = 0; attempt < 12 && !recovered; attempt += 1) {
          if (attempt) await wait(5_000);
          const rows = await loadHistory(false);
          recovered = rows.find((batch) => batch.fileName === file.name
            && new Date(batch.createdAt).getTime() >= startedAt - 10_000);
        }
      }
      if (recovered) {
        form.reset(); notifyDashboardUpdate();
        setError("");
        setNotice(`Import ${recovered.fileName} sudah tersimpan: ${number.format(recovered.insertedCount)} baris aktif. Respons browser sempat terputus, tetapi status database telah diverifikasi.`);
      } else {
        setError(uploadError instanceof Error ? uploadError.message : "Import gagal.");
      }
    }
    finally { setUploading(false); }
  }

  async function remove(batch: Batch) {
    const warning = batch.insertedCount
      ? `Hapus import ${batch.fileName}? ${number.format(batch.insertedCount)} transaksi yang berasal dari batch ini juga akan dihapus dari MySQL.`
      : `Hapus riwayat import ${batch.fileName}? Batch ini tidak menambah transaksi baru.`;
    if (!confirm(warning)) return;
    setDeleting(batch.id); setError(""); setNotice("");
    try {
      const response = await apiFetch<{ deletedTransactions: number; deletedReports: number }>(`/api/admin/imports/${batch.id}`, { method: "DELETE" });
      notifyDashboardUpdate(); await loadHistory();
      setNotice(`Import dihapus: ${number.format(response.deletedTransactions)} transaksi dan ${number.format(response.deletedReports)} target report.`);
    } catch (removeError) { setError(removeError instanceof Error ? removeError.message : "Import gagal dihapus."); }
    finally { setDeleting(null); }
  }

  return <main className="min-h-screen pb-12">
    <header className="border-b border-stone-200 bg-white"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5"><div className="flex items-center gap-3"><span className="relative block h-12 w-12 overflow-hidden rounded-xl"><Image src="/erafone.png" alt="Logo Erafone" fill sizes="48px" className="object-cover" /></span><div><p className="text-xs font-bold uppercase tracking-widest text-brand-600">Erafone & More</p><h1 className="mt-1 text-xl font-bold">Import Data Penjualan</h1></div></div><div className="flex flex-wrap gap-2"><Link href="/admin" className="btn-secondary"><ArrowLeft size={15} /> Admin</Link><Link href="/admin/transactions" className="btn-secondary"><Database size={15} /> Transaksi</Link><Link href="/admin/report-targets" className="btn-secondary"><Target size={15} /> Target</Link><Link href="/dashboard" className="btn-primary">Dashboard</Link></div></div></header>
    <div className="mx-auto max-w-6xl px-5 py-7">
      <div className="grid gap-4 md:grid-cols-3">{[[FileSpreadsheet,"1. Pilih file","Gunakan template atau workbook kerja. Nama sheet dan posisi header boleh bervariasi sesuai ketentuan."],[Database,"2. Validasi & impor","Sistem memilih sheet transaksi, memvalidasi data, membaca target, dan mencegah duplikat."],[CheckCircle2,"3. Kelola & tampilkan","Edit transaksi satu per satu atau hapus seluruh batch, lalu dashboard otomatis diperbarui."]].map(([Icon,title,copy]) => { const CardIcon=Icon as typeof FileSpreadsheet; return <section key={String(title)} className="card p-5"><CardIcon className="text-brand-600" /><h2 className="mt-4 font-bold">{String(title)}</h2><p className="mt-2 text-sm leading-6 text-stone-500">{String(copy)}</p></section>; })}</div>
      <section className="card mt-5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3"><span className="rounded-xl bg-brand-50 p-3 text-brand-600"><Upload /></span><div><h2 className="font-bold">Unggah Excel atau CSV</h2><p className="mt-1 text-xs text-stone-500">Maksimal 4 MB. File besar dapat memerlukan 1–2 menit; jangan menutup halaman saat validasi berjalan.</p></div></div>
          <a href="/api/admin/imports/template" className="btn-secondary"><Download size={16} /> Unduh Template Actual</a>
        </div>
        <form onSubmit={submit} className="mt-5 flex flex-col gap-3 sm:flex-row">
          <input className="field h-auto flex-1 py-2" type="file" name="file" accept=".xlsx,.csv" required />
          <button className="btn-primary min-w-48" disabled={uploading}>{uploading ? <LoaderCircle className="animate-spin" size={17} /> : <Upload size={17} />}{uploading ? "Validasi & menyimpan…" : "Validasi & Import"}</button>
        </form>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-stone-200 p-4 text-xs leading-6 text-stone-600"><h3 className="font-bold text-stone-900">Actual penjualan — sheet fleksibel</h3><p className="mt-1">Nama sheet boleh berbeda dan header boleh berada pada salah satu dari 30 baris pertama. Jika ada beberapa sheet transaksi, sheet bernama <strong>MASTER</strong> dipilih. Data ini mengisi actual kategori, sales, brand, operator, Racing, dan produk fokus.</p></div>
          <div className="rounded-xl border border-stone-200 p-4 text-xs leading-6 text-stone-600"><h3 className="font-bold text-stone-900">Target & Racing bulanan</h3><p className="mt-1">Sheet <strong>TARGET</strong> dibaca berdasarkan judul dan header sehingga blok boleh berpindah. Program baru yang tidak standar dapat ditentukan lewat <strong>RACING_CONFIG</strong> pada template, atau target diedit lewat menu <Link className="font-bold text-brand-600 underline" href="/admin/report-targets">Target</Link>.</p></div>
        </div>
        <details className="mt-4 rounded-xl bg-stone-50 p-4 text-xs leading-6 text-stone-600">
          <summary className="cursor-pointer font-bold text-stone-900">Lihat ketentuan kolom dan format data</summary>
          <div className="mt-3 space-y-2">
            <p><strong>9 kolom wajib:</strong> site_code, site_desc, sales_name, order_date, brand_name, article_description, quantity, total_nett_amount_exc_tax, CAT.</p>
            <p><strong>Kolom opsional yang ikut dibaca:</strong> sales_org, sales_org_desc, sales_code, pos_number, week, item_group, item_group_desc, article_code, price, discount, total_nett_amount_with_tax, CAT 2, BU DESC, SL, TSH.</p>
            <p><strong>Tanggal:</strong> tanggal Excel, DD/MM/YYYY, atau YYYY-MM-DD. <strong>Angka:</strong> angka murni tanpa teks “Rp”. Nilai 0 diperbolehkan.</p>
            <p><strong>Kategori utama dashboard:</strong> DEVICE, ACC &amp; IOT, REPAIR CONTRACT, CARRIER, CE, LAPTOP. Nama header tidak peka huruf besar/kecil; spasi, titik, garis miring, dan tanda hubung diterima sebagai pemisah.</p>
            <p><strong>Racing:</strong> report M221 Agustus/September dideteksi otomatis. Untuk format/program baru, gunakan sheet RACING_CONFIG agar brand, artikel, kategori, batas harga, satuan, dan target tidak perlu ditebak.</p>
            <p><strong>Keamanan data:</strong> seluruh file divalidasi dahulu. Jika satu baris wajib tidak valid, seluruh impor ditolak dan tidak ada data setengah masuk. Baris identik dari unggahan sebelumnya dilewati otomatis.</p>
          </div>
        </details>
        {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {notice && <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
        {result && <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><p className="font-bold">{result.fileName} berhasil diproses dan database telah diperbarui.</p><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><span>{number.format(result.insertedRows)} baris baru</span><span>{number.format(result.duplicateRows)} duplikat dilewati</span><span>{result.stores} store terdeteksi</span><span>{date(result.periodStart)} – {date(result.periodEnd)}</span></div><p className="mt-3 text-xs">Sheet actual yang dibaca: <strong>{result.sourceSheet}</strong>. {result.report ? `Target report ${result.report.storeCode} periode ${result.report.month}/${result.report.year} ikut disimpan.` : "File ini hanya berisi actual; target tidak diubah."}</p></div>}
      </section>
      <section className="card mt-5 overflow-hidden"><div className="flex items-center gap-2 border-b border-stone-200 px-5 py-4"><History size={18} className="text-brand-600" /><div><h2 className="font-bold">Riwayat Import & Rollback</h2><p className="mt-1 text-xs text-stone-500">Hapus batch jika file yang diunggah salah. Hanya data milik batch tersebut yang dihapus.</p></div></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500"><tr><th className="px-5 py-3">Waktu</th><th className="px-5 py-3">File</th><th className="px-5 py-3">Periode</th><th className="px-5 py-3">Dibaca</th><th className="px-5 py-3">Baris Aktif</th><th className="px-5 py-3">Target Report</th><th className="px-5 py-3 text-center">Aksi</th></tr></thead><tbody>{loading ? <tr><td colSpan={7} className="p-8 text-center text-stone-500">Memuat riwayat…</td></tr> : batches.length ? batches.map((batch) => <tr key={batch.id} className="border-t border-stone-100"><td className="px-5 py-3">{new Date(batch.createdAt).toLocaleString("id-ID")}</td><td className="max-w-64 truncate px-5 py-3 font-medium" title={batch.fileName}>{batch.fileName}</td><td className="px-5 py-3">{date(batch.periodStart)} – {date(batch.periodEnd)}</td><td className="px-5 py-3 tabular-nums">{number.format(batch.rowCount)}</td><td className="px-5 py-3 tabular-nums text-emerald-700">{number.format(batch.insertedCount)}</td><td className="px-5 py-3">{batch.reportDatasets.map((item) => `${item.storeCode} · ${item.month}/${item.year}`).join(", ") || "-"}</td><td className="px-5 py-3 text-center"><button className="btn-secondary h-9 px-2 text-red-600" disabled={deleting === batch.id} onClick={() => remove(batch)}>{deleting === batch.id ? <LoaderCircle size={15} className="animate-spin" /> : <Trash2 size={15} />} Hapus</button></td></tr>) : <tr><td colSpan={7} className="p-8 text-center text-stone-500">Belum ada file yang diimpor.</td></tr>}</tbody></table></div></section>
    </div>
  </main>;
}
