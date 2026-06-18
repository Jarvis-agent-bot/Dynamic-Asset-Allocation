import { describe, expect, it } from "vitest";

import { buildManualPreTradeRiskCheck, buildPreTradeRiskCheck } from "@/src/daa/modules/workbench/workbenchModeling";
import type { AssetUniverseView } from "@/src/daa/modules/workbench/workbenchTypes";
import type { RebalanceProposal } from "@/src/daa/modules/rebalance/rebalanceTypes";

function makeAsset(overrides: Partial<AssetUniverseView> = {}): AssetUniverseView {
  return {
    assetKey: "US::NVDA",
    symbol: "NVDA",
    name: "NVIDIA Corporation",
    displayNameZh: "英伟达",
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

  it("执行前止损检查使用基准货币 PnL，而不是本币价格涨跌", () => {
    const asset = makeAsset({
      assetKey: "HK::0700",
      symbol: "0700",
      market: "HK",
      currency: "HKD",
      holdingPrice: 100,
      lastPrice: 110,
      costBasis: null,
      costBasisInBase: 1000,
      valuationBase: 700,
      unrealizedPnlPct: -30,
      fxRateToBase: 0.7,
    });

    const riskCheck = buildPreTradeRiskCheck({
      assetUniverse: [asset],
      proposals: [makeProposal({
        assetKey: "HK::0700",
        symbol: "0700",
        currency: "HKD",
        fxRateToBase: 0.7,
      })],
      totalEquity: 10000,
      availableCash: 1000,
      constraints: {
        maxPositionPct: 0.5,
        maxOrderPctOfNav: 0.5,
      },
      risk: {
        perAssetStopLossPct: 0.2,
        maxConcentrationPct: 0.9,
      },
    });

    const stopLoss = riskCheck.items.find((item) => item.rule === "stop_loss_breach");
    expect(stopLoss).toMatchObject({
      status: "warn",
      current: 30,
      limit: 20,
    });
  });

  it("手动预览止损检查也使用基准货币 PnL", () => {
    const asset = makeAsset({
      assetKey: "HK::0700",
      symbol: "0700",
      market: "HK",
      currency: "HKD",
      holdingPrice: 100,
      lastPrice: 110,
      costBasis: null,
      costBasisInBase: 1000,
      valuationBase: 700,
      unrealizedPnlPct: -30,
      fxRateToBase: 0.7,
    });

    const riskCheck = buildManualPreTradeRiskCheck({
      assetUniverse: [asset],
      proposal: makeProposal({
        assetKey: "HK::0700",
        symbol: "0700",
        currency: "HKD",
        fxRateToBase: 0.7,
      }),
      totalEquity: 10000,
      constraints: {
        maxPositionPct: 0.5,
        maxOrderPctOfNav: 0.5,
      },
      risk: {
        perAssetStopLossPct: 0.2,
        maxConcentrationPct: 0.9,
      },
    });

    const stopLoss = riskCheck.items.find((item) => item.rule === "stop_loss_breach");
    expect(stopLoss).toMatchObject({
      status: "warn",
      current: 30,
      limit: 20,
    });
  });

  it("执行前止损检查等于阈值时状态和文案一致触发", () => {
    const riskCheck = buildPreTradeRiskCheck({
      assetUniverse: [makeAsset({
        unrealizedPnlPct: -20,
        valuationBase: 800,
        costBasisInBase: 1000,
      })],
      proposals: [makeProposal()],
      totalEquity: 10000,
      availableCash: 1000,
      constraints: {
        maxPositionPct: 0.5,
        maxOrderPctOfNav: 0.5,
      },
      risk: {
        perAssetStopLossPct: 0.2,
        maxConcentrationPct: 0.9,
      },
    });

    const stopLoss = riskCheck.items.find((item) => item.rule === "stop_loss_breach");
    expect(stopLoss?.status).toBe("warn");
    expect(stopLoss?.message).toContain("达到止损线 20.00%");
  });
});
