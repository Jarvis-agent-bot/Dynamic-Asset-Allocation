import { clamp, cumulativeProduct } from "./math";
import { computeMetrics, scoreMetrics, type ScoreWeights } from "./metrics";
import type { BacktestResult, PriceBar, Strategy } from "./domain";

/** Compute daily close-to-close returns. */
export function computeAssetReturns(series: Array<Pick<PriceBar, "close">>): number[] {
  const rs: number[] = [];

  // Defensive: data providers occasionally emit null/0/NaN/Infinity.
  // For backtests we treat invalid prices as a 0% return to avoid NaN pollution.
  //
  // Important: if a day is invalid, we also "break" the prev-close chain so we don't
  // create a cascade of invalid-prev returns on subsequent days.
  let prevClose: number | undefined = undefined;
  if (series.length > 0) {
    const first = Number(series[0].close);
    if (Number.isFinite(first) && first > 0) prevClose = first;
  }

  for (let i = 1; i < series.length; i++) {
    const cur = Number(series[i].close);

    if (!Number.isFinite(cur) || cur <= 0) {
      rs.push(0);
      prevClose = undefined;
      continue;
    }

    if (prevClose === undefined) {
      rs.push(0);
      prevClose = cur;
      continue;
    }

    const r = cur / prevClose - 1;
    rs.push(Number.isFinite(r) ? r : 0);
    prevClose = cur;
  }

  return rs;
}

/**
 * Backtest a single-asset strategy with daily rebalancing and no fees.
 * weights are applied for the NEXT day return (i -> i+1), so we align:
 * - weights length == series length
 * - dailyReturns length == series length - 1
 */
export function backtestSingleAsset(strategy: Strategy, series: PriceBar[]): BacktestResult {
  if (!series || series.length < 2) throw new Error("series too short");

  // Contract: series dates must be present, ISO-like (YYYY-MM-DD), valid, and strictly increasing.
  // We rely on lexicographic ordering/alignment between weights[i] and return[i->i+1];
  // missing/out-of-order or non-ISO dates would silently degrade signal quality.
  for (let i = 0; i < series.length; i++) {
    const d = (series[i] as any)?.date;
    if (typeof d !== "string" || d.length === 0) {
      throw new Error(`Price series date must be a non-empty string (got ${String(d)} at index ${i})`);
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      throw new Error(`Price series date must match YYYY-MM-DD (got ${d} at index ${i})`);
    }
    const parsed = new Date(`${d}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== d) {
      throw new Error(`Price series date must be a valid calendar date (got ${d} at index ${i})`);
    }

    if (i > 0) {
      const prev = (series[i - 1] as any).date as string;
      if (d <= prev) {
        throw new Error(`Price series dates must be strictly increasing (got ${prev} then ${d} at index ${i})`);
      }
    }
  }

  // Defensive: strategies must not emit NaN/Infinity weights. For backtests we treat
  // invalid weights as 0 to prevent NaN pollution and accidental full-risk exposure.
  const w = strategy.weights(series).map((x: number) => {
    const n = Number(x);
    return clamp(Number.isFinite(n) ? n : 0, 0, 1);
  });
  if (w.length !== series.length) {
    throw new Error(`weights length mismatch: ${strategy.id} expected=${series.length} got=${w.length}`);
  }

  const assetReturns = computeAssetReturns(series);

  // portfolio daily return: weight at day i applies to return i->i+1
  const dailyReturns = assetReturns.map((r, i) => w[i] * r);
  const equity = cumulativeProduct(dailyReturns, 1);

  return {
    strategyId: strategy.id,
    strategyName: strategy.name,
    equity,
    dailyReturns,
    metrics: computeMetrics(equity, dailyReturns),
  };
}

export function runBacktests(strategies: Strategy[], series: PriceBar[]): BacktestResult[] {
  return strategies.map((s) => backtestSingleAsset(s, series));
}

export type RankedBacktestResult = BacktestResult & { score: number };

export function rankBacktestResults(results: BacktestResult[] = [], weights?: ScoreWeights): RankedBacktestResult[] {
  return [...(results || [])]
    .map((r) => ({ ...r, score: scoreMetrics(r.metrics, weights) }))
    // Deterministic ordering: break ties by strategyId so CI snapshots/logs don't flap.
    .sort((a, b) => (b.score - a.score) || a.strategyId.localeCompare(b.strategyId));
}
