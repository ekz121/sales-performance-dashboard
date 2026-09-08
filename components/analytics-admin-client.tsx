"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  BarChart3, Boxes, ChevronRight, CircleGauge, Database, ExternalLink,
  Flag, LogOut, Pencil, Plus, RadioTower, RefreshCw, Save, Store as StoreIcon,
  Target, Trash2, Upload, Users,
} from "lucide-react";
import { apiFetch, notifyDashboardUpdate } from "@/lib/client-api";

type Section = "performance" | "brands" | "operators" | "racing" | "focus";
type TargetGroup = "categoryTargets" | "brandTargets" | "operatorTargets" | "racingTargets";
type StoreRow = { id: number; kode: string; nama: string; _count?: { sales: number } };
type StoreOption = { code: string; name: string; sales: string[] };
type TransactionRow = {
  id: number; siteCode: string; siteDesc: string; salesCode: string | null; salesName: string;
  orderDate: string; brandName: string; articleCode: string | null; articleDescription: string;
  quantity: number; price: number; discount: number; totalNettAmountWithTax: number;
  totalNettAmountExcTax: number; category: string; category2: string | null;
  importBatch: { fileName: string };
};
type ReportConfig = {
  categoryTargets: Record<string, Record<string, number>>;
  brandTargets: Record<string, Record<string, number>>;
  operatorTargets: Record<string, Record<string, number>>;
  racingTargets: Record<string, Record<string, { quantity?: number; amount?: number }>>;
};
type TargetResponse = { stores: StoreOption[]; defaultSelection: null | { storeCode: string; month: number; year: number }; report: null | { config: ReportConfig; sourceFile: string } };
type TransactionResponse = { rows: TransactionRow[]; total: number; page: number; pageSize: number };

const MENU = [
  { id: "performance" as const, label: "Perform Dashboard", icon: CircleGauge, group: "categoryTargets" as const },
  { id: "brands" as const, label: "Sales by Brand", icon: BarChart3, group: "brandTargets" as const },
  { id: "operators" as const, label: "Operator", icon: RadioTower, group: "operatorTargets" as const },
  { id: "racing" as const, label: "Racing", icon: Flag, group: "racingTargets" as const },
  { id: "focus" as const, label: "Produk Fokus", icon: Boxes, group: null },
];
const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const CATEGORIES = ["DEVICE", "ACC & IOT", "REPAIR CONTRACT", "CARRIER", "CE", "LAPTOP"];
const KEYS: Record<Exclude<Section, "focus">, string[]> = {
  performance: CATEGORIES,
  brands: ["APPLE", "HONOR", "HUAWEI", "INFINIX", "OPPO", "REALME", "SAMSUNG", "TECNO", "VIVO", "XIAOMI"],
  operators: ["INDOSAT", "TELKOMSEL", "XL PRIO"],
  racing: ["CAMON_50", "POVA_8", "MEDPOIN", "OPPO"],
};
const SECTION_INFO: Record<Section, { title: string; help: string; defaultCategory: string }> = {
  performance: { title: "Perform Dashboard", help: "Kelola actual seluruh kategori dan target perform per sales.", defaultCategory: "DEVICE" },
  brands: { title: "Sales by Brand", help: "Transaksi DEVICE membentuk pencapaian dan komposisi setiap brand.", defaultCategory: "DEVICE" },
  operators: { title: "Operator", help: "Gunakan kategori CARRIER dan nama brand/artikel INDOSAT, TELKOMSEL, atau XL.", defaultCategory: "CARRIER" },
  racing: { title: "Racing", help: "Target quantity/amount dan actual produk racing dibaca dari brand serta artikel.", defaultCategory: "DEVICE" },
  focus: { title: "Produk Fokus", help: "Actual produk fokus dihitung dari kategori, brand, dan deskripsi artikel yang diinput.", defaultCategory: "ACC & IOT" },
};
const emptyTransaction = (category = "DEVICE") => ({
  id: 0, salesName: "", salesCode: "", orderDate: new Date().toISOString().slice(0, 10),
  brandName: "", articleCode: "", articleDescription: "", quantity: "1", price: "0", discount: "0",
  totalNettAmountWithTax: "", totalNettAmountExcTax: "", category, category2: "",
});
type TransactionForm = ReturnType<typeof emptyTransaction>;

