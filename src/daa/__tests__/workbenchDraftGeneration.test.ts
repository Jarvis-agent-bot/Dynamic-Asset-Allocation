import { describe, expect, it } from "vitest";

import { buildAssetUniverseView, buildWorkbenchBootstrap } from "@/src/daa/__tests__/testDataFactories";
import { buildCycleDraftFromBootstrap } from "@/src/daa/modules/workbench/workbenchModeling";

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
    expect(draft.proposals[0]?.reason).toContain("观察列表目标建仓");
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
});
