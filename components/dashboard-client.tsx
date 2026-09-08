"use client";

import Link from "next/link";
import useSWR from "swr";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Clock3,
  Download,
  Gauge,
  LockKeyhole,
  RefreshCw,
  Target,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  ComposedChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Fragment, useMemo, useState } from "react";
import type { DashboardData } from "@/lib/dashboard-types";
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  type Category,
} from "@/lib/constants";
import { exportDashboardToExcel } from "@/lib/export-excel";
import { DashboardGuide } from "@/components/dashboard-guide";
import { apiFetch } from "@/lib/client-api";

const MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];
const PERSON_BLOCK_STYLES = [
  {
    name: "bg-rose-100 text-rose-950 border-rose-500",
    line: "[&>td]:border-rose-400",
  },
  {
    name: "bg-blue-100 text-blue-950 border-blue-500",
    line: "[&>td]:border-blue-400",
  },
  {
    name: "bg-amber-100 text-amber-950 border-amber-500",
    line: "[&>td]:border-amber-400",
  },
  {
    name: "bg-emerald-100 text-emerald-950 border-emerald-500",
    line: "[&>td]:border-emerald-400",
  },
  {
    name: "bg-violet-100 text-violet-950 border-violet-500",
    line: "[&>td]:border-violet-400",
  },
  {
    name: "bg-cyan-100 text-cyan-950 border-cyan-500",
    line: "[&>td]:border-cyan-400",
  },
];
const fetcher = (url: string) =>
  apiFetch<DashboardData>(url, { cache: "no-store" });

const rupiah = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("id-ID", {
  notation: "compact",
  maximumFractionDigits: 2,
});
const money = (value: number) => `Rp ${rupiah.format(Math.round(value))}`;
const pct = (value: number | null) =>
  value === null ? "-" : `${Math.round(value)}%`;

function SummaryCard({
  label,
  value,
  helper,
  icon: Icon,
  accent = false,
}: {
  label: string;
  value: number;
  helper: string;
  icon: typeof Target;
  accent?: boolean;
}) {
  return (
    <section
      className={`card overflow-hidden p-5 ${accent ? "border-brand-100 bg-gradient-to-br from-brand-600 to-orange-500 text-white" : ""}`}
      title={helper}
    >
      <div className="flex items-start justify-between">
        <div>
          <p
            className={`text-xs font-semibold uppercase tracking-[0.14em] ${accent ? "text-orange-100" : "text-stone-500"}`}
          >
            {label}
          </p>
          <p className="mt-3 text-2xl font-bold tracking-tight lg:text-3xl">
            {money(value)}
          </p>
          <p
            className={`mt-2 text-xs ${accent ? "text-orange-100" : "text-stone-500"}`}
          >
            {helper}
          </p>
        </div>
        <span
          className={`rounded-xl p-2.5 ${accent ? "bg-white/15" : "bg-brand-50 text-brand-600"}`}
        >
          <Icon size={20} />
        </span>
      </div>
    </section>
  );
}

function ChartCard({
  title,
  helper,
  exportKey,
  children,
}: {
  title: string;
  helper: string;
  exportKey: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="card p-5"
      data-excel-chart={exportKey}
      data-excel-title={title}
    >
      <h2 className="text-base font-bold text-stone-900">{title}</h2>
      <p className="mt-1 text-xs text-stone-500">{helper}</p>
      <div className="mt-5 h-72">{children}</div>
    </section>
  );
}

