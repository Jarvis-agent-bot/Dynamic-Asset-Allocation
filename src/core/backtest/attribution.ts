import type { DriftRebalanceBacktestResult } from "../backtestDriftRebalance";

export type BacktestAttribution = {
  totalReturn: number;
  benchmark: { symbol: string; return: number };
  activeReturn: number;
  perAsset: Array<{
    symbol: string;
    avgWeight: number;
    assetReturn: number;
    contributionToReturn: number;
    allocationEffect: number;
    selectionEffect: number;
  }>;
  rebalanceEvents: Array<{
    date: string;
    turnover: number;
    driftBefore: number;
  }>;
  metrics: {
    sharpe: number;
    maxDrawdown: number;
    calmar: number;
    volatility: number;
    winRate: number;
  };
};

function toNum(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function annualizedVolatility(dailyReturns: number[]): number {
  const values = dailyReturns.filter((x) => Number.isFinite(x));
  if (values.length <= 1) return 0;
  const mean = values.reduce((sum, x) => sum + x, 0) / values.length;
  const variance = values.reduce((sum, x) => sum + (x - mean) * (x - mean), 0) / (values.length - 1);
  return Math.sqrt(Math.max(0, variance)) * Math.sqrt(252);
}

export function computeBacktestAttribution(input: {
  backtest: DriftRebalanceBacktestResult;
  targetWeights: Record<string, number>;
  seriesBySymbol: Record<string, Array<{ date: string; close: number }>>;
  benchmarkSymbol?: string;
}): BacktestAttribution {
  const totalReturn = toNum(input.backtest.metrics.totalReturn);

  const benchmarkSymbol = String(input.benchmarkSymbol || "SPY").trim().toUpperCase();
  const benchmarkSeries = input.seriesBySymbol[benchmarkSymbol] || [];
  const benchmarkReturn = benchmarkSeries.length >= 2
    ? (toNum(benchmarkSeries[benchmarkSeries.length - 1]?.close) / Math.max(1e-9, toNum(benchmarkSeries[0]?.close))) - 1
    : 0;

  const perAsset = Object.entries(input.seriesBySymbol)
    .map(([symbol, series]) => {
      const assetReturn = series.length >= 2
        ? (toNum(series[series.length - 1]?.close) / Math.max(1e-9, toNum(series[0]?.close))) - 1
        : 0;
      const avgWeight = Math.max(0, toNum(input.targetWeights[symbol]));
      const contributionToReturn = avgWeight * assetReturn;
      const allocationEffect = avgWeight * (assetReturn - benchmarkReturn);
      const selectionEffect = contributionToReturn - allocationEffect;

      return {
        symbol,
        avgWeight,
        assetReturn,
        contributionToReturn,
        allocationEffect,
        selectionEffect,
      };
    })
    .sort((a, b) => Math.abs(b.contributionToReturn) - Math.abs(a.contributionToReturn) || a.symbol.localeCompare(b.symbol));

  const months = input.backtest.dailyReturns.length > 0 ? input.backtest.dailyReturns : [0];
  const winRate = months.filter((x) => x > 0).length / months.length;
  const volatility = annualizedVolatility(input.backtest.dailyReturns);
  const maxDrawdown = toNum(input.backtest.metrics.maxDrawdown);
  const calmar = maxDrawdown > 1e-9 ? totalReturn / maxDrawdown : 0;

  const rebalanceEvents = input.backtest.events
    .filter((event) => event.kind === "rebalance")
    .map((event) => ({
      date: event.date,
      turnover: event.turnoverNotional,
      driftBefore: Math.max(0, toNum(event.trigger.stats?.maxAbsDriftPct)),
    }));

  return {
    totalReturn,
    benchmark: {
      symbol: benchmarkSymbol,
      return: benchmarkReturn,
    },
    activeReturn: totalReturn - benchmarkReturn,
    perAsset,
    rebalanceEvents,
    metrics: {
      sharpe: toNum(input.backtest.metrics.sharpe),
      maxDrawdown,
      calmar,
      volatility,
      winRate,
    },
  };
}
