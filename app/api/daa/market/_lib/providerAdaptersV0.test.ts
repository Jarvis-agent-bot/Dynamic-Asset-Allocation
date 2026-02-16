import { describe, expect, it } from "vitest";

import { clampLimitV0, parseXueqiuCookieV0, ProviderAdapterError } from "./providerAdaptersV0";

describe("providerAdaptersV0", () => {
  it("clamps list limits into a safe positive range", () => {
    expect(clampLimitV0(null)).toBe(50);
    expect(clampLimitV0("0")).toBe(50);
    expect(clampLimitV0("12.9")).toBe(12);
    expect(clampLimitV0("999")).toBe(200);
  });

  it("accepts a bare xueqiu token and converts it into a cookie", () => {
    expect(parseXueqiuCookieV0("token123")).toBe("xq_a_token=token123");
  });

  it("keeps only xq_a_token/u cookie keys for xueqiu", () => {
    const cookie = parseXueqiuCookieV0("foo=bar; xq_a_token=abc ; u=42 ; x=1");
    expect(cookie).toBe("xq_a_token=abc; u=42");
  });

  it("fails for malformed xueqiu cookie input", () => {
    expect(() => parseXueqiuCookieV0("a=b;c=d")).toThrow(ProviderAdapterError);
  });
});
