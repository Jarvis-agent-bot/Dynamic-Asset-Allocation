import { describe, expect, it } from "vitest";

import { buildAssetUniverseView } from "@/src/daa/__tests__/testDataFactories";

import {
  buildTargetWeightApplyPlan,
  parseLooseTargetAssetKey,
} from "./targetAllocationApply";

describe("targetAllocationApply", () => {
  it("兼容 ::、: 与裸 symbol 三种目标键格式", () => {
    expect(parseLooseTargetAssetKey("US::SPY")).toEqual({
      assetKey: "US::SPY",
      market: "US",
      symbol: "SPY",
    });
    expect(parseLooseTargetAssetKey("HK:0388.HK")).toEqual({
      assetKey: "HK::0388.HK",
      market: "HK",
      symbol: "0388.HK",
    });
    expect(parseLooseTargetAssetKey("QQQ")).toEqual({
      assetKey: "US::QQQ",
      market: "US",
      symbol: "QQQ",
    });
  });

  it("会统一权重单位、补开 watch，并清零未出现在新计划中的旧目标", () => {
    const plan = buildTargetWeightApplyPlan({
      currentRows: [
        buildAssetUniverseView({
          assetKey: "US::SPY",
          symbol: "SPY",
          watchEnabled: false,
          targetWeightHint: 0.25,
        }),
        buildAssetUniverseView({
          assetKey: "US::TLT",
          symbol: "TLT",
          watchEnabled: true,
          targetWeightHint: 0.15,
        }),
        buildAssetUniverseView({
          assetKey: "US::GLD",
          symbol: "GLD",
          watchEnabled: true,
          targetWeightHint: 0.1,
        }),
      ],
      weightsPct: {
        "US:SPY": 60,
        QQQ: 0.4,
        TLT: 0,
      },
    });

    expect(plan.patches).toEqual(expect.arrayContaining([
      {
        assetKey: "US::SPY",
        patch: {
          watchEnabled: true,
          targetWeightHint: 0.6,
        },
      },
      {
        assetKey: "US::TLT",
        patch: {
          targetWeightHint: 0,
        },
      },
      {
        assetKey: "US::GLD",
        patch: {
          targetWeightHint: 0,
        },
      },
    ]));
    expect(plan.patches).toHaveLength(3);
    expect(plan.upserts).toEqual([
      {
        market: "US",
        symbol: "QQQ",
        watchEnabled: true,
        targetWeightHint: 0.4,
      },
    ]);
  });
});
