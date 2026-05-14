import { normalizeYfinanceSymbol } from "@/src/market/yfinance";
import { toFinite } from "@/src/daa/utils/normalize";
import { getYahooProvider } from "@/src/market/yahooProvider";

const FUNDAMENTAL_TYPES_ = [
  "trailingPeRatio",
  "trailingMarketCap",
  "quarterlyMarketCap",
  "annualMarketCap",
] as const;

export const FUNDAMENTAL_PERCENTILE_MIN_SAMPLE_COUNT = 36;
export const FUNDAMENTAL_PERCENTILE_MIN_SPAN_DAYS = 720;

type FundamentalMetricKey = (typeof FUNDAMENTAL_TYPES_)[number];

export type YfinanceMarketCapSource =
  | "price_x_shares_outstanding"
  | "quote_summary_market_cap"
  | "fundamentals_timeseries_market_cap"
  | null;

export type FundamentalHistoryStats = {
  sampleCount: number;
  minSampleCount: number;
  spanDays: number | null;
  minSpanDays: number;
  percentile: number | null;
  latestRank: number | null;
  latestValue: number | null;
  min: number | null;
  median: number | null;
  max: number | null;
  firstAsOfDate: string | null;
  latestAsOfDate: string | null;
  eligible: boolean;
  reason: string | null;
};

