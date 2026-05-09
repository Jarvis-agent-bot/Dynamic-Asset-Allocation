import { describe, expect, it } from "vitest";

import { buildAssetUniverseView } from "@/src/daa/__tests__/testDataFactories";

import { buildTargetWeightApplyPlan } from "./targetAllocationApply";

describe("targetAllocationApply", () => {
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
        "US::SPY": 60,
        "US::QQQ": 0.4,
        "US::TLT": 0,
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

  it("拒绝旧版单冒号或裸 symbol 目标键", () => {
    expect(() => buildTargetWeightApplyPlan({
      currentRows: [],
      weightsPct: { "US:SPY": 60 },
    })).toThrow(/MARKET::SYMBOL/);

    expect(() => buildTargetWeightApplyPlan({
      currentRows: [],
      weightsPct: { QQQ: 40 },
    })).toThrow(/MARKET::SYMBOL/);
  });
});
