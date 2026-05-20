import { describe, expect, it } from "vitest";

import { computeBacktestAttribution } from "../backtest/attribution";
import type { DriftRebalanceBacktestResult } from "../backtestDriftRebalance";

function buildBacktestResult(overrides: Partial<DriftRebalanceBacktestResult>): DriftRebalanceBacktestResult {
  return {
    schemaVersion: 1,
    dates: ["2026-01-02"],
    equity: [1],
    dailyReturns: [0],
    metrics: {
      totalReturn: 0,
      annualizedReturn: 0,
      annualizationFactor: 252,
      maxDrawdown: 0,
      sharpe: 0,
      winRate: 0,
    },
    summary: {
      initialEquityAbs: 100,
      finalEquityAbs: 100,
      rebalanceCount: 0,
      turnoverNotional: 0,
      totalFeesAbs: 0,
    },
    events: [],
    warnings: [],
    portfolioByDate: [
      {
        date: "2026-01-01",
        equityAbs: 100,
        cashAbs: 100,
        cashPct01: 1,
        weightsBySymbolPct01: {},
      },
      {
        date: "2026-01-02",
        equityAbs: 100,
        cashAbs: 100,
        cashPct01: 1,
        weightsBySymbolPct01: {},
      },
    ],
    ...overrides,
  };
}

