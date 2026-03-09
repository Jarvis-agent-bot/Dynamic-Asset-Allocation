import { describe, expect, it, vi } from "vitest";

import { createMarketDataClient } from "./marketDataClient";

describe("market/marketDataClient", () => {
  it("yfinance.priceSeries() builds the expected URL and unwraps ApiResponseV1", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            source: "yfinance",
            series: [{ date: "2026-02-01", close: 1 }],
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });

    const client = createMarketDataClient({ endpointBase: "https://example.com/", fetch: fetchMock as any });

    const payload = await client.yfinance.priceSeries({ symbol: "SPY", start: "2026-01-01", end: "2026-02-01" });

    expect(payload.series).toEqual([{ date: "2026-02-01", close: 1 }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const calls = fetchMock.mock.calls as unknown as [string | URL, RequestInit?][];
    expect(calls[0]?.[0]).toBe(
      "https://example.com/api/daa/market/yfinance/price-series?symbol=SPY&start=2026-01-01&end=2026-02-01",
    );

    const init = calls[0]?.[1];
    expect(init?.method).toBe("GET");
  });

  it("yahoo.rss() throws a useful error on ApiResponseV1 failures", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({
        ok: false,
        error: {
          code: "VALIDATION_FAILED",
          message: "missing symbol",
        },
      }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    });

    const client = createMarketDataClient({ fetch: fetchMock as any });

    await expect(client.yahoo.rss({ symbol: "" })).rejects.toThrow(/missing symbol/i);
  });
});
