import { describe, expect, it } from "vitest";

import { buildAssetUniverseView, buildWorkbenchBootstrap } from "@/src/daa/__tests__/testDataFactories";
import type { RebalanceProposal } from "@/src/daa/modules/rebalance/rebalanceTypes";
import {
  attachMacroBudgetShadowSizing,
  buildCycleDraftFromBootstrap,
} from "@/src/daa/modules/workbench/workbenchModeling";

describe("buildCycleDraftFromBootstrap", () => {
  it("默认不会为未持仓 watchlist 目标直接生成 BUY 提案", () => {
    const bootstrap = buildWorkbenchBootstrap({
      account: {
        cash: 1000,
        investableCash: 1000,
        frozenCash: 0,
        totalEquity: 1000,
      },
      assetUniverse: [
        buildAssetUniverseView({
          assetKey: "US::AAPL",
          symbol: "AAPL",
          holdingQty: 0,
          actualWeightPct: 0,
          targetWeightPct: 20,
          targetWeightHint: 0.2,
          lastPrice: 100,
          fxRateToBase: 1,
          watchEnabled: true,
          autoEntryEnabled: false,
        }),
      ],
    });

    const draft = buildCycleDraftFromBootstrap({ bootstrap });

    expect(draft.proposals).toHaveLength(0);
    expect(draft.driftSnapshot).toHaveLength(1);
    expect(draft.maxAbsDriftPct).toBeCloseTo(20, 6);
  });

  it("显式允许时，Agent 目标权重路径可以为未持仓资产生成 BUY 提案", () => {
    const bootstrap = buildWorkbenchBootstrap({
      account: {
        cash: 1000,
        investableCash: 1000,
        frozenCash: 0,
        totalEquity: 1000,
      },
      assetUniverse: [
        buildAssetUniverseView({
          assetKey: "US::AAPL",
          symbol: "AAPL",
          holdingQty: 0,
          actualWeightPct: 0,
          targetWeightPct: 20,
          targetWeightHint: 0.2,
          lastPrice: 100,
          fxRateToBase: 1,
          watchEnabled: true,
        }),
      ],
    });

    const draft = buildCycleDraftFromBootstrap({ bootstrap, allowUnheldBuyTargets: true });

    expect(draft.proposals).toHaveLength(1);
    expect(draft.proposals[0]?.side).toBe("BUY");
    expect(draft.proposals[0]?.reason).toContain("观察列表目标入场");
  });

  it("BUY 提案会为滑点和手续费预留现金预算", () => {
    const bootstrap = buildWorkbenchBootstrap({
      account: {
        cash: 1000,
        investableCash: 1000,
        frozenCash: 0,
        totalEquity: 1000,
      },
      execution: {
        feeRateBps: 100,
        slippageBps: 100,
        minNotional: 0,
      },
      assetUniverse: [
        buildAssetUniverseView({
          assetKey: "US::MSFT",
          symbol: "MSFT",
          holdingQty: 0,
          actualWeightPct: 0,
          targetWeightPct: 100,
          targetWeightHint: 1,
          lastPrice: 100,
          fxRateToBase: 1,
          watchEnabled: true,
        }),
      ],
    });

    const draft = buildCycleDraftFromBootstrap({ bootstrap, allowUnheldBuyTargets: true });

    expect(draft.proposals).toHaveLength(1);
    expect(draft.proposals[0]?.suggestedNotional).toBeCloseTo(1000 / (1.01 * 1.01), 6);
    expect(draft.proposals[0]?.suggestedQty).toBeCloseTo((1000 / (1.01 * 1.01)) / 100, 6);
  });

  it("小于 minNotional 的 drift 提案会被直接过滤", () => {
    const bootstrap = buildWorkbenchBootstrap({
      account: {
        cash: 1000,
        investableCash: 1000,
        frozenCash: 0,
        totalEquity: 1000,
      },
      execution: {
        minNotional: 200,
      },
      assetUniverse: [
        buildAssetUniverseView({
          assetKey: "US::NVDA",
          symbol: "NVDA",
          holdingQty: 1,
          holdingPrice: 100,
          valuationBase: 100,
          actualWeightPct: 10,
          targetWeightPct: 5,
          targetWeightHint: 0.05,
          lastPrice: 100,
          fxRateToBase: 1,
          watchEnabled: true,
        }),
      ],
    });

    const draft = buildCycleDraftFromBootstrap({ bootstrap });

    expect(draft.maxAbsDriftPct).toBeCloseTo(5, 6);
    expect(draft.proposals).toHaveLength(0);
  });

  it("宏观资产预算只写入影子 sizing，不改真实 BUY/SELL 提案金额", () => {
    const bootstrap = buildWorkbenchBootstrap({
      marketContext: {
        generatedAt: "2026-03-01T00:00:00.000Z",
        regime: "risk_off",
        riskOffScorePct: 70,
        confidencePct: 80,
        buyScale: 0.8,
        highRiskBuyScale: 0.6,
        reasons: ["通胀和流动性压力偏高"],
        indicators: [],
        scopes: [],
        macroPolicy: null,
        assetBudgets: [{
          key: "us_equity",
          label: "美股成长 / 宽基",
          stance: "reduce",
          budgetScale: 0.65,
          pressurePct: 75,
          confidencePct: 82,
          reasons: ["PPI 和政策利率压力偏高，美股买入预算下调"],
          sourceScopes: ["us_equity"],
          sourceMacroDimensions: ["inflation", "rates"],
        }],
      },
      assetUniverse: [
        buildAssetUniverseView({
          assetKey: "US::AAPL",
          symbol: "AAPL",
          market: "US",
          assetClass: "EQUITY",
          instrumentType: "STOCK",
          marketGroup: "US_EQUITY",
          lastPrice: 100,
          fxRateToBase: 1,
        }),
      ],
    });
    const proposals: RebalanceProposal[] = [
      {
        assetKey: "US::AAPL",
        symbol: "AAPL",
        currency: "USD",
        fxRateToBase: 1,
        side: "BUY",
        suggestedQty: 2,
        suggestedNotional: 200,
        price: 100,
        reason: "测试买入",
        selected: true,
        hfContribution: null,
      },
      {
        assetKey: "US::AAPL",
        symbol: "AAPL",
        currency: "USD",
        fxRateToBase: 1,
        side: "SELL",
        suggestedQty: 1.2,
        suggestedNotional: 120,
        price: 100,
        reason: "测试卖出",
        selected: true,
        hfContribution: null,
      },
    ];

    const [buyProposal, sellProposal] = attachMacroBudgetShadowSizing({ proposals, bootstrap });

    expect(buyProposal?.suggestedNotional).toBe(200);
    expect(buyProposal?.suggestedQty).toBe(2);
    expect(buyProposal?.decisionContext?.assetBudgetKey).toBe("us_equity");
    expect(buyProposal?.decisionContext?.assetBudgetScale).toBeCloseTo(0.65, 6);
    expect(buyProposal?.decisionContext?.macroShadowNotional).toBeCloseTo(130, 6);
    expect(buyProposal?.decisionContext?.macroShadowQty).toBeCloseTo(1.3, 6);
    expect(buyProposal?.decisionContext?.macroShadowDeltaNotional).toBeCloseTo(-70, 6);

    expect(sellProposal?.suggestedNotional).toBe(120);
    expect(sellProposal?.suggestedQty).toBe(1.2);
    expect(sellProposal?.decisionContext?.assetBudgetScale).toBe(1);
    expect(sellProposal?.decisionContext?.macroShadowNotional).toBe(120);
    expect(sellProposal?.decisionContext?.macroShadowDeltaNotional).toBe(0);
  });
});
