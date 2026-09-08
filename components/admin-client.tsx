"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import {
  Database,
  ExternalLink,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Target,
  Trash2,
  Users,
} from "lucide-react";
import { CATEGORIES, CATEGORY_LABELS, type Category } from "@/lib/constants";
import { apiFetch } from "@/lib/client-api";

type Store = { id: number; nama: string; kode: string };
type Sales = {
  id: number;
  nama: string;
  storeId: number;
  aktif: boolean;
  store: Store;
};
type TargetRow = {
  id: number;
  salesId: number;
  kategori: Category;
  bulan: number;
  tahun: number;
  nilai: number;
  sales: Sales;
};
type EntryRow = {
  id: number;
  salesId: number;
  kategori: Category;
  tanggal: string;
  nilaiMtd: number;
  sales: Sales;
};
type Tab = "sales" | "targets" | "entries";

const rupiah = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
async function fetcher<T>(url: string): Promise<T> {
  try {
    return await apiFetch<T>(url, { cache: "no-store" });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "status" in error &&
      error.status === 401
    ) {
      window.location.href = "/admin/login";
    }
    throw error;
  }
}

async function request(url: string, method: string, body?: unknown) {
  return apiFetch<unknown>(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function Field({
  label,
  children,
  helper,
}: {
  label: string;
  children: React.ReactNode;
  helper?: string;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {helper && (
        <span className="mt-1 block text-[11px] text-stone-500">{helper}</span>
      )}
    </label>
  );
}

export function AdminClient() {
  const router = useRouter();
  const now = new Date();
  const [tab, setTab] = useState<Tab>("sales");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [notice, setNotice] = useState<{
    type: "ok" | "error";
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: stores = [] } = useSWR<Store[]>("/api/admin/stores", fetcher);
  const { data: sales = [], mutate: mutateSales } = useSWR<Sales[]>(
    "/api/admin/sales",
    fetcher,
  );
  const targetKey = `/api/admin/targets?month=${month}&year=${year}`;
  const entryKey = `/api/admin/entries?month=${month}&year=${year}`;
  const {
    data: targets = [],
    mutate: mutateTargets,
    isLoading: targetLoading,
  } = useSWR<TargetRow[]>(targetKey, fetcher);
  const {
    data: entries = [],
    mutate: mutateEntries,
    isLoading: entryLoading,
  } = useSWR<EntryRow[]>(entryKey, fetcher);
  const activeSales = useMemo(
    () => sales.filter((item) => item.aktif),
    [sales],
  );

  const [salesForm, setSalesForm] = useState({ id: 0, nama: "", storeId: 0 });
  const [targetForm, setTargetForm] = useState({
    id: 0,
    salesId: 0,
    kategori: "DEVICE" as Category,
    nilai: "",
  });
  const [entryForm, setEntryForm] = useState({
    id: 0,
    salesId: 0,
    kategori: "DEVICE" as Category,
    tanggal: `${year}-${String(month).padStart(2, "0")}-01`,
    nilaiMtd: "",
  });
  const salesFormRef = useRef<HTMLElement>(null);
  const targetFormRef = useRef<HTMLElement>(null);
  const entryFormRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setEntryForm((current) =>
      current.id
        ? current
        : {
            ...current,
            tanggal: `${year}-${String(month).padStart(2, "0")}-01`,
          },
    );
  }, [month, year]);

  function showEditForm(
    ref: React.RefObject<HTMLElement | null>,
    label: string,
  ) {
    setNotice({
      type: "ok",
      text: `Mode Edit ${label} aktif. Ubah data pada form yang disorot, lalu tekan Simpan Perubahan.`,
    });
    requestAnimationFrame(() =>
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  function editSales(item: Sales) {
    setSalesForm({ id: item.id, nama: item.nama, storeId: item.storeId });
    showEditForm(salesFormRef, "Sales");
  }

  function editTarget(item: TargetRow) {
    setTargetForm({
      id: item.id,
      salesId: item.salesId,
      kategori: item.kategori,
      nilai: String(item.nilai),
    });
    showEditForm(targetFormRef, "Target");
  }

  function editEntry(item: EntryRow) {
    setEntryForm({
      id: item.id,
      salesId: item.salesId,
      kategori: item.kategori,
      tanggal: item.tanggal.slice(0, 10),
      nilaiMtd: String(item.nilaiMtd),
    });
    showEditForm(entryFormRef, "Daily Entry");
  }

  function resetForms() {
    setSalesForm({ id: 0, nama: "", storeId: stores[0]?.id || 0 });
    setTargetForm({
      id: 0,
      salesId: activeSales[0]?.id || 0,
      kategori: "DEVICE",
      nilai: "",
    });
    setEntryForm({
      id: 0,
      salesId: activeSales[0]?.id || 0,
      kategori: "DEVICE",
      tanggal: `${year}-${String(month).padStart(2, "0")}-01`,
      nilaiMtd: "",
    });
  }

  async function afterMutation(
    message: string,
    localMutate: () => Promise<unknown>,
  ) {
    await Promise.all([
      localMutate(),
      globalMutate(`/api/dashboard?month=${month}&year=${year}`),
      globalMutate(
        (key) => typeof key === "string" && key.startsWith("/api/dashboard"),
      ),
    ]);
    setNotice({
      type: "ok",
      text: `${message} Dashboard sudah diinvalidasi dan akan membaca ulang database.`,
    });
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setNotice(null);
    try {
      await action();
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Aksi gagal",
      });
    } finally {
      setBusy(false);
    }
  }

  async function saveSales(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const payload = {
        nama: salesForm.nama,
        storeId: salesForm.storeId || stores[0]?.id,
      };
      await request(
        salesForm.id ? `/api/admin/sales/${salesForm.id}` : "/api/admin/sales",
        salesForm.id ? "PATCH" : "POST",
        payload,
      );
      await afterMutation(
        salesForm.id ? "Sales diperbarui." : "Sales ditambahkan.",
        mutateSales,
      );
      setSalesForm({ id: 0, nama: "", storeId: stores[0]?.id || 0 });
    });
  }

  async function toggleSales(item: Sales) {
    await run(async () => {
      await request(`/api/admin/sales/${item.id}`, "PATCH", {
        aktif: !item.aktif,
      });
      await afterMutation(
        item.aktif
          ? "Sales dinonaktifkan; histori tetap tersimpan."
          : "Sales diaktifkan kembali.",
        mutateSales,
      );
    });
  }

  async function saveTarget(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const payload = {
        salesId: targetForm.salesId || activeSales[0]?.id,
        kategori: targetForm.kategori,
        bulan: month,
        tahun: year,
        nilai: Number(targetForm.nilai),
      };
      await request(
        targetForm.id
          ? `/api/admin/targets/${targetForm.id}`
          : "/api/admin/targets",
        targetForm.id ? "PATCH" : "POST",
        payload,
      );
      await afterMutation(
        targetForm.id ? "Target diperbarui." : "Target ditambahkan.",
        mutateTargets,
      );
      setTargetForm({
        id: 0,
        salesId: activeSales[0]?.id || 0,
        kategori: "DEVICE",
        nilai: "",
      });
    });
  }

  async function deleteTarget(id: number) {
    if (!confirm("Hapus target ini? Tindakan ini tidak dapat dibatalkan."))
      return;
    await run(async () => {
      await request(`/api/admin/targets/${id}`, "DELETE");
      await afterMutation("Target dihapus.", mutateTargets);
    });
  }

  async function saveEntry(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const payload = {
        salesId: entryForm.salesId || activeSales[0]?.id,
        kategori: entryForm.kategori,
        tanggal: entryForm.tanggal,
        nilaiMtd: Number(entryForm.nilaiMtd),
      };
      await request(
        entryForm.id
          ? `/api/admin/entries/${entryForm.id}`
          : "/api/admin/entries",
        entryForm.id ? "PATCH" : "POST",
        payload,
      );
      await afterMutation(
        entryForm.id ? "Entry MTD diperbarui." : "Entry MTD ditambahkan.",
        mutateEntries,
      );
      setEntryForm({
        id: 0,
        salesId: activeSales[0]?.id || 0,
        kategori: "DEVICE",
        tanggal: entryForm.tanggal,
        nilaiMtd: "",
      });
    });
  }

  async function deleteEntry(id: number) {
    if (!confirm("Hapus entry MTD ini? Tindakan ini tidak dapat dibatalkan."))
      return;
    await run(async () => {
      await request(`/api/admin/entries/${id}`, "DELETE");
      await afterMutation("Entry MTD dihapus.", mutateEntries);
    });
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <main className="min-h-screen pb-12">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-brand-600">
              Erafone & More
            </p>
            <h1 className="mt-1 text-xl font-bold">Admin Data Manual</h1>
            <p className="mt-1 text-xs text-stone-500">
              Sales, Target, dan Daily Entry lama. Untuk dashboard analytics gunakan menu Transaksi dan Target Report.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/import" className="btn-primary">
              <Database size={15} /> Import Excel/CSV
            </Link>
            <Link href="/dashboard" target="_blank" className="btn-secondary">
              <ExternalLink size={15} /> Buka Dashboard
            </Link>
            <button onClick={logout} className="btn-secondary">
              <LogOut size={15} /> Keluar
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-6">
        <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
          <strong>Cara kerja:</strong> pilih menu, isi form, lalu simpan. Setiap
          perubahan otomatis menginvalidasi dashboard; tab dashboard lain juga
          mengambil ulang data maksimal dalam 10 detik.
        </div>
        {notice && (
          <div
            className={`mb-5 rounded-xl border p-3 text-sm ${notice.type === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}
          >
            {notice.text}
          </div>
        )}

        <details className="card mb-5 overflow-hidden">
          <summary className="cursor-pointer px-5 py-4 text-sm font-bold text-stone-800 hover:bg-stone-50">
            Panduan input admin — klik untuk membuka
          </summary>
          <div className="grid gap-3 border-t border-stone-200 bg-stone-50 p-4 md:grid-cols-3">
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
              <h3 className="font-bold text-sky-900">1. Sales</h3>
              <p className="mt-1 text-xs leading-5 text-sky-800">
                Buat nama sales terlebih dahulu. Data ini menjadi pilihan pada
                Target dan Daily Entry.
              </p>
            </div>
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
              <h3 className="font-bold text-violet-900">2. Target</h3>
              <p className="mt-1 text-xs leading-5 text-violet-800">
                Rencana omzet per sales, kategori, dan bulan. Satu kombinasi
                hanya memiliki satu target.
              </p>
            </div>
            <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
              <h3 className="font-bold text-orange-900">3. Daily Entry</h3>
              <p className="mt-1 text-xs leading-5 text-orange-800">
                Total MTD akumulatif pada tanggal input, bukan hanya transaksi
                pada hari tersebut.
              </p>
            </div>
          </div>
        </details>

        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <nav className="flex rounded-xl border border-stone-200 bg-white p-1">
            {(
              [
                ["sales", "Sales", Users],
                ["targets", "Target", Target],
                ["entries", "Daily Entry", Database],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => {
                  setTab(id);
                  setNotice(null);
                }}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${tab === id ? "bg-brand-600 text-white" : "text-stone-600 hover:bg-stone-50"}`}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </nav>
          {tab !== "sales" && (
            <div className="flex gap-2">
              <label>
                <span className="label">Bulan</span>
                <select
                  className="field w-36"
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                >
                  {[
                    "Jan",
                    "Feb",
                    "Mar",
                    "Apr",
                    "Mei",
                    "Jun",
                    "Jul",
                    "Agu",
                    "Sep",
                    "Okt",
                    "Nov",
                    "Des",
                  ].map((m, i) => (
                    <option value={i + 1} key={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="label">Tahun</span>
                <input
                  className="field w-28"
                  type="number"
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                />
              </label>
            </div>
          )}
        </div>

        {tab === "sales" && (
          <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
            <section
              ref={salesFormRef}
              className={`card h-fit scroll-mt-6 p-5 ${salesForm.id ? "border-2 border-brand-500 ring-4 ring-brand-100" : ""}`}
            >
              <h2 className="font-bold">
                {salesForm.id ? "Edit Sales" : "Tambah Sales"}
              </h2>
              {salesForm.id > 0 && (
                <p className="mt-2 rounded-lg bg-brand-50 p-2 text-xs font-bold text-brand-700">
                  MODE EDIT AKTIF — Sales #{salesForm.id}
                </p>
              )}
              <p className="mt-1 text-xs text-stone-500">
                Sales nonaktif tidak masuk kalkulasi dashboard, tetapi
                historinya tidak dihapus.
              </p>
              <form onSubmit={saveSales} className="mt-5 space-y-4">
                <Field label="Nama Sales">
                  <input
                    className="field"
                    required
                    value={salesForm.nama}
                    onChange={(e) =>
                      setSalesForm({ ...salesForm, nama: e.target.value })
                    }
                  />
                </Field>
                <Field label="Store">
                  <select
                    className="field"
                    required
                    value={salesForm.storeId || stores[0]?.id || ""}
                    onChange={(e) =>
                      setSalesForm({
                        ...salesForm,
                        storeId: Number(e.target.value),
                      })
                    }
                  >
                    {stores.map((s) => (
                      <option value={s.id} key={s.id}>
                        {s.nama}
                      </option>
                    ))}
                  </select>
                </Field>
                <button
                  className="btn-primary w-full"
                  disabled={busy || !stores.length}
                >
                  <Plus size={16} />
                  {salesForm.id ? "Simpan Perubahan" : "Tambah Sales"}
                </button>
                {salesForm.id > 0 && (
                  <button
                    type="button"
                    className="btn-secondary w-full"
                    onClick={() =>
                      setSalesForm({
                        id: 0,
                        nama: "",
                        storeId: stores[0]?.id || 0,
                      })
                    }
                  >
                    Batal Edit
                  </button>
                )}
              </form>
            </section>
            <DataTable headers={["Nama", "Store", "Status", "Aksi"]}>
              {sales.map((item) => (
                <tr
                  key={item.id}
                  className={`border-t border-stone-100 ${salesForm.id === item.id ? "bg-brand-50" : ""}`}
                >
                  <td className="px-4 py-3 font-medium">{item.nama}</td>
                  <td className="px-4 py-3 text-stone-600">
                    {item.store.nama}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${item.aktif ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"}`}
                    >
                      {item.aktif ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="btn-secondary h-8"
                        onClick={() => editSales(item)}
                      >
                        <Pencil size={13} /> Edit
                      </button>
                      <button
                        className="btn-secondary h-8"
                        onClick={() => toggleSales(item)}
                      >
                        {item.aktif ? (
                          <Trash2 size={13} />
                        ) : (
                          <RotateCcw size={13} />
                        )}
                        {item.aktif ? "Nonaktifkan" : "Aktifkan"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </DataTable>
          </div>
        )}

        {tab === "targets" && (
          <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
            <section
              ref={targetFormRef}
              className={`card h-fit scroll-mt-6 p-5 ${targetForm.id ? "border-2 border-brand-500 ring-4 ring-brand-100" : ""}`}
            >
              <h2 className="font-bold">
                {targetForm.id ? "Edit Target" : "Tambah Target"}
              </h2>
              {targetForm.id > 0 && (
                <p className="mt-2 rounded-lg bg-brand-50 p-2 text-xs font-bold text-brand-700">
                  MODE EDIT AKTIF — Target #{targetForm.id}
                </p>
              )}
              <p className="mt-1 text-xs text-stone-500">
                Satu target untuk setiap kombinasi sales, kategori, bulan, dan
                tahun.
              </p>
              <form onSubmit={saveTarget} className="mt-5 space-y-4">
                <SalesSelect
                  value={targetForm.salesId}
                  sales={activeSales}
                  onChange={(salesId) =>
                    setTargetForm({ ...targetForm, salesId })
                  }
                />
                <CategorySelect
                  value={targetForm.kategori}
                  onChange={(kategori) =>
                    setTargetForm({ ...targetForm, kategori })
                  }
                />
                <Field
                  label="Nilai Target"
                  helper="Masukkan angka rupiah tanpa pemisah titik."
                >
                  <input
                    className="field"
                    type="number"
                    min="0"
                    required
                    value={targetForm.nilai}
                    onChange={(e) =>
                      setTargetForm({ ...targetForm, nilai: e.target.value })
                    }
                  />
                </Field>
                <button
                  className="btn-primary w-full"
                  disabled={busy || !activeSales.length}
                >
                  <Plus size={16} />
                  {targetForm.id ? "Simpan Perubahan" : "Tambah Target"}
                </button>
                {targetForm.id > 0 && (
                  <button
                    type="button"
                    className="btn-secondary w-full"
                    onClick={resetForms}
                  >
                    Batal Edit
                  </button>
                )}
              </form>
            </section>
            <DataTable
              loading={targetLoading}
              headers={["Sales", "Kategori", "Nilai", "Aksi"]}
            >
              {targets.map((item) => (
                <tr
                  key={item.id}
                  className={`border-t border-stone-100 ${targetForm.id === item.id ? "bg-brand-50" : ""}`}
                >
                  <td className="px-4 py-3 font-medium">{item.sales.nama}</td>
                  <td className="px-4 py-3">
                    {CATEGORY_LABELS[item.kategori]}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    Rp {rupiah.format(item.nilai)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="btn-secondary h-8"
                        onClick={() => editTarget(item)}
                      >
                        <Pencil size={13} /> Edit
                      </button>
                      <button
                        className="btn-secondary h-8 text-red-600"
                        onClick={() => deleteTarget(item.id)}
                      >
                        <Trash2 size={13} /> Hapus
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </DataTable>
          </div>
        )}

        {tab === "entries" && (
          <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
            <section
              ref={entryFormRef}
              className={`card h-fit scroll-mt-6 p-5 ${entryForm.id ? "border-2 border-brand-500 ring-4 ring-brand-100" : ""}`}
            >
              <h2 className="font-bold">
                {entryForm.id ? "Edit Daily Entry" : "Tambah Daily Entry"}
              </h2>
              {entryForm.id > 0 && (
                <p className="mt-2 rounded-lg bg-brand-50 p-2 text-xs font-bold text-brand-700">
                  MODE EDIT AKTIF — Daily Entry #{entryForm.id}
                </p>
              )}
              <p className="mt-1 text-xs text-stone-500">
                Nilai yang diisi adalah total MTD akumulatif pada tanggal
                tersebut, bukan transaksi harian.
              </p>
              <form onSubmit={saveEntry} className="mt-5 space-y-4">
                <SalesSelect
                  value={entryForm.salesId}
                  sales={activeSales}
                  onChange={(salesId) =>
                    setEntryForm({ ...entryForm, salesId })
                  }
                />
                <CategorySelect
                  value={entryForm.kategori}
                  onChange={(kategori) =>
                    setEntryForm({ ...entryForm, kategori })
                  }
                />
                <Field label="Tanggal">
                  <input
                    className="field"
                    type="date"
                    required
                    value={entryForm.tanggal}
                    onChange={(e) =>
                      setEntryForm({ ...entryForm, tanggal: e.target.value })
                    }
                  />
                </Field>
                <Field
                  label="Nilai MTD"
                  helper="Dashboard memakai entry bertanggal paling baru per kategori."
                >
                  <input
                    className="field"
                    type="number"
                    min="0"
                    required
                    value={entryForm.nilaiMtd}
                    onChange={(e) =>
                      setEntryForm({ ...entryForm, nilaiMtd: e.target.value })
                    }
                  />
                </Field>
                <button
                  className="btn-primary w-full"
                  disabled={busy || !activeSales.length}
                >
                  <Plus size={16} />
                  {entryForm.id ? "Simpan Perubahan" : "Tambah Entry"}
                </button>
                {entryForm.id > 0 && (
                  <button
                    type="button"
                    className="btn-secondary w-full"
                    onClick={resetForms}
                  >
                    Batal Edit
                  </button>
                )}
              </form>
            </section>
            <DataTable
              loading={entryLoading}
              headers={["Tanggal", "Sales", "Kategori", "Nilai MTD", "Aksi"]}
            >
              {entries.map((item) => (
                <tr
                  key={item.id}
                  className={`border-t border-stone-100 ${entryForm.id === item.id ? "bg-brand-50" : ""}`}
                >
                  <td className="px-4 py-3">
                    {new Date(item.tanggal).toLocaleDateString("id-ID", {
                      timeZone: "UTC",
                    })}
                  </td>
                  <td className="px-4 py-3 font-medium">{item.sales.nama}</td>
                  <td className="px-4 py-3">
                    {CATEGORY_LABELS[item.kategori]}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    Rp {rupiah.format(item.nilaiMtd)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="btn-secondary h-8"
                        onClick={() => editEntry(item)}
                      >
                        <Pencil size={13} /> Edit
                      </button>
                      <button
                        className="btn-secondary h-8 text-red-600"
                        onClick={() => deleteEntry(item.id)}
                      >
                        <Trash2 size={13} /> Hapus
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </DataTable>
          </div>
        )}
      </div>
    </main>
  );
}

function SalesSelect({
  value,
  sales,
  onChange,
}: {
  value: number;
  sales: Sales[];
  onChange: (value: number) => void;
}) {
  return (
    <Field label="Sales">
      <select
        className="field"
        required
        value={value || sales[0]?.id || ""}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {sales.map((s) => (
          <option value={s.id} key={s.id}>
            {s.nama}
          </option>
        ))}
      </select>
    </Field>
  );
}

function CategorySelect({
  value,
  onChange,
}: {
  value: Category;
  onChange: (value: Category) => void;
}) {
  return (
    <Field label="Kategori">
      <select
        className="field"
        value={value}
        onChange={(e) => onChange(e.target.value as Category)}
      >
        {CATEGORIES.map((c) => (
          <option value={c} key={c}>
            {CATEGORY_LABELS[c]}
          </option>
        ))}
      </select>
    </Field>
  );
}

function DataTable({
  headers,
  children,
  loading = false,
}: {
  headers: string[];
  children: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[650px] text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase tracking-wider text-stone-500">
            <tr>
              {headers.map((header) => (
                <th className="px-4 py-3" key={header}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={headers.length}
                  className="p-10 text-center text-stone-500"
                >
                  <RefreshCw className="mx-auto mb-2 animate-spin" />
                  Memuat…
                </td>
              </tr>
            ) : (
              children
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
