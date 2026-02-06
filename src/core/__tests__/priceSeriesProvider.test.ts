import { describe, expect, it } from "vitest";

import type { PriceBar } from "../domain";
import {
  assertPriceSeriesRespectsRequestRange,
  assertValidPriceSeriesRequest,
  fetchValidatedPriceSeries,
  fetchValidatedPriceSeriesEnforcingRange,
  PriceSeriesProviderError,
  type PriceSeriesProvider,
} from "../providers";

function bar(date: string, close: number): PriceBar {
  return { date, close };
}

describe("framework v0 provider contract", () => {
  it("assertValidPriceSeriesRequest throws for invalid symbol", () => {
    expect(() => assertValidPriceSeriesRequest({ symbol: "" })).toThrow(/symbol must be a non-empty string/i);
    expect(() => assertValidPriceSeriesRequest({ symbol: "  SPY" })).toThrow(/leading\/trailing whitespace/i);
    expect(() => assertValidPriceSeriesRequest({ symbol: "SPY  " })).toThrow(/leading\/trailing whitespace/i);
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

  it("fetchValidatedPriceSeries preserves the original error as cause", async () => {
    const provider: PriceSeriesProvider = {
      name: "test-provider",
      async getPriceSeries() {
        throw new Error("boom");
      },
    };

    try {
      await fetchValidatedPriceSeries(provider, { symbol: "SPY" });
      throw new Error("expected fetchValidatedPriceSeries to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(PriceSeriesProviderError);
      const e = err as PriceSeriesProviderError;
      expect(e.providerName).toBe("test-provider");
      expect(e.request.symbol).toBe("SPY");
      expect(e.cause).toBeInstanceOf(Error);
      expect((e.cause as Error).message).toBe("boom");
    }
  });

  it("assertPriceSeriesRespectsRequestRange is a no-op when no range is requested", () => {
    assertPriceSeriesRespectsRequestRange([bar("2026-01-01", 100)], {});
  });

  it("assertPriceSeriesRespectsRequestRange throws if series contains a non-ISO date string", () => {
    expect(() =>
      assertPriceSeriesRespectsRequestRange([{ date: "20260101" }], { start: "2026-01-01" }),
    ).toThrow(/YYYY-MM-DD/i);
  });

  it("assertPriceSeriesRespectsRequestRange throws if series contains a non-string date", () => {
    expect(() =>
      assertPriceSeriesRespectsRequestRange([{ date: 123 as any }], { start: "2026-01-01" }),
    ).toThrow(/YYYY-MM-DD/i);
  });

  it("assertPriceSeriesRespectsRequestRange throws if series has date before start", () => {
    expect(() =>
      assertPriceSeriesRespectsRequestRange([bar("2026-01-01", 100), bar("2026-01-02", 101)], {
        start: "2026-01-02",
      }),
    ).toThrow(/before start/i);
  });

  it("assertPriceSeriesRespectsRequestRange throws if series has date after end", () => {
    expect(() =>
      assertPriceSeriesRespectsRequestRange([bar("2026-01-01", 100), bar("2026-01-03", 101)], {
        end: "2026-01-02",
      }),
    ).toThrow(/after end/i);
  });

  it("fetchValidatedPriceSeriesEnforcingRange throws if provider ignores requested start/end", async () => {
    const provider: PriceSeriesProvider = {
      async getPriceSeries() {
        return [bar("2026-01-01", 100), bar("2026-01-02", 101), bar("2026-01-03", 102)];
      },
    };

    await expect(
      fetchValidatedPriceSeriesEnforcingRange(provider, {
        symbol: "SPY",
        start: "2026-01-02",
        end: "2026-01-02",
      }),
    ).rejects.toThrow(/before start|after end/i);
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
