import { describe, expect, it } from "vitest";

import { buildPreTradeRiskCheck } from "@/src/daa/modules/workbench/workbenchModeling";
import type { AssetUniverseView } from "@/src/daa/modules/workbench/workbenchTypes";
import type { RebalanceProposal } from "@/src/daa/modules/rebalance/rebalanceTypes";

function makeAsset(overrides: Partial<AssetUniverseView> = {}): AssetUniverseView {
  return {
    assetKey: "US::NVDA",
    symbol: "NVDA",
    market: "US",
    currency: "USD",
    assetClass: "EQUITY",
    region: "US",
    exchange: "NASDAQ",
    instrumentType: "STOCK",
    marketGroup: "US_EQUITY",
    yfinanceSymbol: "NVDA",
    holdingQty: 10,
    holdingPrice: 100,
    costBasis: 1000,
    costBasisInBase: 1000,
    unrealizedPnlBase: 0,
    unrealizedPnlPct: 0,
    holdingTags: [],
    watchEnabled: true,
    autoEntryEnabled: false,
    entryTargetWeightPct: null,
    entryCooldownDays: 0,
    lastEntryTriggeredAt: null,
    targetWeightHint: 0.1,
    watchTags: [],
    notes: null,
    priceAlertAbove: null,
    priceAlertBelow: null,
    lastPrice: 109.3,
    priceUpdatedAt: null,
    priceStatus: "fresh",
    priceSource: "test",
    priceAgeSec: null,
    valuationBase: 1093,
    fxRateToBase: 1,
    fxMissing: false,
    actualWeightPct: 10.93,
    targetWeightPct: 10,
    gapPct: -0.93,
    hfSignal: null,
    ...overrides,
  };
}

function makeProposal(overrides: Partial<RebalanceProposal> = {}): RebalanceProposal {
  return {
    assetKey: "US::NVDA",
    symbol: "NVDA",
    currency: "USD",
    fxRateToBase: 1,
    side: "SELL",
    suggestedQty: 0.4,
    suggestedNotional: 88,
    price: 220,
    reason: "回归目标权重",
    selected: true,
    hfContribution: null,
    ...overrides,
  };
}

function runRisk(proposals: RebalanceProposal[]) {
  return buildPreTradeRiskCheck({
    assetUniverse: [makeAsset()],
    proposals,
    totalEquity: 10000,
    availableCash: 1000,
    constraints: {
      maxPositionPct: 0.1,
      maxOrderPctOfNav: 0.5,
    },
    risk: {
      perAssetStopLossPct: 0.2,
      maxConcentrationPct: 0.9,
    },
  });
}

describe("buildPreTradeRiskCheck max_position", () => {
  it("卖出后仍略超上限但向目标权重收敛时降级为提醒", () => {
    const riskCheck = runRisk([makeProposal()]);
    const maxPosition = riskCheck.items.find((item) => item.rule === "max_position");

    expect(riskCheck.overallStatus).toBe("warn");
    expect(maxPosition?.status).toBe("warn");
    expect(maxPosition?.current).toBeCloseTo(10.05, 6);
    expect(maxPosition?.message).toContain("仍超过上限 10.00%");
    expect(maxPosition?.message).toContain("正向目标 10.00% 收敛");
  });

  it("买入导致交易后仓位超过上限时继续阻断", () => {
    const riskCheck = runRisk([makeProposal({
      side: "BUY",
      suggestedNotional: 100,
      suggestedQty: 0.45,
    })]);
    const maxPosition = riskCheck.items.find((item) => item.rule === "max_position");

    expect(riskCheck.overallStatus).toBe("block");
    expect(maxPosition?.status).toBe("block");
    expect(maxPosition?.current).toBeCloseTo(11.93, 6);
    expect(maxPosition?.message).toContain("超过上限 10.00%");
  });
});
