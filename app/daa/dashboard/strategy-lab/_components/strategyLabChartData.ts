import type {
  StrategyLabBenchmarkResult,
  StrategyLabRunResult,
  StrategyLabStrategyResult,
} from "@/src/daa/modules/strategyLab/strategyLabTypes";

export function strategyLabBenchmarkDataKey(symbol: string): string {
  return `benchmark:${String(symbol || "").trim().toUpperCase()}`;
}

export function buildStrategyLabChartData(input: {
  result: StrategyLabRunResult | null;
  strategyResults: StrategyLabStrategyResult[];
  benchmarkResults?: StrategyLabBenchmarkResult[];
}): Array<Record<string, string | number>> {
  const { result, strategyResults, benchmarkResults = [] } = input;
  if (!result || strategyResults.length === 0) return [];

  const rows = new Map<string, Record<string, string | number>>();
  for (const strategyResult of strategyResults) {
    for (const point of strategyResult.equityCurve || []) {
      const row = rows.get(point.date) || { date: point.date };
      row[strategyResult.strategy] = +point.equity.toFixed(2);
      rows.set(point.date, row);
    }
  }

  for (const benchmarkResult of benchmarkResults) {
    const dataKey = strategyLabBenchmarkDataKey(benchmarkResult.symbol);
    for (const point of benchmarkResult.equityCurve || []) {
      const row = rows.get(point.date) || { date: point.date };
      row[dataKey] = +point.equity.toFixed(2);
      rows.set(point.date, row);
    }
  }

  return [...rows.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, row]) => row);
}