export function DashboardClient() {
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());
  const [exporting, setExporting] = useState(false);
  const key = `/api/dashboard?month=${month}&year=${year}`;
  const { data, error, isLoading, isValidating, mutate } =
    useSWR<DashboardData>(key, fetcher, {
      refreshInterval: 10_000,
      revalidateOnFocus: true,
      dedupingInterval: 1_000,
    });

  const chartRows = useMemo(
    () =>
      data?.categories.map((row) => ({
        name: CATEGORY_LABELS[row.category as Category],
        category: row.category,
        mtd: row.mtd,
        achievement: Math.round(row.achievement || 0),
        contribution: data.grandTotal.mtd
          ? (row.mtd / data.grandTotal.mtd) * 100
          : 0,
      })) || [],
    [data],
  );

  async function exportExcel() {
    if (!data) return;
    setExporting(true);
    try {
      await exportDashboardToExcel(data);
    } catch (error) {
      alert(
        error instanceof Error
          ? `Export gagal: ${error.message}`
          : "Export Excel gagal.",
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="min-h-screen pb-12">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-5 px-5 py-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-600 to-orange-400 text-xl font-black text-white">
              E+
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">
                Erafone & More
              </p>
              <h1 className="mt-1 text-xl font-bold text-stone-900">
                Sales Performance Dashboard
              </h1>
              <p className="mt-1 text-xs text-stone-500">
                Monitoring proyeksi, pencapaian, dan kebutuhan harian tim sales.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label>
              <span className="label">Bulan</span>
              <select
                className="field min-w-36"
                value={month}
                onChange={(event) => setMonth(Number(event.target.value))}
              >
                {MONTHS.map((name, index) => (
                  <option key={name} value={index + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="label">Tahun</span>
              <input
                className="field w-28"
                type="number"
                min="2000"
                max="2200"
                value={year}
                onChange={(event) => setYear(Number(event.target.value))}
              />
            </label>
            <button
              className="btn-secondary"
              onClick={() => mutate()}
              disabled={isValidating}
              title="Ambil data terbaru dari database sekarang"
            >
              <RefreshCw
                size={16}
                className={isValidating ? "animate-spin" : ""}
              />{" "}
              Segarkan
            </button>
            <button
              className="btn-primary"
              onClick={exportExcel}
              disabled={!data || exporting}
              title="Unduh tabel, ringkasan, dan grafik periode yang tampil sebagai Excel"
            >
              <Download size={16} />{" "}
              {exporting ? "Membuat Excel…" : "Export Excel"}
            </button>
            <Link
              className="btn-secondary"
              href="/admin"
              title="Masuk ke halaman pengelolaan data"
            >
              <LockKeyhole size={16} /> Admin
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-5 py-7 lg:px-8">
        {error && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error.message}
          </div>
        )}
        {isLoading && (
          <div className="card grid min-h-64 place-items-center text-sm text-stone-500">
            <RefreshCw className="mb-3 animate-spin text-brand-600" />
            Mengambil data terbaru…
          </div>
        )}
        {data && (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-stone-700">
                <CalendarDays size={17} className="text-brand-600" />{" "}
                {data.period.label} · Snapshot hari ke-{data.period.elapsedDays}{" "}
                dari {data.period.totalDays}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-stone-500">
                <Clock3 size={14} /> Diperbarui{" "}
                {new Date(data.lastUpdated).toLocaleTimeString("id-ID")} ·
                otomatis setiap 10 detik
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <SummaryCard
                label="Total Target"
                value={data.grandTotal.target}
                helper="Akumulasi target seluruh sales dan kategori."
                icon={Target}
              />
              <SummaryCard
                label="Total MTD"
                value={data.grandTotal.mtd}
                helper="Nilai MTD terbaru pada periode terpilih."
                icon={WalletCards}
                accent
              />
              <SummaryCard
                label="Total Expect"
                value={data.grandTotal.expect}
                helper="Proyeksi MTD sampai akhir bulan."
                icon={TrendingUp}
              />
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <section
                className="card flex items-center justify-between p-5"
                title="Target dikurangi MTD saat ini"
              >
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                    Total Gap
                  </p>
                  <p className="mt-2 text-2xl font-bold">
                    {money(data.grandTotal.gap)}
                  </p>
                  <p className="mt-1 text-xs text-stone-500">Target − MTD</p>
                </div>
                <span className="rounded-2xl bg-amber-50 p-4 text-amber-600">
                  <Gauge />
                </span>
              </section>
              <section
                className="card flex items-center justify-between p-5"
                title="Perbandingan Expect bulan ini dengan actual final bulan sebelumnya"
              >
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                    Growth vs bulan lalu
                  </p>
                  <p
                    className={`mt-2 text-2xl font-bold ${(data.growth || 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}
                  >
                    {data.growth === null
                      ? "-"
                      : `${data.growth >= 0 ? "+" : ""}${Math.round(data.growth)}%`}
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    Expect kini vs actual final sebelumnya
                  </p>
                </div>
                <span
                  className={`rounded-2xl p-4 ${(data.growth || 0) >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}
                >
                  {(data.growth || 0) >= 0 ? (
                    <ArrowUpRight />
                  ) : (
                    <ArrowDownRight />
                  )}
                </span>
              </section>
            </div>

            <section className="card mt-6 overflow-hidden">
              <div className="border-b border-stone-200 px-5 py-4">
                <h2 className="font-bold">Detail Performance per Sales</h2>
                <p className="mt-1 text-xs text-stone-500">
                  Expect dihitung dari laju MTD; achievement membandingkan
                  Expect terhadap Target.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1120px] text-sm">
                  <thead className="text-left text-xs uppercase tracking-wider text-white">
                    <tr>
                      <th className="bg-stone-800 px-5 py-3">Sales</th>
                      <th className="bg-indigo-700 px-4 py-3">Kategori</th>
                      <th className="bg-sky-700 px-4 py-3 text-right">
                        Target
                      </th>
                      <th className="bg-orange-600 px-4 py-3 text-right">
                        MTD
                      </th>
                      <th className="bg-violet-700 px-4 py-3 text-right">
                        Expect
                      </th>
                      <th className="bg-amber-600 px-4 py-3 text-right">Gap</th>
                      <th
                        className="bg-cyan-700 px-4 py-3 text-right"
                        title="Gap dibagi jumlah hari tersisa"
                      >
                        Target / Hari
                      </th>
                      <th className="bg-emerald-700 px-5 py-3 text-right">
                        Achievement
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sales.map((person, personIndex) => {
                      const blockStyle =
                        PERSON_BLOCK_STYLES[
                          personIndex % PERSON_BLOCK_STYLES.length
                        ];
                      return (
                        <Fragment key={person.id}>
                          {[...person.rows, person.total].map(
                            (row, rowIndex) => (
                              <tr
                                key={`${person.id}-${row.category}`}
                                className={`${blockStyle.line} ${rowIndex === 0 ? "[&>td]:border-t-4" : "[&>td]:border-t [&>td]:border-t-stone-200"} ${row.category === "TOTAL" ? "font-bold [&>td]:border-b-4" : ""}`}
                              >
                                {rowIndex === 0 && (
                                  <td
                                    rowSpan={person.rows.length + 1}
                                    className={`min-w-48 border-r-4 px-5 py-4 align-middle ${blockStyle.name}`}
                                  >
                                    <>
                                      <span className="block text-[11px] font-bold uppercase tracking-widest opacity-60">
                                        Sales {personIndex + 1}
                                      </span>
                                      <span className="mt-2 block font-bold">
                                        {person.name}
                                      </span>
                                      <span className="mt-2 block text-xs font-semibold opacity-75">
                                        Growth{" "}
                                        {person.growth === null
                                          ? "-"
                                          : `${person.growth >= 0 ? "+" : ""}${Math.round(person.growth)}%`}
                                      </span>
                                    </>
                                  </td>
                                )}
                                <td className="bg-indigo-50 px-4 py-3 font-medium text-indigo-950">
                                  {row.label}
                                </td>
                                <td className="bg-sky-50 px-4 py-3 text-right tabular-nums text-sky-950">
                                  {rupiah.format(row.target)}
                                </td>
                                <td className="bg-orange-50 px-4 py-3 text-right tabular-nums text-orange-950">
                                  {rupiah.format(row.mtd)}
                                </td>
                                <td className="bg-violet-50 px-4 py-3 text-right tabular-nums text-violet-950">
                                  {rupiah.format(row.expect)}
                                </td>
                                <td className="bg-amber-50 px-4 py-3 text-right tabular-nums text-amber-950">
                                  {rupiah.format(row.gap)}
                                </td>
                                <td className="bg-cyan-50 px-4 py-3 text-right tabular-nums text-cyan-950">
                                  {row.targetByDay === null
                                    ? "-"
                                    : rupiah.format(
                                        Math.round(row.targetByDay),
                                      )}
                                </td>
                                <td className="bg-emerald-50 px-5 py-3 text-right">
                                  <span
                                    className={`inline-flex min-w-14 justify-center rounded-full px-2.5 py-1 text-xs font-bold ${(row.achievement || 0) >= 100 ? "bg-emerald-200 text-emerald-800" : "bg-red-100 text-red-700"}`}
                                  >
                                    {pct(row.achievement)}
                                  </span>
                                </td>
                              </tr>
                            ),
                          )}
                        </Fragment>
                      );
                    })}
                    {[...data.categories, data.grandTotal].map((row, index) => (
                      <tr
                        key={`grand-${row.category}`}
                        className={
                          row.category === "TOTAL"
                            ? "bg-stone-900 font-bold text-white"
                            : "bg-stone-100 font-semibold text-stone-800"
                        }
                      >
                        <td className="px-5 py-3">
                          {index === 0 ? "TOTAL SEMUA SALES" : ""}
                        </td>
                        <td className="px-4 py-3">{row.label}</td>
                        <td className="px-4 py-3 text-right">
                          {rupiah.format(row.target)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {rupiah.format(row.mtd)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {rupiah.format(row.expect)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {rupiah.format(row.gap)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {row.targetByDay === null
                            ? "-"
                            : rupiah.format(Math.round(row.targetByDay))}
                        </td>
                        <td className="px-5 py-3 text-right">
                          {pct(row.achievement)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="mt-6 grid gap-5 xl:grid-cols-3">
              <ChartCard
                title="MTD by Category"
                helper="Nilai MTD terbaru seluruh sales per kategori."
                exportKey="mtd-by-category"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartRows}
                    layout="vertical"
                    margin={{ left: 18, right: 18 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis
                      type="number"
                      tickFormatter={(v) => compact.format(v)}
                      fontSize={11}
                    />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={94}
                      fontSize={11}
                    />
                    <Tooltip formatter={(value) => money(Number(value))} />
                    <Bar dataKey="mtd" radius={[0, 7, 7, 0]}>
                      {chartRows.map((row) => (
                        <Cell
                          key={row.category}
                          fill={CATEGORY_COLORS[row.category as Category]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard
                title="Kontribusi MTD"
                helper="Porsi tiap kategori dari total MTD periode ini."
                exportKey="kontribusi-mtd"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartRows}
                      dataKey="contribution"
                      nameKey="name"
                      innerRadius={62}
                      outerRadius={94}
                      paddingAngle={2}
                    >
                      {chartRows.map((row) => (
                        <Cell
                          key={row.category}
                          fill={CATEGORY_COLORS[row.category as Category]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => `${Number(value).toFixed(1)}%`}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard
                title="Achievement by Category"
                helper="Garis putus-putus menandai threshold target 100%."
                exportKey="achievement-by-category"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={chartRows}
                    margin={{ left: 0, right: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="name"
                      fontSize={10}
                      interval={0}
                      angle={-15}
                      height={55}
                      textAnchor="end"
                    />
                    <YAxis tickFormatter={(v) => `${v}%`} fontSize={11} />
                    <Tooltip formatter={(value) => `${value}%`} />
                    <ReferenceLine
                      y={100}
                      stroke="#262626"
                      strokeDasharray="5 4"
                      label={{ value: "100%", fontSize: 10 }}
                    />
                    <Bar
                      dataKey="achievement"
                      fill="#ef3f23"
                      radius={[7, 7, 0, 0]}
                    />
                    <Line
                      dataKey="achievement"
                      stroke="transparent"
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
            <DashboardGuide />
          </>
        )}
      </div>
    </main>
  );
}
