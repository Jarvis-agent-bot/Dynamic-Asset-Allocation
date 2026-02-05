import { clamp, cumulativeProduct } from "./math";
import { computeMetrics, scoreMetrics, type ScoreWeights } from "./metrics";
import type { BacktestResult, PriceBar, Strategy } from "./domain";

/** Compute daily close-to-close returns. */
export function computeAssetReturns(series: Array<Pick<PriceBar, "close">>): number[] {
  const rs: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const prev = Number(series[i - 1].close);
    const cur = Number(series[i].close);

    // Defensive: data providers occasionally emit null/0/NaN/Infinity.
    // For backtests we treat invalid prices as a 0% return to avoid NaN pollution.
    if (!Number.isFinite(prev) || !Number.isFinite(cur) || prev <= 0 || cur <= 0) {
      rs.push(0);
      continue;
    }

    const r = cur / prev - 1;
    rs.push(Number.isFinite(r) ? r : 0);
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
  const w = strategy.weights(series).map((x: number) => clamp(Number(x) || 0, 0, 1));
  if (w.length !== series.length) throw new Error("weights length mismatch");

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
    .sort((a, b) => b.score - a.score);
}
