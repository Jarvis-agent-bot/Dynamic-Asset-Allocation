import type { DriftRebalanceBacktestResult } from "../backtestDriftRebalance";
import { toFinite } from "../utils/number";

export type BacktestBenchmarkCoverage = "full" | "partial" | "missing";

export type BacktestAttribution = {
  totalReturn: number;
  benchmark: { symbol: string; return: number | null; coverage: BacktestBenchmarkCoverage };
  activeReturn: number | null;
  perAsset: Array<{
    symbol: string;
    avgWeight: number;
    assetReturn: number;
    contributionToReturn: number;
    allocationEffect: number | null;
    selectionEffect: number | null;
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

function annualizedVolatility(dailyReturns: number[]): number {
  const values = dailyReturns.filter((x) => Number.isFinite(x));
  if (values.length <= 1) return 0;
  const mean = values.reduce((sum, x) => sum + x, 0) / values.length;
  const variance = values.reduce((sum, x) => sum + (x - mean) * (x - mean), 0) / (values.length - 1);
  return Math.sqrt(Math.max(0, variance)) * Math.sqrt(252);
}

function normalizeSeries(series: Array<{ date: string; close: number }>): Array<{ date: string; close: number }> {
  const out = new Map<string, number>();
  for (const bar of series || []) {
    const date = String(bar?.date || "").trim();
    const close = toFinite(bar?.close, Number.NaN);
    if (!date || !(close > 0)) continue;
    out.set(date, close);
  }
  return [...out.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, close]) => ({ date, close }));
}

function computeTotalReturnFromSeries(series: Array<{ date: string; close: number }>): number {
  const normalized = normalizeSeries(series);
  if (normalized.length < 2) return 0;
  const start = normalized[0].close;
  const end = normalized[normalized.length - 1].close;
  return end / start - 1;
}

function buildCloseMap(series: Array<{ date: string; close: number }>): Map<string, number> {
  const out = new Map<string, number>();
  for (const bar of normalizeSeries(series)) {
    out.set(bar.date, bar.close);
  }
  return out;
}

function computePeriodReturn(closeMap: Map<string, number>, startDate: string, endDate: string): number {
  const start = toFinite(closeMap.get(startDate), Number.NaN);
  const end = toFinite(closeMap.get(endDate), Number.NaN);
  if (!(start > 0) || !(end > 0)) return 0;
  const ret = end / start - 1;
  return Number.isFinite(ret) ? ret : 0;
}

function computeCoverageOnHorizon(input: {
  series: Array<{ date: string; close: number }>;
  startDate: string;
  endDate: string;
}): {
  coverage: BacktestBenchmarkCoverage;
  startClose: number | null;
  endClose: number | null;
} {
  const series = normalizeSeries(input.series);
  if (series.length < 2) {
    return {
      coverage: "missing",
      startClose: null,
      endClose: null,
    };
  }

  const firstDate = series[0]?.date || "";
  const lastDate = series[series.length - 1]?.date || "";
  if (!firstDate || !lastDate) {
    return {
      coverage: "missing",
      startClose: null,
      endClose: null,
    };
  }

  let startClose: number | null = null;
  let endClose: number | null = null;
  for (const bar of series) {
    if (bar.date <= input.startDate) {
      startClose = bar.close;
    }
    if (bar.date <= input.endDate) {
      endClose = bar.close;
    } else {
      break;
    }
  }

  const coverage: BacktestBenchmarkCoverage = firstDate <= input.startDate && lastDate >= input.endDate && startClose && endClose
    ? "full"
    : "partial";

  return {
    coverage,
    startClose: startClose && startClose > 0 ? startClose : null,
    endClose: endClose && endClose > 0 ? endClose : null,
  };
}

function listTrackedSymbols(input: {
  backtest: DriftRebalanceBacktestResult;
  seriesBySymbol: Record<string, Array<{ date: string; close: number }>>;
}): string[] {
  const symbols = new Set<string>(Object.keys(input.seriesBySymbol || {}));
  for (const point of input.backtest.portfolioByDate || []) {
    for (const symbol of Object.keys(point.weightsBySymbolPct01 || {})) {
      if (symbol) symbols.add(symbol);
    }
  }
  return [...symbols].sort();
}

