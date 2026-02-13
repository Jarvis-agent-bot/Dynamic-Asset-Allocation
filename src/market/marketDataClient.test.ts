import { describe, expect, it, vi } from "vitest";

import { createMarketDataClient } from "./marketDataClient";

describe("market/marketDataClient", () => {
  it("yfinance.priceSeries() builds the expected URL (with endpointBase)", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({ ok: true, series: [{ date: "2026-02-01", close: 1 }] }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });

    const client = createMarketDataClient({ endpointBase: "https://example.com/", fetch: fetchMock as any });

    await client.yfinance.priceSeries({ symbol: "SPY", start: "2026-01-01", end: "2026-02-01" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://example.com/api/daa/market/yfinance/price-series?symbol=SPY&start=2026-01-01&end=2026-02-01",
    );

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("GET");
  });

  it("yahoo.rss() throws a useful error on non-2xx responses", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ error: "missing symbol" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    });

    const client = createMarketDataClient({ fetch: fetchMock as any });

    await expect(client.yahoo.rss({ symbol: "" })).rejects.toThrow(/missing symbol/i);
  });
});
