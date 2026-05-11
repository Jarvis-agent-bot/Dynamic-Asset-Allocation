import { describe, expect, it, vi } from "vitest";

import { createMarketDataClient } from "./marketDataClient";

describe("market/marketDataClient", () => {
  it("yfinance.priceSeries() builds the expected URL and unwraps ApiResponse", async () => {
    const fetchMock = vi.fn(async (_input: string | URL, _init?: RequestInit): Promise<Response> => {
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

    const client = createMarketDataClient({ endpointBase: "https://example.com/", fetch: fetchMock });

    const payload = await client.yfinance.priceSeries({ symbol: "SPY", start: "2026-01-01", end: "2026-02-01" });

    expect(payload.series).toEqual([{ date: "2026-02-01", close: 1 }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall?.[0]).toBe(
      "https://example.com/api/daa/market/yfinance/price-series?symbol=SPY&start=2026-01-01&end=2026-02-01",
    );

    const init = firstCall?.[1];
    expect(init?.method).toBe("GET");
  });

  it("yahoo.rss() throws a useful error on ApiResponse failures", async () => {
    const fetchMock = vi.fn(async (_input: string | URL, _init?: RequestInit): Promise<Response> => {
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

    const client = createMarketDataClient({ fetch: fetchMock });

    await expect(client.yahoo.rss({ symbol: "" })).rejects.toThrow(/missing symbol/i);
  });

  it("merges default headers into internal provider requests", async () => {
    const fetchMock = vi.fn(async (_input: string | URL, _init?: RequestInit): Promise<Response> => new Response(JSON.stringify({
      ok: true,
      data: {
        source: "yfinance",
        series: [{ date: "2026-02-01", close: 1 }],
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));

    const client = createMarketDataClient({
      endpointBase: "https://example.com",
      fetch: fetchMock,
      headers: { cookie: "daa_session=abc", authorization: "Bearer token-1" },
    });

    await client.yfinance.priceSeries({ symbol: "QQQ" });

    const init = fetchMock.mock.calls[0]?.[1];
    const headers = new Headers(init?.headers);
    expect(headers.get("cookie")).toBe("daa_session=abc");
    expect(headers.get("authorization")).toBe("Bearer token-1");
  });
});
