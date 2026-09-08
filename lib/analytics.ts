import type { ReportConfig } from "./import-sales";
import type { AnalyticsData, AnalyticsMetric } from "./analytics-types";
import { prisma } from "./prisma";

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const CATEGORIES: Array<{ key: string; label: string; source?: string }> = [
  { key: "DEVICE", label: "Device" },
  { key: "ACC & IOT", label: "ACC + IoT" },
  { key: "REPAIR CONTRACT", label: "Repair Contract" },
  { key: "CARRIER", label: "Carrier" },
  { key: "CE", label: "CE" },
  { key: "LAPTOP", label: "Laptop" },
];

type Fact = {
  salesName: string;
  brandName: string;
  articleDescription: string;
  category: string;
  quantity: number;
  amount: number;
  grossAmount: number;
};

type TargetConfig = ReportConfig | null;

function canonicalCategory(category: string) {
  const normalized = category.trim().toUpperCase().replace(/\s*\+\s*/g, " & ");
  if (normalized.includes("ACC") && normalized.includes("IOT")) return "ACC & IOT";
  if (normalized.includes("REPAIR")) return "REPAIR CONTRACT";
  if (normalized.includes("LAPTOP")) return "LAPTOP";
  if (normalized.includes("DEVICE")) return "DEVICE";
  if (normalized.includes("CARRIER")) return "CARRIER";
  if (normalized === "CE") return "CE";
  return normalized;
}

function makeMetric(
  target: number,
  mtd: number,
  quantity: number,
  elapsedDays: number,
  totalDays: number,
  grandMtd = 0,
): AnalyticsMetric {
  const expect = elapsedDays > 0 ? mtd * (totalDays / elapsedDays) : mtd;
  const gap = target - mtd;
  const remaining = totalDays - elapsedDays;
  return {
    target: Math.round(target),
    mtd: Math.round(mtd),
    quantity,
    expect: Math.round(expect),
    achievement: target > 0 ? (expect / target) * 100 : null,
    gap: Math.round(gap),
    targetByDay: target > 0 && remaining > 0 ? Math.round(gap / remaining) : null,
    contribution: grandMtd > 0 ? (mtd / grandMtd) * 100 : 0,
  };
}

function sumFacts(facts: Fact[], predicate: (fact: Fact) => boolean) {
  let mtd = 0;
  let quantity = 0;
  for (const fact of facts) {
    if (!predicate(fact)) continue;
    mtd += fact.amount;
    quantity += fact.quantity;
  }
  return { mtd, quantity };
}

function sumGrossFacts(facts: Fact[], predicate: (fact: Fact) => boolean) {
  let mtd = 0;
  let quantity = 0;
  for (const fact of facts) {
    if (!predicate(fact)) continue;
    mtd += fact.grossAmount;
    quantity += fact.quantity;
  }
  return { mtd, quantity };
}

function targetFor(
  config: TargetConfig,
  group: "categoryTargets" | "brandTargets" | "operatorTargets",
  sales: string,
  key: string,
) {
  return config?.[group]?.[sales]?.[key] || 0;
}

function raceTarget(
  config: TargetConfig,
  sales: string,
  key: string,
  unit: "qty" | "amount",
) {
  return config?.racingTargets?.[sales]?.[key]?.[unit === "qty" ? "quantity" : "amount"] || 0;
}

function periodRange(month: number, year: number) {
  return {
    gte: new Date(Date.UTC(year, month - 1, 1)),
    lt: new Date(Date.UTC(year, month, 1)),
  };
}

function previousPeriod(month: number, year: number) {
  return month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year };
}

