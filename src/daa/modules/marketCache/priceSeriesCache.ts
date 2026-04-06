/**
 * priceSeriesCache.ts
 *
 * 通用的价格序列获取函数，DB 优先 + 按需补数据。
 * 所有需要历史价格数据的接口都应该调用此函数，而不是直接请求 Yahoo Finance。
 *
 * 缓存策略：
 * 1. 先查 daa_market_price_history_v1（本地 DB）
 * 2. 数据充足（100+ 天）且最近 2 天内有更新 → 直接返回（0 次外部请求）
 * 3. 否则只从 Yahoo Finance 补缺失天数（增量拉取）
 * 4. 新数据异步写回 DB（下次不用再拉）
 * 5. Yahoo 不可用时降级返回 DB 缓存
 */

import { daaPgPool } from "@/src/daa/pg/daaPg";
import { normalizeYfinanceSymbol } from "@/src/market/yfinance";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export type CachedPricePoint = { date: string; close: number };

export type PriceSeriesCacheResult = {
  symbol: string;
  data: CachedPricePoint[];
  source: "db" | "yahoo" | "mixed";
  error?: string;
};

export type PriceSeriesCacheOptions = {
  /** 认为 DB 数据"充足"的最小天数（默认 100） */
  minDbDays?: number;
  /** 认为 DB 数据"新鲜"的最大天数（默认 2） */
  maxStaleDays?: number;
  /** Yahoo 请求超时（默认 8000ms） */
  timeoutMs?: number;
};

const DEFAULT_MIN_DB_DAYS = 100;
const DEFAULT_MAX_STALE_DAYS = 2;
const DEFAULT_TIMEOUT_MS = 8000;

/**
 * 获取价格序列（DB 优先 + 按需补数据）。
 * 所有需要历史价格数据的地方都应调用此函数。
 */
export async function fetchPriceSeriesWithCache(
  symbol: string,
  start: string,
  opts: PriceSeriesCacheOptions = {},
): Promise<PriceSeriesCacheResult> {
  const normalized = normalizeYfinanceSymbol(symbol);
  const normalizedUpper = normalized.toUpperCase();
  const minDbDays = opts.minDbDays ?? DEFAULT_MIN_DB_DAYS;
  const maxStaleDays = opts.maxStaleDays ?? DEFAULT_MAX_STALE_DAYS;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Step 1: 从 DB 查缓存
  let dbData: CachedPricePoint[] = [];
  try {
    dbData = await queryPriceHistory(normalizedUpper, start);
  } catch (e) {
    logSwallowed("priceSeriesCache.dbRead", e);
  }

  // Step 2: 判断是否需要补数据
  const today = new Date().toISOString().slice(0, 10);
  const latestDbDate = dbData.length > 0 ? dbData[dbData.length - 1].date : null;
  const daysSinceLatest = latestDbDate
    ? Math.floor((Date.parse(today) - Date.parse(latestDbDate)) / 86_400_000)
    : Infinity;

  if (dbData.length >= minDbDays && daysSinceLatest <= maxStaleDays) {
    return { symbol, data: dbData, source: "db" };
  }

  // Step 3: 从 Yahoo Finance 补数据
  try {
    const fetchStart = latestDbDate && dbData.length >= minDbDays ? latestDbDate : start;
    const freshData = await fetchFromYahoo(normalized, fetchStart, timeoutMs);

    if (freshData.length === 0 && dbData.length > 0) {
      return { symbol, data: dbData, source: "db" };
    }

    // Step 4: 新数据异步写回 DB（fire-and-forget）
    if (freshData.length > 0) {
      void writePriceHistory(normalizedUpper, freshData).catch((e) => logSwallowed("priceSeriesCache.dbWrite", e));
    }

    if (dbData.length === 0) {
      return { symbol, data: freshData, source: "yahoo" };
    }

    return { symbol, data: mergeByDate(dbData, freshData), source: "mixed" };
  } catch (e) {
    // Yahoo 失败时降级返回 DB 缓存
    if (dbData.length > 0) {
      return { symbol, data: dbData, source: "db" };
    }
    return { symbol, data: [], source: "yahoo", error: e instanceof Error ? e.message : "未知错误" };
  }
}

