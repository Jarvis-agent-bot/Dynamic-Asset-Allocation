import { describe, expect, it } from "vitest";

import type { StrategyLabRunResult } from "@/src/daa/modules/strategyLab/strategyLabTypes";
import { resolveStrategyLabApplyMeta } from "../strategyLabApplyMeta";

function buildResult(overrides: Partial<StrategyLabRunResult> = {}): StrategyLabRunResult {
  return {
    runId: "run-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    baseCurrency: "USD",
    params: {
      assets: ["US::SPY", "US::QQQ"],
      strategies: ["equalWeight"],
      startDate: "2025-12-31",
      endDate: "2026-01-02",
      rebalanceFrequency: "monthly",
      initialCapital: 100000,
      baseCurrency: "USD",
    },
    strategyResults: [
      {
        strategy: "equalWeight",
        equityCurve: [],
        metrics: { totalReturn: 0, annualizedReturn: 0, annualizationFactor: 252, maxDrawdown: 0, sharpe: 0, winRate: 0 },
        attribution: {
          totalReturn: 0,
          benchmark: { symbol: "SPY", return: null, coverage: "missing" },
          activeReturn: null,
          perAsset: [],
          rebalanceEvents: [],
          metrics: { sharpe: 0, maxDrawdown: 0, annualizedReturn: 0, annualizationFactor: 252, calmar: 0, volatility: 0, winRate: 0 },
        },
        targetWeights: { "US::SPY": 1 },
        warnings: [],
      },
    ],
    benchmarkResults: [],
    primaryStrategy: "equalWeight",
    equityCurve: [],
    metrics: { totalReturn: 0, annualizedReturn: 0, annualizationFactor: 252, maxDrawdown: 0, sharpe: 0, winRate: 0 },
    attribution: {
      totalReturn: 0,
      benchmark: { symbol: "SPY", return: null, coverage: "missing" },
      activeReturn: null,
      perAsset: [],
      rebalanceEvents: [],
      metrics: { sharpe: 0, maxDrawdown: 0, annualizedReturn: 0, annualizationFactor: 252, calmar: 0, volatility: 0, winRate: 0 },
    },
    targetWeights: { "US::SPY": 1 },
    warnings: [],
    ...overrides,
  };
}

describe("resolveStrategyLabApplyMeta", () => {
  it("单策略且有目标权重时允许应用", () => {
    const meta = resolveStrategyLabApplyMeta(buildResult(), false);

    expect(meta).toMatchObject({
      canApply: true,
      hasTargetWeights: true,
      isSingleStrategy: true,
      strategyKey: "equalWeight",
    });
  });

  it("多策略结果禁止直接应用权重", () => {
    const result = buildResult({
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
        buildResult().strategyResults[0],
        {
          ...buildResult().strategyResults[0],
          strategy: "momentum",
          targetWeights: { "US::QQQ": 1 },
        },
      ],
      primaryStrategy: "equalWeight",
    });

    const meta = resolveStrategyLabApplyMeta(result, false);

    expect(meta).toMatchObject({
      canApply: false,
      hasTargetWeights: true,
      isSingleStrategy: false,
      strategyKey: "equalWeight",
    });
  });

  it("没有目标权重时不允许应用", () => {
    const meta = resolveStrategyLabApplyMeta(buildResult({ targetWeights: {} }), false);

    expect(meta.canApply).toBe(false);
    expect(meta.hasTargetWeights).toBe(false);
  });
});
