import { afterEach, describe, expect, it, vi } from "vitest";

import type { appendDaaExternalRequestLog } from "@/src/daa/store/jobStore";
import { createYahooProvider } from "./yahooProvider";

afterEach(() => {
  vi.restoreAllMocks();
});

function jsonResponse(payload: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

type LogInput = Parameters<typeof appendDaaExternalRequestLog>[0];

function createLogRequestMock() {
  return vi.fn(async (input: LogInput) => ({
    id: "log",
    provider: input.provider,
    resource: input.resource,
    subjectKey: input.subjectKey ?? "",
    endpointHost: input.endpointHost ?? "",
    httpStatus: input.httpStatus ?? 0,
    errorCode: input.errorCode ?? "",
    errorMessage: input.errorMessage ?? "",
    latencyMs: input.latencyMs ?? 0,
    retryCount: input.retryCount ?? 0,
    cacheStatus: input.cacheStatus ?? "",
    caller: input.caller ?? "",
    rawRefId: input.rawRefId ?? null,
    createdAt: new Date().toISOString(),
  }));
}

describe("market/yahooProvider", () => {
  it("uses query2 first for chart requests and records the request", async () => {
    const fetchMock = vi.fn(async (_input: string | URL, _init?: RequestInit): Promise<Response> => jsonResponse({
      chart: {
        result: [{
          timestamp: [1778198400],
          indicators: { quote: [{ close: [123] }] },
        }],
        error: null,
      },
    }));
    const logRequest = createLogRequestMock();
    const provider = createYahooProvider({
      fetchFn: fetchMock,
      logRequest,
      minRequestGapMs: 0,
      rateLimitCooldownMs: 0,
    });

    const result = await provider.fetchChart({
      symbol: "AAPL",
      period1: 1,
      period2: 2,
      context: { caller: "test", cacheStatus: "external_fetch" },
    });

    expect(result.endpointHost).toBe("query2.finance.yahoo.com");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("https://query2.finance.yahoo.com/v8/finance/chart/AAPL");
    expect(logRequest).toHaveBeenCalledWith(expect.objectContaining({
      provider: "yahoo",
      resource: "yahoo.chart",
      subjectKey: "AAPL",
      endpointHost: "query2.finance.yahoo.com",
      httpStatus: 200,
      caller: "test",
      cacheStatus: "external_fetch",
    }));
  });

  it("gets cookie and crumb before quoteSummary requests", async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://fc.yahoo.com/") {
        return new Response("", {
          status: 200,
          headers: { "set-cookie": "A3=session-token; Path=/; Domain=.yahoo.com" },
        });
      }
      if (url.includes("/v1/test/getcrumb")) return new Response("crumb-token", { status: 200 });
      expect(url).toContain("crumb=crumb-token");
      expect((init?.headers as Record<string, string>).cookie).toContain("A3=session-token");
      return jsonResponse({ quoteSummary: { result: [{ price: { regularMarketPrice: { raw: 10 } } }], error: null } });
    });
    const provider = createYahooProvider({
      fetchFn: fetchMock,
      logRequest: createLogRequestMock(),
      minRequestGapMs: 0,
      rateLimitCooldownMs: 0,
    });

    await provider.fetchQuoteSummary({
      symbol: "AAPL",
      modules: "price",
      context: { caller: "test" },
    });

    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      "https://fc.yahoo.com/",
      "https://query2.finance.yahoo.com/v1/test/getcrumb",
      expect.stringContaining("https://query2.finance.yahoo.com/v10/finance/quoteSummary/AAPL"),
    ]);
  });

  it("refreshes crumb once after invalid crumb responses", async () => {
    let crumbCounter = 0;
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === "https://fc.yahoo.com/") {
        return new Response("", {
          status: 200,
          headers: { "set-cookie": `A3=session-${crumbCounter}; Path=/; Domain=.yahoo.com` },
        });
      }
      if (url.includes("/v1/test/getcrumb")) {
        crumbCounter += 1;
        return new Response(`crumb-${crumbCounter}`, { status: 200 });
      }
      if (url.includes("crumb=crumb-1")) return new Response("Invalid Crumb", { status: 401 });
      return jsonResponse({ quoteSummary: { result: [{ price: { regularMarketPrice: { raw: 10 } } }], error: null } });
    });
    const provider = createYahooProvider({
      fetchFn: fetchMock,
      logRequest: createLogRequestMock(),
      minRequestGapMs: 0,
      rateLimitCooldownMs: 0,
    });

    const result = await provider.fetchQuoteSummary({ symbol: "AAPL", modules: "price" });

    expect(result.url).toContain("crumb=crumb-2");
    expect(crumbCounter).toBe(2);
  });

  it("falls back to query1 after query2 rate limiting", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("query2.finance.yahoo.com")) return new Response("Too Many Requests", { status: 429 });
      return jsonResponse({
        chart: {
          result: [{ timestamp: [1778198400], indicators: { quote: [{ close: [11] }] } }],
          error: null,
        },
      });
    });
    const logRequest = createLogRequestMock();
    const provider = createYahooProvider({
      fetchFn: fetchMock,
      logRequest,
      minRequestGapMs: 0,
      rateLimitCooldownMs: 0,
    });

    const result = await provider.fetchChart({ symbol: "AAPL", period1: 1, period2: 2 });

    expect(result.endpointHost).toBe("query1.finance.yahoo.com");
    expect(logRequest).toHaveBeenCalledWith(expect.objectContaining({
      endpointHost: "query2.finance.yahoo.com",
      httpStatus: 429,
      errorCode: "rate_limited",
    }));
  });

  it("records Yahoo payload errors as a failed request without a duplicate success log", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      chart: {
        result: null,
        error: { code: "Not Found", description: "No data found" },
      },
    }));
    const logRequest = createLogRequestMock();
    const provider = createYahooProvider({
      fetchFn: fetchMock,
      logRequest,
      minRequestGapMs: 0,
      rateLimitCooldownMs: 0,
    });

    await expect(provider.fetchChart({ symbol: "MISSING", period1: 1, period2: 2 })).rejects.toThrow("No data found");

    expect(logRequest).toHaveBeenCalledTimes(1);
    expect(logRequest).toHaveBeenCalledWith(expect.objectContaining({
      provider: "yahoo",
      resource: "yahoo.chart",
      subjectKey: "MISSING",
      httpStatus: 200,
      errorCode: "Not Found",
      errorMessage: "No data found",
    }));
  });

  it("does not require crumb for fundamentals-timeseries requests", async () => {
    const fetchMock = vi.fn(async (_input: string | URL, _init?: RequestInit): Promise<Response> => jsonResponse({
      timeseries: { result: [] },
    }));
    const provider = createYahooProvider({
      fetchFn: fetchMock,
      logRequest: createLogRequestMock(),
      minRequestGapMs: 0,
      rateLimitCooldownMs: 0,
    });

    await provider.fetchFundamentalsTimeseries({
      symbol: "AAPL",
      types: ["trailingPeRatio"],
      period1: 1,
      period2: 2,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/ws/fundamentals-timeseries/");
  });
});
