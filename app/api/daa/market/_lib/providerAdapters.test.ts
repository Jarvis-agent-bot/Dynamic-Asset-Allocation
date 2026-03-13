import { describe, expect, it } from "vitest";

import { clampLimit, parseXueqiuCookie, ProviderAdapterError } from "./providerAdapters";

describe("providerAdapters", () => {
  it("clamps list limits into a safe positive range", () => {
    expect(clampLimit(null)).toBe(50);
    expect(clampLimit("0")).toBe(50);
    expect(clampLimit("12.9")).toBe(12);
    expect(clampLimit("999")).toBe(200);
  });

  it("accepts a bare xueqiu token and converts it into a cookie", () => {
    expect(parseXueqiuCookie("token123")).toBe("xq_a_token=token123");
  });

  it("keeps only xq_a_token/u cookie keys for xueqiu", () => {
    const cookie = parseXueqiuCookie("foo=bar; xq_a_token=abc ; u=42 ; x=1");
    expect(cookie).toBe("xq_a_token=abc; u=42");
  });

  it("fails for malformed xueqiu cookie input", () => {
    expect(() => parseXueqiuCookie("a=b;c=d")).toThrow(ProviderAdapterError);
  });
});
