"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { ArrowLeft, Database, LoaderCircle, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { apiFetch, notifyDashboardUpdate } from "@/lib/client-api";

type Transaction = {
  id: number;
  siteCode: string;
  siteDesc: string;
  salesCode: string | null;
  salesName: string;
  orderDate: string;
  brandName: string;
  articleCode: string | null;
  articleDescription: string;
  quantity: number;
  price: number;
  discount: number;
  totalNettAmountWithTax: number;
  totalNettAmountExcTax: number;
  category: string;
  category2: string | null;
  importBatch: { fileName: string };
};

type ResponseData = {
  rows: Transaction[];
  total: number;
  page: number;
  pageSize: number;
  stores: Array<{ siteCode: string; siteDesc: string }>;
};

const blank = {
  id: 0, siteCode: "", siteDesc: "", salesCode: "", salesName: "",
  orderDate: new Date().toISOString().slice(0, 10), brandName: "", articleCode: "",
  articleDescription: "", quantity: "1", price: "0", discount: "0",
  totalNettAmountWithTax: "", totalNettAmountExcTax: "", category: "DEVICE", category2: "",
};

const money = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const count = new Intl.NumberFormat("id-ID");

export default function TransactionsPage() {
  const now = new Date();
  const [filter, setFilter] = useState({ store: "", month: now.getMonth() + 1, year: now.getFullYear(), q: "", page: 1 });
  const [draftQuery, setDraftQuery] = useState("");
  const [form, setForm] = useState(blank);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const query = new URLSearchParams({ month: String(filter.month), year: String(filter.year), page: String(filter.page) });
  if (filter.store) query.set("store", filter.store);
  if (filter.q) query.set("q", filter.q);
  const { data, error, isLoading, isValidating, mutate } = useSWR<ResponseData>(`/api/admin/transactions?${query}`, (url: string) => apiFetch<ResponseData>(url, { cache: "no-store" }));

  useEffect(() => {
    if (!filter.store && data?.stores[0]) setFilter((value) => ({ ...value, store: data.stores[0].siteCode }));
  }, [data?.stores, filter.store]);

  const pages = Math.max(1, Math.ceil((data?.total || 0) / (data?.pageSize || 50)));
  const years = useMemo(() => Array.from({ length: 7 }, (_, index) => now.getFullYear() - 2 + index), [now]);

  function startCreate() {
    const store = data?.stores.find((item) => item.siteCode === filter.store);
    setForm({ ...blank, siteCode: store?.siteCode || "", siteDesc: store?.siteDesc || "", orderDate: `${filter.year}-${String(filter.month).padStart(2, "0")}-01` });
    setShowForm(true);
  }

  function startEdit(row: Transaction) {
    setForm({
      id: row.id, siteCode: row.siteCode, siteDesc: row.siteDesc, salesCode: row.salesCode || "",
      salesName: row.salesName, orderDate: row.orderDate.slice(0, 10), brandName: row.brandName,
      articleCode: row.articleCode || "", articleDescription: row.articleDescription,
      quantity: String(row.quantity), price: String(row.price), discount: String(row.discount),
      totalNettAmountWithTax: String(row.totalNettAmountWithTax), totalNettAmountExcTax: String(row.totalNettAmountExcTax),
      category: row.category, category2: row.category2 || "",
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const payload = {
        ...form,
        quantity: Number(form.quantity), price: Number(form.price), discount: Number(form.discount),
        totalNettAmountWithTax: Number(form.totalNettAmountWithTax), totalNettAmountExcTax: Number(form.totalNettAmountExcTax),
      };
      await apiFetch(form.id ? `/api/admin/transactions/${form.id}` : "/api/admin/transactions", {
        method: form.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      notifyDashboardUpdate();
      await mutate();
      setNotice({ type: "ok", text: form.id ? "Transaksi diperbarui dan dashboard disegarkan." : "Transaksi ditambahkan ke MySQL." });
      setShowForm(false);
      setForm(blank);
    } catch (saveError) {
      setNotice({ type: "error", text: saveError instanceof Error ? saveError.message : "Data gagal disimpan." });
    } finally { setBusy(false); }
  }

  async function remove(row: Transaction) {
    if (!confirm(`Hapus transaksi ${row.articleDescription} milik ${row.salesName}?`)) return;
    setBusy(true);
    try {
      await apiFetch(`/api/admin/transactions/${row.id}`, { method: "DELETE" });
      notifyDashboardUpdate();
      await mutate();
      setNotice({ type: "ok", text: "Transaksi dihapus dari MySQL dan dashboard disegarkan." });
    } catch (removeError) {
      setNotice({ type: "error", text: removeError instanceof Error ? removeError.message : "Transaksi gagal dihapus." });
    } finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen pb-12">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4 px-5 py-5">
          <div className="flex items-center gap-3"><span className="relative h-11 w-11 overflow-hidden rounded-xl"><Image src="/erafone.png" alt="Erafone" fill sizes="48px" className="object-cover" /></span><div><p className="text-xs font-black uppercase tracking-widest text-brand-600">Admin Analytics</p><h1 className="text-xl font-black">CRUD Transaksi Penjualan</h1></div></div>
          <div className="flex flex-wrap gap-2"><Link href="/admin/import" className="btn-secondary"><ArrowLeft size={15} /> Import</Link><Link href="/admin/report-targets" className="btn-secondary">Target Report</Link><Link href="/dashboard" className="btn-primary">Dashboard</Link></div>
        </div>
      </header>
      <div className="mx-auto max-w-[1500px] px-5 py-6">
        {notice && <div className={`mb-4 rounded-xl border p-3 text-sm ${notice.type === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>{notice.text}</div>}
        {showForm && <section className="card mb-5 p-5"><div className="flex items-center justify-between"><h2 className="font-black">{form.id ? `Edit transaksi #${form.id}` : "Tambah transaksi manual"}</h2><button className="btn-secondary" onClick={() => setShowForm(false)}><X size={16} /> Tutup</button></div><form onSubmit={save} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[["Kode Store","siteCode"],["Nama Store","siteDesc"],["Kode Sales","salesCode"],["Nama Sales","salesName"],["Tanggal","orderDate"],["Brand","brandName"],["Kode Artikel","articleCode"],["Deskripsi Artikel","articleDescription"],["Quantity","quantity"],["Harga","price"],["Diskon","discount"],["Net dengan Pajak","totalNettAmountWithTax"],["Net tanpa Pajak","totalNettAmountExcTax"],["Kategori","category"],["Kategori 2","category2"]].map(([label,key]) => <label key={key}><span className="label">{label}</span><input className="field" type={key === "orderDate" ? "date" : ["quantity","price","discount","totalNettAmountWithTax","totalNettAmountExcTax"].includes(key) ? "number" : "text"} step="any" value={form[key as keyof typeof form]} onChange={(event) => setForm((value) => ({ ...value, [key]: event.target.value }))} required={["siteCode","siteDesc","salesName","orderDate","brandName","articleDescription","quantity","totalNettAmountWithTax","totalNettAmountExcTax","category"].includes(key)} /></label>)}
          <div className="flex items-end"><button className="btn-primary w-full" disabled={busy}>{busy && <LoaderCircle size={16} className="animate-spin" />}{form.id ? "Simpan Perubahan" : "Tambah ke MySQL"}</button></div>
        </form></section>}

        <section className="card overflow-hidden"><div className="border-b border-stone-200 p-5"><div className="flex flex-wrap items-end gap-3"><label><span className="label">Store</span><select className="field min-w-64" value={filter.store} onChange={(e) => setFilter({ ...filter, store: e.target.value, page: 1 })}>{data?.stores.map((store) => <option key={store.siteCode} value={store.siteCode}>{store.siteCode} — {store.siteDesc}</option>)}</select></label><label><span className="label">Bulan</span><select className="field" value={filter.month} onChange={(e) => setFilter({ ...filter, month: Number(e.target.value), page: 1 })}>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{new Date(2026, i).toLocaleDateString("id-ID", { month: "long" })}</option>)}</select></label><label><span className="label">Tahun</span><select className="field" value={filter.year} onChange={(e) => setFilter({ ...filter, year: Number(e.target.value), page: 1 })}>{years.map((year) => <option key={year}>{year}</option>)}</select></label><form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setFilter({ ...filter, q: draftQuery, page: 1 }); }}><label><span className="label">Cari</span><input className="field" value={draftQuery} onChange={(e) => setDraftQuery(e.target.value)} placeholder="Sales, brand, artikel" /></label><button className="btn-secondary self-end">Cari</button></form><button className="btn-secondary" onClick={() => mutate()} disabled={isValidating}><RefreshCw size={15} className={isValidating ? "animate-spin" : ""} /> Segarkan</button><button className="btn-primary" onClick={startCreate}><Plus size={16} /> Tambah</button></div></div>
          <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50 px-5 py-3 text-sm"><span><strong>{count.format(data?.total || 0)}</strong> transaksi ditemukan</span><span>Halaman {filter.page} dari {pages}</span></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[1400px] text-xs"><thead className="bg-stone-900 text-white"><tr>{["Tanggal","Store","Sales","Brand","Artikel","Kategori","Qty","Net tanpa Pajak","Sumber","Aksi"].map((head) => <th key={head} className="px-3 py-3 text-left last:text-center">{head}</th>)}</tr></thead><tbody>{isLoading ? <tr><td colSpan={10} className="p-10 text-center"><LoaderCircle className="mx-auto animate-spin" /></td></tr> : error ? <tr><td colSpan={10} className="p-8 text-center text-red-600">{error.message}</td></tr> : data?.rows.map((row) => <tr key={row.id} className="border-t border-stone-100"><td className="whitespace-nowrap px-3 py-3">{new Date(row.orderDate).toLocaleDateString("id-ID", { timeZone: "UTC" })}</td><td className="px-3 py-3">{row.siteCode}</td><td className="px-3 py-3 font-bold">{row.salesName}</td><td className="px-3 py-3">{row.brandName}</td><td className="max-w-72 px-3 py-3"><span className="block truncate" title={row.articleDescription}>{row.articleDescription}</span></td><td className="px-3 py-3">{row.category}</td><td className="px-3 py-3 text-right">{count.format(row.quantity)}</td><td className="px-3 py-3 text-right font-semibold" title={String(row.totalNettAmountExcTax)}>{money.format(row.totalNettAmountExcTax)}</td><td className="max-w-52 px-3 py-3"><span className="block truncate" title={row.importBatch.fileName}>{row.importBatch.fileName}</span></td><td className="px-3 py-3"><div className="flex justify-center gap-1"><button className="btn-secondary h-9 px-2" onClick={() => startEdit(row)}><Pencil size={14} /></button><button className="btn-secondary h-9 px-2 text-red-600" disabled={busy} onClick={() => remove(row)}><Trash2 size={14} /></button></div></td></tr>)}</tbody></table></div>
          <div className="flex justify-between p-4"><button className="btn-secondary" disabled={filter.page <= 1} onClick={() => setFilter({ ...filter, page: filter.page - 1 })}>Sebelumnya</button><button className="btn-secondary" disabled={filter.page >= pages} onClick={() => setFilter({ ...filter, page: filter.page + 1 })}>Berikutnya</button></div>
        </section>
        <p className="mt-4 flex items-center gap-2 text-xs text-stone-500"><Database size={14} /> Semua perubahan dilakukan langsung pada MySQL dan memicu refresh dashboard.</p>
      </div>
    </main>
  );
}
