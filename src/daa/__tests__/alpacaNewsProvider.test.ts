import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/daa/config/secretsManager", () => ({
  resolveSecret: vi.fn(async (key: string) => {
    if (key === "alpaca_api_key_id") return "TEST_KEY";
    if (key === "alpaca_api_secret_key") return "TEST_SECRET";
    return "";
  }),
}));

import { alpacaNewsProvider } from "@/src/daa/signals/providers/alpacaNews";

describe("alpacaNewsProvider", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("returns empty on missing credentials", async () => {
    const { resolveSecret } = await import("@/src/daa/config/secretsManager");
    (resolveSecret as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce("").mockResolvedValueOnce("");
    const items = await alpacaNewsProvider.fetchNews("AAPL");
    expect(items).toEqual([]);
  });

  it("normalizes Alpaca REST payload and fills defaults", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        news: [
          {
            id: 111,
            headline: "Apple beats Q3",
            summary: "Strong iPhone sales",
            url: "https://example.com/a",
            created_at: "2026-04-19T12:00:00Z",
            symbols: ["AAPL"],
            source: "benzinga",
          },
          { id: 222 }, // missing headline → filtered
        ],
      }),
    } as Response);

    const items = await alpacaNewsProvider.fetchNews("AAPL");
    expect(items).toHaveLength(1);
    const [first] = items;
    expect(first.title).toBe("Apple beats Q3");
    expect(first.link).toBe("https://example.com/a");
    expect(first.publishedAt).toBe("2026-04-19T12:00:00Z");
    expect(first.source).toBe("benzinga");
    expect(first.provider).toBe("alpaca");
    expect(first.symbols).toEqual(["AAPL"]);
  });

  it("falls back to given symbol when payload lacks symbols", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        news: [
          {
            id: 333,
            headline: "Market news",
            created_at: "2026-04-19T12:00:00Z",
          },
        ],
      }),
    } as Response);

    const items = await alpacaNewsProvider.fetchNews("NVDA");
    expect(items[0].symbols).toEqual(["NVDA"]);
    expect(items[0].source).toBe("benzinga"); // default
  });

  it("returns empty on HTTP 429/403 without throwing", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    } as Response);

    const items = await alpacaNewsProvider.fetchNews("AAPL");
    expect(items).toEqual([]);
  });

  it("returns empty on network failure (swallow)", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("DNS fail"));
    const items = await alpacaNewsProvider.fetchNews("AAPL");
    expect(items).toEqual([]);
  });

  it("sends Alpaca auth headers", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ news: [] }),
    } as Response);

    await alpacaNewsProvider.fetchNews("TSLA");

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const lastCall = fetchMock.mock.calls[0];
    const url = String(lastCall[0]);
    const init = lastCall[1] as RequestInit;
    expect(url).toContain("data.alpaca.markets/v1beta1/news");
    expect(url).toContain("symbols=TSLA");
    const headers = init.headers as Record<string, string>;
    expect(headers["APCA-API-KEY-ID"]).toBe("TEST_KEY");
    expect(headers["APCA-API-SECRET-KEY"]).toBe("TEST_SECRET");
  });
});
