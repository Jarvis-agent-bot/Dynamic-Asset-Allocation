import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/daa/modules/workbench/decisionFusionV2", async () => {
  const actual = await vi.importActual<typeof import("@/src/daa/modules/workbench/decisionFusionV2")>(
    "@/src/daa/modules/workbench/decisionFusionV2",
  );
  return {
    ...actual,
    fuseDecisionV2: vi.fn((input: import("@/src/daa/modules/workbench/decisionFusionV2").DecisionFusionInputV2) => ({
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
  createDaaRebalanceCycleV1,
  getDaaRebalanceCycleV1,
  getDaaSystemConfigV2,
  saveDaaSystemConfigV2,
  upsertDaaAssetUniverseRowV1,
} from "@/src/daa/store/daaStorePgV1";
import {
  generateWorkbenchRebalanceCycleV1,
  updateWorkbenchRebalanceCycleV1,
} from "@/src/daa/modules/workbench/workbenchServiceV1";

const PG_GLOBAL_KEY = "__daa_pg_state_v0__";
const STORE_GLOBAL_KEY = "__daa_store_pg_state_v0__";

function resetPgMemRuntimeV1() {
  process.env.DAA_PG_MEM = "1";
  delete process.env.DAA_DB_URL;
  delete process.env.DATABASE_URL;
  delete (globalThis as any)[PG_GLOBAL_KEY];
  delete (globalThis as any)[STORE_GLOBAL_KEY];
}

describe("workbench-risk-consistency-v1", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    resetPgMemRuntimeV1();

    const current = await getDaaSystemConfigV2();
    await saveDaaSystemConfigV2({
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
    await upsertDaaAssetUniverseRowV1({
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

    const generated = await generateWorkbenchRebalanceCycleV1({
      triggerSource: "manual",
      triggerReason: "risk consistency",
      manual: true,
    });

    expect(generated.created).toBe(true);
    expect(generated.cycle?.proposals[0]?.suggestedNotional).toBeCloseTo(1400, 6);
    const maxOrderItem = generated.cycle?.riskCheck.items.find((item) => item.rule === "max_order_pct");
    expect(maxOrderItem?.current).toBeCloseTo(14, 6);
    expect(maxOrderItem?.message).toContain("14.00%");

    const stored = generated.cycle ? await getDaaRebalanceCycleV1(generated.cycle.cycleId) : null;
    const storedMaxOrderItem = stored?.riskCheck.items.find((item) => item.rule === "max_order_pct");
    expect(storedMaxOrderItem?.current).toBeCloseTo(14, 6);
  });

  it("更新勾选后应持久化最新风险检查，避免刷新后口径回退", async () => {
    await upsertDaaAssetUniverseRowV1({
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

    const cycle = await createDaaRebalanceCycleV1({
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

    const updated = await updateWorkbenchRebalanceCycleV1(cycle.cycleId, {
      selectedSymbols: ["AAPL"],
    });

    const maxOrderItem = updated.riskCheck.items.find((item) => item.rule === "max_order_pct");
    expect(maxOrderItem?.current).toBeCloseTo(14, 6);
    expect(maxOrderItem?.message).toContain("14.00%");

    const stored = await getDaaRebalanceCycleV1(cycle.cycleId);
    const storedMaxOrderItem = stored?.riskCheck.items.find((item) => item.rule === "max_order_pct");
    expect(storedMaxOrderItem?.current).toBeCloseTo(14, 6);
  });
});
