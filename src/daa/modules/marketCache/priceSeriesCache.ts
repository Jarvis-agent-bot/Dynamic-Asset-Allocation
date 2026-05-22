/**
 * priceSeriesCache.ts
 *
 * 统一的行情序列入口，优先读取真实 OHLCV candle cache。
 * - `daa_market_candles_v1` 是新的 K 线/技术指标/回测底座，保存 Yahoo 返回的 open/high/low/close/volume/adjClose。
 * - `daa_market_price_history_v1` 和 legacy `daa_price_history` 只作为 close-only 兼容 fallback，不再用来伪造蜡烛线。
 */

import { daaPgPool } from "@/src/daa/pg/daaPg";
import { normalizeYfinanceSymbol } from "@/src/market/yfinance";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { getYahooProvider } from "@/src/market/yahooProvider";
import { ensureDaaMarketCacheSchemaPg } from "@/src/daa/store/storeSchema";

export type CachedPricePoint = {
  date: string;
  close: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
  adjClose?: number;
};

export type PriceSeriesInterval = "1d" | "1h";

type PriceSeriesWriteScope = {
  market: string;
  currency: string;
};

type PriceSeriesCacheResult = {
  symbol: string;
  data: CachedPricePoint[];
  source: "db" | "yahoo" | "mixed";
  interval?: PriceSeriesInterval;
  priceMode?: "close" | "adjclose";
  upstream?: "daa_market_candles_v1" | "legacy_close_history" | "yahoo_provider" | "mixed";
  rowsCovered?: number;
  rowsWritten?: number;
  error?: string;
};

type PriceSeriesCacheOptions = {
  /** 当前系统里的资产市场，用于历史表主键和 fallback 口径 */
  market?: string;
  /** 当前系统里的资产报价币种，用于历史表和 fallback 口径 */
  currency?: string;
  /** Yahoo/chart interval；当前前端 K 线使用 1d，初始化可预留 1h。 */
  interval?: PriceSeriesInterval;
  /** 是否使用 adjClose 作为返回 close。写库始终保留 Yahoo 原始 close 和 adjClose。 */
  adjusted?: boolean;
  /** 绘制真实 K 线时必须为 true，避免 close-only fallback 被当成蜡烛线。 */
  requireOhlcv?: boolean;
  /** 认为 DB 数据"充足"的最小条数（默认 100） */
  minDbDays?: number;
  /** 认为 DB 数据"新鲜"的最大天数（默认 2） */
  maxStaleDays?: number;
  /** Yahoo 请求超时（默认 8000ms） */
  timeoutMs?: number;
  /** 批量请求时的最大并发数（默认 10） */
  concurrency?: number;
  /** 默认异步写库；历史初始化需要同步确认写入结果。 */
  writeMode?: "async" | "sync";
};

const DEFAULT_MIN_DB_DAYS = 100;
const DEFAULT_MAX_STALE_DAYS = 2;
const DEFAULT_TIMEOUT_MS = 8000;
const START_COVERAGE_TOLERANCE_DAYS = 7;

/**
 * 获取价格序列（真实 candle DB 优先 + 按需补 Yahoo）。
 * 所有需要历史行情数据的地方都应调用此函数。
 */
