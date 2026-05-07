import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildAssetUniverseView, buildWorkbenchBootstrap as buildBootstrapFixture } from "@/src/daa/__tests__/testDataFactories";

const mocks = vi.hoisted(() => ({
  registerTool: vi.fn(),
  rebalanceCore: vi.fn(),
  buildWorkbenchBootstrap: vi.fn(),
  logSwallowed: vi.fn(),
}));

vi.mock("@/src/daa/agent/tools/registry", () => ({
  registerTool: mocks.registerTool,
}));

vi.mock("@/src/core/rebalanceCore", () => ({
  rebalanceCore: mocks.rebalanceCore,
}));

vi.mock("@/src/daa/modules/workbench/workbenchReadService", () => ({
  buildWorkbenchBootstrap: mocks.buildWorkbenchBootstrap,
}));

vi.mock("@/src/daa/utils/logSwallowed", () => ({
  logSwallowed: mocks.logSwallowed,
}));

describe("simulate_rebalance tool", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.registerTool.mockReset();
    mocks.rebalanceCore.mockReset();
    mocks.buildWorkbenchBootstrap.mockReset();
    mocks.logSwallowed.mockReset();
  });

  it("使用 workbench 的有效目标权重，而不是旧的 targetWeightHint 推断", async () => {
    mocks.buildWorkbenchBootstrap.mockResolvedValue(buildBootstrapFixture({
      account: {
        cash: 250,
        investableCash: 250,
        frozenCash: 0,
        totalEquity: 1000,
      },
      assetUniverse: [
        buildAssetUniverseView({
          assetKey: "US::AAPL",
          symbol: "AAPL",
          holdingQty: 2,
          lastPrice: 110,
          holdingPrice: 100,
          targetWeightHint: 0.6,
          targetWeightPct: 25,
        }),
        buildAssetUniverseView({
          assetKey: "US::MSFT",
          symbol: "MSFT",
          holdingQty: 0,
          lastPrice: 90,
          holdingPrice: 90,
          targetWeightHint: 0.8,
          targetWeightPct: 10,
        }),
      ],
    }));
    mocks.rebalanceCore.mockReturnValue({
      trigger: {
        shouldRebalance: true,
        reasons: ["drift"],
      },
      orders: [
        {
          symbol: "AAPL",
          side: "BUY",
          notional: 120,
        },
      ],
      warnings: [],
    });

    await import("@/src/daa/agent/tools/analyze/simulateRebalance");
    const executor = mocks.registerTool.mock.calls[0]?.[1];

    expect(typeof executor).toBe("function");

    const result = await executor({}, { market: null, portfolio: null });

    expect(mocks.rebalanceCore).toHaveBeenCalledWith(expect.objectContaining({
      account: {
        cash: 250,
        totalEquity: 1000,
      },
      holdings: {
        AAPL: 2,
      },
      prices: {
        AAPL: 110,
        MSFT: 90,
      },
      targetWeights: {
        AAPL: 0.25,
        MSFT: 0.1,
      },
    }));
    expect(result.success).toBe(true);
    expect(result.outputFields).toMatchObject({
      shouldRebalance: true,
      orderCount: 1,
      totalTurnover: 120,
    });
  });
});
