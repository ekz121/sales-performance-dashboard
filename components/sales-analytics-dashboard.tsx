"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { createPortal } from "react-dom";
import {
  BarChart3,
  Boxes,
  CalendarDays,
  ChevronRight,
  CircleGauge,
  Flag,
  LoaderCircle,
  LockKeyhole,
  Medal,
  PanelLeftClose,
  PanelRightOpen,
  Printer,
  RadioTower,
  RefreshCw,
  Store,
  Target,
  TrendingUp,
  Upload,
  WalletCards,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ApiResponseError, apiFetch } from "@/lib/client-api";
import type { AnalyticsData, AnalyticsMetric } from "@/lib/analytics-types";

type Section = "performance" | "brands" | "operators" | "racing" | "focus";
type ValueKind = "money" | "number" | "percent";

const MENU = [
  { id: "performance" as const, label: "Perform Dashboard", icon: CircleGauge },
  { id: "brands" as const, label: "Sales by Brand", icon: BarChart3 },
  { id: "operators" as const, label: "Operator", icon: RadioTower },
  { id: "racing" as const, label: "Racing", icon: Flag },
  { id: "focus" as const, label: "Produk Fokus", icon: Boxes },
];

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
const COLORS = [
  "#e31e2f",
  "#f4b400",
  "#111827",
  "#0ea5e9",
  "#16a34a",
  "#7c3aed",
  "#f97316",
  "#ec4899",
  "#14b8a6",
  "#64748b",
];
const rupiah = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("id-ID", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function fullMoney(value: number) {
  return `Rp ${rupiah.format(Math.round(value))}`;
}

function money(value: number) {
  const absolute = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const format = (scaled: number) =>
    scaled.toLocaleString("id-ID", { maximumFractionDigits: 2 });
  if (absolute >= 1_000_000_000)
    return `${sign}Rp ${format(absolute / 1_000_000_000)} M`;
  if (absolute >= 1_000_000)
    return `${sign}Rp ${format(absolute / 1_000_000)} jt`;
  if (absolute >= 1_000) return `${sign}Rp ${format(absolute / 1_000)} rb`;
  return fullMoney(value);
}

function percent(value: number | null) {
  return value === null ? "-" : `${Math.round(value)}%`;
}

function tone(value: number | null) {
  if (value === null) return "bg-stone-100 text-stone-500";
  if (value >= 100) return "bg-emerald-100 text-emerald-800";
  if (value >= 80) return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-red-700";
}

function ExactValue({
  value,
  kind = "money",
  display,
  className = "",
}: {
  value: number;
  kind?: ValueKind;
  display?: string;
  className?: string;
}) {
  const [tip, setTip] = useState<{ left: number; top: number } | null>(null);
  const exact =
    kind === "money"
      ? fullMoney(value)
      : kind === "percent"
        ? `${rupiah.format(value)}%`
        : rupiah.format(value);
  const shown =
    display ??
    (kind === "money"
      ? money(value)
      : kind === "percent"
        ? `${Math.round(value)}%`
        : rupiah.format(value));
  function show(event: React.SyntheticEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setTip({
      left: Math.max(
        90,
        Math.min(window.innerWidth - 90, rect.left + rect.width / 2),
      ),
      top: Math.max(54, rect.top - 8),
    });
  }
  return (
    <>
      <span
        className={`inline-flex cursor-help border-b border-dotted border-current/40 tabular-nums outline-none ${className}`}
        tabIndex={0}
        aria-label={exact}
        onMouseEnter={show}
        onMouseLeave={() => setTip(null)}
        onFocus={show}
        onBlur={() => setTip(null)}
        onClick={show}
      >
        {shown}
      </span>
      {tip &&
        createPortal(
          <span
            role="tooltip"
            style={{ left: tip.left, top: tip.top }}
            className="pointer-events-none fixed z-[9999] -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-stone-950 px-3 py-2 text-xs font-bold text-white shadow-xl"
          >
            {exact}
          </span>,
          document.body,
        )}
    </>
  );
}

function KpiCard({
  label,
  value,
  helper,
  icon: Icon,
  accent = "red",
  kind = "money",
}: {
  label: string;
  value: number;
  helper: string;
  icon: typeof Target;
  accent?: "red" | "yellow" | "dark" | "green";
  kind?: ValueKind;
}) {
  const styles = {
    red: "border-red-100 bg-gradient-to-br from-red-600 to-rose-500 text-white",
    yellow:
      "border-amber-200 bg-gradient-to-br from-amber-400 to-yellow-300 text-stone-950",
    dark: "border-stone-700 bg-stone-900 text-white",
    green: "border-emerald-200 bg-emerald-600 text-white",
  };
  const display =
    kind === "money"
      ? money(value)
      : kind === "percent"
        ? `${Math.round(value)}%`
        : rupiah.format(value);
  const exact =
    kind === "money"
      ? fullMoney(value)
      : kind === "percent"
        ? `${rupiah.format(value)}%`
        : rupiah.format(value);
  return (
    <section className={`rounded-2xl border p-5 shadow-card ${styles[accent]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.15em] opacity-75">
            {label}
          </p>
          <p className="mt-3 text-xl font-black tracking-tight xl:text-2xl">
            <ExactValue value={value} kind={kind} display={display} />
          </p>
          <p className="mt-1 break-words text-[11px] font-semibold opacity-90">
            {exact}
          </p>
          <p className="mt-2 text-[11px] leading-4 opacity-70">{helper}</p>
        </div>
        <span className="rounded-xl bg-white/20 p-2.5">
          <Icon size={20} />
        </span>
      </div>
    </section>
  );
}

function Panel({
  title,
  helper,
  children,
  className = "",
}: {
  title: string;
  helper?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card overflow-hidden ${className}`}>
      <div className="border-b border-stone-100 px-5 py-4">
        <h2 className="font-black text-stone-900">{title}</h2>
        {helper && <p className="mt-1 text-xs text-stone-500">{helper}</p>}
      </div>
      {children}
    </section>
  );
}

function MetricTable({
  rows,
  firstLabel = "Kategori",
  valueFormatter = money,
}: {
  rows: Array<{ label: string; metric: AnalyticsMetric }>;
  firstLabel?: string;
  valueFormatter?: (value: number) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-sm">
        <thead className="bg-stone-900 text-left text-[11px] uppercase tracking-wider text-white">
          <tr>
            <th className="px-4 py-3">{firstLabel}</th>
            <th className="px-4 py-3 text-right">Target</th>
            <th className="px-4 py-3 text-right">MTD</th>
            <th className="px-4 py-3 text-right">Expect</th>
            <th className="px-4 py-3 text-right">Ach.</th>
            <th className="px-4 py-3 text-right">Gap</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-stone-100">
              <td className="px-4 py-3 font-bold">{row.label}</td>
              <td className="px-4 py-3 text-right">
                <ExactValue
                  value={row.metric.target}
                  kind={valueFormatter === money ? "money" : "number"}
                  display={valueFormatter(row.metric.target)}
                />
              </td>
              <td className="px-4 py-3 text-right font-semibold">
                <ExactValue
                  value={row.metric.mtd}
                  kind={valueFormatter === money ? "money" : "number"}
                  display={valueFormatter(row.metric.mtd)}
                />
              </td>
              <td className="px-4 py-3 text-right">
                <ExactValue
                  value={row.metric.expect}
                  kind={valueFormatter === money ? "money" : "number"}
                  display={valueFormatter(row.metric.expect)}
                />
              </td>
              <td className="px-4 py-3 text-right">
                <span
                  className={`rounded-full px-2 py-1 text-xs font-black ${tone(row.metric.achievement)}`}
                >
                  {percent(row.metric.achievement)}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <ExactValue
                  value={row.metric.gap}
                  kind={valueFormatter === money ? "money" : "number"}
                  display={valueFormatter(row.metric.gap)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PerformanceView({ data }: { data: AnalyticsData }) {
  const chart = data.performance.categories.map((row) => ({
    name: row.label,
    target: row.metric.target,
    mtd: row.metric.mtd,
    achievement: Math.round(row.metric.achievement || 0),
  }));
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          label="Total Target All"
          value={data.performance.total.target}
          helper="Target seluruh kategori"
          icon={Target}
          accent="dark"
        />
        <KpiCard
          label="Total MTD All"
          value={data.performance.total.mtd}
          helper="Net sales sebelum pajak"
          icon={WalletCards}
        />
        <KpiCard
          label="Total Expect All"
          value={data.performance.total.expect}
          helper={`Proyeksi dari hari ke-${data.meta.elapsedDays}`}
          icon={TrendingUp}
          accent="yellow"
        />
        <KpiCard
          label="Achievement"
          value={data.performance.total.achievement || 0}
          kind="percent"
          helper="Expect dibanding target"
          icon={Medal}
          accent="green"
        />
        <KpiCard
          label="Gap to Target"
          value={data.performance.total.gap}
          helper="Target dikurangi MTD"
          icon={CircleGauge}
          accent="dark"
        />
      </div>

      <Panel
        title="Digital Summary Dashboard"
        helper="Struktur target, MTD, expect, achievement, gap, growth, dan target harian mengikuti report klien."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1320px] text-xs">
            <thead className="bg-stone-900 text-left uppercase tracking-wider text-white">
              <tr>
                <th className="px-3 py-3">Sales</th>
                <th className="px-3 py-3">Kategori</th>
                <th className="px-3 py-3 text-right">Target</th>
                <th className="px-3 py-3 text-right">MTD</th>
                <th className="px-3 py-3 text-right">Expect</th>
                <th className="px-3 py-3 text-right">Ach.</th>
                <th className="px-3 py-3 text-right">Bulan Lalu</th>
                <th className="px-3 py-3 text-right">Growth</th>
                <th className="px-3 py-3 text-right">Gap</th>
                <th className="px-3 py-3 text-right">Target/Hari</th>
              </tr>
            </thead>
            <tbody>
              {data.performance.people.map((person) =>
                person.categories
                  .concat([
                    { key: "TOTAL", label: "Total All", metric: person.total },
                  ])
                  .map((row, index, all) => (
                    <tr
                      key={`${person.name}-${row.key}`}
                      className={`border-t border-stone-100 ${row.key === "TOTAL" ? "bg-amber-50 font-bold" : ""}`}
                    >
                      {index === 0 && (
                        <td
                          rowSpan={all.length}
                          className="border-r border-stone-200 bg-stone-50 px-3 py-3 align-top font-black"
                        >
                          {person.name}
                        </td>
                      )}
                      <td className="px-3 py-2.5 font-semibold">{row.label}</td>
                      <td className="px-3 py-2.5 text-right">
                        <ExactValue value={row.metric.target} />
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold">
                        <ExactValue value={row.metric.mtd} />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <ExactValue value={row.metric.expect} />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span
                          className={`rounded px-2 py-1 font-black ${tone(row.metric.achievement)}`}
                        >
                          {percent(row.metric.achievement)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {row.key === "TOTAL" &&
                        person.previousActual !== null ? (
                          <ExactValue value={person.previousActual} />
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {row.key === "TOTAL" && person.growth !== null ? (
                          <ExactValue value={person.growth} kind="percent" />
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <ExactValue value={row.metric.gap} />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {row.metric.targetByDay === null ? (
                          "-"
                        ) : (
                          <ExactValue value={row.metric.targetByDay} />
                        )}
                      </td>
                    </tr>
                  )),
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Target vs MTD per Kategori">
          <div className="h-80 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis
                  tickFormatter={(value) => compact.format(value)}
                  fontSize={11}
                />
                <Tooltip formatter={(value) => fullMoney(Number(value))} />
                <Legend />
                <Bar
                  dataKey="target"
                  name="Target"
                  fill="#e31e2f"
                  radius={[6, 6, 0, 0]}
                />
                <Bar
                  dataKey="mtd"
                  name="MTD"
                  fill="#f4b400"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Kontribusi MTD per Kategori">
          <div className="h-80 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chart}
                  dataKey="mtd"
                  nameKey="name"
                  innerRadius={70}
                  outerRadius={105}
                  paddingAngle={2}
                  labelLine={false}
                >
                  {chart.map((row, index) => (
                    <Cell key={row.name} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => fullMoney(Number(value))} />
                <Legend verticalAlign="bottom" height={48} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function BrandsView({ data }: { data: AnalyticsData }) {
  const chart = data.brands.slice(0, 12).map((row) => ({
    name: row.brand,
    target: row.metric.target,
    mtd: row.metric.mtd,
    achievement: Math.round(row.metric.achievement || 0),
  }));
  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        {data.performance.people.map((sales) => (
          <Panel
            key={sales.name}
            title={`Performa Brand — ${sales.name}`}
            helper="Target, MTD, expect, achievement, dan gap per salesperson."
          >
            <MetricTable
              firstLabel="Brand"
              rows={data.brands.map((brand) => ({
                label: brand.brand,
                metric: brand.people.find(
                  (person) => person.name === sales.name,
                )?.metric || {
                  target: 0,
                  mtd: 0,
                  quantity: 0,
                  expect: 0,
                  achievement: null,
                  gap: 0,
                  targetByDay: null,
                  contribution: 0,
                },
              }))}
            />
          </Panel>
        ))}
      </div>
      <Panel
        title="Total per Brand (Semua Salesperson)"
        helper="Angka dihitung dari transaksi kategori DEVICE."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-xs">
            <thead className="bg-stone-900 text-white">
              <tr>
                <th className="px-3 py-3 text-left">Brand</th>
                <th className="px-3 py-3 text-right">Target</th>
                <th className="px-3 py-3 text-right">Qty</th>
                <th className="px-3 py-3 text-right">MTD</th>
                <th className="px-3 py-3 text-right">Expect</th>
                <th className="px-3 py-3 text-right">Ach.</th>
                <th className="px-3 py-3 text-right">Kontribusi</th>
              </tr>
            </thead>
            <tbody>
              {data.brands.map((row, index) => (
                <tr key={row.brand} className="border-t border-stone-100">
                  <td className="px-3 py-3 font-bold">
                    <span
                      className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: COLORS[index % COLORS.length] }}
                    />
                    {row.brand}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <ExactValue value={row.metric.target} />
                  </td>
                  <td className="px-3 py-3 text-right">
                    <ExactValue value={row.metric.quantity} kind="number" />
                  </td>
                  <td className="px-3 py-3 text-right font-bold">
                    <ExactValue value={row.metric.mtd} />
                  </td>
                  <td className="px-3 py-3 text-right">
                    <ExactValue value={row.metric.expect} />
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span
                      className={`rounded px-2 py-1 font-black ${tone(row.metric.achievement)}`}
                    >
                      {percent(row.metric.achievement)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <ExactValue
                      value={row.metric.contribution}
                      kind="percent"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="MTD per Brand">
          <div className="h-80 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="name"
                  angle={-30}
                  textAnchor="end"
                  height={70}
                  fontSize={10}
                />
                <YAxis
                  tickFormatter={(value) => compact.format(value)}
                  fontSize={10}
                />
                <Tooltip formatter={(value) => fullMoney(Number(value))} />
                <Bar dataKey="mtd" name="MTD" fill="#f4b400" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Achievement per Brand">
          <div className="h-80 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="name"
                  angle={-30}
                  textAnchor="end"
                  height={70}
                  fontSize={10}
                />
                <YAxis tickFormatter={(value) => `${value}%`} />
                <Tooltip
                  formatter={(value) => `${rupiah.format(Number(value))}%`}
                />
                <Bar dataKey="achievement" name="Achievement" fill="#16a34a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Kontribusi MTD per Brand">
          <div className="h-80 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chart}
                  dataKey="mtd"
                  nameKey="name"
                  innerRadius={65}
                  outerRadius={100}
                  labelLine={false}
                >
                  {chart.map((row, index) => (
                    <Cell key={row.name} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => fullMoney(Number(value))} />
                <Legend verticalAlign="bottom" height={55} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Target vs MTD per Brand">
          <div className="h-80 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="name"
                  angle={-30}
                  textAnchor="end"
                  height={70}
                  fontSize={10}
                />
                <YAxis tickFormatter={(value) => compact.format(value)} />
                <Tooltip formatter={(value) => fullMoney(Number(value))} />
                <Legend />
                <Bar dataKey="target" name="Target" fill="#e31e2f" />
                <Bar dataKey="mtd" name="MTD" fill="#f4b400" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function OperatorView({ data }: { data: AnalyticsData }) {
  const chart = data.operators.map((row) => ({
    name: row.operator,
    target: row.metric.target,
    mtd: row.metric.mtd,
    achievement: Math.round(row.metric.achievement || 0),
  }));
  return (
    <div className="space-y-5">
      <Panel
        title="Carrier Erafone & More"
        helper="Target dan actual operator dikenali dari brand/deskripsi artikel kategori CARRIER."
      >
        <MetricTable
          firstLabel="Operator"
          rows={data.operators.map((row) => ({
            label: row.operator,
            metric: row.metric,
          }))}
        />
      </Panel>
      <div className="grid gap-5 lg:grid-cols-3">
        {data.operators.map((row) => (
          <Panel key={row.operator} title={row.operator}>
            <MetricTable
              firstLabel="Sales"
              rows={row.people.map((person) => ({
                label: person.name,
                metric: person.metric,
              }))}
            />
          </Panel>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <Panel title="Kontribusi MTD Carrier">
          <div className="h-80 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chart}
                  dataKey="mtd"
                  nameKey="name"
                  innerRadius={65}
                  outerRadius={100}
                  labelLine={false}
                >
                  {chart.map((row, index) => (
                    <Cell key={row.name} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => fullMoney(Number(value))} />
                <Legend verticalAlign="bottom" height={50} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Achievement Carrier">
          <div className="h-80 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" fontSize={10} />
                <YAxis tickFormatter={(value) => `${value}%`} />
                <Tooltip
                  formatter={(value) => `${rupiah.format(Number(value))}%`}
                />
                <Bar dataKey="achievement" fill="#f4b400" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Target vs MTD Carrier">
          <div className="h-80 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" fontSize={10} />
                <YAxis tickFormatter={(value) => compact.format(value)} />
                <Tooltip formatter={(value) => fullMoney(Number(value))} />
                <Legend />
                <Bar dataKey="target" name="Target" fill="#e31e2f" />
                <Bar dataKey="mtd" name="MTD" fill="#f4b400" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function RacingView({ data }: { data: AnalyticsData }) {
  const chart = data.racing.map((race) => ({
    name: race.label,
    target: race.metric.target,
    actual: race.metric.mtd,
    achievement: Math.round(race.metric.achievement || 0),
  }));
  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        {data.racing.map((race) => (
          <Panel
            key={race.key}
            title={`Racing ${race.label}`}
            helper={
              race.unit === "qty"
                ? "Target, actual, expect dalam unit."
                : "Target, actual, expect dalam Rupiah."
            }
          >
            <div className="grid grid-cols-3 border-b border-stone-100 bg-stone-50">
              <div className="p-4">
                <p className="text-[10px] font-bold uppercase text-stone-500">
                  Target
                </p>
                <p className="mt-1 font-black">
                  <ExactValue
                    value={race.metric.target}
                    kind={race.unit === "qty" ? "number" : "money"}
                  />
                </p>
              </div>
              <div className="p-4">
                <p className="text-[10px] font-bold uppercase text-stone-500">
                  Actual
                </p>
                <p className="mt-1 font-black text-brand-600">
                  <ExactValue
                    value={race.metric.mtd}
                    kind={race.unit === "qty" ? "number" : "money"}
                  />
                </p>
              </div>
              <div className="p-4">
                <p className="text-[10px] font-bold uppercase text-stone-500">
                  Achievement
                </p>
                <p className="mt-1 font-black">
                  {race.metric.achievement === null ? (
                    "-"
                  ) : (
                    <ExactValue
                      value={race.metric.achievement}
                      kind="percent"
                    />
                  )}
                </p>
              </div>
            </div>
            {race.quantityMetric && (
              <div className="grid grid-cols-3 border-b border-stone-100 bg-amber-50 px-4 py-3 text-xs">
                <span>
                  Target Booster Qty:{" "}
                  <strong>{rupiah.format(race.quantityMetric.target)}</strong>
                </span>
                <span>
                  Actual Qty:{" "}
                  <strong>{rupiah.format(race.quantityMetric.mtd)}</strong>
                </span>
                <span>
                  Expect Qty:{" "}
                  <strong>{rupiah.format(race.quantityMetric.expect)}</strong>
                </span>
              </div>
            )}
            <MetricTable
              firstLabel="Sales"
              valueFormatter={
                race.unit === "qty"
                  ? (value) => rupiah.format(Math.round(value))
                  : money
              }
              rows={race.people.map((person) => ({
                label: person.name,
                metric: person.metric,
              }))}
            />
          </Panel>
        ))}
      </div>
      <Panel title="Target vs Actual Semua Racing">
        <div className="h-80 p-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" fontSize={10} />
              <YAxis tickFormatter={(value) => compact.format(value)} />
              <Tooltip formatter={(value) => rupiah.format(Number(value))} />
              <Legend />
              <Bar dataKey="target" name="Target" fill="#e31e2f" />
              <Bar dataKey="actual" name="Actual" fill="#f4b400" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </div>
  );
}

function FocusView({ data }: { data: AnalyticsData }) {
  const deviceChart = data.focus.people.map((row) => ({
    name: row.name,
    value: row.device.mtd,
  }));
  const carrierChart = [
    {
      name: "ISAT",
      value: data.focus.people.reduce(
        (sum, row) => sum + row.carrier.indosat,
        0,
      ),
    },
    {
      name: "TSEL",
      value: data.focus.people.reduce(
        (sum, row) => sum + row.carrier.telkomsel,
        0,
      ),
    },
    {
      name: "XL",
      value: data.focus.people.reduce((sum, row) => sum + row.carrier.xl, 0),
    },
  ];
  const accChart = data.focus.people.map((row) => ({
    name: row.name,
    value: Math.round(row.accessory.rate),
  }));
  const medpointChart = data.focus.people.map((row) => ({
    name: row.name,
    value: row.medpoint.mtd,
  }));
  const cards = [
    {
      label: "Total Dev (Qty)",
      value: data.focus.totals.deviceQty,
      kind: "number" as const,
      icon: Boxes,
    },
    {
      label: "Total Dev (MTD)",
      value: data.focus.totals.deviceMtd,
      kind: "money" as const,
      icon: WalletCards,
    },
    {
      label: "Repair Contract",
      value: data.focus.totals.repairQty,
      kind: "number" as const,
      icon: Target,
    },
    {
      label: "Carrier",
      value: data.focus.totals.carrierQty,
      kind: "number" as const,
      icon: RadioTower,
    },
    {
      label: "ACC (Qty)",
      value: data.focus.totals.accessoryQty,
      kind: "number" as const,
      icon: Boxes,
    },
    {
      label: "Medpoint (MTD)",
      value: data.focus.totals.medpointMtd,
      kind: "money" as const,
      icon: TrendingUp,
    },
    {
      label: "Trade In (MTD)",
      value: data.focus.totals.tradeInMtd,
      kind: "money" as const,
      icon: RefreshCw,
    },
  ];
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
        {cards.map(({ label, value, kind, icon: Icon }) => (
          <section
            key={label}
            className="card border-t-4 border-t-brand-600 p-4"
          >
            <Icon size={18} className="text-brand-600" />
            <p className="mt-3 text-[10px] font-bold uppercase text-stone-500">
              {label}
            </p>
            <p className="mt-1 text-lg font-black">
              <ExactValue value={value} kind={kind} />
            </p>
          </section>
        ))}
      </div>
      <Panel
        title="Produk Fokus Erafone & More"
        helper="Semua kolom pada brief: DEV, repair, carrier, ACC, PPOB, Medpoint, dan Trade In."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1750px] text-xs">
            <thead className="bg-stone-900 text-white">
              <tr>
                {[
                  "Sales",
                  "Dev Qty",
                  "Dev MTD",
                  "Repair Qty",
                  "Repair AR",
                  "ISAT",
                  "TSEL",
                  "XL",
                  "Carrier Total",
                  "Carrier AR",
                  "ACC Qty",
                  "ACC MTD",
                  "ACC AR",
                  "ACC SOB",
                  "T-Micro",
                  "Vidio",
                  "Medpoint Qty",
                  "Medpoint MTD",
                  "Trade In Qty",
                  "Trade In MTD",
                ].map((head) => (
                  <th
                    key={head}
                    className="px-3 py-3 text-right first:text-left"
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.focus.people.map((row) => (
                <tr key={row.name} className="border-t border-stone-100">
                  <td className="px-3 py-3 font-black">{row.name}</td>
                  <td className="px-3 py-3 text-right">
                    {rupiah.format(row.device.quantity)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <ExactValue value={row.device.mtd} />
                  </td>
                  <td className="px-3 py-3 text-right">
                    {rupiah.format(row.repair.quantity)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {percent(row.repair.rate)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {rupiah.format(row.carrier.indosat)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {rupiah.format(row.carrier.telkomsel)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {rupiah.format(row.carrier.xl)}
                  </td>
                  <td className="px-3 py-3 text-right font-bold">
                    {rupiah.format(row.carrier.total)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {percent(row.carrier.rate)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {rupiah.format(row.accessory.quantity)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <ExactValue value={row.accessory.mtd} />
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span
                      className={`rounded px-2 py-1 font-bold ${tone(row.accessory.rate)}`}
                    >
                      {percent(row.accessory.rate)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    {percent(row.accessory.sob)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {rupiah.format(row.ppob.tmicro)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {rupiah.format(row.ppob.vidio)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {rupiah.format(row.medpoint.quantity)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <ExactValue value={row.medpoint.mtd} />
                  </td>
                  <td className="px-3 py-3 text-right">
                    {rupiah.format(row.tradeIn.quantity)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <ExactValue value={row.tradeIn.mtd} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="DEV MTD (Top Performer)">
          <div className="h-80 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deviceChart} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(value) => compact.format(value)}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  fontSize={10}
                />
                <Tooltip formatter={(value) => fullMoney(Number(value))} />
                <Bar dataKey="value" fill="#e31e2f" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Carrier Total per Operator">
          <div className="h-80 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={carrierChart}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={65}
                  outerRadius={100}
                  labelLine={false}
                >
                  {carrierChart.map((row, index) => (
                    <Cell key={row.name} fill={COLORS[index]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => rupiah.format(Number(value))} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="ACC Attachment Rate">
          <div className="h-80 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={accChart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" fontSize={10} />
                <YAxis tickFormatter={(value) => `${value}%`} />
                <Tooltip
                  formatter={(value) => `${rupiah.format(Number(value))}%`}
                />
                <Bar dataKey="value" fill="#f4b400" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Medpoint MTD">
          <div className="h-80 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={medpointChart} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(value) => compact.format(value)}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  fontSize={10}
                />
                <Tooltip formatter={(value) => fullMoney(Number(value))} />
                <Bar dataKey="value" fill="#e31e2f" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
    </div>
  );
}

export function SalesAnalyticsDashboard() {
  const today = useMemo(() => new Date(), []);
  const [section, setSection] = useState<Section>("performance");
  const [selection, setSelection] = useState({
    store: "",
    month: 0,
    year: 0,
    day: 0,
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const query = selection.month
    ? `?store=${encodeURIComponent(selection.store)}&month=${selection.month}&year=${selection.year}${selection.day ? `&day=${selection.day}` : ""}`
    : "";
  const { data, error, isLoading, isValidating, mutate } =
    useSWR<AnalyticsData>(
      `/api/analytics${query}`,
      (url: string) => apiFetch<AnalyticsData>(url, { cache: "no-store" }),
      {
        refreshInterval: (latestData) => (latestData ? 15_000 : 0),
        revalidateOnFocus: true,
        errorRetryCount: 2,
        errorRetryInterval: 5_000,
        shouldRetryOnError: (requestError) =>
          requestError instanceof ApiResponseError &&
          requestError.status >= 500 &&
          requestError.status !== 503,
      },
    );
  const current = useMemo(
    () =>
      data
        ? {
            store: selection.store || data.filters.storeCode,
            month: selection.month || data.filters.month,
            year: selection.year || data.filters.year,
            day: selection.day || data.filters.day,
          }
        : {
            ...selection,
            month: selection.month || today.getMonth() + 1,
            year: selection.year || today.getFullYear(),
            day: selection.day || today.getDate(),
          },
    [data, selection, today],
  );
  const activeLabel = MENU.find((item) => item.id === section)?.label;

  function update(next: Partial<typeof current>) {
    setSelection({ ...current, ...next });
  }
  const currentYear = today.getFullYear();
  const dataYears = data?.filters.periods.map((period) => period.year) || [];
  const minYear = Math.min(currentYear - 2, ...dataYears);
  const maxYear = Math.max(currentYear + 4, ...dataYears);
  const years = Array.from(
    { length: maxYear - minYear + 1 },
    (_, index) => maxYear - index,
  );

  useEffect(() => {
    const refresh = () => {
      void mutate();
    };
    const storage = (event: StorageEvent) => {
      if (event.key === "erafone-dashboard-refresh") refresh();
    };
    window.addEventListener("storage", storage);
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("erafone-dashboard")
        : null;
    if (channel) channel.onmessage = refresh;
    return () => {
      window.removeEventListener("storage", storage);
      channel?.close();
    };
  }, [mutate]);

  return (
    <main className="min-h-screen bg-[#f7f5f3] lg:flex">
      <aside
        className={`relative border-b border-stone-200 bg-white transition-[width] duration-300 lg:sticky lg:top-0 lg:h-screen lg:flex-none lg:border-b-0 lg:border-r ${sidebarCollapsed ? "lg:w-20" : "lg:w-64"}`}
      >
        <div className="px-4 py-4 lg:px-3 lg:py-5">
          <div
            className={`flex items-center ${sidebarCollapsed ? "justify-center" : "justify-between"}`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span
                className={`relative block flex-none overflow-hidden rounded-2xl transition-all ${sidebarCollapsed ? "h-10 w-10" : "h-12 w-12"}`}
              >
                <Image
                  src="/erafone.png"
                  alt="Logo Erafone"
                  width={346}
                  height={173}
                  className="h-full w-full object-cover"
                  priority
                />
              </span>
              {!sidebarCollapsed && (
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-brand-600">
                    Erafone
                  </p>
                  <p className="mt-0.5 truncate text-sm font-bold text-stone-900">
                    Sales Analytics
                  </p>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSidebarCollapsed((value) => !value)}
              className={`hidden h-9 w-9 flex-none items-center justify-center rounded-xl border border-stone-200 text-stone-500 transition hover:bg-stone-100 hover:text-stone-900 lg:flex ${sidebarCollapsed ? "absolute -right-4 top-6 z-20 bg-white shadow-md" : ""}`}
              aria-label={
                sidebarCollapsed ? "Tampilkan sidebar" : "Ciutkan sidebar"
              }
              title={sidebarCollapsed ? "Tampilkan sidebar" : "Ciutkan sidebar"}
            >
              {sidebarCollapsed ? (
                <PanelRightOpen size={17} />
              ) : (
                <PanelLeftClose size={17} />
              )}
            </button>
          </div>
          <Link
            href="/admin/import"
            title="Import Data"
            className={`btn-secondary mt-5 w-full ${sidebarCollapsed ? "px-0" : ""}`}
          >
            <Upload size={16} /> {!sidebarCollapsed && <span>Import Data</span>}
          </Link>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-stone-100 px-3 py-3 lg:block lg:space-y-1 lg:border-t-0">
          {MENU.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              title={label}
              aria-label={label}
              onClick={() => setSection(id)}
              className={`flex flex-none items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold transition lg:w-full ${sidebarCollapsed ? "lg:justify-center lg:px-0" : ""} ${section === id ? "bg-brand-600 text-white shadow-md shadow-red-200" : "text-stone-600 hover:bg-stone-100"}`}
            >
              <Icon size={19} className="flex-none" />
              <span className={sidebarCollapsed ? "lg:hidden" : ""}>
                {label}
              </span>
              {section === id && !sidebarCollapsed && (
                <ChevronRight size={15} className="ml-auto hidden lg:block" />
              )}
            </button>
          ))}
        </nav>
        <div className="hidden px-3 lg:absolute lg:bottom-5 lg:block lg:w-full">
          <Link
            href="/admin"
            title="Kelola Data Manual"
            className={`flex items-center rounded-xl border border-stone-200 px-3 py-3 text-xs font-bold text-stone-600 hover:bg-stone-50 ${sidebarCollapsed ? "justify-center" : "gap-2"}`}
          >
            <LockKeyhole size={16} className="flex-none" />
            {!sidebarCollapsed && <span>Kelola Data Manual</span>}
          </Link>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="border-b border-stone-200 bg-white px-5 py-5 lg:px-8">
          <div className="mx-auto flex max-w-[1600px] flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-brand-600">
                {activeLabel}
              </p>
              <h1 className="mt-1 text-2xl font-black text-stone-900">
                {data?.meta.storeName || "Sales Performance Dashboard"}
              </h1>
              <p className="mt-1 text-xs text-stone-500">
                Data aktual MySQL · angka ringkas selalu disertai nilai Rupiah
                lengkap · arahkan atau fokuskan angka bergaris titik
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label>
                <span className="label">Store</span>
                <select
                  className="field min-w-64"
                  value={current.store}
                  onChange={(event) =>
                    update({ store: event.target.value, day: 0 })
                  }
                >
                  {data?.filters.stores.map((store) => (
                    <option key={store.code} value={store.code}>
                      {store.code} — {store.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="label">Bulan</span>
                <select
                  className="field min-w-36"
                  value={current.month}
                  onChange={(event) =>
                    update({ month: Number(event.target.value), day: 0 })
                  }
                >
                  {MONTHS.map((month, index) => (
                    <option key={month} value={index + 1}>
                      {month}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="label">Tahun</span>
                <select
                  className="field min-w-28"
                  value={current.year}
                  onChange={(event) =>
                    update({ year: Number(event.target.value), day: 0 })
                  }
                >
                  {years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="label">Sampai Tanggal</span>
                <select
                  className="field min-w-24"
                  value={current.day}
                  onChange={(event) =>
                    update({ day: Number(event.target.value) })
                  }
                >
                  {Array.from(
                    { length: data?.meta.totalDays || 31 },
                    (_, index) => (
                      <option key={index + 1} value={index + 1}>
                        {index + 1}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <button
                className="btn-secondary"
                onClick={() => mutate()}
                disabled={isValidating}
              >
                <RefreshCw
                  size={15}
                  className={isValidating ? "animate-spin" : ""}
                />{" "}
                Segarkan
              </button>
              <button className="btn-secondary" onClick={() => window.print()}>
                <Printer size={15} /> Cetak
              </button>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[1600px] p-5 lg:p-8">
          {data && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-bold text-stone-700">
                <CalendarDays size={17} className="text-brand-600" />{" "}
                {data.meta.periodLabel} • Snapshot hari ke-
                {data.meta.elapsedDays}/{data.meta.totalDays}
              </div>
              <div
                className={`rounded-full px-3 py-1.5 text-xs font-bold ${data.meta.hasTargets ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}
              >
                {data.meta.hasTargets
                  ? "Target report tersedia"
                  : "Target belum diimport — actual tetap tampil"}
              </div>
            </div>
          )}
          {error && (
            <div
              className={`card p-5 text-sm ${error instanceof ApiResponseError && error.status === 409 ? "border-amber-200 bg-amber-50 text-amber-900" : "border-red-200 bg-red-50 text-red-700"}`}
            >
              <p className="font-bold">
                {error instanceof ApiResponseError && error.status === 409
                  ? "Dashboard siap, data transaksi belum ada"
                  : "Data belum dapat ditampilkan"}
              </p>
              <p className="mt-1">{error.message}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => mutate()}
                  className="btn-secondary"
                >
                  <RefreshCw size={16} /> Coba Lagi
                </button>
                <Link href="/admin/import" className="btn-primary">
                  <Upload size={16} /> Import Master Sales
                </Link>
              </div>
            </div>
          )}
          {isLoading && (
            <div className="card grid min-h-72 place-items-center text-sm text-stone-500">
              <div className="text-center">
                <LoaderCircle className="mx-auto mb-3 animate-spin text-brand-600" />
                Memproses data transaksi…
              </div>
            </div>
          )}
          {data && section === "performance" && <PerformanceView data={data} />}
          {data && section === "brands" && <BrandsView data={data} />}
          {data && section === "operators" && <OperatorView data={data} />}
          {data && section === "racing" && <RacingView data={data} />}
          {data && section === "focus" && <FocusView data={data} />}
        </div>
      </div>
    </main>
  );
}
