import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { proxyToEngine, proxyToEngineJson } from "../proxyToEngine";

describe("daa/proxyToEngine", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env.DAA_ENGINE_BASE_URL;

  beforeEach(() => {
    vi.useFakeTimers();
    process.env.DAA_ENGINE_BASE_URL = "https://engine.test";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();

    if (originalEnv === undefined) delete process.env.DAA_ENGINE_BASE_URL;
    else process.env.DAA_ENGINE_BASE_URL = originalEnv;
  });

  it("returns 500 with a clear error when DAA_ENGINE_BASE_URL is missing", async () => {
    delete process.env.DAA_ENGINE_BASE_URL;

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const resp = await proxyToEngine({
      upstreamPath: "/daa-api/health",
      method: "GET",
      timeoutMs: 123,
      fallbackContentType: "text/plain; charset=utf-8",
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(resp.status).toBe(500);
    await expect(resp.json()).resolves.toMatchObject({
      error: "missing DAA_ENGINE_BASE_URL",
      upstreamPath: "/daa-api/health",
    });
  });

  it("treats blank DAA_ENGINE_BASE_URL as missing config", async () => {
    process.env.DAA_ENGINE_BASE_URL = "   ";

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const resp = await proxyToEngineJson({
      upstreamPath: "/daa-api/health",
      method: "GET",
      timeoutMs: 123,
      fallbackContentType: "application/json",
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(resp.status).toBe(500);
    await expect(resp.json()).resolves.toMatchObject({
      error: "missing DAA_ENGINE_BASE_URL",
      upstreamPath: "/daa-api/health",
    });
  });

  it("normalizes trailing slash in DAA_ENGINE_BASE_URL before proxy fetch", async () => {
    process.env.DAA_ENGINE_BASE_URL = "https://engine.test/";

    const fetchSpy = vi.fn(async () => {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchSpy;

    const resp = await proxyToEngineJson({
      upstreamPath: "/daa-api/health",
      method: "GET",
      timeoutMs: 123,
      fallbackContentType: "application/json",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect((fetchSpy as any).mock.calls[0]?.[0]).toBe("https://engine.test/daa-api/health");
    expect(resp.status).toBe(200);
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

  it("proxyToEngineJson parses JSON and preserves upstream status", async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const resp = await proxyToEngineJson({
      upstreamPath: "/daa-api/health",
      method: "GET",
      timeoutMs: 10_000,
      fallbackContentType: "application/json",
    });

    expect(resp.status).toBe(201);
    await expect(resp.json()).resolves.toMatchObject({ ok: true });
  });

  it("proxyToEngineJson returns 502 when upstream JSON is invalid", async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response("not-json", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const resp = await proxyToEngineJson({
      upstreamPath: "/daa-api/health",
      method: "GET",
      timeoutMs: 10_000,
      fallbackContentType: "application/json",
    });

    expect(resp.status).toBe(502);
    await expect(resp.json()).resolves.toMatchObject({ ok: false, error: "invalid upstream json" });
  });

  it("proxyToEngineJson returns 502 when validate() fails", async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ ok: "not-a-bool" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const resp = await proxyToEngineJson({
      upstreamPath: "/daa-api/health",
      method: "GET",
      timeoutMs: 10_000,
      fallbackContentType: "application/json",
      validate: (v: unknown): v is { ok: true } => typeof v === "object" && v !== null && (v as any).ok === true,
    });

    expect(resp.status).toBe(502);
    await expect(resp.json()).resolves.toMatchObject({ ok: false, error: "upstream response contract mismatch" });
  });

  it("forwards abortSignal to the upstream fetch", async () => {
    globalThis.fetch = vi.fn(((_url: any, init: any) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => {
            reject({ name: "AbortError" });
          },
          { once: true },
        );
      });
    }) as any) as unknown as typeof fetch;

    const ac = new AbortController();

    const p = proxyToEngine({
      upstreamPath: "/daa-api/health",
      method: "GET",
      timeoutMs: 10_000,
      fallbackContentType: "text/plain; charset=utf-8",
      abortSignal: ac.signal,
    });

    ac.abort();

    const resp = await p;

    expect(resp.status).toBe(504);
    await expect(resp.json()).resolves.toMatchObject({
      error: "upstream timeout",
      upstream: expect.any(String),
    });
  });
});
