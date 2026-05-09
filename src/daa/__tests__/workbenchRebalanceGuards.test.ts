import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateWorkbenchRebalanceCycle } from "@/src/daa/modules/workbench/workbenchRebalanceCycleService";
import { resetTestDb, isTestDbAvailable } from "@/src/daa/__tests__/testDbSetup";

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminViewerAuth: vi.fn(async () => null),
  requireDaaAdminEditorAuth: vi.fn(async () => null),
}));

import { PATCH as patchCycleRoute } from "@/app/api/daa/workbench/rebalance/cycles/[id]/route";
import { POST as executeSummaryRoute } from "@/app/api/daa/workbench/rebalance/execute-summary/route";
import { POST as executeRoute } from "@/app/api/daa/workbench/rebalance/execute/route";
import {
  createDaaRebalanceCycle,
  getDaaSystemConfig,
  listDaaRebalanceCycles,
  patchDaaRebalanceCycle,
  patchDaaAssetUniverseRow,
  replaceDaaAccountState,
  saveDaaSystemConfig,
  upsertDaaAssetUniverseRow,
} from "@/src/daa/store/daaStorePg";

async function createCycle(status: "generated" | "completed") {
  return createDaaRebalanceCycle({
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

describe.skipIf(!isTestDbAvailable())("workbench-rebalance-guards-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTestDb();
  });

  it("completed 周期调用执行摘要返回 409 + CYCLE_NOT_EXECUTABLE", async () => {
    const cycle = await createCycle("completed");
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
    const cycle = await createCycle("completed");
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
    const cycle = await createCycle("completed");
    const response = await patchCycleRoute(
      new Request(`http://localhost/api/daa/workbench/rebalance/cycles/${cycle.cycleId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ selectedAssetSideKeys: [] }),
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
    await createCycle("generated");
    const first = await listDaaRebalanceCycles(10);
    const second = await listDaaRebalanceCycles(10);

    expect(first[0]?.createdAt).toBeTruthy();
    expect(first[0]?.createdAt).toBe(second[0]?.createdAt);
  });

  it("旧快照周期刚进入 executing 时不会被当成卡住周期恢复并重复执行", async () => {
    const cycle = await createDaaRebalanceCycle({
      status: "generated",
      triggerSource: "manual",
      triggerReason: "旧快照周期",
      snapshotAt: "2026-01-01T00:00:00.000Z",
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
      riskCheck: { overallStatus: "pass", items: [] },
    });
    const executing = await patchDaaRebalanceCycle({
      cycleId: cycle.cycleId,
      status: "executing",
    });

    expect(executing.executionStartedAt).toBeTruthy();

    const response = await executeRoute(new Request("http://localhost/api/daa/workbench/rebalance/execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cycleId: cycle.cycleId, executeMode: "selected" }),
    }));
    const json = await response.json();
    const [after] = await listDaaRebalanceCycles(1);

    expect(response.status).toBe(409);
    expect(json.error.details.code).toBe("CYCLE_NOT_EXECUTABLE");
    expect(json.error.details.cycleStatus).toBe("executing");
    expect(after?.status).toBe("executing");
  });


  it("零权益但已有目标权重时手动生成返回 skipped 而不是 healthy", async () => {
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
            cash: 0,
            investableCash: 0,
            frozenCash: 0,
          },
        },
      },
    });

    await upsertDaaAssetUniverseRow({
      symbol: "AAPL",
      market: "US",
      currency: "USD",
      watchEnabled: true,
      targetWeightHint: 0.6,
      lastPrice: 100,
    });

    const generated = await generateWorkbenchRebalanceCycle({
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
            cash: 1000,
            investableCash: 1000,
            frozenCash: 0,
          },
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

    await upsertDaaAssetUniverseRow({
      symbol: "AAPL",
      market: "US",
      currency: "USD",
      watchEnabled: true,
      targetWeightHint: 0.2,
      lastPrice: 100,
    });
    await patchDaaAssetUniverseRow({
      assetKey: "US::AAPL",
      holdingQty: 10,
      holdingPrice: 95,
    });

    await createDaaRebalanceCycle({
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

    const generated = await generateWorkbenchRebalanceCycle({
      triggerSource: "drift",
      triggerReason: "drift should still trigger",
      manual: false,
    });

    expect(generated.created).toBe(true);
    expect(generated.skippedByCooldown).toBe(false);
    expect(generated.cycle?.triggerSource).toBe("drift");
  }, 20000);

  it("手动再平衡遇到小额 drift 时会按最小成交门槛跳过", async () => {
    const current = await getDaaSystemConfig();
    await saveDaaSystemConfig({
      baseVersion: current.version,
      config: {
        ...current.config,
        strategy: {
          ...current.config.strategy,
          constraints: {
            ...current.config.strategy.constraints,
            minNotional: 200,
          },
        },
      },
    });

    await replaceDaaAccountState({
      baseCurrency: "USD",
      cash: 900,
      investableCash: 900,
      frozenCash: 0,
      totalEquity: 1000,
    });

    await upsertDaaAssetUniverseRow({
      symbol: "AAPL",
      market: "US",
      currency: "USD",
      watchEnabled: true,
      targetWeightHint: 0.05,
      lastPrice: 100,
    });
    await patchDaaAssetUniverseRow({
      assetKey: "US::AAPL",
      holdingQty: 1,
      holdingPrice: 100,
    });

    const generated = await generateWorkbenchRebalanceCycle({
      triggerSource: "manual",
      triggerReason: "small drift below min notional",
      manual: true,
    });

    expect(generated.created).toBe(false);
    expect(generated.portfolioStatus).toBe("skipped");
    expect(generated.message).toContain("最小成交额或费用门槛");
    expect(generated.healthyInsight ?? null).toBeNull();
  }, 20000);

  it("agent_trigger 在冷静期内重复加仓会被跳过", async () => {
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
            cash: 9600,
            investableCash: 9600,
            frozenCash: 0,
          },
        },
        rebalanceStrategy: {
          ...current.config.rebalanceStrategy,
          cooldownHours: 24,
        },
      },
    });

    await upsertDaaAssetUniverseRow({
      symbol: "AAPL",
      market: "US",
      currency: "USD",
      watchEnabled: true,
      targetWeightHint: 0.08,
      lastPrice: 100,
    });
    await patchDaaAssetUniverseRow({
      assetKey: "US::AAPL",
      holdingQty: 8,
      holdingPrice: 100,
    });

    await createDaaRebalanceCycle({
      triggerSource: "calendar",
      triggerReason: "recent auto cycle",
      equitySnapshot: 4800,
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
          reason: "recent auto",
          selected: true,
          hfContribution: null,
        },
      ],
      riskCheck: { overallStatus: "pass", items: [] },
    });

    const generated = await generateWorkbenchRebalanceCycle({
      triggerSource: "agent_trigger",
      triggerReason: "repeat buy within cooldown",
      manual: false,
      targetWeightOverrides: { "US::AAPL": 0.12 },
    });

    expect(generated.created).toBe(false);
    expect(generated.skippedByCooldown).toBe(true);
    expect(generated.message).toContain("仅允许纯降风险 SELL");
  }, 20000);

  it("agent_trigger 在冷静期内的纯降风险 SELL 仍可放行", async () => {
    const current = await getDaaSystemConfig();
    await saveDaaSystemConfig({
      baseVersion: current.version,
      config: {
        ...current.config,
        strategy: {
          ...current.config.strategy,
          constraints: {
            ...current.config.strategy.constraints,
            maxPositionPct: 0.1,
          },
          account: {
            ...current.config.strategy.account,
            baseCurrency: "USD",
            cash: 8000,
            investableCash: 8000,
            frozenCash: 0,
          },
        },
        rebalanceStrategy: {
          ...current.config.rebalanceStrategy,
          cooldownHours: 24,
        },
      },
    });

    await upsertDaaAssetUniverseRow({
      symbol: "NVDA",
      market: "US",
      currency: "USD",
      watchEnabled: true,
      targetWeightHint: 0.2,
      lastPrice: 100,
    });
    await patchDaaAssetUniverseRow({
      assetKey: "US::NVDA",
      holdingQty: 20,
      holdingPrice: 100,
    });

    await createDaaRebalanceCycle({
      triggerSource: "drift",
      triggerReason: "recent auto cycle",
      equitySnapshot: 10000,
      driftSnapshot: [],
      proposals: [
        {
          assetKey: "US::NVDA",
          symbol: "NVDA",
          currency: "USD",
          fxRateToBase: 1,
          side: "BUY",
          suggestedQty: 1,
          suggestedNotional: 100,
          price: 100,
          reason: "recent auto",
          selected: true,
          hfContribution: null,
        },
      ],
      riskCheck: { overallStatus: "pass", items: [] },
    });

    const generated = await generateWorkbenchRebalanceCycle({
      triggerSource: "agent_trigger",
      triggerReason: "risk reduction sell within cooldown",
      manual: false,
      targetWeightOverrides: { "US::NVDA": 0.05 },
    });

    expect(generated.created).toBe(true);
    expect(generated.skippedByCooldown).toBe(false);
    expect(generated.cycle?.proposals.every((proposal) => proposal.side === "SELL")).toBe(true);
  }, 20000);

  it("自动触发的小额提案会被过滤，但手动提案保留", async () => {
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
            cash: 1000,
            investableCash: 1000,
            frozenCash: 0,
          },
        },
      },
    });

    await upsertDaaAssetUniverseRow({
      symbol: "QQQ",
      market: "US",
      currency: "USD",
      watchEnabled: true,
      targetWeightHint: 0,
      lastPrice: 100,
    });

    const autoGenerated = await generateWorkbenchRebalanceCycle({
      triggerSource: "agent_trigger",
      triggerReason: "tiny auto proposal",
      manual: false,
      targetWeightOverrides: { "US::QQQ": 0.005 },
    });
    const manualGenerated = await generateWorkbenchRebalanceCycle({
      triggerSource: "manual",
      triggerReason: "tiny manual proposal",
      manual: true,
      targetWeightOverrides: { "US::QQQ": 0.005 },
    });

    expect(autoGenerated.created).toBe(false);
    expect(autoGenerated.message).toContain("未生成可执行提案");
    expect(manualGenerated.created).toBe(true);
    expect((manualGenerated.cycle?.proposals[0]?.suggestedNotional ?? 0) < 100).toBe(true);
  }, 20000);

  it("已持仓资产的目标回归提案不再显示观察列表目标权重文案", async () => {
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
            cash: 1000,
            investableCash: 1000,
            frozenCash: 0,
          },
        },
      },
    });

    await upsertDaaAssetUniverseRow({
      symbol: "AAPL",
      market: "US",
      currency: "USD",
      watchEnabled: true,
      targetWeightHint: 0.2,
      lastPrice: 100,
    });
    await patchDaaAssetUniverseRow({
      assetKey: "US::AAPL",
      holdingQty: 10,
      holdingPrice: 100,
    });

    const generated = await generateWorkbenchRebalanceCycle({
      triggerSource: "manual",
      triggerReason: "holding reason copy",
      manual: true,
    });

    expect(generated.created).toBe(true);
    expect(generated.cycle?.proposals[0]?.reason).toContain("持仓目标权重回归");
    expect(generated.cycle?.proposals[0]?.reason).not.toContain("观察列表目标权重");
  }, 20000);

  it("Agent 对新资产建仓时使用独立文案", async () => {
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
            cash: 5000,
            investableCash: 5000,
            frozenCash: 0,
          },
        },
      },
    });

    await upsertDaaAssetUniverseRow({
      symbol: "SPY",
      market: "US",
      currency: "USD",
      watchEnabled: true,
      targetWeightHint: 0,
      lastPrice: 100,
    });

    const generated = await generateWorkbenchRebalanceCycle({
      triggerSource: "agent_trigger",
      triggerReason: "agent entry reason copy",
      manual: false,
      targetWeightOverrides: { "US::SPY": 0.05 },
    });

    expect(generated.created).toBe(true);
    expect(generated.cycle?.proposals[0]?.reason).toContain("Agent 目标建仓");
  }, 20000);
});
