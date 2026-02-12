import { describe, it, expect } from "vitest";

import { snapshotsToSeriesBySymbol, coerceSeriesBySymbolInput } from "../priceSnapshotsToSeries";

describe("priceSnapshotsToSeries", () => {
  it("converts dated price snapshots into aligned per-symbol series", () => {
    const res = snapshotsToSeriesBySymbol([
      { date: "2026-01-01", prices: { AAA: 1, BBB: 2 } },
      { date: "2026-01-02", prices: { AAA: 1.1, BBB: 2.2 } },
    ]);

    expect(res.symbols).toEqual(["AAA", "BBB"]);
    expect(res.dates).toEqual(["2026-01-01", "2026-01-02"]);

    expect(res.seriesBySymbol.AAA).toEqual([
      { date: "2026-01-01", close: 1 },
      { date: "2026-01-02", close: 1.1 },
    ]);
    expect(res.seriesBySymbol.BBB).toEqual([
      { date: "2026-01-01", close: 2 },
      { date: "2026-01-02", close: 2.2 },
    ]);
  });

  it("accepts ISO datetime and nested {price} forms", () => {
    const res = snapshotsToSeriesBySymbol([
      { date: "2026-01-01T00:00:00.000Z", prices: { AAA: { price: 10 }, BBB: { price: 20 } } },
      { date: "2026-01-02T00:00:00.000Z", prices: { AAA: { price: 11 }, BBB: { price: 21 } } },
    ]);

    expect(res.dates).toEqual(["2026-01-01", "2026-01-02"]);
    expect(res.seriesBySymbol.AAA.map((b) => b.close)).toEqual([10, 11]);
    expect(res.seriesBySymbol.BBB.map((b) => b.close)).toEqual([20, 21]);
  });

  it("errors when a snapshot is missing a symbol price (v0 requires complete snapshots)", () => {
    expect(() =>
      snapshotsToSeriesBySymbol([
        { date: "2026-01-01", prices: { AAA: 1, BBB: 2 } },
        { date: "2026-01-02", prices: { AAA: 1.1 } },
      ]),
    ).toThrow(/missing price/i);
  });

  it("coerces seriesBySymbol input shapes", () => {
    const raw = {
      seriesBySymbol: {
        aaa: [
          { date: "2026-01-01", close: 1 },
          { date: "2026-01-02", price: 2 },
        ],
      },
    };

    const m = coerceSeriesBySymbolInput(raw);
    expect(Object.keys(m)).toEqual(["AAA"]);
    expect(m.AAA).toEqual([
      { date: "2026-01-01", close: 1 },
      { date: "2026-01-02", close: 2 },
    ]);
  });
});
