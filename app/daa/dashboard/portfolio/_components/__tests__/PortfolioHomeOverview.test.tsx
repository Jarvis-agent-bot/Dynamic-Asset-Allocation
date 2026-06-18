// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PortfolioHomeOverview } from "../PortfolioHomeOverview";
import type { AssetUniverseView } from "@/src/daa/modules/workbench/workbenchTypes";

vi.mock("next/dynamic", () => ({
  default: () => function DynamicMock() {
    return <div data-testid="performance-chart" />;
  },
}));

afterEach(() => {
  cleanup();
});

function makeRow(overrides: Partial<AssetUniverseView>): AssetUniverseView {
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
    holdingQty: 10,
    holdingPrice: 100,
    costBasis: null,
    costBasisInBase: null,
    unrealizedPnlBase: null,
    unrealizedPnlPct: null,
    holdingTags: [],
    watchEnabled: false,
    targetWeightHint: 0,
    watchTags: [],
    notes: null,
    priceAlertAbove: null,
    priceAlertBelow: null,
    lastPrice: 100,
    priceUpdatedAt: "2026-06-18T00:00:00.000Z",
    priceStatus: "fresh",
    priceSource: "test",
    priceAgeSec: 60,
    valuationBase: 1000,
    fxRateToBase: 1,
    fxMissing: false,
    actualWeightPct: 10,
    targetWeightPct: 0,
    gapPct: null,
    hfSignal: null,
    ...overrides,
  };
}

describe("PortfolioHomeOverview", () => {
  it("配置分布不展示低于最小持仓市值的残留仓位", () => {
    render(
      <PortfolioHomeOverview
        baseCurrency="USD"
        totalEquity={10_000}
        holdingsValue={1_000}
        availableCashValue={9_000}
        frozenCashValue={0}
        holdingCount={1}
        watchlistCount={0}
        rows={[
          makeRow({ assetKey: "US::AAPL", symbol: "AAPL", valuationBase: 1000, actualWeightPct: 10 }),
          makeRow({
            assetKey: "US::TINY",
            symbol: "TINY",
            holdingQty: 0.00000066,
            valuationBase: 0.00001,
            actualWeightPct: 0.0000001,
          }),
        ]}
        snapshots={[]}
        equityDelta={null}
        latestCycle={null}
        refreshing={false}
        onRefresh={vi.fn()}
        onCashRefresh={vi.fn()}
        onOpenRebalance={vi.fn()}
      />,
    );

    expect(screen.queryByText("AAPL")).not.toBeNull();
    expect(screen.queryByText("TINY")).toBeNull();
  });

  it("配置分布使用有效目标权重，而不是旧 targetWeightHint 残留", () => {
    render(
      <PortfolioHomeOverview
        baseCurrency="USD"
        totalEquity={10_000}
        holdingsValue={1_000}
        availableCashValue={9_000}
        frozenCashValue={0}
        holdingCount={1}
        watchlistCount={0}
        rows={[
          makeRow({ assetKey: "US::AAPL", symbol: "AAPL", valuationBase: 1000, actualWeightPct: 10 }),
          makeRow({
            assetKey: "HK::9988.HK",
            symbol: "9988.HK",
            market: "HK",
            holdingQty: 0,
            valuationBase: 0,
            actualWeightPct: 0,
            targetWeightHint: 15,
            targetWeightPct: 0,
            watchEnabled: false,
          }),
        ]}
        snapshots={[]}
        equityDelta={null}
        latestCycle={null}
        refreshing={false}
        onRefresh={vi.fn()}
        onCashRefresh={vi.fn()}
        onOpenRebalance={vi.fn()}
      />,
    );

    expect(screen.queryByText("AAPL")).not.toBeNull();
    expect(screen.queryByText("9988.HK")).toBeNull();
  });
});
