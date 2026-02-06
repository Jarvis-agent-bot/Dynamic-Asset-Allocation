import { describe, it, expect } from "vitest";

import { computeAssetReturns } from "../backtest";

describe("computeAssetReturns", () => {
  it("returns an array with length series.length - 1", () => {
    expect(computeAssetReturns([])).toEqual([]);

    const rs1 = computeAssetReturns([{ close: 100 }]);
    expect(rs1).toEqual([]);

    const rs2 = computeAssetReturns([{ close: 100 }, { close: 110 }]);
    expect(rs2).toHaveLength(1);
  });

  it("computes close-to-close returns for valid prices", () => {
    const rs = computeAssetReturns([{ close: 100 }, { close: 101 }, { close: 102 }]);

    expect(rs).toHaveLength(2);
    expect(rs[0]).toBeCloseTo(0.01, 12);
    expect(rs[1]).toBeCloseTo(102 / 101 - 1, 12);
  });

  it("treats invalid prices as 0% return and breaks the prev-close chain", () => {
    const rs = computeAssetReturns([{ close: 100 }, { close: Number.NaN }, { close: 110 }]);

    // day1->day2 invalid => 0
    // day2 invalid breaks the chain, so day2->day3 also becomes 0 (instead of using stale prevClose)
    expect(rs).toEqual([0, 0]);
  });

  it("treats non-positive prices as invalid (0% return) and breaks the chain", () => {
    const rs = computeAssetReturns([{ close: 100 }, { close: 0 }, { close: 110 }]);
    expect(rs).toEqual([0, 0]);
  });
});
