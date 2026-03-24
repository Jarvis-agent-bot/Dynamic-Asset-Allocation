import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetPgMemRuntime } from "@/src/daa/__tests__/pgMemTestUtils";

vi.mock("@/src/daa/modules/workbench/decisionFusion", async () => {
  const actual = await vi.importActual<typeof import("@/src/daa/modules/workbench/decisionFusion")>(
    "@/src/daa/modules/workbench/decisionFusion",
  );
  return {
    ...actual,
    fuseDecision: vi.fn((input: Parameters<typeof actual.fuseDecision>[0]) => ({
      proposals: input.draftProposals.map((proposal) => ({
        ...proposal,
        suggestedQty: proposal.suggestedQty * 0.7,
        suggestedNotional: proposal.suggestedNotional * 0.7,
        decisionContext: {
          driftReason: proposal.reason,
          signalAction: null,
          signalScore: null,
          signalConfidence: null,
          signalConflict: false,
          llmAdjustment: null,
          llmConfidence: null,
          llmRationale: null,
          marketRegime: null,
          ruleBasedMarketRegime: null,
          llmMarketRegime: null,
          effectiveMarketRegime: null,
          marketScope: null,
          marketScopeLabel: null,
          marketIndicatorFlags: [],
          conflictFlags: ["mock scale 70%"],
          finalQtyMultiplier: 0.7,
        },
      })),
      marketRegime: null,
      overallConfidence: 0.7,
      fusionWarnings: [],
      llmStatus: "skipped",
      llmSummary: "mocked fusion",
    })),
  };
});

import {
  createDaaRebalanceCycle,
  getDaaRebalanceCycle,
  getDaaSystemConfig,
  saveDaaSystemConfig,
  upsertDaaAssetUniverseRow,
} from "@/src/daa/store/daaStorePg";
import {
  generateWorkbenchRebalanceCycle,
  updateWorkbenchRebalanceCycle,
} from "@/src/daa/modules/workbench/workbenchRebalanceCycleService";

