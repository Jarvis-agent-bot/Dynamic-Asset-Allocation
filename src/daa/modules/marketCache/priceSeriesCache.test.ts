import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  fetchChart: vi.fn(),
}));

vi.mock("@/src/daa/pg/daaPg", () => ({
  daaPgPool: vi.fn(() => ({
    query: mocks.query,
  })),
}));

vi.mock("@/src/market/yahooProvider", () => ({
  getYahooProvider: vi.fn(() => ({
    fetchChart: mocks.fetchChart,
  })),
}));

import { fetchPriceSeriesWithCache } from "./priceSeriesCache";

function chartPayload(input: {
  currency: string;
  instrumentType: string;
  close: number;
  timestamp?: number;
}) {
  return {
    chart: {
      result: [{
        meta: {
          currency: input.currency,
          instrumentType: input.instrumentType,
        },
        timestamp: [input.timestamp ?? 1_778_198_400],
        indicators: {
          quote: [{ close: [input.close] }],
        },
      }],
      error: null,
    },
  };
}

async function flushAsyncWrites() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("priceSeriesCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT DISTINCT ON")) return { rows: [] };
      return { rows: [], rowCount: 1 };
    });
  });

  it("writes Yahoo chart history with market and currency from chart metadata", async () => {
    mocks.fetchChart.mockResolvedValue({
      payloadJson: chartPayload({
        currency: "KRW",
        instrumentType: "EQUITY",
        close: 1_745_000,
      }),
    });

    const result = await fetchPriceSeriesWithCache("000660.KS", "2026-05-01", {
      minDbDays: 2,
    });
    await flushAsyncWrites();

    expect(result.data).toEqual([{ date: "2026-05-08", close: 1_745_000 }]);
    const insertCall = mocks.query.mock.calls.find((call) => String(call[0]).includes("INSERT INTO daa_market_price_history_v1"));
    expect(insertCall?.[1]).toEqual([
      "yfinance",
      "KR",
      "000660.KS",
      "2026-05-08T00:00:00Z",
      1_745_000,
      "KRW",
      "price_series_cache",
    ]);
  });

  it("uses explicit asset scope for cache reads and writes when provided", async () => {
    mocks.fetchChart.mockResolvedValue({
      payloadJson: chartPayload({
        currency: "KRW",
        instrumentType: "CURRENCY",
        close: 1_360,
      }),
    });

    await fetchPriceSeriesWithCache("USDKRW=X", "2026-05-01", {
      market: "FX",
      currency: "KRW",
      minDbDays: 2,
    });
    await flushAsyncWrites();

    const selectCall = mocks.query.mock.calls.find((call) => String(call[0]).includes("SELECT DISTINCT ON"));
    expect(String(selectCall?.[0])).toContain("market = $3");
    expect(selectCall?.[1]).toEqual(["USDKRW=X", "2026-05-01", "FX"]);

    const insertCall = mocks.query.mock.calls.find((call) => String(call[0]).includes("INSERT INTO daa_market_price_history_v1"));
    expect(insertCall?.[1]).toEqual([
      "yfinance",
      "FX",
      "USDKRW=X",
      "2026-05-08T00:00:00Z",
      1_360,
      "KRW",
      "price_series_cache",
    ]);
  });
});
