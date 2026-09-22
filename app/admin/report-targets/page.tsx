"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { ArrowLeft, LoaderCircle, Pencil, Plus, RefreshCw, Target, Trash2 } from "lucide-react";
import { apiFetch, notifyDashboardUpdate } from "@/lib/client-api";

type Group = "categoryTargets" | "brandTargets" | "operatorTargets" | "racingTargets";
type ReportConfig = {
  categoryTargets: Record<string, Record<string, number>>;
  brandTargets: Record<string, Record<string, number>>;
  operatorTargets: Record<string, Record<string, number>>;
  racingTargets: Record<string, Record<string, { amount?: number; quantity?: number }>>;
  racingDefinitions?: Array<{ key: string; label: string; unit: "qty" | "amount" }>;
};
type Data = {
  stores: Array<{ code: string; name: string; sales: string[] }>;
  report: { sourceFile: string; config: ReportConfig } | null;
};
type Row = { salesName: string; group: Group; key: string; unit?: "amount" | "quantity"; value: number };

const groups: Array<{ value: Group; label: string; keys: string[] }> = [
  { value: "categoryTargets", label: "Kategori", keys: ["DEVICE", "ACC & IOT", "REPAIR CONTRACT", "CARRIER", "CE", "LAPTOP"] },
  { value: "brandTargets", label: "Brand", keys: ["APPLE", "HUAWEI", "INFINIX", "IQOO", "MOTOROLA", "OPPO", "REALME", "SAMSUNG", "TECNO", "VIVO", "XIAOMI"] },
  { value: "operatorTargets", label: "Operator", keys: ["INDOSAT", "TELKOMSEL", "XL PRIO"] },
  { value: "racingTargets", label: "Racing", keys: ["CAMON_50", "POVA_8", "MEDPOIN", "OPPO"] },
];
const number = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });

function flatten(config?: ReportConfig): Row[] {
  if (!config) return [];
  const rows: Row[] = [];
  for (const group of ["categoryTargets", "brandTargets", "operatorTargets"] as const) {
    for (const [salesName, targets] of Object.entries(config[group] || {})) {
      for (const [key, value] of Object.entries(targets)) rows.push({ salesName, group, key, value });
    }
  }
  for (const [salesName, targets] of Object.entries(config.racingTargets || {})) {
    for (const [key, values] of Object.entries(targets)) {
      if (values.amount !== undefined) rows.push({ salesName, group: "racingTargets", key, unit: "amount", value: values.amount });
      if (values.quantity !== undefined) rows.push({ salesName, group: "racingTargets", key, unit: "quantity", value: values.quantity });
    }
  }
  return rows.sort((a, b) => a.salesName.localeCompare(b.salesName, "id") || a.group.localeCompare(b.group) || a.key.localeCompare(b.key));
}