async function fetcher<T>(url: string) {
  try { return await apiFetch<T>(url, { cache: "no-store" }); }
  catch (error) {
    if (error && typeof error === "object" && "status" in error && error.status === 401) window.location.replace("/admin/login");
    throw error;
  }
}
async function request<T>(url: string, method: string, body?: unknown) {
  return apiFetch<T>(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
}
const number = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

function Field({ label, children, help }: { label: string; children: React.ReactNode; help?: string }) {
  return <label className="block"><span className="label">{label}</span>{children}{help && <span className="mt-1 block text-[11px] leading-4 text-stone-500">{help}</span>}</label>;
}

export function AnalyticsAdminClient() {
  const router = useRouter();
  const now = new Date();
  const [section, setSection] = useState<Section>("performance");
  const [storeCode, setStoreCode] = useState("");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showStores, setShowStores] = useState(false);

  const targetUrl = `/api/admin/report-targets?store=${encodeURIComponent(storeCode)}&month=${month}&year=${year}`;
  const { data: targetData, mutate: mutateTargets, isLoading: loadingOptions } = useSWR<TargetResponse>(targetUrl, fetcher);
  const { data: masterStores = [], mutate: mutateStores } = useSWR<StoreRow[]>("/api/admin/stores", fetcher);
  const categoryFilter = section === "brands" ? "DEVICE" : section === "operators" ? "CARRIER" : "";
  const transactionUrl = `/api/admin/transactions?store=${encodeURIComponent(storeCode)}&month=${month}&year=${year}&page=${page}&q=${encodeURIComponent(query)}${categoryFilter ? `&category=${encodeURIComponent(categoryFilter)}` : ""}`;
  const { data: transactions, mutate: mutateTransactions, isLoading: loadingTransactions } = useSWR<TransactionResponse>(storeCode ? transactionUrl : null, fetcher);
  const store = targetData?.stores.find((item) => item.code === storeCode);

  useEffect(() => {
    if (!storeCode && targetData?.stores.length) {
      const initial = targetData.defaultSelection;
      setStoreCode(initial?.storeCode || targetData.stores[0].code);
      if (initial) { setMonth(initial.month); setYear(initial.year); }
    }
  }, [storeCode, targetData]);
  useEffect(() => setPage(1), [section, storeCode, month, year, query]);

  async function run(action: () => Promise<void>) {
    setBusy(true); setNotice(null);
    try { await action(); }
    catch (error) { setNotice({ type: "error", text: error instanceof Error ? error.message : "Proses gagal." }); }
    finally { setBusy(false); }
  }
  async function changed(message: string) {
    await Promise.all([mutateTransactions(), mutateTargets(), mutateStores()]);
    notifyDashboardUpdate();
    setNotice({ type: "ok", text: `${message} Dashboard diperbarui otomatis dari MySQL.` });
  }
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/admin/login"); router.refresh();
  }

  return <main className="min-h-screen bg-stone-50 lg:flex">
    <aside className="border-b border-stone-200 bg-white lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:flex-none lg:border-b-0 lg:border-r">
      <div className="flex items-center gap-3 border-b border-stone-100 px-5 py-5">
        <span className="relative block h-12 w-12 flex-none overflow-hidden rounded-xl"><Image src="/erafone.png" alt="Erafone" fill sizes="48px" className="object-cover" priority /></span>
        <div><p className="text-xs font-black uppercase tracking-widest text-brand-600">Erafone</p><h1 className="text-lg font-black">Admin Analytics</h1></div>
      </div>
      <div className="p-4">
        <Link href="/admin/import" className="btn-primary w-full"><Upload size={17} /> Import Excel/CSV</Link>
        <button type="button" onClick={() => setShowStores((value) => !value)} className="btn-secondary mt-2 w-full"><StoreIcon size={17} /> Master Store ({masterStores.length})</button>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:space-y-1">
        {MENU.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setSection(id)} className={`flex flex-none items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold lg:w-full ${section === id ? "bg-brand-600 text-white shadow-md shadow-red-100" : "text-stone-600 hover:bg-stone-100"}`}><Icon size={19} />{label}{section === id && <ChevronRight size={15} className="ml-auto hidden lg:block" />}</button>)}
      </nav>
      <div className="p-4 lg:absolute lg:bottom-0 lg:w-72">
        <Link href="/dashboard" target="_blank" className="btn-secondary w-full"><ExternalLink size={16} /> Buka Dashboard</Link>
        <button type="button" onClick={logout} className="mt-2 flex w-full items-center justify-center gap-2 py-2 text-xs font-bold text-stone-500 hover:text-red-600"><LogOut size={15} /> Keluar</button>
      </div>
    </aside>

    <div className="min-w-0 flex-1">
      <header className="border-b border-stone-200 bg-white px-5 py-5 lg:px-8">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-black uppercase tracking-widest text-brand-600">Kelola data dashboard</p><h2 className="mt-1 text-2xl font-black">{SECTION_INFO[section].title}</h2><p className="mt-1 text-sm text-stone-500">{SECTION_INFO[section].help}</p></div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Store"><select className="field min-w-52" value={storeCode} onChange={(e) => setStoreCode(e.target.value)} disabled={loadingOptions}>{targetData?.stores.map((item) => <option key={item.code} value={item.code}>{item.code} — {item.name}</option>)}</select></Field>
            <Field label="Bulan"><select className="field" value={month} onChange={(e) => setMonth(Number(e.target.value))}>{MONTHS.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></Field>
            <Field label="Tahun"><input className="field w-28" type="number" min="2000" max="2200" value={year} onChange={(e) => setYear(Number(e.target.value))} /></Field>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] space-y-5 p-5 lg:p-8">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800"><strong>Dinamis:</strong> input manual dan impor menyimpan actual ke <code>SalesTransaction</code>; target disimpan ke <code>ReportDataset</code>. Dashboard membaca tabel yang sama secara real-time.</div>
        {notice && <div className={`rounded-xl border p-3 text-sm ${notice.type === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>{notice.text}</div>}
        {showStores && <StoreManager stores={masterStores} busy={busy} run={run} changed={changed} onClose={() => setShowStores(false)} />}
        {!storeCode && !loadingOptions && <div className="card p-8 text-center"><StoreIcon className="mx-auto text-stone-400" /><p className="mt-3 font-bold">Belum ada store.</p><p className="text-sm text-stone-500">Tambah Master Store atau import file MASTER terlebih dahulu.</p></div>}
        {storeCode && <>
          {MENU.find((item) => item.id === section)?.group && <TargetEditor section={section as Exclude<Section, "focus">} store={store} month={month} year={year} report={targetData?.report || null} busy={busy} run={run} changed={changed} />}
          {section === "focus" && <div className="card border-violet-200 bg-violet-50 p-4 text-sm text-violet-800"><strong>Produk Fokus memakai actual transaksi.</strong> Isi kategori/brand/artikel dengan benar: Device, Repair Contract, Carrier, ACC &amp; IoT, TMicro/Vidio, Medpoint, dan Trade In akan dihitung otomatis.</div>}
          <TransactionManager key={`${section}-${storeCode}-${month}-${year}`} section={section} store={store} storeCode={storeCode} month={month} year={year} data={transactions} loading={loadingTransactions} page={page} setPage={setPage} query={query} setQuery={setQuery} busy={busy} run={run} changed={changed} />
        </>}
      </div>
    </div>
  </main>;
}

function StoreManager({ stores, busy, run, changed, onClose }: { stores: StoreRow[]; busy: boolean; run: (action: () => Promise<void>) => Promise<void>; changed: (message: string) => Promise<void>; onClose: () => void }) {
  const [form, setForm] = useState({ id: 0, kode: "", nama: "" });
  const [filter, setFilter] = useState("");
  const shown = stores.filter((store) => `${store.kode} ${store.nama}`.toLowerCase().includes(filter.toLowerCase())).slice(0, 100);
  async function save(event: FormEvent) { event.preventDefault(); await run(async () => { await request(form.id ? `/api/admin/stores/${form.id}` : "/api/admin/stores", form.id ? "PATCH" : "POST", { kode: form.kode, nama: form.nama }); await changed(form.id ? "Store diperbarui." : "Store ditambahkan."); setForm({ id: 0, kode: "", nama: "" }); }); }
  async function remove(store: StoreRow) { if (!confirm(`Hapus store ${store.kode}? Store yang memiliki transaksi tidak dapat dihapus.`)) return; await run(async () => { await request(`/api/admin/stores/${store.id}`, "DELETE"); await changed("Store dihapus."); }); }
  return <section className="card overflow-hidden border-brand-100">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 p-5"><div><h3 className="font-black">Master Store — {stores.length} store</h3><p className="text-xs text-stone-500">Hasil import otomatis masuk ke sini. Edit nama/kode juga memperbarui transaksi dan target terkait.</p></div><button onClick={onClose} className="btn-secondary">Tutup</button></div>
    <div className="grid gap-5 p-5 lg:grid-cols-[330px_1fr]">
      <form onSubmit={save} className="space-y-3"><h4 className="font-bold">{form.id ? "Edit Store" : "Tambah Store"}</h4><Field label="Kode Store"><input required className="field uppercase" value={form.kode} onChange={(e) => setForm({ ...form, kode: e.target.value })} /></Field><Field label="Nama Store"><input required className="field" value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} /></Field><button disabled={busy} className="btn-primary w-full"><Save size={15} /> {form.id ? "Simpan Perubahan" : "Tambah Store"}</button>{form.id > 0 && <button type="button" className="btn-secondary w-full" onClick={() => setForm({ id: 0, kode: "", nama: "" })}>Batal Edit</button>}</form>
      <div><input className="field mb-3" placeholder="Cari kode atau nama store…" value={filter} onChange={(e) => setFilter(e.target.value)} /><div className="max-h-80 overflow-auto rounded-xl border border-stone-200"><table className="w-full min-w-[520px] text-sm"><thead className="sticky top-0 bg-stone-900 text-left text-xs uppercase text-white"><tr><th className="p-3">Kode</th><th className="p-3">Nama</th><th className="p-3">Sales</th><th className="p-3">Aksi</th></tr></thead><tbody>{shown.map((store) => <tr key={store.id} className="border-t border-stone-100"><td className="p-3 font-bold">{store.kode}</td><td className="p-3">{store.nama}</td><td className="p-3">{store._count?.sales || 0}</td><td className="p-3"><div className="flex gap-1"><button className="btn-secondary h-8" onClick={() => setForm({ id: store.id, kode: store.kode, nama: store.nama })}><Pencil size={13} /> Edit</button><button className="btn-secondary h-8 text-red-600" onClick={() => remove(store)}><Trash2 size={13} /></button></div></td></tr>)}</tbody></table></div><p className="mt-2 text-xs text-stone-500">Menampilkan maksimal 100 hasil. Gunakan pencarian untuk store lain.</p></div>
    </div>
  </section>;
}

function TargetEditor({ section, store, month, year, report, busy, run, changed }: { section: Exclude<Section, "focus">; store?: StoreOption; month: number; year: number; report: TargetResponse["report"]; busy: boolean; run: (action: () => Promise<void>) => Promise<void>; changed: (message: string) => Promise<void> }) {
  const group = MENU.find((item) => item.id === section)!.group as TargetGroup;
  const [salesName, setSalesName] = useState("");
  const [key, setKey] = useState(KEYS[section][0]);
  const [customKey, setCustomKey] = useState("");
  const [unit, setUnit] = useState<"amount" | "quantity">("amount");
  const [value, setValue] = useState("");
  useEffect(() => { if (store?.sales.length && !store.sales.includes(salesName)) setSalesName(store.sales[0]); }, [store, salesName]);
  const finalKey = customKey.trim() || key;
  const entries = useMemo<Array<{ key: string; unit?: "amount" | "quantity"; value: number }>>(() => {
    if (!report || !salesName) return [] as Array<{ key: string; unit?: "amount" | "quantity"; value: number }>;
    if (group === "racingTargets") return Object.entries(report.config.racingTargets[salesName] || {}).flatMap(([name, units]) => Object.entries(units).map(([kind, amount]) => ({ key: name, unit: kind as "amount" | "quantity", value: amount || 0 })));
    return Object.entries(report.config[group][salesName] || {}).map(([name, amount]) => ({ key: name, value: amount }));
  }, [report, salesName, group]);
  async function save(event: FormEvent) { event.preventDefault(); if (!store || !salesName || !finalKey) return; await run(async () => { await request("/api/admin/report-targets", "PUT", { storeCode: store.code, month, year, salesName, group, key: finalKey, unit, value: Number(value) }); await changed("Target disimpan."); setValue(""); }); }
  async function remove(item: { key: string; unit?: "amount" | "quantity"; value: number }) { if (!store || !confirm(`Hapus target ${item.key}?`)) return; await run(async () => { await request("/api/admin/report-targets", "DELETE", { storeCode: store.code, month, year, salesName, group, key: item.key, unit: item.unit || unit, value: item.value }); await changed("Target dihapus."); }); }
  return <section className="card overflow-hidden"><div className="flex items-center justify-between border-b border-stone-100 px-5 py-4"><div><h3 className="flex items-center gap-2 font-black"><Target size={18} className="text-brand-600" /> Target {SECTION_INFO[section].title}</h3><p className="mt-1 text-xs text-stone-500">{report ? `Sumber: ${report.sourceFile}` : "Belum ada target periode ini; simpan form untuk membuatnya."}</p></div></div>
    <div className="grid gap-5 p-5 lg:grid-cols-[390px_1fr]"><form onSubmit={save} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1"><Field label="Sales"><select required className="field" value={salesName} onChange={(e) => setSalesName(e.target.value)}>{store?.sales.map((name) => <option key={name}>{name}</option>)}</select></Field><div className="grid grid-cols-2 gap-2"><Field label="Jenis"><select className="field" value={key} onChange={(e) => { setKey(e.target.value); setCustomKey(""); }}>{KEYS[section].map((name) => <option key={name}>{name}</option>)}</select></Field>{group === "racingTargets" && <Field label="Satuan"><select className="field" value={unit} onChange={(e) => setUnit(e.target.value as "amount" | "quantity")}><option value="amount">Rupiah</option><option value="quantity">Quantity</option></select></Field>}</div><Field label="Jenis lain (opsional)" help="Contoh brand/produk baru di luar pilihan."><input className="field uppercase" placeholder="Kosongkan jika memakai pilihan" value={customKey} onChange={(e) => setCustomKey(e.target.value)} /></Field><Field label={unit === "quantity" && group === "racingTargets" ? "Nilai quantity" : "Nilai target (Rp)"}><input required min="0" className="field" type="number" value={value} onChange={(e) => setValue(e.target.value)} /></Field><button disabled={busy || !store?.sales.length} className="btn-primary"><Save size={15} /> Simpan Target</button></form>
      <div className="overflow-x-auto rounded-xl border border-stone-200"><table className="w-full min-w-[500px] text-sm"><thead className="bg-stone-900 text-left text-xs uppercase text-white"><tr><th className="p-3">Sales</th><th className="p-3">Jenis</th><th className="p-3 text-right">Target</th><th className="p-3">Aksi</th></tr></thead><tbody>{entries.length ? entries.map((item) => <tr key={`${item.key}-${item.unit}`} className="border-t border-stone-100"><td className="p-3 font-semibold">{salesName}</td><td className="p-3">{item.key}{item.unit ? ` (${item.unit})` : ""}</td><td className="p-3 text-right tabular-nums">{item.unit === "quantity" ? number.format(item.value) : `Rp ${number.format(item.value)}`}</td><td className="p-3"><button onClick={() => remove(item)} className="btn-secondary h-8 text-red-600"><Trash2 size={13} /> Hapus</button></td></tr>) : <tr><td colSpan={4} className="p-8 text-center text-stone-500">Belum ada target untuk sales ini.</td></tr>}</tbody></table></div>
    </div>
  </section>;
}

function TransactionManager({ section, store, storeCode, month, year, data, loading, page, setPage, query, setQuery, busy, run, changed }: { section: Section; store?: StoreOption; storeCode: string; month: number; year: number; data?: TransactionResponse; loading: boolean; page: number; setPage: (page: number) => void; query: string; setQuery: (value: string) => void; busy: boolean; run: (action: () => Promise<void>) => Promise<void>; changed: (message: string) => Promise<void> }) {
  const [form, setForm] = useState<TransactionForm>(() => ({ ...emptyTransaction(SECTION_INFO[section].defaultCategory), orderDate: `${year}-${String(month).padStart(2, "0")}-01` }));
  function edit(row: TransactionRow) { setForm({ id: row.id, salesName: row.salesName, salesCode: row.salesCode || "", orderDate: row.orderDate.slice(0, 10), brandName: row.brandName, articleCode: row.articleCode || "", articleDescription: row.articleDescription, quantity: String(row.quantity), price: String(row.price), discount: String(row.discount), totalNettAmountWithTax: String(row.totalNettAmountWithTax), totalNettAmountExcTax: String(row.totalNettAmountExcTax), category: row.category, category2: row.category2 || "" }); window.scrollTo({ top: 0, behavior: "smooth" }); }
  async function save(event: FormEvent) { event.preventDefault(); if (!store) return; await run(async () => { const payload = { ...form, id: undefined, siteCode: storeCode, siteDesc: store.name, salesCode: form.salesCode || null, articleCode: form.articleCode || null, category2: form.category2 || null, quantity: Number(form.quantity), price: Number(form.price), discount: Number(form.discount), totalNettAmountWithTax: Number(form.totalNettAmountWithTax), totalNettAmountExcTax: Number(form.totalNettAmountExcTax) }; await request(form.id ? `/api/admin/transactions/${form.id}` : "/api/admin/transactions", form.id ? "PATCH" : "POST", payload); await changed(form.id ? "Actual transaksi diperbarui." : "Actual transaksi ditambahkan."); setForm({ ...emptyTransaction(SECTION_INFO[section].defaultCategory), orderDate: `${year}-${String(month).padStart(2, "0")}-01`, salesName: form.salesName }); }); }
  async function remove(row: TransactionRow) { if (!confirm(`Hapus transaksi #${row.id} ${row.articleDescription}?`)) return; await run(async () => { await request(`/api/admin/transactions/${row.id}`, "DELETE"); await changed("Actual transaksi dihapus."); }); }
  return <section className="space-y-4"><div className="card overflow-hidden"><div className="border-b border-stone-100 px-5 py-4"><h3 className="flex items-center gap-2 font-black"><Database size={18} className="text-brand-600" /> {form.id ? `Edit Actual #${form.id}` : "Input Actual Manual"}</h3><p className="mt-1 text-xs text-stone-500">Satu input adalah satu baris transaksi. Data langsung masuk ke dashboard {SECTION_INFO[section].title}.</p></div><form onSubmit={save} className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4"><Field label="Nama Sales"><input className="field" required list="sales-options" value={form.salesName} onChange={(e) => setForm({ ...form, salesName: e.target.value })} /><datalist id="sales-options">{store?.sales.map((name) => <option key={name} value={name} />)}</datalist></Field><Field label="Kode Sales"><input className="field" value={form.salesCode} onChange={(e) => setForm({ ...form, salesCode: e.target.value })} /></Field><Field label="Tanggal"><input required className="field" type="date" value={form.orderDate} onChange={(e) => setForm({ ...form, orderDate: e.target.value })} /></Field><Field label="Kategori"><select className="field" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map((name) => <option key={name}>{name}</option>)}</select></Field><Field label="Brand"><input required className="field uppercase" placeholder="Contoh: SAMSUNG / TELKOMSEL" value={form.brandName} onChange={(e) => setForm({ ...form, brandName: e.target.value })} /></Field><Field label="Kode Artikel"><input className="field" value={form.articleCode} onChange={(e) => setForm({ ...form, articleCode: e.target.value })} /></Field><Field label="Deskripsi Artikel"><input required className="field" placeholder="Nama produk; gunakan Trade In/TMicro/Vidio bila sesuai" value={form.articleDescription} onChange={(e) => setForm({ ...form, articleDescription: e.target.value })} /></Field><Field label="Kategori 2"><input className="field" value={form.category2} onChange={(e) => setForm({ ...form, category2: e.target.value })} /></Field><Field label="Quantity"><input required className="field" type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></Field><Field label="Harga"><input required className="field" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></Field><Field label="Diskon"><input required className="field" type="number" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} /></Field><Field label="Net sebelum pajak" help="Angka utama MTD dashboard."><input required className="field" type="number" value={form.totalNettAmountExcTax} onChange={(e) => setForm({ ...form, totalNettAmountExcTax: e.target.value })} /></Field><Field label="Net termasuk pajak"><input required className="field" type="number" value={form.totalNettAmountWithTax} onChange={(e) => setForm({ ...form, totalNettAmountWithTax: e.target.value })} /></Field><div className="flex items-end gap-2 xl:col-span-3"><button disabled={busy} className="btn-primary min-w-48"><Plus size={15} /> {form.id ? "Simpan Perubahan" : "Tambah Actual"}</button>{form.id > 0 && <button type="button" className="btn-secondary" onClick={() => setForm({ ...emptyTransaction(SECTION_INFO[section].defaultCategory), orderDate: `${year}-${String(month).padStart(2, "0")}-01` })}>Batal Edit</button>}</div></form></div>
    <div className="card overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 p-4"><div><h3 className="font-black">Actual dari MySQL</h3><p className="text-xs text-stone-500">{number.format(data?.total || 0)} baris sesuai filter • termasuk hasil import dan input manual</p></div><input className="field w-full sm:w-72" placeholder="Cari sales, brand, atau artikel…" value={query} onChange={(e) => setQuery(e.target.value)} /></div><div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-sm"><thead className="bg-stone-900 text-left text-xs uppercase text-white"><tr><th className="p-3">Tanggal</th><th className="p-3">Sales</th><th className="p-3">Kategori</th><th className="p-3">Brand / Artikel</th><th className="p-3 text-right">Qty</th><th className="p-3 text-right">Net Exc Tax</th><th className="p-3">Sumber</th><th className="p-3">Aksi</th></tr></thead><tbody>{loading ? <tr><td colSpan={8} className="p-10 text-center text-stone-500"><RefreshCw className="mx-auto mb-2 animate-spin" />Memuat data…</td></tr> : data?.rows.length ? data.rows.map((row) => <tr key={row.id} className={`border-t border-stone-100 ${form.id === row.id ? "bg-brand-50" : ""}`}><td className="p-3">{new Date(row.orderDate).toLocaleDateString("id-ID", { timeZone: "UTC" })}</td><td className="p-3 font-semibold">{row.salesName}</td><td className="p-3"><span className="rounded-full bg-stone-100 px-2 py-1 text-xs font-bold">{row.category}</span></td><td className="p-3"><strong>{row.brandName}</strong><br /><span className="text-xs text-stone-500">{row.articleDescription}</span></td><td className="p-3 text-right tabular-nums">{number.format(row.quantity)}</td><td className="p-3 text-right tabular-nums">Rp {number.format(row.totalNettAmountExcTax)}</td><td className="p-3 text-xs text-stone-500">{row.importBatch.fileName}</td><td className="p-3"><div className="flex gap-1"><button className="btn-secondary h-8" onClick={() => edit(row)}><Pencil size={13} /> Edit</button><button className="btn-secondary h-8 text-red-600" onClick={() => remove(row)}><Trash2 size={13} /></button></div></td></tr>) : <tr><td colSpan={8} className="p-10 text-center text-stone-500">Belum ada actual pada filter ini.</td></tr>}</tbody></table></div><div className="flex items-center justify-between border-t border-stone-100 p-4"><button disabled={page <= 1} onClick={() => setPage(page - 1)} className="btn-secondary">Sebelumnya</button><span className="text-xs font-bold text-stone-500">Halaman {page} dari {Math.max(1, Math.ceil((data?.total || 0) / (data?.pageSize || 50)))}</span><button disabled={!data || page * data.pageSize >= data.total} onClick={() => setPage(page + 1)} className="btn-secondary">Berikutnya</button></div></div>
  </section>;
}
