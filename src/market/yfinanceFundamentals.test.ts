import { describe, expect, it } from "vitest";

import { normalizeYfinanceFundamentalsPayload } from "./yfinanceFundamentals";

describe("market/yfinanceFundamentals", () => {
  it("normalizes latest PE, PEG and market cap from Yahoo timeseries payload", () => {
    const payload = {
      timeseries: {
        result: [
          {
            timestamp: [1717977600, 1778198400],
            trailingPeRatio: [
              { asOfDate: "2024-06-10", reportedValue: { raw: 30.03 } },
              { asOfDate: "2026-05-08", reportedValue: { raw: 35.51 } },
            ],
          },
          {
            timestamp: [1717977600, 1778198400],
            trailingPegRatio: [
              { asOfDate: "2024-06-10", reportedValue: { raw: 2.04 } },
              { asOfDate: "2026-05-08", reportedValue: { raw: 2.57 } },
            ],
          },
          {
            timestamp: [1717977600, 1778198400],
            trailingMarketCap: [
              { asOfDate: "2024-06-10", currencyCode: "USD", reportedValue: { raw: 2_960_000_000_000 } },
              { asOfDate: "2026-05-08", currencyCode: "USD", reportedValue: { raw: 4_310_000_000_000 } },
            ],
          },
        ],
      },
    };

    const result = normalizeYfinanceFundamentalsPayload({
      symbol: "AAPL",
      payload,
      updatedAt: "2026-05-13T00:00:00.000Z",
    });

    expect(result.trailingPE).toBe(35.51);
    expect(result.pegRatio).toBe(2.57);
    expect(result.marketCap).toBe(4_310_000_000_000);
    expect(result.marketCapCurrency).toBe("USD");
    expect(result.pePercentile).toBe(null);
    expect(result.pegPercentile).toBe(null);
    expect(result.peSampleCount).toBe(2);
    expect(result.pegSampleCount).toBe(2);
    expect(result.issues).toContain("insufficient trailingPeRatio history");
    expect(result.issues).toContain("insufficient trailingPegRatio history");
  });

  it("falls back to quarterly market cap when trailing market cap is empty", () => {
    const payload = {
      timeseries: {
        result: [
          { trailingMarketCap: [] },
          {
            quarterlyMarketCap: [
              { asOfDate: "2026-03-31", currencyCode: "HKD", reportedValue: { raw: 3_000_000_000_000 } },
            ],
          },
        ],
      },
    };

    const result = normalizeYfinanceFundamentalsPayload({ symbol: "9988.HK", payload });

    expect(result.marketCap).toBe(3_000_000_000_000);
    expect(result.marketCapCurrency).toBe("HKD");
    expect(result.pePercentile).toBe(null);
    expect(result.pegPercentile).toBe(null);
    expect(result.issues).toContain("missing trailingPeRatio");
    expect(result.issues).toContain("missing trailingPegRatio");
  });

  it("calculates historical percentile with enough valuation samples", () => {
    const payload = {
      timeseries: {
        result: [
          {
            trailingPeRatio: [
              { asOfDate: "2024-01-01", reportedValue: { raw: 10 } },
              { asOfDate: "2024-06-01", reportedValue: { raw: 20 } },
              { asOfDate: "2025-01-01", reportedValue: { raw: 30 } },
              { asOfDate: "2026-01-01", reportedValue: { raw: 20 } },
            ],
          },
        ],
      },
    };

    const result = normalizeYfinanceFundamentalsPayload({ symbol: "MSFT", payload });

    expect(result.trailingPE).toBe(20);
    expect(result.pePercentile).toBe(75);
    expect(result.peSampleCount).toBe(4);
  });
});