export async function getAnalytics(searchParams: URLSearchParams): Promise<AnalyticsData> {
  const [optionRows, masterStores] = await Promise.all([
    prisma.salesTransaction.findMany({
      select: { siteCode: true, siteDesc: true, orderDate: true },
      orderBy: { orderDate: "desc" },
    }),
    prisma.store.findMany({ select: { kode: true, nama: true }, orderBy: { nama: "asc" } }),
  ]);
  if (!optionRows.length) {
    throw new Error("Belum ada master transaksi. Login admin lalu import file Excel/CSV terlebih dahulu.");
  }

  const storeMap = new Map(masterStores.map((row) => [row.kode, { code: row.kode, name: row.nama }]));
  for (const row of optionRows) {
    if (!storeMap.has(row.siteCode)) storeMap.set(row.siteCode, { code: row.siteCode, name: row.siteDesc });
  }
  const stores = Array.from(storeMap.values()).sort((a, b) => a.name.localeCompare(b.name, "id"));
  const periods = Array.from(
    new Map(optionRows.map((row) => {
      const value = { month: row.orderDate.getUTCMonth() + 1, year: row.orderDate.getUTCFullYear() };
      return [`${value.year}-${value.month}`, value];
    })).values(),
  ).sort((a, b) => b.year - a.year || b.month - a.month);

  const latestReport = await prisma.reportDataset.findFirst({
    select: { storeCode: true, month: true, year: true },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
  const defaultPeriod = latestReport || periods[0];
  const month = Number(searchParams.get("month") || defaultPeriod.month);
  const year = Number(searchParams.get("year") || defaultPeriod.year);
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) {
    throw new Error("Periode tidak valid.");
  }
  const requestedStore = searchParams.get("store") || "";
  const storeCode = stores.some((store) => store.code === requestedStore)
    ? requestedStore
    : latestReport && stores.some((store) => store.code === latestReport.storeCode)
      ? latestReport.storeCode
      : stores.some((store) => store.code === "M221")
        ? "M221"
        : stores[0].code;
  const storeName = stores.find((store) => store.code === storeCode)?.name || storeCode;

  const monthRows = await prisma.salesTransaction.findMany({
    where: { siteCode: storeCode, orderDate: periodRange(month, year) },
    select: {
      salesName: true,
      brandName: true,
      articleDescription: true,
      category: true,
      quantity: true,
      totalNettAmountExcTax: true,
      totalNettAmountWithTax: true,
      orderDate: true,
    },
  });
  const totalDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const maxDataDay = monthRows.length
    ? Math.max(...monthRows.map((row) => row.orderDate.getUTCDate()))
    : 0;
  const requestedDay = Number(searchParams.get("day") || 0);
  const day = Number.isInteger(requestedDay) && requestedDay >= 1 && requestedDay <= totalDays
    ? requestedDay
    : maxDataDay || totalDays;
  const rows = monthRows.filter((row) => row.orderDate.getUTCDate() <= day);
  const previous = previousPeriod(month, year);
  const previousRows = await prisma.salesTransaction.findMany({
    where: { siteCode: storeCode, orderDate: periodRange(previous.month, previous.year) },
    select: { salesName: true, category: true, totalNettAmountExcTax: true },
  });
  const report = await prisma.reportDataset.findUnique({
    where: { storeCode_month_year: { storeCode, month, year } },
    select: { config: true },
  });
  const config = report?.config as TargetConfig;

  const facts: Fact[] = rows.map((row) => ({
    salesName: row.salesName.trim(),
    brandName: row.brandName.trim().toUpperCase(),
    articleDescription: row.articleDescription.trim().toUpperCase(),
    category: canonicalCategory(row.category),
    quantity: row.quantity,
    amount: Number(row.totalNettAmountExcTax),
    grossAmount: Number(row.totalNettAmountWithTax),
  }));
  const people = Array.from(new Set(facts.map((fact) => fact.salesName))).sort((a, b) => a.localeCompare(b, "id"));
  const elapsedDays = rows.length ? day : 0;

  const allCategoryMtd = sumFacts(facts, (fact) =>
    CATEGORIES.some((category) => (category.source || category.key) === fact.category),
  ).mtd;
  const categoryRows = CATEGORIES.map((category) => {
    const source = category.source || category.key;
    const value = sumFacts(facts, (fact) => fact.category === source);
    const target = people.reduce((sum, sales) => sum + targetFor(config, "categoryTargets", sales, source), 0);
    return { key: source, label: category.label, metric: makeMetric(target, value.mtd, value.quantity, elapsedDays, totalDays, allCategoryMtd) };
  });

  const peoplePerformance = people.map((name) => {
    const personFacts = facts.filter((fact) => fact.salesName === name);
    const personMtd = sumFacts(personFacts, (fact) => CATEGORIES.some((category) => (category.source || category.key) === fact.category));
    const categories = CATEGORIES.map((category) => {
      const source = category.source || category.key;
      const value = sumFacts(personFacts, (fact) => fact.category === source);
      return { key: source, label: category.label, metric: makeMetric(targetFor(config, "categoryTargets", name, source), value.mtd, value.quantity, elapsedDays, totalDays, personMtd.mtd) };
    });
    const target = CATEGORIES.reduce((sum, category) =>
      sum + targetFor(config, "categoryTargets", name, category.source || category.key), 0);
    const previousActual = previousRows
      .filter((row) => row.salesName.trim() === name && CATEGORIES.some((category) => (category.source || category.key) === canonicalCategory(row.category)))
      .reduce((sum, row) => sum + Number(row.totalNettAmountExcTax), 0);
    const total = makeMetric(target, personMtd.mtd, personMtd.quantity, elapsedDays, totalDays, allCategoryMtd);
    return { name, categories, total, previousActual: previousActual || null, growth: previousActual ? ((total.expect - previousActual) / previousActual) * 100 : null };
  });
  const totalTarget = people.reduce((grand, sales) => grand + CATEGORIES.reduce(
    (sum, category) => sum + targetFor(config, "categoryTargets", sales, category.source || category.key),
    0,
  ), 0);
  const performanceTotal = makeMetric(totalTarget, allCategoryMtd, categoryRows.reduce((sum, row) => sum + row.metric.quantity, 0), elapsedDays, totalDays, allCategoryMtd);
  const previousActual = previousRows.reduce((sum, row) => sum + Number(row.totalNettAmountExcTax), 0) || null;

  const deviceFacts = facts.filter((fact) => fact.category === "DEVICE");
  const brandNames = Array.from(new Set([
    ...deviceFacts.map((fact) => fact.brandName),
    ...Object.values(config?.brandTargets || {}).flatMap((targets) => Object.keys(targets)),
  ])).filter(Boolean).sort();
  const deviceMtd = sumFacts(deviceFacts, () => true).mtd;
  const brands = brandNames.map((brand) => {
    const value = sumFacts(deviceFacts, (fact) => fact.brandName === brand);
    const target = people.reduce((sum, sales) => sum + targetFor(config, "brandTargets", sales, brand), 0);
    return {
      brand,
      metric: makeMetric(target, value.mtd, value.quantity, elapsedDays, totalDays, deviceMtd),
      people: people.map((name) => {
        const personValue = sumFacts(deviceFacts, (fact) => fact.salesName === name && fact.brandName === brand);
        return { name, metric: makeMetric(targetFor(config, "brandTargets", name, brand), personValue.mtd, personValue.quantity, elapsedDays, totalDays, value.mtd) };
      }),
    };
  }).sort((a, b) => b.metric.mtd - a.metric.mtd);

  const carrierFacts = facts.filter((fact) => fact.category === "CARRIER");
  const operator = (fact: Fact) => {
    const value = `${fact.brandName} ${fact.articleDescription}`;
    if (/INDOSAT|ISAT/.test(value)) return "INDOSAT";
    if (/TELKOMSEL|TSEL/.test(value)) return "TELKOMSEL";
    if (/XL|AXIATA/.test(value)) return "XL PRIO";
    return fact.brandName;
  };
  const operatorNames = Array.from(new Set([
    ...carrierFacts.map(operator),
    ...Object.values(config?.operatorTargets || {}).flatMap((targets) => Object.keys(targets)),
  ])).filter(Boolean);
  const carrierMtd = sumFacts(carrierFacts, () => true).mtd;
  const operators = operatorNames.map((name) => {
    const value = sumFacts(carrierFacts, (fact) => operator(fact) === name);
    const target = people.reduce((sum, sales) => sum + targetFor(config, "operatorTargets", sales, name), 0);
    return {
      operator: name,
      metric: makeMetric(target, value.mtd, value.quantity, elapsedDays, totalDays, carrierMtd),
      people: people.map((sales) => {
        const personValue = sumFacts(carrierFacts, (fact) => fact.salesName === sales && operator(fact) === name);
        return { name: sales, metric: makeMetric(targetFor(config, "operatorTargets", sales, name), personValue.mtd, personValue.quantity, elapsedDays, totalDays, value.mtd) };
      }),
    };
  });

  const raceDefinitions = [
    { key: "CAMON_50", label: "Tecno Camon 50", unit: "qty" as const, match: (fact: Fact) => fact.articleDescription.includes("CAMON 50") },
    { key: "POVA_8", label: "Tecno Pova 8", unit: "qty" as const, match: (fact: Fact) => fact.articleDescription.includes("POVA 8") },
    { key: "MEDPOIN", label: "Medpoint Booster", unit: "amount" as const, match: (fact: Fact) => fact.brandName === "MEDPOIN" },
    { key: "OPPO", label: "Racing OPPO", unit: "amount" as const, match: (fact: Fact) => fact.brandName === "OPPO" && fact.category === "DEVICE" },
  ];
  const racing = raceDefinitions.map((definition) => {
    const value = definition.key === "MEDPOIN"
      ? sumGrossFacts(facts, definition.match)
      : sumFacts(facts, definition.match);
    const actual = definition.unit === "qty" ? value.quantity : value.mtd;
    const target = people.reduce((sum, sales) => sum + raceTarget(config, sales, definition.key, definition.unit), 0);
    return {
      key: definition.key,
      label: definition.label,
      unit: definition.unit,
      metric: makeMetric(target, actual, definition.unit === "qty" ? actual : value.quantity, elapsedDays, totalDays),
      quantityMetric: definition.key === "MEDPOIN"
        ? makeMetric(people.reduce((sum, sales) => sum + raceTarget(config, sales, definition.key, "qty"), 0), value.quantity, value.quantity, elapsedDays, totalDays)
        : null,
      people: people.map((name) => {
        const person = definition.key === "MEDPOIN"
          ? sumGrossFacts(facts, (fact) => fact.salesName === name && definition.match(fact))
          : sumFacts(facts, (fact) => fact.salesName === name && definition.match(fact));
        const personActual = definition.unit === "qty" ? person.quantity : person.mtd;
        return {
          name,
          metric: makeMetric(raceTarget(config, name, definition.key, definition.unit), personActual, person.quantity, elapsedDays, totalDays),
          quantityMetric: definition.key === "MEDPOIN"
            ? makeMetric(raceTarget(config, name, definition.key, "qty"), person.quantity, person.quantity, elapsedDays, totalDays)
            : null,
        };
      }),
    };
  });

  const focusPeople = people.map((name) => {
    const personFacts = facts.filter((fact) => fact.salesName === name);
    const device = sumFacts(personFacts, (fact) => fact.category === "DEVICE");
    const repair = sumFacts(personFacts, (fact) => fact.category === "REPAIR CONTRACT");
    const accessory = sumFacts(personFacts, (fact) => fact.category === "ACC & IOT");
    const personCarrier = personFacts.filter((fact) => fact.category === "CARRIER");
    const indosat = sumFacts(personCarrier, (fact) => operator(fact) === "INDOSAT").quantity;
    const telkomsel = sumFacts(personCarrier, (fact) => operator(fact) === "TELKOMSEL").quantity;
    const xl = sumFacts(personCarrier, (fact) => operator(fact) === "XL PRIO").quantity;
    const medpoint = sumGrossFacts(personFacts, (fact) => fact.brandName === "MEDPOIN");
    const tradeIn = sumGrossFacts(personFacts, (fact) => /TRADE\s*IN/.test(fact.articleDescription));
    const tmicro = sumFacts(personFacts, (fact) => /TMICRO|T-MICRO|TELKOMSEL MICRO/.test(fact.articleDescription)).quantity;
    const vidio = sumFacts(personFacts, (fact) => /VIDIO/.test(fact.articleDescription)).quantity;
    const carrierTotal = indosat + telkomsel + xl;
    return {
      name,
      device: { quantity: device.quantity, mtd: Math.round(device.mtd) },
      repair: { quantity: repair.quantity, rate: device.quantity ? (repair.quantity / device.quantity) * 100 : 0 },
      carrier: { indosat, telkomsel, xl, total: carrierTotal, rate: device.quantity ? (carrierTotal / device.quantity) * 100 : 0 },
      accessory: {
        quantity: accessory.quantity,
        mtd: Math.round(accessory.mtd),
        rate: device.quantity ? (accessory.quantity / device.quantity) * 100 : 0,
        sob: device.mtd ? (accessory.mtd / device.mtd) * 100 : 0,
      },
      ppob: { tmicro, vidio },
      medpoint: { quantity: medpoint.quantity, mtd: Math.round(medpoint.mtd) },
      tradeIn: { quantity: tradeIn.quantity, mtd: Math.round(tradeIn.mtd) },
    };
  });
  const totals = {
    deviceQty: focusPeople.reduce((sum, row) => sum + row.device.quantity, 0),
    deviceMtd: focusPeople.reduce((sum, row) => sum + row.device.mtd, 0),
    repairQty: focusPeople.reduce((sum, row) => sum + row.repair.quantity, 0),
    carrierQty: focusPeople.reduce((sum, row) => sum + row.carrier.total, 0),
    accessoryQty: focusPeople.reduce((sum, row) => sum + row.accessory.quantity, 0),
    accessoryMtd: focusPeople.reduce((sum, row) => sum + row.accessory.mtd, 0),
    medpointMtd: focusPeople.reduce((sum, row) => sum + row.medpoint.mtd, 0),
    tradeInMtd: focusPeople.reduce((sum, row) => sum + row.tradeIn.mtd, 0),
  };

  return {
    filters: { stores, periods, storeCode, month, year, day },
    meta: { storeName, periodLabel: `${MONTHS[month - 1]} ${year}`, elapsedDays, totalDays, maxDataDay, transactionRows: rows.length, hasTargets: Boolean(report), lastUpdated: new Date().toISOString() },
    performance: {
      categories: categoryRows,
      people: peoplePerformance,
      total: performanceTotal,
      previousActual,
      growth: previousActual ? ((performanceTotal.expect - previousActual) / previousActual) * 100 : null,
    },
    brands,
    operators,
    racing,
    focus: { people: focusPeople, totals },
  };
}
