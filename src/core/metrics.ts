import { mean, stdev, maxDrawdown } from "./math";
import type { BacktestMetrics } from "./domain";

const DEFAULT_PERIODS_PER_YEAR = 252;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type ComputeMetricsOptions = {
  /** 完整估值日期序列；长度通常是 dailyReturns.length + 1。 */
  dates?: string[];
  /** 调用方显式指定的年化周期数；优先级高于 dates 推导。 */
  periodsPerYear?: number;
};

function parseIsoDateMs(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Number.NaN;
  const [yearRaw, monthRaw, dayRaw] = date.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return Number.NaN;
  return Date.UTC(year, month - 1, day);
}

export function inferAnnualizationFactorFromDates(
  dates: string[] | undefined,
  periodCount: number,
  fallback = DEFAULT_PERIODS_PER_YEAR,
): number {
  const explicitFallback = Number.isFinite(fallback) && fallback > 0 ? fallback : DEFAULT_PERIODS_PER_YEAR;
  const count = Math.max(0, Math.trunc(Number(periodCount)));
  if (count <= 0 || !Array.isArray(dates) || dates.length < 2) return explicitFallback;

  const first = parseIsoDateMs(String(dates[0] || ""));
  const last = parseIsoDateMs(String(dates[dates.length - 1] || ""));
  if (!Number.isFinite(first) || !Number.isFinite(last) || last <= first) return explicitFallback;

  const calendarDays = (last - first) / MS_PER_DAY;
  const years = calendarDays / 365.25;
  if (!(years > 0)) return explicitFallback;

  const factor = count / years;
  return Number.isFinite(factor) && factor > 0 ? factor : explicitFallback;
}

export function computeAnnualizedReturn(
  totalReturn: number,
  periodCount: number,
  periodsPerYear: number,
): number {
  const base = 1 + totalReturn;
  const count = Math.max(0, Math.trunc(Number(periodCount)));
  const factor = Number.isFinite(periodsPerYear) && periodsPerYear > 0 ? periodsPerYear : DEFAULT_PERIODS_PER_YEAR;
  if (count <= 0) return 0;
  if (base <= 0) return -1;
  const annualized = Math.pow(base, factor / count) - 1;
  return Number.isFinite(annualized) ? annualized : 0;
}

export function computeMetrics(
  equity: number[],
  dailyReturns: number[],
  options: ComputeMetricsOptions = {},
): BacktestMetrics {
  if (equity.length !== dailyReturns.length) {
    throw new Error(
      `computeMetrics contract violation: equity.length (${equity.length}) must equal dailyReturns.length (${dailyReturns.length})`
    );
  }

  const totalReturn = equity.length ? equity[equity.length - 1] - 1 : 0;
  const annualizationFactor = Number.isFinite(options.periodsPerYear) && Number(options.periodsPerYear) > 0
    ? Number(options.periodsPerYear)
    : inferAnnualizationFactorFromDates(options.dates, dailyReturns.length);
  const annualizedReturn = computeAnnualizedReturn(totalReturn, dailyReturns.length, annualizationFactor);
  const mdd = maxDrawdown(equity);

  // Simple period Sharpe assuming risk-free 0, annualized by the caller's observed calendar.
  const mu = mean(dailyReturns);
  const sigma = stdev(dailyReturns);
  const sharpe = sigma === 0 ? 0 : (mu / sigma) * Math.sqrt(annualizationFactor);

  const wins = dailyReturns.filter((r: number) => r > 0).length;
  const winRate = dailyReturns.length ? wins / dailyReturns.length : 0;

  return {
    totalReturn,
    annualizedReturn,
    annualizationFactor,
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

type ScoreWeights = {
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

  // Defensive: treat non-finite score weights as defaults to avoid NaN scores
  // that would otherwise make ranking non-deterministic.
  const finiteOr = (v: unknown, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const wr = finiteOr(wReturn, 1);
  const ws = finiteOr(wSharpe, 1);
  const wd = finiteOr(wDrawdown, 1);
  const ww = finiteOr(wWinRate, 0.1);

  return wr * totalReturn + ws * sharpe - wd * maxDrawdown + ww * winRate;
}
