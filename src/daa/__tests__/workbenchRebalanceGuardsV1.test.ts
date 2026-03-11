import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateWorkbenchRebalanceCycleV1 } from "@/src/daa/modules/workbench/workbenchRebalanceCycleServiceV1";

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminViewerAuth: vi.fn(async () => null),
  requireDaaAdminEditorAuth: vi.fn(async () => null),
}));

import { PATCH as patchCycleRoute } from "@/app/api/daa/workbench/rebalance/cycles/[id]/route";
import { POST as executeSummaryRoute } from "@/app/api/daa/workbench/rebalance/execute-summary/route";
import { POST as executeRoute } from "@/app/api/daa/workbench/rebalance/execute/route";
import {
  createDaaRebalanceCycleV1,
  getDaaSystemConfigV2,
  listDaaRebalanceCyclesV1,
  patchDaaAssetUniverseRowV1,
  saveDaaSystemConfigV2,
  upsertDaaAssetUniverseRowV1,
} from "@/src/daa/store/daaStorePgV1";

const PG_GLOBAL_KEY = "__daa_pg_state_v0__";
const STORE_GLOBAL_KEY = "__daa_store_pg_state_v0__";

function resetPgMemRuntimeV1() {
  process.env.DAA_PG_MEM = "1";
  delete process.env.DAA_DB_URL;
  delete process.env.DATABASE_URL;
  delete (globalThis as any)[PG_GLOBAL_KEY];
  delete (globalThis as any)[STORE_GLOBAL_KEY];
}

async function createCycleV1(status: "generated" | "completed") {
  return createDaaRebalanceCycleV1({
    status,
    triggerSource: "manual",
    triggerReason: "测试周期",
    equitySnapshot: 1000,
    driftSnapshot: [],
    proposals: [
      {
        assetKey: "US::SPY",
        symbol: "SPY",
        currency: "USD",
        fxRateToBase: 1,
        side: "BUY",
        suggestedQty: 0.2,
        suggestedNotional: 100,
        price: 500,
        reason: "测试建议",
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
          current: 10,
          limit: 5,
          message: "测试告警",
        },
      ],
    },
  });
}

describe("workbench-rebalance-guards-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPgMemRuntimeV1();
  });

  it("completed 周期调用执行摘要返回 409 + CYCLE_NOT_EXECUTABLE", async () => {
    const cycle = await createCycleV1("completed");
    const response = await executeSummaryRoute(new Request("http://localhost/api/daa/workbench/rebalance/execute-summary", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cycleId: cycle.cycleId, executeMode: "selected" }),
    }));
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.ok).toBe(false);
    expect(json.error.details.code).toBe("CYCLE_NOT_EXECUTABLE");
    expect(json.error.details.cycleStatus).toBe("completed");
  });

  it("completed 周期调用执行返回 409 + CYCLE_ALREADY_COMPLETED", async () => {
    const cycle = await createCycleV1("completed");
    const response = await executeRoute(new Request("http://localhost/api/daa/workbench/rebalance/execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cycleId: cycle.cycleId, executeMode: "selected" }),
    }));
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.ok).toBe(false);
    expect(json.error.details.code).toBe("CYCLE_ALREADY_COMPLETED");
    expect(json.error.details.cycleStatus).toBe("completed");
  });

  it("completed 周期 patch 勾选返回 409 + CYCLE_IMMUTABLE", async () => {
    const cycle = await createCycleV1("completed");
    const response = await patchCycleRoute(
      new Request(`http://localhost/api/daa/workbench/rebalance/cycles/${cycle.cycleId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ selectedSymbols: [] }),
      }),
      { params: { id: cycle.cycleId } },
    );
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.ok).toBe(false);
    expect(json.error.details.code).toBe("CYCLE_IMMUTABLE");
    expect(json.error.details.cycleStatus).toBe("completed");
  });

  it("周期 createdAt 在重复读取时保持稳定", async () => {
    await createCycleV1("generated");
    const first = await listDaaRebalanceCyclesV1(10);
    const second = await listDaaRebalanceCyclesV1(10);

    expect(first[0]?.createdAt).toBeTruthy();
    expect(first[0]?.createdAt).toBe(second[0]?.createdAt);
  });


  it("零权益但已有目标权重时手动生成返回 skipped 而不是 healthy", async () => {
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
            cash: 0,
            investableCash: 0,
            frozenCash: 0,
          },
          targetWeights: {},
        },
      },
    });

    await upsertDaaAssetUniverseRowV1({
      symbol: "AAPL",
      market: "US",
      currency: "USD",
      watchEnabled: true,
      targetWeightHint: 0.6,
      lastPrice: 100,
    });

    const generated = await generateWorkbenchRebalanceCycleV1({
      triggerSource: "manual",
      triggerReason: "zero equity should skip",
      manual: true,
    });

    expect(generated.created).toBe(false);
    expect(generated.portfolioStatus).toBe("skipped");
    expect(generated.message).toContain("建立可计算权益");
    expect(generated.healthyInsight ?? null).toBeNull();
  });

  it("recent risk/manual 周期不会阻断 drift 自动触发", async () => {
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
            cash: 1000,
            investableCash: 1000,
            frozenCash: 0,
          },
          targetWeights: {},
        },
        rebalanceStrategy: {
          ...current.config.rebalanceStrategy,
          cooldownHours: 72,
          drift: {
            ...current.config.rebalanceStrategy.drift,
            enabled: true,
            thresholdPct: 0.05,
            checkFrequency: "daily",
          },
        },
      },
    });

    await upsertDaaAssetUniverseRowV1({
      symbol: "AAPL",
      market: "US",
      currency: "USD",
      watchEnabled: true,
      targetWeightHint: 0.2,
      lastPrice: 100,
    });
    await patchDaaAssetUniverseRowV1({
      assetKey: "US::AAPL",
      holdingQty: 10,
      holdingPrice: 95,
    });

    await createDaaRebalanceCycleV1({
      triggerSource: "risk",
      triggerReason: "recent risk cycle",
      equitySnapshot: 2000,
      driftSnapshot: [],
      proposals: [
        {
          assetKey: "US::AAPL",
          symbol: "AAPL",
          currency: "USD",
          fxRateToBase: 1,
          side: "SELL",
          suggestedQty: 1,
          suggestedNotional: 100,
          price: 100,
          reason: "risk",
          selected: true,
          hfContribution: null,
        },
      ],
      riskCheck: { overallStatus: "pass", items: [] },
    });

    const generated = await generateWorkbenchRebalanceCycleV1({
      triggerSource: "drift",
      triggerReason: "drift should still trigger",
      manual: false,
    });

    expect(generated.created).toBe(true);
    expect(generated.skippedByCooldown).toBe(false);
    expect(generated.cycle?.triggerSource).toBe("drift");
  }, 20000);
});

