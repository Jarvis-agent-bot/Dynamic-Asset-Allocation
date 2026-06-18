import { describe, expect, it } from "vitest";

import { buildAssetUniverseView, buildWorkbenchBootstrap } from "@/src/daa/__tests__/testDataFactories";

import { buildRiskCycleDraft } from "./workbenchModeling";

describe("buildRiskCycleDraft", () => {
  it("使用基准货币未实现盈亏判断风险触发，而不是本币单价涨跌", () => {
    const draft = buildRiskCycleDraft({
      bootstrap: buildWorkbenchBootstrap({
        assetUniverse: [
          buildAssetUniverseView({
            assetKey: "HK::0700",
            symbol: "0700",
            market: "HK",
            currency: "HKD",
            holdingQty: 10,
            holdingPrice: 100,
            lastPrice: 110,
            costBasis: null,
            costBasisInBase: 1000,
            valuationBase: 700,
            unrealizedPnlPct: -30,
            fxRateToBase: 0.7,
          }),
        ],
        execution: {
          minNotional: 1,
        },
      }),
      perAssetStopLossPct: 0.2,
      perAssetTakeProfitPct: 0.35,
    });

    expect(draft?.riskHits).toEqual([
      {
        symbol: "0700",
        kind: "stop_loss",
        pnlPct: -30,
      },
    ]);
    expect(draft?.proposals[0]).toMatchObject({
      assetKey: "HK::0700",
      symbol: "0700",
      side: "SELL",
      sellAll: true,
    });
  });
});
