"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import useSWR from "swr";
import { ArrowLeft, Copy, Flag, LoaderCircle, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { apiFetch, notifyDashboardUpdate } from "@/lib/client-api";

type Definition = {
  key: string;
  label: string;
  unit: "qty" | "amount";
  brandIncludes?: string[];
  articleIncludes?: string[];
  category?: string;
  minUnitAmount?: number;
  amountSource?: "net" | "gross";
};
type Data = {
  stores: Array<{ code: string; name: string; sales: string[] }>;
  report: { sourceFile: string; config: { racingDefinitions?: Definition[] } } | null;
};
type Form = { key: string; label: string; unit: "qty" | "amount"; brand: string; article: string; category: string; minUnitAmount: string; amountSource: "net" | "gross" };

const emptyForm: Form = { key: "", label: "", unit: "qty", brand: "", article: "", category: "", minUnitAmount: "", amountSource: "net" };

export default function RacingAdminPage() {
  const now = new Date();
  const [period, setPeriod] = useState({ store: "", month: now.getMonth() + 1, year: now.getFullYear() });
  const [form, setForm] = useState<Form>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const query = new URLSearchParams({ store: period.store, month: String(period.month), year: String(period.year) });
  const { data, error, isLoading, isValidating, mutate } = useSWR<Data>(`/api/admin/report-targets?${query}`, (url: string) => apiFetch<Data>(url, { cache: "no-store" }));
  const definitions = data?.report?.config.racingDefinitions || [];

  useEffect(() => {
    if (!period.store && data?.stores[0]) setPeriod((value) => ({ ...value, store: data.stores[0].code }));
  }, [data?.stores, period.store]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setNotice(null);
    try {
      await apiFetch("/api/admin/racing-programs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeCode: period.store, month: period.month, year: period.year,
          key: form.key, label: form.label, unit: form.unit,
          brandIncludes: form.brand.split(/[;,|]/).map((item) => item.trim()).filter(Boolean),
          articleIncludes: form.article.split(/[;,|]/).map((item) => item.trim()).filter(Boolean),
          category: form.category || null,
          minUnitAmount: form.minUnitAmount ? Number(form.minUnitAmount) : null,
          amountSource: form.amountSource,
        }),
      });
      setForm(emptyForm); notifyDashboardUpdate(); await mutate();
      setNotice({ ok: true, text: "Program Racing disimpan dan dashboard diperbarui." });
    } catch (requestError) { setNotice({ ok: false, text: requestError instanceof Error ? requestError.message : "Program gagal disimpan." }); }
    finally { setBusy(false); }
  }

  async function remove(key: string) {
    if (!confirm(`Hapus program ${key} beserta targetnya pada periode ini?`)) return;
    setBusy(true); setNotice(null);
    try {
      await apiFetch("/api/admin/racing-programs", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storeCode: period.store, month: period.month, year: period.year, key }) });
      notifyDashboardUpdate(); await mutate(); setNotice({ ok: true, text: "Program Racing dihapus." });
    } catch (requestError) { setNotice({ ok: false, text: requestError instanceof Error ? requestError.message : "Program gagal dihapus." }); }
    finally { setBusy(false); }
  }

  async function copyPrevious() {
    if (!confirm("Salin program dan target Racing dari bulan sebelumnya? Konfigurasi Racing periode ini akan diganti.")) return;
    setBusy(true); setNotice(null);
    try {
      const response = await apiFetch<{ copiedPrograms: number }>("/api/admin/racing-programs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storeCode: period.store, month: period.month, year: period.year }) });
      notifyDashboardUpdate(); await mutate(); setNotice({ ok: true, text: `${response.copiedPrograms} program Racing berhasil disalin.` });
    } catch (requestError) { setNotice({ ok: false, text: requestError instanceof Error ? requestError.message : "Racing bulan sebelumnya tidak dapat disalin." }); }
    finally { setBusy(false); }
  }

  function edit(item: Definition) {
    setForm({ key: item.key, label: item.label, unit: item.unit, brand: item.brandIncludes?.join("; ") || "", article: item.articleIncludes?.join("; ") || "", category: item.category || "", minUnitAmount: item.minUnitAmount ? String(item.minUnitAmount) : "", amountSource: item.amountSource || "net" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return <main className="min-h-screen pb-12">
    <header className="border-b border-stone-200 bg-white"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5"><div><p className="text-xs font-black uppercase tracking-widest text-brand-600">Admin Analytics</p><h1 className="text-xl font-black">Konfigurasi Racing Bulanan</h1></div><div className="flex gap-2"><Link href="/admin" className="btn-secondary"><ArrowLeft size={15} /> Admin</Link><Link href="/admin/report-targets" className="btn-secondary">Target per Sales</Link><Link href="/dashboard" className="btn-primary">Dashboard</Link></div></div></header>
    <div className="mx-auto max-w-6xl space-y-5 px-5 py-6">
      {notice && <div className={`rounded-xl border p-3 text-sm ${notice.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>{notice.text}</div>}
      <section className="card p-5"><div className="flex flex-wrap items-end gap-3"><label><span className="label">Store</span><select className="field min-w-72" value={period.store} onChange={(e) => setPeriod({ ...period, store: e.target.value })}>{data?.stores.map((store) => <option key={store.code} value={store.code}>{store.code} — {store.name}</option>)}</select></label><label><span className="label">Bulan</span><select className="field" value={period.month} onChange={(e) => setPeriod({ ...period, month: Number(e.target.value) })}>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{new Date(2026, i).toLocaleDateString("id-ID", { month: "long" })}</option>)}</select></label><label><span className="label">Tahun</span><input className="field w-28" type="number" min="2000" max="2200" value={period.year} onChange={(e) => setPeriod({ ...period, year: Number(e.target.value) })} /></label><button className="btn-secondary" onClick={() => mutate()} disabled={isValidating}><RefreshCw size={15} className={isValidating ? "animate-spin" : ""} /> Segarkan</button><button className="btn-primary" onClick={copyPrevious} disabled={busy || !period.store}><Copy size={15} /> Salin Bulan Sebelumnya</button></div><p className="mt-3 text-xs text-stone-500">Setiap bulan menyimpan program, aturan pencocokan, dan target Racing sendiri.</p></section>
      <section className="card p-5"><h2 className="flex items-center gap-2 font-black"><Flag className="text-brand-600" /> Tambah atau edit program</h2><form onSubmit={save} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><label><span className="label">Kode program</span><input className="field uppercase" required placeholder="CONTOH: VIVO_3JT_UP" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value.toUpperCase() })} /></label><label><span className="label">Nama yang tampil</span><input className="field" required placeholder="Vivo 3 Juta ke Atas" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></label><label><span className="label">Satuan utama</span><select className="field" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value as "qty" | "amount" })}><option value="qty">Quantity</option><option value="amount">Rupiah</option></select></label><label><span className="label">Sumber nilai</span><select className="field" value={form.amountSource} onChange={(e) => setForm({ ...form, amountSource: e.target.value as "net" | "gross" })}><option value="net">Net sebelum pajak</option><option value="gross">Termasuk pajak</option></select></label><label><span className="label">Brand cocok</span><input className="field" placeholder="VIVO; IQOO" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></label><label><span className="label">Artikel mengandung</span><input className="field" placeholder="CAMON 50; CAMON50" value={form.article} onChange={(e) => setForm({ ...form, article: e.target.value })} /></label><label><span className="label">Kategori</span><input className="field uppercase" placeholder="DEVICE / ACC & IOT" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value.toUpperCase() })} /></label><label><span className="label">Harga/unit minimum</span><input className="field" type="number" min="0" placeholder="3000000" value={form.minUnitAmount} onChange={(e) => setForm({ ...form, minUnitAmount: e.target.value })} /></label><div className="flex gap-2 md:col-span-2 xl:col-span-4"><button className="btn-primary" disabled={busy || !period.store}>{busy ? <LoaderCircle size={15} className="animate-spin" /> : <Plus size={15} />} Simpan Program</button><button type="button" className="btn-secondary" onClick={() => setForm(emptyForm)}>Kosongkan</button></div></form></section>
      <section className="card overflow-hidden"><div className="border-b border-stone-200 px-5 py-4"><h2 className="font-black">Program periode ini ({definitions.length})</h2><p className="mt-1 text-xs text-stone-500">Target quantity/Rupiah per sales diisi melalui menu Target per Sales.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="bg-stone-900 text-left text-xs uppercase text-white"><tr>{["Program","Satuan","Brand","Artikel","Kategori","Minimum","Aksi"].map((head) => <th key={head} className="px-4 py-3">{head}</th>)}</tr></thead><tbody>{isLoading ? <tr><td colSpan={7} className="p-10 text-center"><LoaderCircle className="mx-auto animate-spin" /></td></tr> : error ? <tr><td colSpan={7} className="p-8 text-center text-red-600">{error.message}</td></tr> : definitions.length ? definitions.map((item) => <tr key={item.key} className="border-t border-stone-100"><td className="px-4 py-3"><strong>{item.label}</strong><br /><span className="text-xs text-stone-500">{item.key}</span></td><td className="px-4 py-3">{item.unit === "qty" ? "Quantity" : "Rupiah"}</td><td className="px-4 py-3">{item.brandIncludes?.join(", ") || "Semua"}</td><td className="px-4 py-3">{item.articleIncludes?.join(", ") || "Semua"}</td><td className="px-4 py-3">{item.category || "Semua"}</td><td className="px-4 py-3">{item.minUnitAmount ? new Intl.NumberFormat("id-ID").format(item.minUnitAmount) : "-"}</td><td className="px-4 py-3"><div className="flex gap-2"><button className="btn-secondary h-9 px-2" onClick={() => edit(item)}><Pencil size={14} /></button><button className="btn-secondary h-9 px-2 text-red-600" onClick={() => remove(item.key)} disabled={busy}><Trash2 size={14} /></button></div></td></tr>) : <tr><td colSpan={7} className="p-10 text-center text-stone-500">Belum ada program Racing. Tambahkan program atau salin bulan sebelumnya.</td></tr>}</tbody></table></div></section>
    </div>
  </main>;
}