export default function ReportTargetsPage() {
  const currentYear = new Date().getFullYear();
  const [period, setPeriod] = useState({ store: "", month: new Date().getMonth() + 1, year: currentYear });
  const [form, setForm] = useState<Row>({ salesName: "", group: "categoryTargets", key: "DEVICE", value: 0 });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const query = new URLSearchParams({ store: period.store, month: String(period.month), year: String(period.year) });
  const { data, error, isLoading, isValidating, mutate } = useSWR<Data>(`/api/admin/report-targets?${query}`, (url: string) => apiFetch<Data>(url, { cache: "no-store" }));
  const selectedStore = data?.stores.find((store) => store.code === period.store);
  const rows = useMemo(() => flatten(data?.report?.config), [data?.report?.config]);
  const selectedGroup = groups.find((group) => group.value === form.group) || groups[0];
  const selectedKeys = form.group === "racingTargets" && data?.report?.config.racingDefinitions?.length
    ? data.report.config.racingDefinitions.map((definition) => definition.key)
    : selectedGroup.keys;

  useEffect(() => {
    if (!period.store && data?.stores[0]) setPeriod((value) => ({ ...value, store: data.stores[0].code }));
  }, [data?.stores, period.store]);
  useEffect(() => {
    if (!form.salesName && selectedStore?.sales[0]) setForm((value) => ({ ...value, salesName: selectedStore.sales[0] }));
  }, [form.salesName, selectedStore?.sales]);

  async function request(method: "PUT" | "DELETE", row: Row) {
    setBusy(true);
    setNotice(null);
    try {
      await apiFetch("/api/admin/report-targets", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...row, storeCode: period.store, month: period.month, year: period.year }),
      });
      notifyDashboardUpdate();
      await mutate();
      setNotice({ type: "ok", text: method === "PUT" ? "Target disimpan ke MySQL dan dashboard diperbarui." : "Target dihapus dan dashboard diperbarui." });
    } catch (requestError) {
      setNotice({ type: "error", text: requestError instanceof Error ? requestError.message : "Perubahan target gagal." });
    } finally { setBusy(false); }
  }

  async function save(event: FormEvent) { event.preventDefault(); await request("PUT", form); }
  function edit(row: Row) { setForm(row); window.scrollTo({ top: 0, behavior: "smooth" }); }
  async function remove(row: Row) { if (confirm(`Hapus target ${row.key} untuk ${row.salesName}?`)) await request("DELETE", row); }

  return <main className="min-h-screen pb-12">
    <header className="border-b border-stone-200 bg-white"><div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4 px-5 py-5"><div className="flex items-center gap-3"><span className="relative h-11 w-11 overflow-hidden rounded-xl"><Image src="/erafone.png" alt="Erafone" fill sizes="48px" className="object-cover" /></span><div><p className="text-xs font-black uppercase tracking-widest text-brand-600">Admin Analytics</p><h1 className="text-xl font-black">CRUD Target Dashboard</h1></div></div><div className="flex flex-wrap gap-2"><Link href="/admin/import" className="btn-secondary"><ArrowLeft size={15} /> Import</Link><Link href="/admin/transactions" className="btn-secondary">Transaksi</Link><Link href="/dashboard" className="btn-primary">Dashboard</Link></div></div></header>
    <div className="mx-auto max-w-[1500px] px-5 py-6">
      {notice && <div className={`mb-4 rounded-xl border p-3 text-sm ${notice.type === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>{notice.text}</div>}
      <section className="card p-5"><div className="flex items-center gap-2"><Target className="text-brand-600" /><div><h2 className="font-black">Periode Target</h2><p className="text-xs text-stone-500">Target ini dipakai oleh semua tabel, kartu, dan grafik analytics.</p></div></div><div className="mt-5 flex flex-wrap gap-3"><label><span className="label">Store</span><select className="field min-w-72" value={period.store} onChange={(e) => { setPeriod({ ...period, store: e.target.value }); setForm((value) => ({ ...value, salesName: "" })); }}>{data?.stores.map((store) => <option key={store.code} value={store.code}>{store.code} — {store.name}</option>)}</select></label><label><span className="label">Bulan</span><select className="field" value={period.month} onChange={(e) => setPeriod({ ...period, month: Number(e.target.value) })}>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{new Date(2026, i).toLocaleDateString("id-ID", { month: "long" })}</option>)}</select></label><label><span className="label">Tahun</span><select className="field" value={period.year} onChange={(e) => setPeriod({ ...period, year: Number(e.target.value) })}>{Array.from({ length: 9 }, (_, i) => currentYear - 3 + i).map((year) => <option key={year}>{year}</option>)}</select></label><button className="btn-secondary self-end" onClick={() => mutate()} disabled={isValidating}><RefreshCw size={15} className={isValidating ? "animate-spin" : ""} /> Segarkan</button></div><p className="mt-3 text-xs text-stone-500">Sumber saat ini: <strong>{data?.report?.sourceFile || "Belum ada — akan dibuat dari Admin"}</strong></p></section>

      <section className="card mt-5 p-5"><h2 className="font-black">Tambah atau ubah target</h2><form onSubmit={save} className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-6"><label><span className="label">Sales</span><select className="field" value={form.salesName} onChange={(e) => setForm({ ...form, salesName: e.target.value })} required>{selectedStore?.sales.map((sales) => <option key={sales}>{sales}</option>)}</select></label><label><span className="label">Kelompok</span><select className="field" value={form.group} onChange={(e) => { const group = e.target.value as Group; const definition = groups.find((item) => item.value === group)!; setForm({ ...form, group, key: definition.keys[0], unit: group === "racingTargets" ? "amount" : undefined }); }}>{groups.map((group) => <option key={group.value} value={group.value}>{group.label}</option>)}</select></label><label><span className="label">Kategori/Brand/Program</span><input className="field" list="target-keys" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value.toUpperCase() })} required /><datalist id="target-keys">{selectedKeys.map((key) => <option key={key}>{key}</option>)}</datalist></label>{form.group === "racingTargets" && <label><span className="label">Satuan</span><select className="field" value={form.unit || "amount"} onChange={(e) => setForm({ ...form, unit: e.target.value as "amount" | "quantity" })}><option value="amount">Rupiah</option><option value="quantity">Quantity</option></select></label>}<label><span className="label">Nilai Target</span><input className="field" type="number" min="0" step="any" value={form.value} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} required /></label><div className="flex items-end"><button className="btn-primary w-full" disabled={busy || !period.store || !form.salesName}>{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Plus size={16} />} Simpan Target</button></div></form></section>

      <section className="card mt-5 overflow-hidden"><div className="border-b border-stone-200 px-5 py-4"><h2 className="font-black">Target tersimpan ({rows.length})</h2><p className="mt-1 text-xs text-stone-500">Setiap baris dapat diedit atau dihapus. Perubahan langsung dipakai analytics.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="bg-stone-900 text-white"><tr>{["Sales","Kelompok","Kategori/Program","Satuan","Nilai","Aksi"].map((head) => <th key={head} className="px-4 py-3 text-left last:text-center">{head}</th>)}</tr></thead><tbody>{isLoading ? <tr><td colSpan={6} className="p-10 text-center"><LoaderCircle className="mx-auto animate-spin" /></td></tr> : error ? <tr><td colSpan={6} className="p-8 text-center text-red-600">{error.message}</td></tr> : rows.length ? rows.map((row) => <tr key={`${row.salesName}-${row.group}-${row.key}-${row.unit || "value"}`} className="border-t border-stone-100"><td className="px-4 py-3 font-bold">{row.salesName}</td><td className="px-4 py-3">{groups.find((item) => item.value === row.group)?.label}</td><td className="px-4 py-3">{row.key}</td><td className="px-4 py-3">{row.unit === "quantity" ? "Qty" : "Rupiah"}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{number.format(row.value)}</td><td className="px-4 py-3"><div className="flex justify-center gap-2"><button className="btn-secondary h-9 px-2" onClick={() => edit(row)}><Pencil size={14} /></button><button className="btn-secondary h-9 px-2 text-red-600" disabled={busy} onClick={() => remove(row)}><Trash2 size={14} /></button></div></td></tr>) : <tr><td colSpan={6} className="p-10 text-center text-stone-500">Belum ada target pada periode ini.</td></tr>}</tbody></table></div></section>
    </div>
  </main>;
}