export type YfinanceFundamentalSnapshot = {
  symbol: string;
  normalizedSymbol: string;
  marketCap: number | null;
  marketCapCurrency: string | null;
  marketCapSource: YfinanceMarketCapSource;
  marketPrice: number | null;
  marketPriceCurrency: string | null;
  sharesOutstanding: number | null;
  sharesSource: "shares_outstanding" | "implied_shares_outstanding" | null;
  trailingPE: number | null;
  pbRatio: number | null;
  dividendYieldPct: number | null;
  revenueGrowthPct: number | null;
  earningsGrowthPct: number | null;
  grossMarginsPct: number | null;
  operatingMarginsPct: number | null;
  profitMarginsPct: number | null;
  totalRevenue: number | null;
  freeCashflow: number | null;
  operatingCashflow: number | null;
  totalCash: number | null;
  totalDebt: number | null;
  enterpriseValue: number | null;
  pePercentile: number | null;
  peSampleCount: number;
  peAsOfDate: string | null;
  peHistory: FundamentalHistoryStats;
  marketCapAsOfDate: string | null;
  source: "yfinance_fundamentals_timeseries_quote_summary";
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

function readRawMetric(row: Record<string, unknown>, key: string): unknown {
  const value = row[key];
  return isRecord(value) ? value.raw : value;
}

function readStringMetric(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return typeof value === "string" && value.trim() ? value.trim().toUpperCase() : null;
}

function readQuoteSummaryResult(payload: unknown): Record<string, unknown> {
  const root = isRecord(payload) ? payload : {};
  const quoteSummary = isRecord(root.quoteSummary) ? root.quoteSummary : {};
  const rows = Array.isArray(quoteSummary.result) ? quoteSummary.result : [];
  return isRecord(rows[0]) ? rows[0] : {};
}

function readNumber(row: Record<string, unknown>, key: string): number | null {
  const n = toFinite(readRawMetric(row, key), Number.NaN);
  return Number.isFinite(n) ? n : null;
}

function readPositiveNumber(row: Record<string, unknown>, key: string): number | null {
  const n = readNumber(row, key);
  return n != null && n > 0 ? n : null;
}

function readPctFromRatio(row: Record<string, unknown>, key: string): number | null {
  const n = readNumber(row, key);
  if (n == null) return null;
  return Math.abs(n) <= 1 ? n * 100 : n;
}

type QuoteSummaryStats = {
  price: number | null;
  currency: string | null;
  sharesOutstanding: number | null;
  sharesSource: "shares_outstanding" | "implied_shares_outstanding" | null;
  shareSelectionIssue: string | null;
  marketCap: number | null;
  trailingPE: number | null;
  pbRatio: number | null;
  dividendYieldPct: number | null;
  revenueGrowthPct: number | null;
  earningsGrowthPct: number | null;
  grossMarginsPct: number | null;
  operatingMarginsPct: number | null;
  profitMarginsPct: number | null;
  totalRevenue: number | null;
  freeCashflow: number | null;
  operatingCashflow: number | null;
  totalCash: number | null;
  totalDebt: number | null;
  enterpriseValue: number | null;
};

function relativeDiff(a: number, b: number): number {
  if (!(a > 0) || !(b > 0)) return Number.POSITIVE_INFINITY;
  return Math.abs(a - b) / Math.max(Math.abs(b), 1);
}

function chooseSharesOutstanding(input: {
  price: number | null;
  quoteMarketCap: number | null;
  sharesOutstanding: number | null;
  impliedSharesOutstanding: number | null;
}): {
  shares: number | null;
  source: "shares_outstanding" | "implied_shares_outstanding" | null;
  issue: string | null;
} {
  const candidates = [
    { source: "shares_outstanding" as const, shares: input.sharesOutstanding },
    { source: "implied_shares_outstanding" as const, shares: input.impliedSharesOutstanding },
  ].filter((item): item is { source: "shares_outstanding" | "implied_shares_outstanding"; shares: number } => (
    item.shares != null && Number.isFinite(item.shares) && item.shares > 0
  ));

  if (candidates.length === 0) return { shares: null, source: null, issue: null };
  if (!(input.price != null && input.price > 0 && input.quoteMarketCap != null && input.quoteMarketCap > 0)) {
    const first = candidates[0]!;
    return { shares: first.shares, source: first.source, issue: null };
  }

  const ranked = candidates
    .map((item) => ({
      ...item,
      derivedMarketCap: input.price! * item.shares,
      diff: relativeDiff(input.price! * item.shares, input.quoteMarketCap!),
    }))
    .sort((a, b) => a.diff - b.diff);
  const best = ranked[0]!;
  const ordinary = ranked.find((item) => item.source === "shares_outstanding");
  const issue = best.source === "implied_shares_outstanding" && ordinary && ordinary.diff - best.diff > 0.05
    ? `using impliedSharesOutstanding because sharesOutstanding-derived marketCap diverges from quote marketCap (${(ordinary.diff * 100).toFixed(1)}% vs ${(best.diff * 100).toFixed(1)}%)`
    : null;
  return { shares: best.shares, source: best.source, issue };
}

function readQuoteSummaryStats(payload: unknown): QuoteSummaryStats {
  const result = readQuoteSummaryResult(payload);
  const price = isRecord(result.price) ? result.price : {};
  const summaryDetail = isRecord(result.summaryDetail) ? result.summaryDetail : {};
  const defaultStats = isRecord(result.defaultKeyStatistics) ? result.defaultKeyStatistics : {};
  const financialData = isRecord(result.financialData) ? result.financialData : {};

  const sharesOutstanding = readPositiveNumber(defaultStats, "sharesOutstanding");
  const impliedSharesOutstanding = readPositiveNumber(defaultStats, "impliedSharesOutstanding");
  const regularMarketPrice = readPositiveNumber(price, "regularMarketPrice") ?? readPositiveNumber(financialData, "currentPrice");
  const quoteMarketCap = readPositiveNumber(price, "marketCap") ?? readPositiveNumber(summaryDetail, "marketCap");
  const shares = chooseSharesOutstanding({
    price: regularMarketPrice,
    quoteMarketCap,
    sharesOutstanding,
    impliedSharesOutstanding,
  });

  return {
    price: regularMarketPrice,
    currency: readStringMetric(price, "currency") ?? readStringMetric(summaryDetail, "currency"),
    sharesOutstanding: shares.shares,
    sharesSource: shares.source,
    shareSelectionIssue: shares.issue,
    marketCap: quoteMarketCap,
    trailingPE: readPositiveNumber(summaryDetail, "trailingPE")
      ?? readPositiveNumber(defaultStats, "trailingPE"),
    pbRatio: readPositiveNumber(defaultStats, "priceToBook"),
    dividendYieldPct: readPctFromRatio(summaryDetail, "dividendYield"),
    revenueGrowthPct: readPctFromRatio(financialData, "revenueGrowth"),
    earningsGrowthPct: readPctFromRatio(financialData, "earningsGrowth"),
    grossMarginsPct: readPctFromRatio(financialData, "grossMargins"),
    operatingMarginsPct: readPctFromRatio(financialData, "operatingMargins"),
    profitMarginsPct: readPctFromRatio(financialData, "profitMargins"),
    totalRevenue: readNumber(financialData, "totalRevenue"),
    freeCashflow: readNumber(financialData, "freeCashflow"),
    operatingCashflow: readNumber(financialData, "operatingCashflow"),
    totalCash: readNumber(financialData, "totalCash"),
    totalDebt: readNumber(financialData, "totalDebt"),
    enterpriseValue: readNumber(defaultStats, "enterpriseValue"),
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const left = sorted[mid - 1];
  const right = sorted[mid];
  if (left == null || right == null) return null;
  return (left + right) / 2;
}

function buildHistoryStats(series: MetricPoint[]): FundamentalHistoryStats {
  const values = series
    .map((item) => item.value)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
  const sampleCount = values.length;
  const latest = values[values.length - 1] ?? null;
  const validTimes = series
    .map((item) => item.sortTime)
    .filter((value) => Number.isFinite(value) && value > 0);
  const firstTime = validTimes[0] ?? null;
  const latestTime = validTimes[validTimes.length - 1] ?? null;
  const spanDays = firstTime != null && latestTime != null
    ? Math.max(0, Math.round((latestTime - firstTime) / 86_400))
    : null;
  const latestRank = latest == null ? null : values.filter((value) => value <= latest).length;
  const sampleEnough = sampleCount >= FUNDAMENTAL_PERCENTILE_MIN_SAMPLE_COUNT;
  const spanEnough = spanDays != null && spanDays >= FUNDAMENTAL_PERCENTILE_MIN_SPAN_DAYS;
  const eligible = latest != null && latestRank != null && sampleEnough && spanEnough;
  const reason = !sampleEnough
    ? `insufficient_sample_count:${sampleCount}/${FUNDAMENTAL_PERCENTILE_MIN_SAMPLE_COUNT}`
    : (!spanEnough
      ? `insufficient_history_span_days:${spanDays ?? 0}/${FUNDAMENTAL_PERCENTILE_MIN_SPAN_DAYS}`
      : null);

  return {
    sampleCount,
    minSampleCount: FUNDAMENTAL_PERCENTILE_MIN_SAMPLE_COUNT,
    spanDays,
    minSpanDays: FUNDAMENTAL_PERCENTILE_MIN_SPAN_DAYS,
    percentile: eligible ? Number(((latestRank / sampleCount) * 100).toFixed(2)) : null,
    latestRank,
    latestValue: latest,
    min: sampleCount > 0 ? Math.min(...values) : null,
    median: median(values),
    max: sampleCount > 0 ? Math.max(...values) : null,
    firstAsOfDate: series.find((item) => item.value != null)?.asOfDate ?? null,
    latestAsOfDate: [...series].reverse().find((item) => item.value != null)?.asOfDate ?? null,
    eligible,
    reason,
  };
}

export function normalizeYfinanceFundamentalsPayload(input: {
  symbol: string;
  payload: unknown;
  quoteSummaryPayload?: unknown;
  updatedAt?: string;
}): YfinanceFundamentalSnapshot {
  const normalizedSymbol = normalizeYfinanceSymbol(input.symbol);
  const updatedAt = input.updatedAt || new Date().toISOString();
  const peSeries = readMetricSeries(input.payload, "trailingPeRatio");
  const peHistory = buildHistoryStats(peSeries);
  const pe = readLatestMetric(input.payload, "trailingPeRatio");
  const quoteStats = readQuoteSummaryStats(input.quoteSummaryPayload);
  const trailingMarketCap = readLatestMetric(input.payload, "trailingMarketCap");
  const quarterlyMarketCap = readLatestMetric(input.payload, "quarterlyMarketCap");
  const annualMarketCap = readLatestMetric(input.payload, "annualMarketCap");
  const timeseriesMarketCap = trailingMarketCap.value != null
    ? trailingMarketCap
    : quarterlyMarketCap.value != null
      ? quarterlyMarketCap
      : annualMarketCap;
  const derivedMarketCap = quoteStats.price != null && quoteStats.sharesOutstanding != null
    ? quoteStats.price * quoteStats.sharesOutstanding
    : null;
  const derivedMarketCapReliable = derivedMarketCap != null
    && (quoteStats.marketCap == null || relativeDiff(derivedMarketCap, quoteStats.marketCap) <= 0.2);
  const marketCap = derivedMarketCapReliable
    ? {
      value: derivedMarketCap,
      currency: quoteStats.currency,
      asOfDate: null,
      source: "price_x_shares_outstanding" as const,
    }
    : (quoteStats.marketCap != null
      ? {
        value: quoteStats.marketCap,
        currency: quoteStats.currency,
        asOfDate: null,
        source: "quote_summary_market_cap" as const,
      }
      : {
        value: timeseriesMarketCap.value,
        currency: timeseriesMarketCap.currency,
        asOfDate: timeseriesMarketCap.asOfDate,
        source: timeseriesMarketCap.value != null ? "fundamentals_timeseries_market_cap" as const : null,
      });
  const trailingPE = quoteStats.trailingPE ?? pe.value;

  const issues: string[] = [];
  if (trailingPE == null) issues.push("missing trailingPeRatio");
  if (marketCap.value == null) issues.push("missing marketCap");
  if (trailingPE != null && !peHistory.eligible) issues.push(`insufficient trailingPeRatio history: ${peHistory.reason}`);
  if (quoteStats.shareSelectionIssue) issues.push(quoteStats.shareSelectionIssue);
  if (derivedMarketCap != null && quoteStats.marketCap != null && !derivedMarketCapReliable) {
    issues.push(`derived marketCap diverges from quoteSummary marketCap: ${(relativeDiff(derivedMarketCap, quoteStats.marketCap) * 100).toFixed(1)}%`);
  }
  if (derivedMarketCap == null && quoteStats.price != null && quoteStats.sharesOutstanding == null) issues.push("missing sharesOutstanding for transparent marketCap");
  if (derivedMarketCap == null && quoteStats.price == null && quoteStats.sharesOutstanding != null) issues.push("missing market price for transparent marketCap");

  return {
    symbol: input.symbol,
    normalizedSymbol,
    marketCap: marketCap.value,
    marketCapCurrency: marketCap.currency,
    marketCapSource: marketCap.source,
    marketPrice: quoteStats.price,
    marketPriceCurrency: quoteStats.currency,
    sharesOutstanding: quoteStats.sharesOutstanding,
    sharesSource: quoteStats.sharesSource,
    trailingPE,
    pbRatio: quoteStats.pbRatio,
    dividendYieldPct: quoteStats.dividendYieldPct,
    revenueGrowthPct: quoteStats.revenueGrowthPct,
    earningsGrowthPct: quoteStats.earningsGrowthPct,
    grossMarginsPct: quoteStats.grossMarginsPct,
    operatingMarginsPct: quoteStats.operatingMarginsPct,
    profitMarginsPct: quoteStats.profitMarginsPct,
    totalRevenue: quoteStats.totalRevenue,
    freeCashflow: quoteStats.freeCashflow,
    operatingCashflow: quoteStats.operatingCashflow,
    totalCash: quoteStats.totalCash,
    totalDebt: quoteStats.totalDebt,
    enterpriseValue: quoteStats.enterpriseValue,
    pePercentile: peHistory.percentile,
    peSampleCount: peSeries.length,
    peAsOfDate: pe.asOfDate,
    peHistory,
    marketCapAsOfDate: marketCap.asOfDate,
    source: "yfinance_fundamentals_timeseries_quote_summary",
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
  const provider = getYahooProvider();
  const [timeseriesResult, quoteSummaryResult] = await Promise.allSettled([
    provider.fetchFundamentalsTimeseries({
      symbol: normalizedSymbol,
      types: FUNDAMENTAL_TYPES_,
      period1,
      period2,
      timeoutMs: opts.timeoutMs ?? 8_000,
      context: {
        caller: "fetchYfinanceFundamentals",
        cacheStatus: "cache_miss",
      },
    }),
    provider.fetchQuoteSummary({
      symbol: normalizedSymbol,
      modules: "price,summaryDetail,defaultKeyStatistics,financialData",
      timeoutMs: opts.timeoutMs ?? 8_000,
      context: {
        caller: "fetchYfinanceFundamentals",
        cacheStatus: "cache_miss",
      },
    }),
  ]);
  if (timeseriesResult.status === "rejected" && quoteSummaryResult.status === "rejected") {
    const timeseriesError = timeseriesResult.reason instanceof Error ? timeseriesResult.reason.message : String(timeseriesResult.reason);
    const quoteSummaryError = quoteSummaryResult.reason instanceof Error ? quoteSummaryResult.reason.message : String(quoteSummaryResult.reason);
    throw new Error(`all yfinance fundamentals requests failed: timeseries=${timeseriesError}; quoteSummary=${quoteSummaryError}`);
  }
  const payload = timeseriesResult.status === "fulfilled" ? timeseriesResult.value.payloadJson : null;
  const quoteSummaryPayload = quoteSummaryResult.status === "fulfilled" ? quoteSummaryResult.value.payloadJson : null;
  const snapshot = normalizeYfinanceFundamentalsPayload({
    symbol: symbolRaw,
    payload,
    quoteSummaryPayload,
    updatedAt: now.toISOString(),
  });
  if (timeseriesResult.status === "rejected") snapshot.issues.push("failed fundamentals timeseries request");
  if (quoteSummaryResult.status === "rejected") snapshot.issues.push("failed quoteSummary request");
  return snapshot;
}
