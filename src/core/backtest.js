import { clamp, cumulativeProduct } from "./math.js";
import { computeMetrics } from "./metrics.js";

/**
 * Compute daily close-to-close returns.
 * @param {{close:number}[]} series
 */
export function computeAssetReturns(series) {
  const rs = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1].close;
    const cur = series[i].close;
    rs.push(prev > 0 ? cur / prev - 1 : 0);
  }
  return rs;
}

/**
 * Backtest a single-asset strategy with daily rebalancing and no fees.
 * weights are applied for the NEXT day return (i -> i+1), so we align:
 * - weights length == series length
 * - dailyReturns length == series length - 1
 * @param {{id:string,name:string,weights:(series:any[])=>number[]}} strategy
 * @param {{date:string,close:number}[]} series
 */
export function backtestSingleAsset(strategy, series) {
  if (!series || series.length < 2) throw new Error("series too short");
  const w = strategy.weights(series).map((x) => clamp(Number(x) || 0, 0, 1));
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

/**
 * Run multiple strategies and return results.
 * @param {Array<any>} strategies
 * @param {Array<any>} series
 */
export function runBacktests(strategies, series) {
  return strategies.map((s) => backtestSingleAsset(s, series));
}
