import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchPriceSeriesWithCache: vi.fn(),
}));

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminViewerAuth: vi.fn(async () => null),
}));

vi.mock("@/src/daa/modules/marketCache/priceSeriesCache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/daa/modules/marketCache/priceSeriesCache")>();
  return {
    ...actual,
    fetchPriceSeriesWithCache: mocks.fetchPriceSeriesWithCache,
  };
});

import { GET } from "@/app/api/daa/market/yfinance/price-series/route";

describe("yfinance price-series route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchPriceSeriesWithCache.mockResolvedValue({
      symbol: "005930.KS",
      data: [{
        date: "2026-05-22",
        open: 300000,
        high: 300500,
        low: 292000,
        close: 292500,
        volume: 19662945,
      }],
      source: "yahoo",
      interval: "1d",
      priceMode: "close",
      upstream: "yahoo_provider",
      rowsCovered: 1,
      rowsWritten: 1,
    });
  });

  it("拒绝当前未稳定支持的小时线 interval", async () => {
    const response = await GET(new Request("http://localhost/api/daa/market/yfinance/price-series?symbol=005930.KS&interval=1h"));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_FAILED");
    expect(mocks.fetchPriceSeriesWithCache).not.toHaveBeenCalled();
  });

  it("传递真实 OHLCV 日线请求参数", async () => {
    const response = await GET(new Request("http://localhost/api/daa/market/yfinance/price-series?symbol=005930.KS&market=KR&start=2026-05-01&adjusted=0&requireOhlcv=1&interval=1d"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.series).toEqual([{
      date: "2026-05-22",
      open: 300000,
      high: 300500,
      low: 292000,
      close: 292500,
      volume: 19662945,
    }]);
    expect(mocks.fetchPriceSeriesWithCache).toHaveBeenCalledWith("005930.KS", "2026-05-01", expect.objectContaining({
      market: "KR",
      interval: "1d",
      adjusted: false,
      requireOhlcv: true,
    }));
  });

  it("真实 OHLCV 请求默认使用原始 close，避免 adjusted close 和原始 OHLC 混用", async () => {
    const response = await GET(new Request("http://localhost/api/daa/market/yfinance/price-series?symbol=005930.KS&market=KR&start=2026-05-01&requireOhlcv=1&interval=1d"));

    expect(response.status).toBe(200);
    expect(mocks.fetchPriceSeriesWithCache).toHaveBeenCalledWith("005930.KS", "2026-05-01", expect.objectContaining({
      adjusted: false,
      requireOhlcv: true,
    }));
  });
});
