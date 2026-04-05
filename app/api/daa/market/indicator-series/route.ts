import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { checkRateLimit } from "@/src/daa/api/rateLimit";
import {
  MARKET_INDICATOR_META_CATALOG_,
  MARKET_INDICATOR_KEYS_,
} from "@/src/daa/modules/marketContext/marketIndicatorCatalog";
import type { DaaMarketIndicatorKey } from "@/src/daa/modules/marketContext/marketContextTypes";
import { normalizeYfinanceSymbol } from "@/src/market/yfinance";
import { daaPgPool } from "@/src/daa/pg/daaPg";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export const runtime = "nodejs";

type SeriesPoint = { date: string; value: number };
type DistributionBin = { min: number; max: number; count: number };

/**
 * GET /api/daa/market/indicator-series?key=vix&start=2025-04-01
 *
 * 返回指标的时间序列（支持单值/比率/波动率类型）+ 百分位分布。
 */
export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    // Rate limit: 每 IP 每分钟 5 次
    if (!checkRateLimit("indicator-series", req, { windowMs: 60_000, max: 30 })) {
      return fail("RATE_LIMITED", "请求过于频繁，请稍后重试", { status: 429 });
    }

    const url = new URL(req.url);
    const key = url.searchParams.get("key") as DaaMarketIndicatorKey | null;
    const start = url.searchParams.get("start") || defaultStart();

    if (!key || !MARKET_INDICATOR_KEYS_.includes(key)) {
      return fail("VALIDATION_FAILED", `无效的指标 key: ${key}`, { status: 400 });
    }

    const meta = MARKET_INDICATOR_META_CATALOG_[key];
    if (!meta) {
      return fail("NOT_FOUND", `未找到指标元数据: ${key}`, { status: 404 });
    }

    const symbols = meta.fixedSymbols;
    const isRatio = symbols.length === 2 && meta.category === "relative_value";
    const isVolatility = meta.category === "volatility" && symbols.length === 1 && meta.unit === "%";

    // 并行拉取所有需要的 symbol 的 price-series
    const seriesResults = await Promise.all(
      symbols.map((symbol) => fetchPriceSeries(symbol, start)),
    );

    // 检查是否有失败
    const failed = seriesResults.find((r) => r.error);
    if (failed?.error) {
      return fail("INTERNAL_ERROR", `拉取 ${failed.symbol} 失败: ${failed.error}`, { status: 502 });
    }

    let series: SeriesPoint[];

    if (isRatio) {
      // 比率指标：left / right
      series = computeRatioSeries(seriesResults[0].data, seriesResults[1].data);
    } else if (isVolatility) {
      // 波动率指标：20 日滚动标准差 × √252 (年化)
      series = computeVolatilitySeries(seriesResults[0].data, 20);
    } else {
      // 单值指标：直接用 close 价格
      series = seriesResults[0].data.map((p) => ({ date: p.date, value: p.close }));
    }

    // 百分位分布（取最近 252 天）
    const recentValues = series.slice(-252).map((p) => p.value).filter(Number.isFinite);
    const distribution = computeDistribution(recentValues, 20);

    // 当前快照信息
    const currentValue = series.length > 0 ? series[series.length - 1].value : null;

    return ok({
      key,
      label: meta.label,
      category: meta.category,
      scope: meta.scope,
      unit: meta.unit || "",
      symbols,
      isRatio,
      isVolatility,
      series,
      currentValue,
      distribution,
      componentSeries: isRatio ? {
        left: { symbol: symbols[0], series: seriesResults[0].data.map((p) => ({ date: p.date, value: p.close })) },
        right: { symbol: symbols[1], series: seriesResults[1].data.map((p) => ({ date: p.date, value: p.close })) },
      } : undefined,
    });
  });
}

// ─── Helpers ────────────────────────────────────────────────

function defaultStart(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  d.setDate(d.getDate() - 30); // 1年+30天，确保 252 天百分位够用
  return d.toISOString().slice(0, 10);
}

type PricePoint = { date: string; close: number };

/**
 * DB 优先获取价格序列：
 * 1. 先查 daa_market_price_history_v1
 * 2. 数据充足且不超过 2 天 → 直接返回（0 次外部请求）
 * 3. 否则只补缺失天数 → 新数据写回 DB
 */
