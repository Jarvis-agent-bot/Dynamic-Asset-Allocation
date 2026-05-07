import { describe, expect, it } from "vitest";

import { buildAssetUniverseView, buildWorkbenchBootstrap } from "@/src/daa/__tests__/testDataFactories";
import { buildCycleDraftFromBootstrap } from "@/src/daa/modules/workbench/workbenchShared";

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
});
