import { describe, expect, it } from "vitest";

import { estimateProposalExecutionCost, summarizeProposalExecutionCosts } from "@/src/daa/modules/workbench/executionCost";

describe("workbench execution cost model", () => {
  it("BUY 会把滑点和手续费都计入现金流出", () => {
    const estimate = estimateProposalExecutionCost({
      proposal: {
        assetKey: "US::AAPL",
        symbol: "AAPL",
        side: "BUY",
        suggestedNotional: 100,
      },
      feeRateBps: 100,
      slippageBps: 50,
    });

    expect(estimate.grossNotionalBase).toBeCloseTo(100.5, 6);
    expect(estimate.feeBase).toBeCloseTo(1.005, 6);
    expect(estimate.assetValueDeltaBase).toBeCloseTo(100.5, 6);
    expect(estimate.netCashImpactBase).toBeCloseTo(-101.505, 6);
  });

  it("SELL 会把滑点和手续费都计入现金流入", () => {
    const estimate = estimateProposalExecutionCost({
      proposal: {
        assetKey: "US::NVDA",
        symbol: "NVDA",
        side: "SELL",
        suggestedNotional: 200,
      },
      feeRateBps: 100,
      slippageBps: 50,
    });

    expect(estimate.grossNotionalBase).toBeCloseTo(199, 6);
    expect(estimate.feeBase).toBeCloseTo(1.99, 6);
    expect(estimate.assetValueDeltaBase).toBeCloseTo(-199, 6);
    expect(estimate.netCashImpactBase).toBeCloseTo(197.01, 6);
  });

  it("汇总时会按买卖方向正确聚合净现金影响", () => {
    const summary = summarizeProposalExecutionCosts({
      proposals: [
        {
          assetKey: "US::AAPL",
          symbol: "AAPL",
          side: "BUY",
          suggestedNotional: 100,
        },
        {
          assetKey: "US::NVDA",
          symbol: "NVDA",
          side: "SELL",
          suggestedNotional: 200,
        },
      ],
      feeRateBps: 100,
      slippageBps: 50,
    });

    expect(summary.buyNotional).toBeCloseTo(100.5, 6);
    expect(summary.sellNotional).toBeCloseTo(199, 6);
    expect(summary.estimatedFees).toBeCloseTo(2.995, 6);
    expect(summary.netCashImpact).toBeCloseTo(95.505, 6);
  });
});