/**
 * 批量获取多个 symbol 的价格序列（并行，复用缓存）。
 */
export async function fetchMultiplePriceSeriesWithCache(
  symbols: string[],
  start: string,
  opts: PriceSeriesCacheOptions = {},
): Promise<PriceSeriesCacheResult[]> {
  return Promise.all(symbols.map((s) => fetchPriceSeriesWithCache(s, start, opts)));
}

/**
 * 批量获取多个 symbol 的迷你走势数据（sparkline）。
 * 返回 Map<symbol, number[]>，每个 symbol 最近 N 天的 close 价格数组。
 */
export async function fetchSparklinesBatch(
  symbols: string[],
  days: number = 30,
): Promise<Record<string, number[]>> {
  if (symbols.length === 0) return {};
  const start = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const results = await fetchMultiplePriceSeriesWithCache(symbols, start, {
    minDbDays: 15, // sparkline 不需要 100 天
    maxStaleDays: 3, // 允许 3 天 stale
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

async function queryPriceHistory(symbolUpper: string, start: string): Promise<CachedPricePoint[]> {
  const pool = daaPgPool();
  const result = await pool.query(
    `SELECT DISTINCT ON (as_of_ts::date)
       as_of_ts::date::text AS date, price
     FROM daa_market_price_history_v1
     WHERE UPPER(symbol) = $1 AND as_of_ts >= $2::date
     ORDER BY as_of_ts::date, as_of_ts DESC`,
    [symbolUpper, start],
  );
  return result.rows
    .filter((r: Record<string, unknown>) => r.price != null && Number.isFinite(Number(r.price)))
    .map((r: Record<string, unknown>) => ({ date: String(r.date).slice(0, 10), close: Number(r.price) }));
}

async function fetchFromYahoo(normalizedSymbol: string, start: string, timeoutMs: number): Promise<CachedPricePoint[]> {
  const period1 = Math.floor(new Date(start).getTime() / 1000);
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(normalizedSymbol)}`);
  url.searchParams.set("interval", "1d");
  url.searchParams.set("period1", String(period1));

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; DAAConsole/1.0)" },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    throw new Error(`Yahoo HTTP ${res.status}`);
  }

  const json = await res.json() as { chart?: { result?: Array<{
    timestamp?: number[];
    indicators?: { adjclose?: Array<{ adjclose?: number[] }>; quote?: Array<{ close?: number[] }> };
  }> } };

  const chartResult = json?.chart?.result?.[0];
  if (!chartResult?.timestamp) return [];

  const timestamps = chartResult.timestamp;
  const closes = chartResult.indicators?.adjclose?.[0]?.adjclose ?? chartResult.indicators?.quote?.[0]?.close ?? [];

  const data: CachedPricePoint[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i];
    if (close == null || !Number.isFinite(close)) continue;
    const date = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);
    data.push({ date, close });
  }
  return data;
}

function mergeByDate(dbData: CachedPricePoint[], freshData: CachedPricePoint[]): CachedPricePoint[] {
  const map = new Map<string, number>();
  for (const p of dbData) map.set(p.date, p.close);
  for (const p of freshData) map.set(p.date, p.close); // fresh 覆盖旧数据
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, close]) => ({ date, close }));
}

async function writePriceHistory(symbolUpper: string, data: CachedPricePoint[]): Promise<void> {
  const pool = daaPgPool();
  for (let i = 0; i < data.length; i += 50) {
    const batch = data.slice(i, i + 50);
    const values: string[] = [];
    const params: unknown[] = [];
    for (const p of batch) {
      const idx = params.length;
      values.push(`($${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6}, $${idx + 7}, NOW(), NULL)`);
      params.push("yfinance", "US", symbolUpper, `${p.date}T00:00:00Z`, p.close, "USD", "price_series_cache");
    }
    await pool.query(
      `INSERT INTO daa_market_price_history_v1
        (provider, market, symbol, as_of_ts, price, currency, source, fetched_at, raw_ref_id)
       VALUES ${values.join(",")}
       ON CONFLICT (provider, market, symbol, as_of_ts) DO NOTHING`,
      params,
    );
  }
}
