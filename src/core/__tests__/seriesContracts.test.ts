import { describe, it, expect } from "vitest";

import { assertValidPriceSeries, assertValidSeriesDates } from "../seriesContracts";

const okSeries = [
  { date: "2026-01-01", close: 100 },
  { date: "2026-01-02", close: 101 },
];

describe("assertValidSeriesDates", () => {
  it("accepts strictly increasing ISO dates", () => {
    expect(() => assertValidSeriesDates(okSeries)).not.toThrow();
  });

  it("rejects non-ISO date formats", () => {
    expect(() => assertValidSeriesDates([{ date: "2026/01/01" }])).toThrow(/YYYY-MM-DD/i);
  });

  it("rejects invalid calendar dates", () => {
    expect(() => assertValidSeriesDates([{ date: "2026-02-31" }])).toThrow(/valid calendar date/i);
  });

  it("rejects non-increasing dates", () => {
    expect(() =>
      assertValidSeriesDates([
        { date: "2026-01-02" },
        { date: "2026-01-02" },
      ]),
    ).toThrow(/strictly increasing/i);
  });
});

describe("assertValidPriceSeries", () => {
  it("rejects series shorter than 2 bars", () => {
    expect(() => assertValidPriceSeries([{ date: "2026-01-01", close: 100 }])).toThrow(/too short/i);
  });

  it("rejects non-finite close values", () => {
    expect(() => assertValidPriceSeries([{ date: "2026-01-01", close: 100 }, { date: "2026-01-02", close: NaN }])).toThrow(
      /finite/i,
    );
  });

  it("rejects non-positive close values", () => {
    expect(() => assertValidPriceSeries([{ date: "2026-01-01", close: 100 }, { date: "2026-01-02", close: 0 }])).toThrow(
      /> 0/i,
    );
  });

  it("accepts a minimal valid series", () => {
    expect(() => assertValidPriceSeries(okSeries)).not.toThrow();
  });
});
