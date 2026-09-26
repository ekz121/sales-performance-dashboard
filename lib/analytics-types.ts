export type AnalyticsMetric = {
  target: number;
  mtd: number;
  quantity: number;
  expect: number;
  achievement: number | null;
  gap: number;
  targetByDay: number | null;
  contribution: number;
};

export type AnalyticsData = {
  filters: {
    stores: Array<{ code: string; name: string }>;
    periods: Array<{ month: number; year: number }>;
    storeCode: string;
    month: number;
    year: number;
    day: number;
  };
  meta: {
    storeName: string;
    periodLabel: string;
    elapsedDays: number;
    totalDays: number;
    maxDataDay: number;
    minDataDay: number;
    transactionRows: number;
    hasTargets: boolean;
    lastUpdated: string;
  };
  performance: {
    categories: Array<{ key: string; label: string; metric: AnalyticsMetric }>;
    people: Array<{
      name: string;
      categories: Array<{ key: string; label: string; metric: AnalyticsMetric }>;
      total: AnalyticsMetric;
      previousActual: number | null;
      growth: number | null;
    }>;
    total: AnalyticsMetric;
    previousActual: number | null;
    growth: number | null;
  };
  brands: Array<{
    brand: string;
    metric: AnalyticsMetric;
    people: Array<{ name: string; metric: AnalyticsMetric }>;
  }>;
  operators: Array<{
    operator: string;
    metric: AnalyticsMetric;
    people: Array<{ name: string; metric: AnalyticsMetric }>;
  }>;
  racing: Array<{
    key: string;
    label: string;
    unit: "qty" | "amount";
    metric: AnalyticsMetric;
    quantityMetric: AnalyticsMetric | null;
    people: Array<{ name: string; metric: AnalyticsMetric; quantityMetric: AnalyticsMetric | null }>;
  }>;
  focus: {
    people: Array<{
      name: string;
      device: { quantity: number; mtd: number };
      repair: { quantity: number; rate: number };
      carrier: { indosat: number; telkomsel: number; xl: number; total: number; rate: number };
      accessory: { quantity: number; mtd: number; rate: number; sob: number };
      ppob: { tmicro: number; vidio: number };
      medpoint: { quantity: number; mtd: number };
      tradeIn: { quantity: number; mtd: number };
    }>;
    totals: {
      deviceQty: number;
      deviceMtd: number;
      repairQty: number;
      carrierQty: number;
      accessoryQty: number;
      accessoryMtd: number;
      medpointMtd: number;
      tradeInMtd: number;
    };
  };
};
