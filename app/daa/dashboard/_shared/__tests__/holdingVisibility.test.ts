import { describe, expect, it } from "vitest";

import {
  countVisibleHoldings,
  filterVisibleHoldings,
  isVisibleHolding,
} from "../holdingVisibility";
import type { AssetUniverseView } from "@/src/daa/modules/workbench/workbenchTypes";

function makeRow(overrides: Partial<AssetUniverseView>): AssetUniverseView {
  return {
    assetKey: "US::AAPL",
    symbol: "AAPL",
    market: "US",
    currency: "USD",
    holdingQty: 1,
    lastPrice: 100,
    valuationBase: 100,
    actualWeightPct: 1,
    fxRateToBase: 1,
    ...overrides,
  } as AssetUniverseView;
}

describe("holdingVisibility", () => {
  it("隐藏低于最小市值的残留仓位", () => {
    expect(isVisibleHolding(makeRow({ holdingQty: 0.001, valuationBase: 0.42, actualWeightPct: 0.004 }))).toBe(false);
  });

  it("估值未知时保留仓位，避免误隐藏真实持仓", () => {
    expect(isVisibleHolding(makeRow({ valuationBase: null, fxRateToBase: null, actualWeightPct: undefined }))).toBe(true);
  });

  it("按统一规则过滤并计数有效持仓", () => {
    const rows = [
      makeRow({ assetKey: "US::AAPL", valuationBase: 250 }),
      makeRow({ assetKey: "US::DUST", valuationBase: 0.2, actualWeightPct: 0.002 }),
      makeRow({ assetKey: "US::CASHLIKE", holdingQty: 0 }),
    ];

    expect(filterVisibleHoldings(rows).map((row) => row.assetKey)).toEqual(["US::AAPL"]);
    expect(countVisibleHoldings(rows)).toBe(1);
  });
});
