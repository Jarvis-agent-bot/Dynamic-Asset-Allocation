import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { checkRateLimit } from "@/src/daa/api/rateLimit";
import {
  MARKET_INDICATOR_META_CATALOG_,
  MARKET_INDICATOR_KEYS_,
} from "@/src/daa/modules/marketContext/marketIndicatorCatalog";
import type { DaaMarketIndicatorKey } from "@/src/daa/modules/marketContext/marketContextTypes";
import { fetchMultiplePriceSeriesWithCache, type CachedPricePoint } from "@/src/daa/modules/marketCache/priceSeriesCache";

export const runtime = "nodejs";

type SeriesPoint = { date: string; value: number };
type DistributionBin = { min: number; max: number; count: number };

/**
 * GET /api/daa/market/indicator-series?key=vix&start=2025-04-01
 *
 * 返回指标的时间序列（支持单值/比率/波动率）+ 百分位分布。
 * 使用通用缓存层（DB 优先 + 按需补数据）。
 */
export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

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

    // 通过共享缓存层并行拉取所有 symbol
    const results = await fetchMultiplePriceSeriesWithCache(symbols, start);

    const failed = results.find((r) => r.error && r.data.length === 0);
    if (failed) {
      return fail("INTERNAL_ERROR", `拉取 ${failed.symbol} 失败: ${failed.error}`, { status: 502 });
    }

    let series: SeriesPoint[];

    if (isRatio) {
      series = computeRatioSeries(results[0].data, results[1].data);
    } else if (isVolatility) {
      series = computeVolatilitySeries(results[0].data, 20);
    } else {
      series = results[0].data.map((p) => ({ date: p.date, value: p.close }));
    }

    const recentValues = series.slice(-252).map((p) => p.value).filter(Number.isFinite);
    const distribution = computeDistribution(recentValues, 20);
    const currentValue = series.length > 0 ? series[series.length - 1].value : null;

    // 数据来源统计
    const sources = results.map((r) => r.source);

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
      sources,
      componentSeries: isRatio ? {
        left: { symbol: symbols[0], series: results[0].data.map((p) => ({ date: p.date, value: p.close })) },
        right: { symbol: symbols[1], series: results[1].data.map((p) => ({ date: p.date, value: p.close })) },
      } : undefined,
    });
  });
}

// ─── Helpers ────────────────────────────────────────────────

function defaultStart(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function computeRatioSeries(left: CachedPricePoint[], right: CachedPricePoint[]): SeriesPoint[] {
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

function computeVolatilitySeries(data: CachedPricePoint[], window: number): SeriesPoint[] {
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
    return { bins: [{ min, max: max + 1, count: values.length }], currentBin: 0, currentValue: current, percentile: 50 };
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
