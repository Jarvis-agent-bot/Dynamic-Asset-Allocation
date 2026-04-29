import { describe, expect, it } from "vitest";

import { deriveAssetPriceChange } from "../assetPriceChange";
import type { AssetUniverseView } from "@/src/daa/modules/workbench/workbenchTypes";

function makeRow(overrides: Partial<AssetUniverseView> = {}): AssetUniverseView {
  return {
    assetKey: "US::AAPL",
    symbol: "AAPL",
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
    autoEntryEnabled: false,
    entryTargetWeightPct: null,
    entryCooldownDays: 0,
    lastEntryTriggeredAt: null,
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
  it("优先用 sparkline 最近两个收盘价，而不是 SSE 首包 0 delta", () => {
    const change = deriveAssetPriceChange(makeRow({ priceDelta: 0 } as Partial<AssetUniverseView>), [98, 100, 103]);

    expect(change?.source).toBe("sparkline");
    expect(change?.change).toBe(3);
    expect(change?.changePct).toBeCloseTo(3, 6);
  });

  it("没有 sparkline 且 live delta 为 0 时返回空态", () => {
    const change = deriveAssetPriceChange(makeRow({ priceDelta: 0 } as Partial<AssetUniverseView>), null);

    expect(change).toBeNull();
  });
});