export async function fetchPriceSeriesWithCache(
  symbol: string,
  start: string,
  opts: PriceSeriesCacheOptions = {},
): Promise<PriceSeriesCacheResult> {
  const normalized = normalizeYfinanceSymbol(symbol);
  const normalizedUpper = normalized.toUpperCase();
  const marketHint = normalizeUpper(opts.market);
  const currencyHint = normalizeUpper(opts.currency);
  const interval = normalizeInterval(opts.interval);
  const requireOhlcv = opts.requireOhlcv ?? false;
  const adjusted = requireOhlcv ? false : (opts.adjusted ?? true);
  const minDbDays = opts.minDbDays ?? DEFAULT_MIN_DB_DAYS;
  const maxStaleDays = opts.maxStaleDays ?? DEFAULT_MAX_STALE_DAYS;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const writeMode = opts.writeMode ?? "async";

  await ensureDaaMarketCacheSchemaPg();

  let dbData: CachedPricePoint[] = [];
  let dbUpstream: PriceSeriesCacheResult["upstream"] = "daa_market_candles_v1";

  try {
    dbData = await queryCandleHistory(normalizedUpper, start, {
      market: marketHint,
      interval,
    });
  } catch (e) {
    logSwallowed("priceSeriesCache.candleDbRead", e);
  }

  if (!requireOhlcv) {
    try {
      const legacyData = await queryLegacyCloseHistory(normalizedUpper, start, marketHint);
      if (legacyData.length > 0) {
        dbData = mergeByDate(legacyData, dbData);
        dbUpstream = dbData.some(hasCompleteOhlc) ? "mixed" : "legacy_close_history";
      }
    } catch (e) {
      logSwallowed("priceSeriesCache.legacyDbRead", e);
    }
  }

  const usableDbData = requireOhlcv ? dbData.filter(hasCompleteOhlc) : dbData;
  const today = new Date().toISOString().slice(0, 10);
  const latestDbDate = usableDbData.length > 0 ? usableDbData[usableDbData.length - 1].date.slice(0, 10) : null;
  const earliestDbDate = usableDbData.length > 0 ? usableDbData[0].date.slice(0, 10) : null;
  const daysSinceLatest = latestDbDate
    ? Math.floor((Date.parse(today) - Date.parse(latestDbDate)) / 86_400_000)
    : Infinity;
  const coversRequestedStart = coversStartDate(earliestDbDate, start);

  if (usableDbData.length >= minDbDays && daysSinceLatest <= maxStaleDays && coversRequestedStart) {
    return {
      symbol,
      data: applyCloseMode(usableDbData, adjusted),
      source: "db",
      interval,
      priceMode: adjusted ? "adjclose" : "close",
      upstream: dbUpstream,
      rowsCovered: usableDbData.length,
    };
  }

  try {
    const fetchStart = coversRequestedStart && latestDbDate && usableDbData.length >= minDbDays ? latestDbDate : start;
    const fresh = await fetchFromYahoo(normalized, fetchStart, timeoutMs, {
      market: marketHint,
      currency: currencyHint,
      interval,
    });
    const freshData = fresh.data;

    if (freshData.length === 0 && usableDbData.length > 0) {
      return {
        symbol,
        data: applyCloseMode(usableDbData, adjusted),
        source: "db",
        interval,
        priceMode: adjusted ? "adjclose" : "close",
        upstream: dbUpstream,
        rowsCovered: usableDbData.length,
      };
    }

    let rowsWritten = 0;
    if (freshData.length > 0) {
      const write = writePriceHistory(normalizedUpper, freshData, fresh.scope, interval);
      if (writeMode === "sync") {
        rowsWritten = await write;
      } else {
        void write.catch((e) => logSwallowed("priceSeriesCache.dbWrite", e));
      }
    }

    if (usableDbData.length === 0) {
      return {
        symbol,
        data: applyCloseMode(freshData, adjusted),
        source: "yahoo",
        interval,
        priceMode: adjusted ? "adjclose" : "close",
        upstream: "yahoo_provider",
        rowsCovered: freshData.length,
        rowsWritten,
      };
    }

    const mergedData = mergeByDate(usableDbData, freshData);
    return {
      symbol,
      data: applyCloseMode(mergedData, adjusted),
      source: "mixed",
      interval,
      priceMode: adjusted ? "adjclose" : "close",
      upstream: "mixed",
      rowsCovered: mergedData.length,
      rowsWritten,
    };
  } catch (e) {
    if (usableDbData.length > 0) {
      return {
        symbol,
        data: applyCloseMode(usableDbData, adjusted),
        source: "db",
        interval,
        priceMode: adjusted ? "adjclose" : "close",
        upstream: dbUpstream,
        rowsCovered: usableDbData.length,
      };
    }
    return {
      symbol,
      data: [],
      source: "yahoo",
      interval,
      priceMode: adjusted ? "adjclose" : "close",
      upstream: "yahoo_provider",
      error: e instanceof Error ? e.message : "未知错误",
    };
  }
}

/**
 * 批量获取多个 symbol 的价格序列（并发限制 + 复用缓存）。
 */
export async function fetchMultiplePriceSeriesWithCache(
  symbols: string[],
  start: string,
  opts: PriceSeriesCacheOptions = {},
): Promise<PriceSeriesCacheResult[]> {
  const concurrency = opts.concurrency ?? 10;
  const results: PriceSeriesCacheResult[] = [];

  for (let i = 0; i < symbols.length; i += concurrency) {
    const batch = symbols.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map((s) => fetchPriceSeriesWithCache(s, start, opts)));
    results.push(...batchResults);
  }

  return results;
}

