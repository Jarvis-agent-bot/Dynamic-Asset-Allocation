import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveExecutionRoute } from "@/src/daa/broker/executionRouting";

describe("execution-routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("加密资产会优先路由到 crypto_paper", async () => {
    const route = await resolveExecutionRoute({
      symbol: "BTC-USD",
      market: "CRYPTO",
      currency: "USD",
      assetClass: "CRYPTO",
      instrumentType: "CRYPTO",
      marketGroup: "CRYPTO",
    });

    expect(route.kind).toBe("crypto_paper");
    expect(route.remote).toBe(false);
  });

  it("非加密资产会回落到 sim", async () => {
    const route = await resolveExecutionRoute({
      symbol: "AAPL",
      market: "US",
      currency: "USD",
      assetClass: "EQUITY",
      instrumentType: "STOCK",
      marketGroup: "US_EQUITY",
    });

    expect(route.kind).toBe("sim");
    expect(route.remote).toBe(false);
  });
});
