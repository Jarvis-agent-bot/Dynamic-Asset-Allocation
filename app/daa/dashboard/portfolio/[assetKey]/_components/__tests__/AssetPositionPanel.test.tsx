// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AssetPositionPanel } from "../AssetPositionPanel";
import type { AssetUniverseView } from "@/src/daa/modules/workbench/workbenchTypes";

afterEach(() => {
  cleanup();
});

function makeRow(overrides: Partial<AssetUniverseView> = {}): AssetUniverseView {
  return {
    assetKey: "HK::0388.HK",
    symbol: "0388.HK",
    name: "Hong Kong Exchanges and Clearing",
    displayNameZh: "香港交易所",
    market: "HK",
    currency: "HKD",
    assetClass: "EQUITY",
    region: "HK",
    exchange: "HKEX",
    instrumentType: "STOCK",
    marketGroup: "HK_EQUITY",
    yfinanceSymbol: "0388.HK",
    holdingQty: 1,
    holdingPrice: 399.03,
    costBasis: 399.03,
    costBasisInBase: 51,
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
    lastPrice: 419.8,
    priceUpdatedAt: null,
    priceStatus: "fresh",
    priceSource: "test",
    priceAgeSec: null,
    valuationBase: 1020.73,
    fxRateToBase: 0.128,
    fxMissing: false,
    actualWeightPct: 9.982,
    targetWeightPct: 10,
    gapPct: 0.018,
    hfSignal: null,
    ...overrides,
  };
}

describe("AssetPositionPanel", () => {
  it("按百分数口径显示当前权重和目标权重，不二次乘以 100", () => {
    render(<AssetPositionPanel row={makeRow()} />);

    expect(screen.getByText("9.98%")).toBeInTheDocument();
    expect(screen.getByText("目标 10.00%")).toBeInTheDocument();
    expect(screen.queryByText("998.20%")).not.toBeInTheDocument();
    expect(screen.queryByText("目标 1000.00%")).not.toBeInTheDocument();
  });
});
