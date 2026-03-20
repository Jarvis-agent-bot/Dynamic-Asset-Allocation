import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/daa/broker/brokerConfig", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/daa/broker/brokerConfig")>();
  return {
    ...actual,
    resolveBrokerRuntimeConfig: vi.fn(),
  };
});

import { resolveBrokerRuntimeConfig } from "@/src/daa/broker/brokerConfig";
import { resolveExecutionRoute } from "@/src/daa/broker/executionGateway";

describe("execution-gateway", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("加密资产会优先路由到 crypto_paper", async () => {
    vi.mocked(resolveBrokerRuntimeConfig).mockResolvedValue({ kind: "ibkr_paper", ibkr: {} } as any);

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

  it("股票资产在启用 IBKR 时会路由到 ibkr_paper", async () => {
    vi.mocked(resolveBrokerRuntimeConfig).mockResolvedValue({
      kind: "ibkr_paper",
      ibkr: {
        connectorBaseUrl: "http://127.0.0.1:8787",
        sharedSecret: null,
        accountId: "DU123456",
      },
    } as any);

    const route = await resolveExecutionRoute({
      symbol: "AAPL",
      market: "US",
      currency: "USD",
      assetClass: "EQUITY",
      instrumentType: "STOCK",
      marketGroup: "US_EQUITY",
    });

    expect(route.kind).toBe("ibkr_paper");
    expect(route.remote).toBe(true);
  });

  it("IBKR 不覆盖的资产会回落到 sim", async () => {
    vi.mocked(resolveBrokerRuntimeConfig).mockResolvedValue({
      kind: "ibkr_paper",
      ibkr: {
        connectorBaseUrl: "http://127.0.0.1:8787",
        sharedSecret: null,
        accountId: "DU123456",
      },
    } as any);

    const route = await resolveExecutionRoute({
      symbol: "DXY",
      market: "GLOBAL",
      currency: "USD",
      assetClass: "INDEX",
      instrumentType: "INDEX",
      marketGroup: "GLOBAL_MACRO",
    });

    expect(route.kind).toBe("sim");
    expect(route.remote).toBe(false);
  });
});