describe("computeBacktestAttribution", () => {
  it("uses realized portfolio weights instead of average target weights", () => {
    const backtest = buildBacktestResult({
      dates: ["2026-01-02", "2026-01-03"],
      dailyReturns: [0, 0.1],
      equity: [1, 1.1],
      metrics: {
        totalReturn: 0.1,
        annualizedReturn: 0.1,
        annualizationFactor: 252,
        maxDrawdown: 0,
        sharpe: 1,
        winRate: 0.5,
      },
      portfolioByDate: [
        {
          date: "2026-01-01",
          equityAbs: 100,
          cashAbs: 100,
          cashPct01: 1,
          weightsBySymbolPct01: {},
        },
        {
          date: "2026-01-02",
          equityAbs: 100,
          cashAbs: 0,
          cashPct01: 0,
          weightsBySymbolPct01: { AAA: 1 },
        },
        {
          date: "2026-01-03",
          equityAbs: 110,
          cashAbs: 0,
          cashPct01: 0,
          weightsBySymbolPct01: { AAA: 1 },
        },
      ],
    });

    const attribution = computeBacktestAttribution({
      backtest,
      seriesBySymbol: {
        AAA: [
          { date: "2026-01-01", close: 100 },
          { date: "2026-01-02", close: 100 },
          { date: "2026-01-03", close: 110 },
        ],
        BBB: [
          { date: "2026-01-01", close: 100 },
          { date: "2026-01-02", close: 100 },
          { date: "2026-01-03", close: 100 },
        ],
      },
      benchmarkSymbol: "SPY",
      benchmarkSeries: [
        { date: "2026-01-01", close: 100 },
        { date: "2026-01-02", close: 100 },
        { date: "2026-01-03", close: 100 },
      ],
    });

    const aaa = attribution.perAsset.find((row) => row.symbol === "AAA");
    expect(aaa?.avgWeight).toBeCloseTo(0.5, 8);
    expect(aaa?.assetReturn).toBeCloseTo(0.1, 8);
    expect(aaa?.contributionToReturn).toBeCloseTo(0.1, 8);
  });

  it("computes selection effect from realized contribution minus benchmark allocation baseline", () => {
    const backtest = buildBacktestResult({
      dates: ["2026-01-02"],
      dailyReturns: [0.05],
      equity: [1.05],
      metrics: {
        totalReturn: 0.05,
        annualizedReturn: 0.05,
        annualizationFactor: 252,
        maxDrawdown: 0,
        sharpe: 1,
        winRate: 1,
      },
      portfolioByDate: [
        {
          date: "2026-01-01",
          equityAbs: 100,
          cashAbs: 50,
          cashPct01: 0.5,
          weightsBySymbolPct01: { AAA: 0.5 },
        },
        {
          date: "2026-01-02",
          equityAbs: 105,
          cashAbs: 50,
          cashPct01: 0.4761904762,
          weightsBySymbolPct01: { AAA: 0.5238095238 },
        },
      ],
    });

    const attribution = computeBacktestAttribution({
      backtest,
      seriesBySymbol: {
        AAA: [
          { date: "2026-01-01", close: 100 },
          { date: "2026-01-02", close: 110 },
        ],
      },
      benchmarkSymbol: "SPY",
      benchmarkSeries: [
        { date: "2026-01-01", close: 100 },
        { date: "2026-01-02", close: 104 },
      ],
    });

    const aaa = attribution.perAsset.find((row) => row.symbol === "AAA");
    expect(aaa?.contributionToReturn).toBeCloseTo(0.05, 8);
    expect(aaa?.allocationEffect).toBeCloseTo(0.02, 8);
    expect(aaa?.selectionEffect).toBeCloseTo(0.03, 8);
    expect(attribution.activeReturn).toBeCloseTo(0.01, 8);
  });

  it("再平衡换手率按组合净值归一化，同时保留名义金额", () => {
    const backtest = buildBacktestResult({
      events: [
        {
          date: "2026-01-02",
          kind: "rebalance",
          trigger: {
            shouldRebalance: true,
            reasons: ["trigger: ok"],
            stats: {
              equity: 100,
              driftThresholdPct: 0,
              minOrderNotional: 0,
              minRebalanceIntervalSeconds: 0,
              maxAbsDriftPct: 0.2,
              maxAbsDriftSymbol: "AAA",
              orderCount: 1,
              eligibleOrderCount: 1,
              eligibleNotionalSum: 25,
            },
          },
          orders: [],
          executed: [],
          turnoverNotional: 25,
          feeNotional: 0,
          before: {
            equityAbs: 100,
            cashAbs: 0,
            cashPct01: 0,
            weightsBySymbolPct01: { AAA: 1 },
          },
          after: {
            equityAbs: 100,
            cashAbs: 25,
            cashPct01: 0.25,
            weightsBySymbolPct01: { AAA: 0.75 },
          },
        },
      ],
    });

    const attribution = computeBacktestAttribution({
      backtest,
      seriesBySymbol: {
        AAA: [
          { date: "2026-01-01", close: 100 },
          { date: "2026-01-02", close: 100 },
        ],
      },
    });

    expect(attribution.rebalanceEvents[0].turnoverPct).toBeCloseTo(0.25, 8);
    expect(attribution.rebalanceEvents[0].turnover).toBeCloseTo(0.25, 8);
    expect(attribution.rebalanceEvents[0].turnoverNotional).toBeCloseTo(25, 8);
    expect(attribution.rebalanceEvents[0].driftBefore).toBeCloseTo(0.2, 8);
  });

  it("hides active benchmark comparison when benchmark does not fully cover the backtest horizon", () => {
    const backtest = buildBacktestResult({
      dates: ["2026-01-02", "2026-01-03"],
      dailyReturns: [0.02, 0.03],
      equity: [1.02, 1.0506],
      metrics: {
        totalReturn: 0.0506,
        annualizedReturn: 0.0506,
        annualizationFactor: 252,
        maxDrawdown: 0,
        sharpe: 1,
        winRate: 1,
      },
      portfolioByDate: [
        {
          date: "2026-01-01",
          equityAbs: 100,
          cashAbs: 0,
          cashPct01: 0,
          weightsBySymbolPct01: { AAA: 1 },
        },
        {
          date: "2026-01-02",
          equityAbs: 102,
          cashAbs: 0,
          cashPct01: 0,
          weightsBySymbolPct01: { AAA: 1 },
        },
        {
          date: "2026-01-03",
          equityAbs: 105.06,
          cashAbs: 0,
          cashPct01: 0,
          weightsBySymbolPct01: { AAA: 1 },
        },
      ],
    });

    const attribution = computeBacktestAttribution({
      backtest,
      seriesBySymbol: {
        AAA: [
          { date: "2026-01-01", close: 100 },
          { date: "2026-01-02", close: 102 },
          { date: "2026-01-03", close: 105.06 },
        ],
      },
      benchmarkSymbol: "SPY",
      benchmarkSeries: [
        { date: "2026-01-02", close: 100 },
        { date: "2026-01-03", close: 101 },
      ],
    });

    const aaa = attribution.perAsset.find((row) => row.symbol === "AAA");
    expect(attribution.benchmark.coverage).toBe("partial");
    expect(attribution.benchmark.return).toBeNull();
    expect(attribution.activeReturn).toBeNull();
    expect(aaa?.allocationEffect).toBeNull();
    expect(aaa?.selectionEffect).toBeNull();
  });

  it("uses annualized return instead of period return for Calmar", () => {
    const backtest = buildBacktestResult({
      dates: ["2026-01-02", "2026-01-03"],
      dailyReturns: [0.02, -0.01],
      equity: [1.02, 1.0098],
      metrics: {
        totalReturn: 0.1,
        annualizedReturn: 0.24,
        annualizationFactor: 365.25,
        maxDrawdown: 0.12,
        sharpe: 1,
        winRate: 0.5,
      },
    });

    const attribution = computeBacktestAttribution({
      backtest,
      seriesBySymbol: {
        AAA: [
          { date: "2026-01-01", close: 100 },
          { date: "2026-01-02", close: 102 },
          { date: "2026-01-03", close: 101 },
        ],
      },
    });

    expect(attribution.metrics.annualizedReturn).toBeCloseTo(0.24, 8);
    expect(attribution.metrics.calmar).toBeCloseTo(2, 8);
  });
});