describe("workbench-risk-consistency-v1", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    resetPgMemRuntime();

    const current = await getDaaSystemConfig();
    await saveDaaSystemConfig({
      baseVersion: current.version,
      config: {
        ...current.config,
        strategy: {
          ...current.config.strategy,
          account: {
            ...current.config.strategy.account,
            baseCurrency: "USD",
            cash: 10000,
            frozenCash: 0,
            investableCash: 10000,
          },
          targetWeights: {},
        },
      },
    });
  });

  it("生成周期时应按融合后的建议金额计算单日交易占比", async () => {
    await upsertDaaAssetUniverseRow({
      symbol: "AAPL",
      market: "US",
      currency: "USD",
      assetClass: "EQUITY",
      region: "US",
      exchange: "NASDAQ",
      instrumentType: "STOCK",
      marketGroup: "US_EQUITY",
      watchEnabled: true,
      targetWeightHint: 0.2,
      lastPrice: 100,
    });

    const generated = await generateWorkbenchRebalanceCycle({
      triggerSource: "manual",
      triggerReason: "risk consistency",
      manual: true,
    });

    expect(generated.created).toBe(true);
    expect(generated.cycle?.proposals[0]?.suggestedNotional).toBeCloseTo(1400, 6);
    const maxOrderItem = generated.cycle?.riskCheck.items.find((item) => item.rule === "max_order_pct");
    expect(maxOrderItem?.current).toBeCloseTo(14, 6);
    expect(maxOrderItem?.message).toContain("14.00%");

    const stored = generated.cycle ? await getDaaRebalanceCycle(generated.cycle.cycleId) : null;
    const storedMaxOrderItem = stored?.riskCheck.items.find((item) => item.rule === "max_order_pct");
    expect(storedMaxOrderItem?.current).toBeCloseTo(14, 6);
  }, 15000);

  it("更新勾选后应持久化最新风险检查，避免刷新后口径回退", async () => {
    await upsertDaaAssetUniverseRow({
      symbol: "AAPL",
      market: "US",
      currency: "USD",
      assetClass: "EQUITY",
      region: "US",
      exchange: "NASDAQ",
      instrumentType: "STOCK",
      marketGroup: "US_EQUITY",
      watchEnabled: true,
      targetWeightHint: 0.2,
      lastPrice: 100,
    });

    const cycle = await createDaaRebalanceCycle({
      status: "generated",
      triggerSource: "manual",
      triggerReason: "stale risk check",
      equitySnapshot: 10000,
      driftSnapshot: [],
      proposals: [
        {
          assetKey: "US::AAPL",
          symbol: "AAPL",
          currency: "USD",
          fxRateToBase: 1,
          side: "BUY",
          suggestedQty: 14,
          suggestedNotional: 1400,
          price: 100,
          reason: "mock scaled proposal",
          selected: true,
          hfContribution: null,
        },
      ],
      riskCheck: {
        overallStatus: "warn",
        items: [
          {
            rule: "max_order_pct",
            status: "warn",
            current: 20,
            limit: 10,
            message: "单日交易占比 20.00% 超过阈值 10.00%",
          },
        ],
      },
    });

    const updated = await updateWorkbenchRebalanceCycle(cycle.cycleId, {
      selectedSymbols: ["AAPL"],
    });

    const maxOrderItem = updated.riskCheck.items.find((item) => item.rule === "max_order_pct");
    expect(maxOrderItem?.current).toBeCloseTo(14, 6);
    expect(maxOrderItem?.message).toContain("14.00%");

    const stored = await getDaaRebalanceCycle(cycle.cycleId);
    const storedMaxOrderItem = stored?.riskCheck.items.find((item) => item.rule === "max_order_pct");
    expect(storedMaxOrderItem?.current).toBeCloseTo(14, 6);
  });

  it("高目标权重资产在实际成交后未超限时，不应继续按目标权重阻断执行", async () => {
    await upsertDaaAssetUniverseRow({
      symbol: "AAPL",
      market: "US",
      currency: "USD",
      assetClass: "EQUITY",
      region: "US",
      exchange: "NASDAQ",
      instrumentType: "STOCK",
      marketGroup: "US_EQUITY",
      watchEnabled: true,
      targetWeightHint: 0.0124,
      lastPrice: 248.96,
    });
    await upsertDaaAssetUniverseRow({
      symbol: "BND",
      market: "US",
      currency: "USD",
      assetClass: "BOND",
      region: "US",
      exchange: "NASDAQ",
      instrumentType: "ETF",
      marketGroup: "US_BOND",
      watchEnabled: true,
      targetWeightHint: 0.7424,
      lastPrice: 73.76,
    });

    const current = await getDaaSystemConfig();
    await saveDaaSystemConfig({
      baseVersion: current.version,
      config: {
        ...current.config,
        strategy: {
          ...current.config.strategy,
          account: {
            ...current.config.strategy.account,
            baseCurrency: "USD",
            cash: 923.89,
            frozenCash: 0,
            investableCash: 923.89,
          },
          targetWeights: {},
        },
      },
    });

    const cycle = await createDaaRebalanceCycle({
      status: "generated",
      triggerSource: "manual",
      triggerReason: "selection scoped risk",
      equitySnapshot: 923.89,
      driftSnapshot: [],
      proposals: [
        {
          assetKey: "US::AAPL",
          symbol: "AAPL",
          currency: "USD",
          fxRateToBase: 1,
          side: "BUY",
          suggestedQty: 0.0112,
          suggestedNotional: 2.8,
          price: 248.96,
          reason: "small starter position",
          selected: true,
          hfContribution: null,
        },
        {
          assetKey: "US::BND",
          symbol: "BND",
          currency: "USD",
          fxRateToBase: 1,
          side: "BUY",
          suggestedQty: 3.5801,
          suggestedNotional: 264.07,
          price: 73.76,
          reason: "reduced allocation after market scaling",
          selected: true,
          hfContribution: null,
        },
      ],
      riskCheck: {
        overallStatus: "block",
        items: [
          {
            rule: "max_position",
            status: "block",
            current: 74.24,
            limit: 30,
            message: "BND 目标权重 74.24% 超过上限 30.00%",
          },
        ],
      },
    });

    const updated = await updateWorkbenchRebalanceCycle(cycle.cycleId, {
      selectedSymbols: ["AAPL", "BND"],
    });

    expect(updated.riskCheck.overallStatus).not.toBe("block");
    const maxPositionItem = updated.riskCheck.items.find((item) => item.rule === "max_position");
    expect(maxPositionItem?.status).toBe("pass");
    expect(maxPositionItem?.message).toContain("交易后仓位");
    expect(updated.riskCheck.items.some((item) => item.message.includes("目标权重"))).toBe(false);

    const stored = await getDaaRebalanceCycle(cycle.cycleId);
    expect(stored?.riskCheck.overallStatus).not.toBe("block");
    expect(stored?.riskCheck.items.some((item) => item.message.includes("目标权重"))).toBe(false);
  });
});
