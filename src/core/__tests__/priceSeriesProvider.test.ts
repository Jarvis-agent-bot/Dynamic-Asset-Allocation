import { describe, expect, it } from "vitest";

import type { PriceBar } from "../domain";
import { assertValidPriceSeriesRequest, fetchValidatedPriceSeries, type PriceSeriesProvider } from "../providers";

function bar(date: string, close: number): PriceBar {
  return { date, close };
}

describe("framework v0 provider contract", () => {
  it("assertValidPriceSeriesRequest throws for invalid symbol", () => {
    expect(() => assertValidPriceSeriesRequest({ symbol: "" })).toThrow(/symbol must be a non-empty string/i);
  });

  it("assertValidPriceSeriesRequest throws for invalid dates", () => {
    expect(() => assertValidPriceSeriesRequest({ symbol: "SPY", start: "2026-13-01" })).toThrow(
      /start.*valid calendar date/i,
    );
    expect(() => assertValidPriceSeriesRequest({ symbol: "SPY", end: "20260101" })).toThrow(/end.*YYYY-MM-DD/i);
  });

  it("assertValidPriceSeriesRequest throws if start > end", () => {
    expect(() => assertValidPriceSeriesRequest({ symbol: "SPY", start: "2026-02-01", end: "2026-01-01" })).toThrow(
      /start must be <= end/i,
    );
  });

  it("fetchValidatedPriceSeries throws if provider returns an invalid series", async () => {
    const provider: PriceSeriesProvider = {
      name: "test-provider",
      async getPriceSeries() {
        return [bar("2026-01-01", 100), bar("2026-01-01", 101)]; // duplicate date
      },
    };

    await expect(fetchValidatedPriceSeries(provider, { symbol: "SPY" })).rejects.toThrow(/strictly increasing/i);
  });

  it("fetchValidatedPriceSeries error includes provider name + request", async () => {
    const provider: PriceSeriesProvider = {
      name: "test-provider",
      async getPriceSeries() {
        throw new Error("boom");
      },
    };

    await expect(fetchValidatedPriceSeries(provider, { symbol: "SPY", start: "2026-01-01" })).rejects.toThrow(
      /test-provider.*symbol=SPY.*start=2026-01-01.*boom/i,
    );
  });

  it("fetchValidatedPriceSeries returns the series if valid", async () => {
    const provider: PriceSeriesProvider = {
      async getPriceSeries() {
        return [bar("2026-01-01", 100), bar("2026-01-02", 101)];
      },
    };

    await expect(fetchValidatedPriceSeries(provider, { symbol: "SPY" })).resolves.toHaveLength(2);
  });
});
