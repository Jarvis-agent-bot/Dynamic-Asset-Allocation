import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/daa/modules/workbench/workbenchReadService", () => ({
  buildWorkbenchBootstrap: vi.fn(),
}));

vi.mock("@/src/daa/store/daaStorePg", () => ({
  getDaaRebalanceCycle: vi.fn(),
  getDaaSystemConfig: vi.fn(),
}));

vi.mock("@/src/daa/modules/workbench/correlationService", () => ({
  computeCorrelationMatrix: vi.fn(),
}));

import { buildAssetUniverseView, buildSystemConfigRow, buildWorkbenchBootstrap as buildBootstrapFixture } from "@/src/daa/__tests__/testDataFactories";
import { computeCorrelationMatrix } from "@/src/daa/modules/workbench/correlationService";
import { buildWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";
import { validateExecutionRisk } from "@/src/daa/modules/workbench/workbenchExecutionService";
import { getDaaRebalanceCycle, getDaaSystemConfig } from "@/src/daa/store/daaStorePg";

describe("validateExecutionRisk", () => {
  beforeEach(() => {
    vi.mocked(buildWorkbenchBootstrap).mockReset();
    vi.mocked(getDaaRebalanceCycle).mockReset();
    vi.mocked(getDaaSystemConfig).mockReset();
    vi.mocked(computeCorrelationMatrix).mockReset();
  });

  it("cycle 风控校验会补齐 correlation 项", async () => {
    vi.mocked(buildWorkbenchBootstrap).mockResolvedValue(buildBootstrapFixture({
      account: {
        cash: 1800,
        investableCash: 1800,
        frozenCash: 0,
        totalEquity: 2000,
      },
      assetUniverse: [
        buildAssetUniverseView({
          assetKey: "US::AAPL",
          symbol: "AAPL",
          holdingQty: 1,
          valuationBase: 100,
          actualWeightPct: 5,
          targetWeightPct: 10,
          watchEnabled: true,
        }),
        buildAssetUniverseView({
          assetKey: "US::MSFT",
          symbol: "MSFT",
          holdingQty: 1,
          valuationBase: 100,
          actualWeightPct: 5,
          targetWeightPct: 10,
          watchEnabled: true,
        }),
      ],
    }) as Awaited<ReturnType<typeof buildWorkbenchBootstrap>>);
    vi.mocked(getDaaSystemConfig).mockResolvedValue(buildSystemConfigRow({
      strategy: {
        constraints: {
          maxPositionPct: 0.5,
          maxOrderPctOfNav: 0.5,
        },
        risk: {
          perAssetStopLossPct: 0.3,
          maxConcentrationPct: 100,
          correlationCapPct: 0.6,
        },
      },
    }));
    vi.mocked(getDaaRebalanceCycle).mockResolvedValue({
      cycleId: "cycle-1",
      proposals: [
        {
          assetKey: "US::AAPL",
          symbol: "AAPL",
          currency: "USD",
          fxRateToBase: 1,
          side: "BUY",
          suggestedQty: 1,
          suggestedNotional: 100,
          price: 100,
          reason: "test proposal",
          selected: true,
          hfContribution: null,
        },
      ],
    } as Awaited<ReturnType<typeof getDaaRebalanceCycle>>);
    vi.mocked(computeCorrelationMatrix).mockResolvedValue({
      maxCorrelation: 0.9,
      avgCorrelation: 0.65,
      maxCorrelationPair: { symbolA: "AAPL", symbolB: "MSFT" },
      highCorrelationCount: 1,
      assetCount: 2,
      pairs: [],
    } as Awaited<ReturnType<typeof computeCorrelationMatrix>>);

    const riskCheck = await validateExecutionRisk({
      cycleId: "cycle-1",
      selectedAssetSideKeys: ["US::AAPL::BUY"],
    });

    const correlationItem = riskCheck.items.find((item) => item.rule === "correlation");
    expect(correlationItem).toMatchObject({
      status: "warn",
      current: 90,
      limit: 60,
    });
    expect(correlationItem?.message).toContain("AAPL/MSFT");
    expect(riskCheck.overallStatus).toBe("warn");
  });

  it("手动买卖预览也会补齐 correlation 项", async () => {
    vi.mocked(buildWorkbenchBootstrap).mockResolvedValue(buildBootstrapFixture({
      account: {
        cash: 1800,
        investableCash: 1800,
        frozenCash: 0,
        totalEquity: 2000,
      },
      assetUniverse: [
        buildAssetUniverseView({
          assetKey: "US::AAPL",
          symbol: "AAPL",
          holdingQty: 1,
          valuationBase: 100,
          actualWeightPct: 5,
          targetWeightPct: 10,
          watchEnabled: true,
        }),
        buildAssetUniverseView({
          assetKey: "US::MSFT",
          symbol: "MSFT",
          holdingQty: 1,
          valuationBase: 100,
          actualWeightPct: 5,
          targetWeightPct: 10,
          watchEnabled: true,
        }),
      ],
    }) as Awaited<ReturnType<typeof buildWorkbenchBootstrap>>);
    vi.mocked(getDaaSystemConfig).mockResolvedValue(buildSystemConfigRow({
      strategy: {
        constraints: {
          maxPositionPct: 0.5,
          maxOrderPctOfNav: 0.5,
        },
        risk: {
          perAssetStopLossPct: 0.3,
          maxConcentrationPct: 100,
          correlationCapPct: 0.6,
        },
      },
    }));
    vi.mocked(computeCorrelationMatrix).mockResolvedValue({
      maxCorrelation: 0.9,
      avgCorrelation: 0.65,
      maxCorrelationPair: { symbolA: "AAPL", symbolB: "MSFT" },
      highCorrelationCount: 1,
      assetCount: 2,
      pairs: [],
    } as Awaited<ReturnType<typeof computeCorrelationMatrix>>);

    const riskCheck = await validateExecutionRisk({
      manualProposal: {
        assetKey: "US::AAPL",
        symbol: "AAPL",
        currency: "USD",
        side: "BUY",
        suggestedQty: 1,
        suggestedNotional: 100,
        price: 100,
        reason: "manual preview",
      },
    });

    const correlationItem = riskCheck.items.find((item) => item.rule === "correlation");
    expect(correlationItem).toMatchObject({
      status: "warn",
      current: 90,
      limit: 60,
    });
    expect(correlationItem?.message).toContain("AAPL/MSFT");
    expect(riskCheck.overallStatus).toBe("warn");
  });
});
