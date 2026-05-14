import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchYfinanceFundamentals, normalizeYfinanceFundamentalsPayload } from "./yfinanceFundamentals";

vi.mock("@/src/daa/store/jobStore", () => ({
  appendDaaExternalRequestLog: vi.fn(async () => ({
    id: "log",
    provider: "yahoo",
    resource: "test",
    subjectKey: "",
    endpointHost: "",
    httpStatus: 0,
    errorCode: "",
    errorMessage: "",
    latencyMs: 0,
    retryCount: 0,
    cacheStatus: "",
    caller: "",
    rawRefId: null,
    createdAt: new Date().toISOString(),
  })),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("market/yfinanceFundamentals", () => {
  it("normalizes PE and transparent market cap from Yahoo timeseries + quoteSummary payload", () => {
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
            trailingMarketCap: [
              { asOfDate: "2024-06-10", currencyCode: "USD", reportedValue: { raw: 2_960_000_000_000 } },
              { asOfDate: "2026-05-08", currencyCode: "USD", reportedValue: { raw: 4_310_000_000_000 } },
            ],
          },
        ],
      },
    };
    const quoteSummaryPayload = {
      quoteSummary: {
        result: [{
          price: {
            currency: "USD",
            regularMarketPrice: { raw: 172.4 },
            marketCap: { raw: 2_700_000_000_000 },
          },
          summaryDetail: {
            trailingPE: { raw: 28.2 },
            dividendYield: { raw: 0.005 },
          },
          defaultKeyStatistics: {
            sharesOutstanding: { raw: 15_000_000_000 },
            priceToBook: { raw: 44.2 },
            enterpriseValue: { raw: 2_650_000_000_000 },
          },
          financialData: {
            revenueGrowth: { raw: 0.08 },
            earningsGrowth: { raw: 0.11 },
            grossMargins: { raw: 0.46 },
            profitMargins: { raw: 0.24 },
            totalRevenue: { raw: 410_000_000_000 },
            freeCashflow: { raw: 88_000_000_000 },
          },
        }],
      },
    };

    const result = normalizeYfinanceFundamentalsPayload({
      symbol: "AAPL",
      payload,
      quoteSummaryPayload,
      updatedAt: "2026-05-13T00:00:00.000Z",
    });

    expect(result.trailingPE).toBe(28.2);
    expect(result.pbRatio).toBe(44.2);
    expect(result.dividendYieldPct).toBe(0.5);
    expect(result.revenueGrowthPct).toBe(8);
    expect(result.earningsGrowthPct).toBe(11);
    expect(result.marketPrice).toBe(172.4);
    expect(result.sharesOutstanding).toBe(15_000_000_000);
    expect(result.marketCap).toBe(2_586_000_000_000);
    expect(result.marketCapCurrency).toBe("USD");
    expect(result.marketCapSource).toBe("price_x_shares_outstanding");
    expect(result.pePercentile).toBe(null);
    expect(result.peSampleCount).toBe(2);
    expect(result.peHistory.eligible).toBe(false);
    expect(result.peHistory.reason).toBe("insufficient_sample_count:2/36");
    expect(result.issues.some((item) => item.includes("insufficient trailingPeRatio history"))).toBe(true);
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
    expect(result.marketCapSource).toBe("fundamentals_timeseries_market_cap");
    expect(result.pePercentile).toBe(null);
    expect(result.issues).toContain("missing trailingPeRatio");
  });

  it("用更接近 quote marketCap 的 impliedSharesOutstanding 透明计算港股市值", () => {
    const quoteSummaryPayload = {
      quoteSummary: {
        result: [{
          price: {
            currency: "HKD",
            regularMarketPrice: { raw: 31.72 },
            marketCap: { raw: 819_063_816_192 },
          },
          summaryDetail: {
            trailingPE: { raw: 17.62 },
          },
          defaultKeyStatistics: {
            sharesOutstanding: { raw: 21_353_625_662 },
            impliedSharesOutstanding: { raw: 25_821_683_414 },
            priceToBook: { raw: 2.68 },
          },
        }],
      },
    };

    const result = normalizeYfinanceFundamentalsPayload({
      symbol: "1810.HK",
      payload: null,
      quoteSummaryPayload,
    });

    expect(result.sharesOutstanding).toBe(25_821_683_414);
    expect(result.sharesSource).toBe("implied_shares_outstanding");
    expect(result.marketCap).toBeCloseTo(819_063_816_192, -5);
    expect(result.marketCapSource).toBe("price_x_shares_outstanding");
    expect(result.issues.some((item) => item.includes("using impliedSharesOutstanding"))).toBe(true);
  });

  it("does not calculate historical percentile from tiny valuation samples", () => {
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
    expect(result.pePercentile).toBe(null);
    expect(result.peSampleCount).toBe(4);
    expect(result.peHistory.latestRank).toBe(3);
    expect(result.peHistory.reason).toBe("insufficient_sample_count:4/36");
  });

  it("calculates historical percentile only with enough samples and span", () => {
    const trailingPeRatio = Array.from({ length: 36 }, (_, index) => {
      const year = 2021 + Math.floor(index / 12);
      const month = (index % 12) + 1;
      return {
        asOfDate: `${year}-${String(month).padStart(2, "0")}-01`,
        reportedValue: { raw: index + 1 },
      };
    });
    trailingPeRatio[35] = { asOfDate: "2024-12-01", reportedValue: { raw: 17 } };
    const payload = { timeseries: { result: [{ trailingPeRatio }] } };

    const result = normalizeYfinanceFundamentalsPayload({ symbol: "MSFT", payload });

    expect(result.trailingPE).toBe(17);
    expect(result.peHistory.eligible).toBe(true);
    expect(result.peSampleCount).toBe(36);
    expect(result.pePercentile).toBe(50);
  });

  it("throws when all Yahoo fundamentals endpoints fail, so empty snapshots are not cached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("blocked", { status: 403 })) as unknown as typeof fetch);

    await expect(fetchYfinanceFundamentals("AAPL", {
      now: new Date("2026-05-14T00:00:00.000Z"),
      timeoutMs: 100,
    })).rejects.toThrow("all yfinance fundamentals requests failed");
  });
});
