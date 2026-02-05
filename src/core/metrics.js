import { mean, stdev, maxDrawdown } from "./math.js";

/**
 * @param {number[]} equity
 * @param {number[]} dailyReturns
 */
/**
 * @typedef {{ totalReturn: number, maxDrawdown: number, sharpe: number, winRate: number }} Metrics
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

/**
 * Convert metrics into a single score for ranking.
 * Higher is better.
 *
 * Default is intentionally simple (v0):
 * - reward: totalReturn + sharpe
 * - penalize: maxDrawdown
 * - tiny reward: winRate
 *
 * @param {Metrics} m
 * @param {{
 *   wReturn?: number,
 *   wSharpe?: number,
 *   wDrawdown?: number,
 *   wWinRate?: number
 * }} [w]
 */
export function scoreMetrics(
  m,
  { wReturn = 1, wSharpe = 1, wDrawdown = 1, wWinRate = 0.1 } = {},
) {
  const totalReturn = Number(m?.totalReturn) || 0;
  const sharpe = Number(m?.sharpe) || 0;
  const maxDrawdown = Number(m?.maxDrawdown) || 0;
  const winRate = Number(m?.winRate) || 0;
  return wReturn * totalReturn + wSharpe * sharpe - wDrawdown * maxDrawdown + wWinRate * winRate;
}
