import { describe, expect, it } from "vitest";

import { createDeterministicMockPriceSeriesProvider, fetchValidatedPriceSeriesEnforcingRange } from "../providers";

describe("deterministic mock price-series provider", () => {
  it("returns a series within the inclusive requested range", async () => {
    const provider = createDeterministicMockPriceSeriesProvider({ maxDays: 200 });

    const series = await fetchValidatedPriceSeriesEnforcingRange(provider, {
      symbol: "SPY",
      start: "2026-01-01",
      end: "2026-01-03",
    });

    expect(series.map((b) => b.date)).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
  });

  it("is deterministic for the same inputs", async () => {
    const provider = createDeterministicMockPriceSeriesProvider({ maxDays: 200 });

    const a = await fetchValidatedPriceSeriesEnforcingRange(provider, {
      symbol: "SPY",
      start: "2026-01-01",
      end: "2026-01-05",
    });
    const b = await fetchValidatedPriceSeriesEnforcingRange(provider, {
      symbol: "SPY",
      start: "2026-01-01",
      end: "2026-01-05",
    });

    expect(a).toEqual(b);
  });
});