/**
 * 批量获取多个 symbol 的迷你走势数据（sparkline）。
 */
export async function fetchSparklinesBatch(
  symbols: string[],
  days: number = 30,
): Promise<Record<string, number[]>> {
  if (symbols.length === 0) return {};
  const start = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const results = await fetchMultiplePriceSeriesWithCache(symbols, start, {
    minDbDays: 15,
    maxStaleDays: 3,
    timeoutMs: 5000,
  });
  const out: Record<string, number[]> = {};
  for (const r of results) {
    if (r.data.length > 0) {
      out[r.symbol] = r.data.map((p) => p.close);
    }
  }
  return out;
}

// ─── Internal ────────────────────────────────────────────────

function normalizeUpper(value: unknown): string {
  return String(value || "").trim().toUpperCase();
}

function normalizeInterval(value: unknown): PriceSeriesInterval {
  return value === "1h" ? "1h" : "1d";
}

function coversStartDate(earliestDate: string | null, requestedStart: string): boolean {
  if (!earliestDate) return false;
  const earliest = Date.parse(earliestDate.slice(0, 10));
  const requested = Date.parse(requestedStart.slice(0, 10));
  if (!Number.isFinite(earliest) || !Number.isFinite(requested)) return false;
  return earliest <= requested + START_COVERAGE_TOLERANCE_DAYS * 86_400_000;
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function hasCompleteOhlc(bar: CachedPricePoint): boolean {
  return isPositiveFinite(bar.open) && isPositiveFinite(bar.high) && isPositiveFinite(bar.low) && isPositiveFinite(bar.close);
}

function maybePositive(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function maybeVolume(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function normalizeTs(timestampSeconds: number, interval: PriceSeriesInterval): string {
  const iso = new Date(timestampSeconds * 1000).toISOString();
  return interval === "1h" ? iso : iso.slice(0, 10);
}

function applyCloseMode(data: CachedPricePoint[], adjusted: boolean): CachedPricePoint[] {
  if (!adjusted) return data;
  return data.map((bar) => {
    if (!isPositiveFinite(bar.adjClose)) return bar;
    return { ...bar, close: bar.adjClose };
  });
}

async function queryCandleHistory(
  symbolUpper: string,
  start: string,
  opts: { market?: string; interval: PriceSeriesInterval },
): Promise<CachedPricePoint[]> {
  const pool = daaPgPool();
  const params: unknown[] = [symbolUpper, start, opts.interval];
  const marketFilter = opts.market ? ` AND market = $${params.push(opts.market)}` : "";
  const result = await pool.query(
    `SELECT DISTINCT ON (${opts.interval === "1h" ? "ts" : "ts::date"})
       ${opts.interval === "1h" ? "ts" : "ts::date"}::text AS date,
       open, high, low, close, volume, adj_close
     FROM daa_market_candles_v1
     WHERE UPPER(symbol) = $1
       AND ts >= $2::date
       AND interval = $3${marketFilter}
     ORDER BY ${opts.interval === "1h" ? "ts" : "ts::date"}, ts DESC`,
    params,
  );

  const rows: CachedPricePoint[] = [];
  for (const r of result.rows as Array<Record<string, unknown>>) {
    const close = maybePositive(r.close);
    if (!close) continue;
    rows.push({
      date: String(r.date).slice(0, opts.interval === "1h" ? 24 : 10),
      close,
      open: maybePositive(r.open),
      high: maybePositive(r.high),
      low: maybePositive(r.low),
      volume: maybeVolume(r.volume),
      adjClose: maybePositive(r.adj_close),
    });
  }
  return rows;
}

async function queryLegacyCloseHistory(symbolUpper: string, start: string, market?: string): Promise<CachedPricePoint[]> {
  const pool = daaPgPool();
  const params: unknown[] = [symbolUpper, start];
  const marketFilter = market ? ` AND market = $${params.push(market)}` : "";
  const marketAssetKey = market ? `${market}::${symbolUpper}` : "";
  const legacyParams: unknown[] = [symbolUpper, start, marketAssetKey];

  const [marketHistory, legacyHistory] = await Promise.all([
    pool.query(
      `SELECT DISTINCT ON (as_of_ts::date)
         as_of_ts::date::text AS date, price
       FROM daa_market_price_history_v1
       WHERE UPPER(symbol) = $1 AND as_of_ts >= $2::date${marketFilter}
       ORDER BY as_of_ts::date, as_of_ts DESC`,
      params,
    ),
    pool.query(
      `SELECT DISTINCT ON (ts::date)
         ts::date::text AS date,
         price,
         open_price,
         high_price,
         low_price,
         volume
       FROM daa_price_history
       WHERE UPPER(symbol) IN ($1, $3) AND ts >= $2::date
       ORDER BY ts::date, ts DESC`,
      legacyParams,
    ),
  ]);

  const points = [
    ...marketHistory.rows.map((r: Record<string, unknown>) => ({
      date: String(r.date).slice(0, 10),
      close: Number(r.price),
    })),
    ...legacyHistory.rows.map((r: Record<string, unknown>) => ({
      date: String(r.date).slice(0, 10),
      close: Number(r.price),
      open: maybePositive(r.open_price),
      high: maybePositive(r.high_price),
      low: maybePositive(r.low_price),
      volume: maybeVolume(r.volume),
    })),
  ].filter((p) => Number.isFinite(p.close) && p.close > 0);

  return mergeByDate([], points);
}

function resolveMarketFromYahooMeta(input: {
  symbol: string;
  marketHint?: string;
  currency: string;
  instrumentType: string;
}): string {
  if (input.marketHint) return input.marketHint;
  if (input.instrumentType === "CRYPTOCURRENCY") return "CRYPTO";
  if (input.instrumentType === "FUTURE") return "COMMODITY";
  if (input.instrumentType === "CURRENCY") return "FX";
  if (input.symbol.startsWith("^")) return "INDEX";
  if (input.symbol.endsWith("=X")) return "FX";
  if (input.symbol.includes("=F")) return "COMMODITY";

  switch (input.currency) {
    case "HKD":
      return "HK";
    case "CNY":
    case "CNH":
      return "CN";
    case "KRW":
      return "KR";
    case "TWD":
      return "TW";
    case "JPY":
      return "JP";
    case "SGD":
      return "SG";
    case "GBP":
      return "UK";
    case "EUR":
      return "EU";
    case "USD":
      return "US";
    default:
      return "";
  }
}

async function fetchFromYahoo(
  normalizedSymbol: string,
  start: string,
  timeoutMs: number,
  opts: { market?: string; currency?: string; interval: PriceSeriesInterval },
): Promise<{ data: CachedPricePoint[]; scope: PriceSeriesWriteScope | null }> {
  const period1 = Math.floor(new Date(start).getTime() / 1000);
  const result = await getYahooProvider().fetchChart({
    symbol: normalizedSymbol,
    interval: opts.interval,
    period1,
    period2: Math.floor((Date.now() + 86_400_000) / 1000),
    timeoutMs,
    context: {
      caller: "priceSeriesCache.fetchFromYahoo",
      cacheStatus: "external_fetch",
    },
  });

  const json = result.payloadJson as {
    chart?: {
      error?: { code?: unknown; description?: unknown };
      result?: Array<{
        meta?: { currency?: string; instrumentType?: string };
        timestamp?: number[];
        indicators?: {
          adjclose?: Array<{ adjclose?: number[] }>;
          quote?: Array<{
            open?: number[];
            high?: number[];
            low?: number[];
            close?: number[];
            volume?: number[];
          }>;
        };
      }>;
    };
  };

  const chartError = json?.chart?.error;
  if (chartError) {
    const code = String(chartError.code || "").trim();
    const description = String(chartError.description || "").trim();
    throw new Error(description ? `Yahoo chart error${code ? ` (${code})` : ""}: ${description}` : "Yahoo chart error");
  }

  const chartResult = json?.chart?.result?.[0];
  if (!chartResult?.timestamp) return { data: [], scope: null };

  const quote = chartResult.indicators?.quote?.[0] ?? {};
  const timestamps = chartResult.timestamp;
  const opens = quote.open ?? [];
  const highs = quote.high ?? [];
  const lows = quote.low ?? [];
  const closes = quote.close ?? [];
  const volumes = quote.volume ?? [];
  const adjCloses = chartResult.indicators?.adjclose?.[0]?.adjclose ?? [];
  const metaCurrency = normalizeUpper(chartResult.meta?.currency);
  const currency = normalizeUpper(opts.currency) || metaCurrency;
  const instrumentType = normalizeUpper(chartResult.meta?.instrumentType);
  const market = resolveMarketFromYahooMeta({
    symbol: normalizedSymbol.toUpperCase(),
    marketHint: normalizeUpper(opts.market),
    currency,
    instrumentType,
  });

  const data: CachedPricePoint[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = maybePositive(closes[i]);
    if (!close) continue;
    data.push({
      date: normalizeTs(timestamps[i], opts.interval),
      close,
      open: maybePositive(opens[i]),
      high: maybePositive(highs[i]),
      low: maybePositive(lows[i]),
      volume: maybeVolume(volumes[i]),
      adjClose: maybePositive(adjCloses[i]),
    });
  }
  return {
    data,
    scope: market && currency ? { market, currency } : null,
  };
}

function mergeByDate(dbData: CachedPricePoint[], freshData: CachedPricePoint[]): CachedPricePoint[] {
  const map = new Map<string, CachedPricePoint>();
  for (const p of dbData) map.set(p.date, p);
  for (const p of freshData) map.set(p.date, p);
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function writePriceHistory(
  symbolUpper: string,
  data: CachedPricePoint[],
  scope: PriceSeriesWriteScope | null,
  interval: PriceSeriesInterval,
): Promise<number> {
  if (!scope) return 0;
  const pool = daaPgPool();
  const market = scope.market;
  const currency = scope.currency;
  let written = 0;

  for (let i = 0; i < data.length; i += 50) {
    const batch = data.slice(i, i + 50);
    const candleValues: string[] = [];
    const candleParams: unknown[] = [];
    const priceValues: string[] = [];
    const priceParams: unknown[] = [];

    for (const p of batch) {
      const ts = interval === "1h" ? p.date : `${p.date.slice(0, 10)}T00:00:00Z`;
      if (hasCompleteOhlc(p)) {
        const idx = candleParams.length;
        candleValues.push(
          `($${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6}, $${idx + 7}, $${idx + 8}, $${idx + 9}, $${idx + 10}, $${idx + 11}, $${idx + 12}, $${idx + 13}, NOW(), NULL)`,
        );
        candleParams.push(
          "yfinance",
          market,
          symbolUpper,
          interval,
          ts,
          p.open,
          p.high,
          p.low,
          p.close,
          p.volume ?? null,
          p.adjClose ?? null,
          currency,
          "price_series_cache",
        );
      }

      const idx = priceParams.length;
      priceValues.push(`($${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6}, $${idx + 7}, NOW(), NULL)`);
      priceParams.push("yfinance", market, symbolUpper, ts, p.close, currency, "price_series_cache");
    }

    if (candleValues.length > 0) {
      const result = await pool.query(
        `INSERT INTO daa_market_candles_v1
          (provider, market, symbol, interval, ts, open, high, low, close, volume, adj_close, currency, source, fetched_at, raw_ref_id)
         VALUES ${candleValues.join(",")}
         ON CONFLICT (provider, market, symbol, interval, ts)
         DO UPDATE SET
           open = EXCLUDED.open,
           high = EXCLUDED.high,
           low = EXCLUDED.low,
           close = EXCLUDED.close,
           volume = EXCLUDED.volume,
           adj_close = EXCLUDED.adj_close,
           currency = EXCLUDED.currency,
           source = EXCLUDED.source,
           fetched_at = EXCLUDED.fetched_at,
           raw_ref_id = EXCLUDED.raw_ref_id`,
        candleParams,
      );
      written += result.rowCount ?? 0;
    }

    if (priceValues.length > 0) {
      await pool.query(
        `INSERT INTO daa_market_price_history_v1
          (provider, market, symbol, as_of_ts, price, currency, source, fetched_at, raw_ref_id)
         VALUES ${priceValues.join(",")}
         ON CONFLICT (provider, market, symbol, as_of_ts)
         DO UPDATE SET
           price = EXCLUDED.price,
           currency = EXCLUDED.currency,
           source = EXCLUDED.source,
           fetched_at = EXCLUDED.fetched_at,
           raw_ref_id = EXCLUDED.raw_ref_id`,
        priceParams,
      );
    }
  }

  return written;
}
