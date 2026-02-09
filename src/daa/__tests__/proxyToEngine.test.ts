import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { proxyToEngine } from "../proxyToEngine";

describe("daa/proxyToEngine", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("maps AbortError to a 504 upstream timeout JSON", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw { name: "AbortError" };
    }) as unknown as typeof fetch;

    const resp = await proxyToEngine({
      upstreamPath: "/daa-api/health",
      method: "GET",
      timeoutMs: 123,
      fallbackContentType: "text/plain; charset=utf-8",
    });

    expect(resp.status).toBe(504);
    await expect(resp.json()).resolves.toMatchObject({
      error: "upstream timeout",
      upstream: expect.any(String),
      timeoutMs: 123,
    });
  });

  it("maps other fetch errors to a 502 upstream fetch failed JSON", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("dns lookup failed");
    }) as unknown as typeof fetch;

    const resp = await proxyToEngine({
      upstreamPath: "/daa-api/health",
      method: "GET",
      timeoutMs: 123,
      fallbackContentType: "text/plain; charset=utf-8",
    });

    expect(resp.status).toBe(502);
    await expect(resp.json()).resolves.toMatchObject({
      error: "upstream fetch failed",
      upstream: expect.any(String),
      message: "dns lookup failed",
    });
  });

  it("passes through upstream response body + status + content-type", async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response("OK", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    }) as unknown as typeof fetch;

    const resp = await proxyToEngine({
      upstreamPath: "/daa-api/health",
      method: "GET",
      timeoutMs: 10_000,
      fallbackContentType: "application/json",
    });

    expect(resp.status).toBe(200);
    expect(resp.headers.get("content-type")).toBe("text/plain");
    await expect(resp.text()).resolves.toBe("OK");
  });
});
