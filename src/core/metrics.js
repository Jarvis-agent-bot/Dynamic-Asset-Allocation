import { mean, stdev, maxDrawdown } from "./math.js";

/**
 * @param {number[]} equity
 * @param {number[]} dailyReturns
 */
export function computeMetrics(equity, dailyReturns) {
  const totalReturn = equity.length ? equity[equity.length - 1] - 1 : 0;
  const mdd = maxDrawdown(equity);

  // Simple daily Sharpe assuming risk-free 0 and ~252 trading days.
  const mu = mean(dailyReturns);
  const sigma = stdev(dailyReturns);
  const sharpe = sigma === 0 ? 0 : (mu / sigma) * Math.sqrt(252);

  const wins = dailyReturns.filter((r) => r > 0).length;
  const winRate = dailyReturns.length ? wins / dailyReturns.length : 0;

  return {
    totalReturn,
    maxDrawdown: mdd,
    sharpe,
    winRate,
  };
}
