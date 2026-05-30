import { describe, expect, it } from "vitest";

import { buildStrategyLabChartData, strategyLabBenchmarkDataKey } from "../strategyLabChartData";
import type { StrategyLabRunResult } from "@/src/daa/modules/strategyLab/strategyLabTypes";

function buildResult(): StrategyLabRunResult {
  return {
    runId: "run-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    baseCurrency: "USD",
    params: {
      assets: ["US::SPY", "US::QQQ"],
      strategies: ["equalWeight", "momentum"],
      startDate: "2025-12-31",
      endDate: "2026-01-02",
      rebalanceFrequency: "monthly",
      initialCapital: 100000,
      baseCurrency: "USD",
    },
    strategyResults: [
      {
        strategy: "equalWeight",
        equityCurve: [
          { date: "2025-12-31", equity: 100000 },
          { date: "2026-01-01", equity: 101250 },
        ],
        metrics: { totalReturn: 0.0125, annualizedReturn: 0.1, annualizationFactor: 252, maxDrawdown: 0.02, sharpe: 1.2, winRate: 0.5 },
        attribution: {
          totalReturn: 0.0125,
          benchmark: { symbol: "SPY", return: 0.01, coverage: "full" },
          activeReturn: 0.0025,
          perAsset: [],
          rebalanceEvents: [],
          metrics: { sharpe: 1.2, maxDrawdown: 0.02, annualizedReturn: 0.1, annualizationFactor: 252, calmar: 5, volatility: 0.12, winRate: 0.5 },
        },
        targetWeights: { "US::SPY": 0.5, "US::QQQ": 0.5 },
        warnings: [],
      },
      {
        strategy: "momentum",
        equityCurve: [
          { date: "2025-12-31", equity: 100000 },
          { date: "2026-01-01", equity: 102500 },
        ],
        metrics: { totalReturn: 0.025, annualizedReturn: 0.2, annualizationFactor: 252, maxDrawdown: 0.03, sharpe: 1.4, winRate: 0.5 },
        attribution: {
          totalReturn: 0.025,
          benchmark: { symbol: "SPY", return: 0.01, coverage: "full" },
          activeReturn: 0.015,
          perAsset: [],
          rebalanceEvents: [],
          metrics: { sharpe: 1.4, maxDrawdown: 0.03, annualizedReturn: 0.2, annualizationFactor: 252, calmar: 6.66, volatility: 0.15, winRate: 0.5 },
        },
        targetWeights: { "US::QQQ": 1 },
        warnings: [],
      },
    ],
    benchmarkResults: [
      {
        symbol: "QQQ",
        label: "纳斯达克100",
        equityCurve: [
          { date: "2025-12-31", equity: 100000 },
          { date: "2026-01-01", equity: 101000 },
        ],
        coverage: "full",
        return: 0.01,
      },
    ],
    primaryStrategy: "equalWeight",
    equityCurve: [
      { date: "2025-12-31", equity: 100000 },
      { date: "2026-01-01", equity: 101250 },
    ],
    metrics: { totalReturn: 0.0125, annualizedReturn: 0.1, annualizationFactor: 252, maxDrawdown: 0.02, sharpe: 1.2, winRate: 0.5 },
    attribution: {
      totalReturn: 0.0125,
      benchmark: { symbol: "SPY", return: 0.01, coverage: "full" },
      activeReturn: 0.0025,
      perAsset: [],
      rebalanceEvents: [],
      metrics: { sharpe: 1.2, maxDrawdown: 0.02, annualizedReturn: 0.1, annualizationFactor: 252, calmar: 5, volatility: 0.12, winRate: 0.5 },
    },
    targetWeights: { "US::SPY": 0.5, "US::QQQ": 0.5 },
    warnings: [],
  };
}

describe("strategyLabChartData", () => {
  it("保留完整日期键，并合并策略与基准曲线", () => {
    const result = buildResult();

    const rows = buildStrategyLabChartData({
      result,
      strategyResults: result.strategyResults,
      benchmarkResults: result.benchmarkResults,
    });

    expect(rows).toEqual([
      {
        date: "2025-12-31",
        equalWeight: 100000,
        momentum: 100000,
        [strategyLabBenchmarkDataKey("QQQ")]: 100000,
      },
      {
        date: "2026-01-01",
        equalWeight: 101250,
        momentum: 102500,
        [strategyLabBenchmarkDataKey("QQQ")]: 101000,
      },
    ]);
  });
});
