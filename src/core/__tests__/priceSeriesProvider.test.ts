import { describe, expect, it } from "vitest";

import type { PriceBar } from "../domain";
import { fetchValidatedPriceSeries, type PriceSeriesProvider } from "../providers";

function bar(date: string, close: number): PriceBar {
  return { date, close };
}

describe("framework v0 provider contract", () => {
  it("fetchValidatedPriceSeries throws if provider returns an invalid series", async () => {
    const provider: PriceSeriesProvider = {
      async getPriceSeries() {
        return [bar("2026-01-01", 100), bar("2026-01-01", 101)]; // duplicate date
      },
    };

    await expect(fetchValidatedPriceSeries(provider, { symbol: "SPY" })).rejects.toThrow(
      /strictly increasing/i,
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
