import { describe, expect, it, vi } from "vitest";

import { buildAssetUniverseView, buildWorkbenchBootstrap } from "@/src/daa/__tests__/testDataFactories";
import { scanTaxLossHarvestingCandidates } from "./taxLossHarvestingService";

vi.mock("@/src/daa/pg/daaPg", () => ({
  daaPgPool: vi.fn(() => ({
    query: vi.fn(async () => ({ rows: [] })),
  })),
}));

vi.mock("@/src/daa/account/accountScope", () => ({
  getDaaAccountScopeId: vi.fn(() => "test-account"),
}));

describe("scanTaxLossHarvestingCandidates", () => {
  it("使用基准货币成本和估值识别税损机会", async () => {
    const result = await scanTaxLossHarvestingCandidates({
      bootstrap: buildWorkbenchBootstrap({
        baseCurrency: "USD",
        assetUniverse: [
          buildAssetUniverseView({
            assetKey: "HK::0700",
            symbol: "0700",
            market: "HK",
            currency: "HKD",
            holdingQty: 10,
            holdingPrice: 100,
            lastPrice: 110,
            costBasis: 1_000,
            costBasisInBase: 1_000,
            valuationBase: 800,
            fxRateToBase: 0.7272727,
          }),
          buildAssetUniverseView({
            assetKey: "US::GAIN",
            symbol: "GAIN",
            market: "US",
            currency: "USD",
            holdingQty: 10,
            holdingPrice: 100,
            lastPrice: 90,
            costBasis: 1_000,
            costBasisInBase: 700,
            valuationBase: 900,
          }),
          buildAssetUniverseView({
            assetKey: "US::NOBASE",
            symbol: "NOBASE",
            market: "US",
            currency: "USD",
            holdingQty: 10,
            holdingPrice: 100,
            lastPrice: 70,
            costBasis: 1_000,
            costBasisInBase: null,
            valuationBase: 700,
          }),
        ],
      }),
      config: {
        minLossPct: 0.05,
        minLossAbsBase: 100,
      },
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      assetKey: "HK::0700",
      costBasis: 1_000,
      currentValue: 800,
      unrealizedLoss: -200,
      unrealizedLossPct: -20,
      lossInBase: 200,
      harvestable: true,
    });
    expect(result.proposals[0]).toMatchObject({
      assetKey: "HK::0700",
      side: "SELL",
      suggestedNotional: 800,
    });
  });
});