async function fetchPriceSeries(symbol: string, start: string): Promise<{
  symbol: string;
  data: PricePoint[];
  error?: string;
}> {
  const normalized = normalizeYfinanceSymbol(symbol);
  const normalizedUpper = normalized.toUpperCase();

  // Step 1: 从 DB 查缓存
  let dbData: PricePoint[] = [];
  try {
    const pool = daaPgPool();
    const result = await pool.query(
      `SELECT DISTINCT ON (as_of_ts::date)
         as_of_ts::date::text AS date, price
       FROM daa_market_price_history_v1
       WHERE UPPER(symbol) = $1 AND as_of_ts >= $2::date
       ORDER BY as_of_ts::date, as_of_ts DESC`,
      [normalizedUpper, start],
    );
    dbData = result.rows
      .filter((r: Record<string, unknown>) => r.price != null && Number.isFinite(Number(r.price)))
      .map((r: Record<string, unknown>) => ({ date: String(r.date).slice(0, 10), close: Number(r.price) }));
  } catch (e) {
    logSwallowed("indicator-series.dbRead", e);
  }

  // Step 2: 判断是否需要补数据
  const today = new Date().toISOString().slice(0, 10);
  const latestDbDate = dbData.length > 0 ? dbData[dbData.length - 1].date : null;
  const daysSinceLatest = latestDbDate
    ? Math.floor((Date.parse(today) - Date.parse(latestDbDate)) / 86_400_000)
    : Infinity;

  // DB 有 100+ 天数据且最近 2 天内有更新 → 直接返回
  if (dbData.length >= 100 && daysSinceLatest <= 2) {
    return { symbol, data: dbData };
  }

  // Step 3: 从 Yahoo Finance 补数据（只拉增量或全量）
  try {
    const fetchStart = latestDbDate && dbData.length >= 100 ? latestDbDate : start;
    const period1 = Math.floor(new Date(fetchStart).getTime() / 1000);
    const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(normalized)}`);
    url.searchParams.set("interval", "1d");
    url.searchParams.set("period1", String(period1));

    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; DAAConsole/1.0)" },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      // Yahoo 失败时降级返回 DB 缓存
      if (dbData.length > 0) return { symbol, data: dbData };
      return { symbol, data: [], error: `Yahoo HTTP ${res.status}` };
    }

    const json = await res.json() as { chart?: { result?: Array<{
      timestamp?: number[];
      indicators?: { adjclose?: Array<{ adjclose?: number[] }>; quote?: Array<{ close?: number[] }> };
    }> } };

    const chartResult = json?.chart?.result?.[0];
    if (!chartResult?.timestamp) {
      return { symbol, data: dbData.length > 0 ? dbData : [] };
    }

    const timestamps = chartResult.timestamp;
    const closes = chartResult.indicators?.adjclose?.[0]?.adjclose ?? chartResult.indicators?.quote?.[0]?.close ?? [];

    const freshData: PricePoint[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const close = closes[i];
      if (close == null || !Number.isFinite(close)) continue;
      const date = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);
      freshData.push({ date, close });
    }

    // Step 4: 新数据写回 DB（fire-and-forget）
    if (freshData.length > 0) {
      void writeHistoryToDb(normalizedUpper, freshData).catch((e) => logSwallowed("indicator-series.dbWrite", e));
    }

    // 合并：DB 历史 + 新拉取（日期去重取新）
    return { symbol, data: mergeByDate(dbData, freshData) };
  } catch (e) {
    // 外部调用失败时降级返回 DB 缓存
    if (dbData.length > 0) return { symbol, data: dbData };
    return { symbol, data: [], error: e instanceof Error ? e.message : "未知错误" };
  }
}

function mergeByDate(dbData: PricePoint[], freshData: PricePoint[]): PricePoint[] {
  const map = new Map<string, number>();
  for (const p of dbData) map.set(p.date, p.close);
  for (const p of freshData) map.set(p.date, p.close); // fresh 覆盖旧数据
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, close]) => ({ date, close }));
}

async function writeHistoryToDb(symbol: string, data: PricePoint[]): Promise<void> {
  const pool = daaPgPool();
  for (let i = 0; i < data.length; i += 50) {
    const batch = data.slice(i, i + 50);
    const values: string[] = [];
    const params: unknown[] = [];
    for (const p of batch) {
      const idx = params.length;
      values.push(`($${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6}, $${idx + 7}, NOW(), NULL)`);
      params.push("yfinance", "US", symbol, `${p.date}T00:00:00Z`, p.close, "USD", "indicator_series_cache");
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

function computeRatioSeries(left: PricePoint[], right: PricePoint[]): SeriesPoint[] {
  const rightMap = new Map(right.map((p) => [p.date, p.close]));
  const result: SeriesPoint[] = [];
  for (const lp of left) {
    const rv = rightMap.get(lp.date);
    if (rv && rv > 0) {
      result.push({ date: lp.date, value: +(lp.close / rv).toFixed(6) });
    }
  }
  return result;
}

function computeVolatilitySeries(data: PricePoint[], window: number): SeriesPoint[] {
  if (data.length < window + 1) return [];
  const result: SeriesPoint[] = [];
  for (let i = window; i < data.length; i++) {
    const returns: number[] = [];
    for (let j = i - window + 1; j <= i; j++) {
      if (data[j - 1].close > 0) {
        returns.push(Math.log(data[j].close / data[j - 1].close));
      }
    }
    if (returns.length < 2) continue;
    const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
    const annualizedVol = Math.sqrt(variance) * Math.sqrt(252) * 100;
    result.push({ date: data[i].date, value: +annualizedVol.toFixed(2) });
  }
  return result;
}

function computeDistribution(values: number[], binCount: number): {
  bins: DistributionBin[];
  currentBin: number;
  currentValue: number | null;
  percentile: number;
} {
  if (values.length === 0) {
    return { bins: [], currentBin: -1, currentValue: null, percentile: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const current = values[values.length - 1];
  const range = max - min;

  if (range < 1e-9) {
    return {
      bins: [{ min, max: max + 1, count: values.length }],
      currentBin: 0,
      currentValue: current,
      percentile: 50,
    };
  }

  const binWidth = range / binCount;
  const bins: DistributionBin[] = [];
  for (let i = 0; i < binCount; i++) {
    const bMin = min + i * binWidth;
    const bMax = i === binCount - 1 ? max + 0.001 : min + (i + 1) * binWidth;
    const count = values.filter((v) => v >= bMin && v < bMax).length;
    bins.push({ min: +bMin.toFixed(4), max: +bMax.toFixed(4), count });
  }

  const currentBin = Math.min(Math.floor((current - min) / binWidth), binCount - 1);
  const belowCount = sorted.filter((v) => v <= current).length;
  const percentile = +((belowCount / sorted.length) * 100).toFixed(1);

  return { bins, currentBin, currentValue: current, percentile };
}