function computeRealizedStatsBySymbol(input: {
  backtest: DriftRebalanceBacktestResult;
  seriesBySymbol: Record<string, Array<{ date: string; close: number }>>;
}): Record<string, { avgWeight: number; contributionToReturn: number; assetReturn: number }> {
  const symbols = listTrackedSymbols(input);
  const closeMapsBySymbol = Object.fromEntries(
    symbols.map((symbol) => [symbol, buildCloseMap(input.seriesBySymbol[symbol] || [])]),
  ) as Record<string, Map<string, number>>;

  const periods = Math.max(0, Math.min(input.backtest.dailyReturns.length, Math.max(0, input.backtest.portfolioByDate.length - 1)));
  const avgWeightSums = Object.fromEntries(symbols.map((symbol) => [symbol, 0])) as Record<string, number>;
  const contributionSums = Object.fromEntries(symbols.map((symbol) => [symbol, 0])) as Record<string, number>;

  for (let i = 0; i < periods; i += 1) {
    const startPoint = input.backtest.portfolioByDate[i];
    const endPoint = input.backtest.portfolioByDate[i + 1];
    if (!startPoint || !endPoint) continue;

    for (const symbol of symbols) {
      const weight = Math.max(0, toFinite(startPoint.weightsBySymbolPct01?.[symbol]));
      avgWeightSums[symbol] += weight;
      if (weight <= 0) continue;

      const periodReturn = computePeriodReturn(closeMapsBySymbol[symbol], startPoint.date, endPoint.date);
      contributionSums[symbol] += weight * periodReturn;
    }
  }

  const denominator = periods > 0 ? periods : 1;
  return Object.fromEntries(
    symbols.map((symbol) => [
      symbol,
      {
        avgWeight: avgWeightSums[symbol] / denominator,
        contributionToReturn: contributionSums[symbol],
        assetReturn: computeTotalReturnFromSeries(input.seriesBySymbol[symbol] || []),
      },
    ]),
  );
}

export function computeBacktestAttribution(input: {
  backtest: DriftRebalanceBacktestResult;
  seriesBySymbol: Record<string, Array<{ date: string; close: number }>>;
  benchmarkSymbol?: string;
  benchmarkSeries?: Array<{ date: string; close: number }>;
}): BacktestAttribution {
  const totalReturn = toFinite(input.backtest.metrics.totalReturn);

  const benchmarkSymbol = String(input.benchmarkSymbol || "SPY").trim().toUpperCase();
  const benchmarkSeries = input.benchmarkSeries?.length ? input.benchmarkSeries : (input.seriesBySymbol[benchmarkSymbol] || []);
  const horizonStart = String(input.backtest.portfolioByDate[0]?.date || "").trim();
  const horizonEnd = String(input.backtest.portfolioByDate[input.backtest.portfolioByDate.length - 1]?.date || "").trim();
  const benchmarkCoverage = horizonStart && horizonEnd
    ? computeCoverageOnHorizon({
        series: benchmarkSeries,
        startDate: horizonStart,
        endDate: horizonEnd,
      })
    : {
        coverage: "missing" as const,
        startClose: null,
        endClose: null,
      };
  const benchmarkReturn = benchmarkCoverage.coverage === "full"
    && benchmarkCoverage.startClose
    && benchmarkCoverage.endClose
    ? benchmarkCoverage.endClose / benchmarkCoverage.startClose - 1
    : null;

  const realizedStatsBySymbol = computeRealizedStatsBySymbol({
    backtest: input.backtest,
    seriesBySymbol: input.seriesBySymbol,
  });

  const perAsset = Object.entries(realizedStatsBySymbol)
    .map(([symbol, stats]) => {
      const allocationEffect = benchmarkReturn === null ? null : stats.avgWeight * benchmarkReturn;
      const selectionEffect = allocationEffect === null ? null : stats.contributionToReturn - allocationEffect;

      return {
        symbol,
        avgWeight: stats.avgWeight,
        assetReturn: stats.assetReturn,
        contributionToReturn: stats.contributionToReturn,
        allocationEffect,
        selectionEffect,
      };
    })
    .sort((a, b) => Math.abs(b.contributionToReturn) - Math.abs(a.contributionToReturn) || a.symbol.localeCompare(b.symbol));

  const returnSeries = input.backtest.dailyReturns.length > 0 ? input.backtest.dailyReturns : [0];
  const winRate = returnSeries.filter((x) => x > 0).length / returnSeries.length;
  const volatility = annualizedVolatility(input.backtest.dailyReturns);
  const maxDrawdown = toFinite(input.backtest.metrics.maxDrawdown);
  const calmar = maxDrawdown > 1e-9 ? totalReturn / maxDrawdown : 0;

  const rebalanceEvents = input.backtest.events
    .filter((event) => event.kind === "rebalance")
    .map((event) => ({
      date: event.date,
      turnover: event.turnoverNotional,
      driftBefore: Math.max(0, toFinite(event.trigger.stats?.maxAbsDriftPct)),
    }));

  return {
    totalReturn,
    benchmark: {
      symbol: benchmarkSymbol,
      return: benchmarkReturn,
      coverage: benchmarkCoverage.coverage,
    },
    activeReturn: benchmarkReturn === null ? null : totalReturn - benchmarkReturn,
    perAsset,
    rebalanceEvents,
    metrics: {
      sharpe: toFinite(input.backtest.metrics.sharpe),
      maxDrawdown,
      calmar,
      volatility,
      winRate,
    },
  };
}
