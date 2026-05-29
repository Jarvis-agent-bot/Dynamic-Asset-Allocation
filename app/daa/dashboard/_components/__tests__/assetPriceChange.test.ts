import { describe, expect, it } from "vitest";

import { deriveAssetPriceChange } from "../assetPriceChange";
import type { AssetUniverseView } from "@/src/daa/modules/workbench/workbenchTypes";

function makeRow(overrides: Partial<AssetUniverseView> = {}): AssetUniverseView {
  return {
    assetKey: "US::AAPL",
    symbol: "AAPL",
    name: "Apple Inc.",
    displayNameZh: "苹果",
    market: "US",
    currency: "USD",
    assetClass: "EQUITY",
    region: "US",
    exchange: "NASDAQ",
    instrumentType: "STOCK",
    marketGroup: "US_EQUITY",
    yfinanceSymbol: "AAPL",
    holdingQty: 1,
    holdingPrice: 100,
    costBasis: 100,
    costBasisInBase: 100,
    unrealizedPnlBase: 0,
    unrealizedPnlPct: 0,
    holdingTags: [],
    watchEnabled: true,
    targetWeightHint: 0.1,
    watchTags: [],
    notes: null,
    priceAlertAbove: null,
    priceAlertBelow: null,
    lastPrice: 101,
    priceUpdatedAt: null,
    priceStatus: "fresh",
    priceSource: "test",
    priceAgeSec: null,
    valuationBase: 101,
    fxRateToBase: 1,
    fxMissing: false,
    actualWeightPct: 10,
    targetWeightPct: 10,
    gapPct: 0,
    hfSignal: null,
    ...overrides,
  };
}

describe("deriveAssetPriceChange", () => {
  it("SSE 首包 0 delta 时回退到 sparkline 最近两个收盘价", () => {
    const change = deriveAssetPriceChange(makeRow({ priceDelta: 0 } as Partial<AssetUniverseView>), [98, 100, 103]);

    expect(change?.source).toBe("sparkline");
    expect(change?.change).toBe(3);
    expect(change?.changePct).toBeCloseTo(3, 6);
  });

  it("SSE 有真实非 0 delta 时优先使用实时涨跌", () => {
    const change = deriveAssetPriceChange(makeRow({ lastPrice: 106, priceDelta: 2 } as Partial<AssetUniverseView>), [98, 100, 101]);

    expect(change?.source).toBe("live");
    expect(change?.change).toBe(2);
    expect(change?.changePct).toBeCloseTo(1.923076, 5);
  });

  it("没有 sparkline 且 live delta 为 0 时返回空态", () => {
    const change = deriveAssetPriceChange(makeRow({ priceDelta: 0 } as Partial<AssetUniverseView>), null);

    expect(change).toBeNull();
  });
});
