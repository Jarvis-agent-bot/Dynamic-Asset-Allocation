import { mean, stdev, maxDrawdown } from "./math";
import type { BacktestMetrics } from "./domain";

export function computeMetrics(equity: number[], dailyReturns: number[]): BacktestMetrics {
  const totalReturn = equity.length ? equity[equity.length - 1] - 1 : 0;
  const mdd = maxDrawdown(equity);

  // Simple daily Sharpe assuming risk-free 0 and ~252 trading days.
  const mu = mean(dailyReturns);
  const sigma = stdev(dailyReturns);
  const sharpe = sigma === 0 ? 0 : (mu / sigma) * Math.sqrt(252);

  const wins = dailyReturns.filter((r: number) => r > 0).length;
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
 */

export type ScoreWeights = {
  wReturn?: number;
  wSharpe?: number;
  wDrawdown?: number;
  wWinRate?: number;
};

export function scoreMetrics(
  m: BacktestMetrics,
  { wReturn = 1, wSharpe = 1, wDrawdown = 1, wWinRate = 0.1 }: ScoreWeights = {}
): number {
  const totalReturn = Number(m?.totalReturn) || 0;
  const sharpe = Number(m?.sharpe) || 0;
  const maxDrawdown = Number(m?.maxDrawdown) || 0;
  const winRate = Number(m?.winRate) || 0;
  return wReturn * totalReturn + wSharpe * sharpe - wDrawdown * maxDrawdown + wWinRate * winRate;
}
