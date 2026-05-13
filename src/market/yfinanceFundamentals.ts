import { MARKET_DATA_USER_AGENT } from "@/src/market/constants";
import { normalizeYfinanceSymbol } from "@/src/market/yfinance";
import { toFinite } from "@/src/daa/utils/normalize";

const FUNDAMENTAL_TYPES_ = [
  "trailingPeRatio",
  "trailingPegRatio",
  "trailingMarketCap",
  "quarterlyMarketCap",
  "annualMarketCap",
] as const;

type FundamentalMetricKey = (typeof FUNDAMENTAL_TYPES_)[number];

export type YfinanceFundamentalSnapshot = {
  symbol: string;
  normalizedSymbol: string;
  marketCap: number | null;
  marketCapCurrency: string | null;
  trailingPE: number | null;
  pegRatio: number | null;
  pePercentile: number | null;
  pegPercentile: number | null;
  peSampleCount: number;
  pegSampleCount: number;
  peAsOfDate: string | null;
  pegAsOfDate: string | null;
  marketCapAsOfDate: string | null;
  source: "yfinance_fundamentals_timeseries";
  updatedAt: string;
  issues: string[];
};

type MetricPoint = {
  value: number | null;
  currency: string | null;
  asOfDate: string | null;
  sortTime: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readMetricRows(payload: unknown): Record<string, unknown>[] {
  const root = isRecord(payload) ? payload : {};
  const timeseries = isRecord(root.timeseries) ? root.timeseries : {};
  return Array.isArray(timeseries.result)
    ? timeseries.result.filter(isRecord)
    : [];
}

function readTimestamp(row: Record<string, unknown>, index: number): number {
  const timestamps = Array.isArray(row.timestamp) ? row.timestamp : [];
  const n = Number(timestamps[index]);
  return Number.isFinite(n) ? n : 0;
}

function readMetricSeries(payload: unknown, key: FundamentalMetricKey): MetricPoint[] {
  const rows = readMetricRows(payload);
  const series: MetricPoint[] = [];

  for (const row of rows) {
    const values = Array.isArray(row[key]) ? row[key] : [];
    for (let i = 0; i < values.length; i += 1) {
      const point = isRecord(values[i]) ? values[i] : {};
      const reported = isRecord(point.reportedValue) ? point.reportedValue : {};
      const raw = toFinite(reported.raw, Number.NaN);
      if (!Number.isFinite(raw) || raw <= 0) continue;

      const asOfDate = typeof point.asOfDate === "string" ? point.asOfDate : null;
      const sortTime = asOfDate
        ? Date.parse(`${asOfDate}T00:00:00.000Z`) / 1000
        : readTimestamp(row, i);
      series.push({
        value: raw,
        currency: typeof point.currencyCode === "string" ? point.currencyCode : null,
        asOfDate,
        sortTime: Number.isFinite(sortTime) ? sortTime : 0,
      });
    }
  }

  return series.sort((a, b) => a.sortTime - b.sortTime);
}

function readLatestMetric(payload: unknown, key: FundamentalMetricKey): MetricPoint {
  const series = readMetricSeries(payload, key);
  const latest = series[series.length - 1] ?? null;
  if (!latest) return { value: null, currency: null, asOfDate: null, sortTime: 0 };

  return {
    value: latest.value,
    currency: latest.currency,
    asOfDate: latest.asOfDate,
    sortTime: latest.sortTime,
  };
}

function percentileOfLatest(series: MetricPoint[]): number | null {
  const values = series
    .map((item) => item.value)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
  if (values.length < 3) return null;
  const latest = values[values.length - 1];
  const leCount = values.filter((value) => value <= latest).length;
  return Number(((leCount / values.length) * 100).toFixed(2));
}

export function normalizeYfinanceFundamentalsPayload(input: {
  symbol: string;
  payload: unknown;
  updatedAt?: string;
}): YfinanceFundamentalSnapshot {
  const normalizedSymbol = normalizeYfinanceSymbol(input.symbol);
  const updatedAt = input.updatedAt || new Date().toISOString();
  const peSeries = readMetricSeries(input.payload, "trailingPeRatio");
  const pegSeries = readMetricSeries(input.payload, "trailingPegRatio");
  const pe = readLatestMetric(input.payload, "trailingPeRatio");
  const peg = readLatestMetric(input.payload, "trailingPegRatio");
  const trailingMarketCap = readLatestMetric(input.payload, "trailingMarketCap");
  const quarterlyMarketCap = readLatestMetric(input.payload, "quarterlyMarketCap");
  const annualMarketCap = readLatestMetric(input.payload, "annualMarketCap");
  const marketCap = trailingMarketCap.value != null
    ? trailingMarketCap
    : quarterlyMarketCap.value != null
      ? quarterlyMarketCap
      : annualMarketCap;

  const issues: string[] = [];
  if (pe.value == null) issues.push("missing trailingPeRatio");
  if (peg.value == null) issues.push("missing trailingPegRatio");
  if (marketCap.value == null) issues.push("missing marketCap");
  if (pe.value != null && peSeries.length < 3) issues.push("insufficient trailingPeRatio history");
  if (peg.value != null && pegSeries.length < 3) issues.push("insufficient trailingPegRatio history");

  return {
    symbol: input.symbol,
    normalizedSymbol,
    marketCap: marketCap.value,
    marketCapCurrency: marketCap.currency,
    trailingPE: pe.value,
    pegRatio: peg.value,
    pePercentile: percentileOfLatest(peSeries),
    pegPercentile: percentileOfLatest(pegSeries),
    peSampleCount: peSeries.length,
    pegSampleCount: pegSeries.length,
    peAsOfDate: pe.asOfDate,
    pegAsOfDate: peg.asOfDate,
    marketCapAsOfDate: marketCap.asOfDate,
    source: "yfinance_fundamentals_timeseries",
    updatedAt,
    issues,
  };
}

export async function fetchYfinanceFundamentals(
  symbolRaw: string,
  opts: { timeoutMs?: number; now?: Date } = {},
): Promise<YfinanceFundamentalSnapshot> {
  const normalizedSymbol = normalizeYfinanceSymbol(symbolRaw);
  if (!normalizedSymbol) {
    return normalizeYfinanceFundamentalsPayload({
      symbol: symbolRaw,
      payload: null,
      updatedAt: (opts.now ?? new Date()).toISOString(),
    });
  }

  const now = opts.now ?? new Date();
  const period2 = Math.floor((now.getTime() + 86_400_000) / 1000);
  const period1 = Math.floor((now.getTime() - 5 * 365 * 86_400_000) / 1000);
  const upstream = new URL(`https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(normalizedSymbol)}`);
  upstream.searchParams.set("symbol", normalizedSymbol);
  upstream.searchParams.set("type", FUNDAMENTAL_TYPES_.join(","));
  upstream.searchParams.set("period1", String(period1));
  upstream.searchParams.set("period2", String(period2));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8_000);
  try {
    const response = await fetch(upstream, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": MARKET_DATA_USER_AGENT,
      },
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json() as unknown;
    const snapshot = normalizeYfinanceFundamentalsPayload({
      symbol: symbolRaw,
      payload,
      updatedAt: now.toISOString(),
    });
    if (!response.ok) {
      return {
        ...snapshot,
        issues: [...snapshot.issues, `upstream http ${response.status}`],
      };
    }
    return snapshot;
  } finally {
    clearTimeout(timeoutId);
  }
}
