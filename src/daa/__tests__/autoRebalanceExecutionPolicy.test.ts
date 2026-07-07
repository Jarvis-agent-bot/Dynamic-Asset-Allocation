import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/daa/modules/workbench/executionGateway", () => ({
  executeRebalanceViaGateway: vi.fn(async () => ({ logs: [] })),
}));

vi.mock("@/src/daa/modules/workbench/workbenchReadService", () => ({
  buildWorkbenchBootstrap: vi.fn(async () => ({
    account: { totalEquity: 10_000 },
    assetUniverse: [],
  })),
}));

vi.mock("@/src/daa/notify/telegram", () => ({
  sendTelegramByEnv: vi.fn(async () => false),
}));

vi.mock("@/src/daa/notify/feishu", () => ({
  sendFeishuByEnv: vi.fn(async () => false),
}));

vi.mock("@/src/daa/store/daaStorePg", () => ({
  listDaaTradeTickets: vi.fn(async () => []),
  patchDaaRebalanceCycle: vi.fn(async (input) => ({ ...input })),
}));

import { executeAutoRebalanceCycle } from "@/src/daa/automation/autoRebalanceExecution";
import { normalizeSystemConfig } from "@/src/daa/config/systemConfig";
import { executeRebalanceViaGateway } from "@/src/daa/modules/workbench/executionGateway";
import type { PolicyDecisionSnapshot } from "@/src/daa/modules/policy-engine/policyTypes";
import { buildWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";
import { listDaaTradeTickets, patchDaaRebalanceCycle } from "@/src/daa/store/daaStorePg";

function policySnapshot(action: PolicyDecisionSnapshot["decision"]["action"]): PolicyDecisionSnapshot {
  return {
    decision: {
      decisionId: "policy-test",
      source: "drift_monitor",
      triggerSource: "drift",
      action,
      score: 42,
      threshold: 25,
      reasons: [],
      blockers: [],
      noTradeBandState: "entered_outer",
      costBenefit: {
        expectedRiskImprovement: 0,
        expectedTrackingImprovement: 20,
        estimatedCostBase: 1,
        turnoverPenalty: 1,
        uncertaintyPenalty: 0,
      },
      audit: {},
      createdAt: "2026-05-09T00:00:00.000Z",
    },
    intentIds: ["intent-1"],
    signalIds: ["signal-1"],
  };
}

describe("auto-rebalance-execution-policy-gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(new Date("2026-06-08T14:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("policy 未授权自动执行时阻断执行网关", async () => {
    const result = await executeAutoRebalanceCycle({
      cycle: {
        cycleId: "cycle-policy-propose",
        proposals: [{
          assetKey: "US::QQQ",
          symbol: "QQQ",
          currency: "USD",
          fxRateToBase: 1,
          side: "SELL",
          suggestedQty: 1,
          suggestedNotional: 100,
          price: 100,
          reason: "policy propose only",
          selected: true,
          hfContribution: null,
        }],
        riskCheck: { overallStatus: "pass", items: [] },
        policySnapshot: policySnapshot("propose"),
      },
      systemConfig: normalizeSystemConfig({
        policy: {
          execution: {
            autoGenerateEnabled: true,
            autoExecuteEnabled: true,
          },
        },
      }),
      triggerSource: "cron_drift_check",
      totalEquity: 10_000,
    });

    expect(result.executed).toBe(false);
    expect(result.blockedReason).toContain("策略决策为 propose");
    expect(executeRebalanceViaGateway).not.toHaveBeenCalled();
  });

  it("投资助理全自动触发会绕过 policy propose、单笔上限和风控 warn，直接进入执行网关", async () => {
    const result = await executeAutoRebalanceCycle({
      cycle: {
        cycleId: "cycle-agent-auto",
        proposals: [{
          assetKey: "US::QQQ",
          symbol: "QQQ",
          currency: "USD",
          fxRateToBase: 1,
          side: "BUY",
          suggestedQty: 50,
          suggestedNotional: 50_000,
          price: 100,
          reason: "投资助理全自动目标权重",
          selected: true,
          hfContribution: null,
        }],
        riskCheck: {
          overallStatus: "warn",
          items: [{
            rule: "max_order_pct",
            status: "warn",
            current: 5,
            limit: 1,
            message: "测试风险不再阻断投资助理全自动执行",
          }],
        },
        policySnapshot: policySnapshot("propose"),
      },
      systemConfig: normalizeSystemConfig({
        policy: {
          execution: {
            autoGenerateEnabled: true,
            autoExecuteEnabled: true,
          },
        },
      }),
      triggerSource: "agent_trigger",
      totalEquity: 10_000,
    });

    expect(result.blockedReason).toBeNull();
    expect(executeRebalanceViaGateway).toHaveBeenCalledWith(expect.objectContaining({
      cycleId: "cycle-agent-auto",
      executeMode: "selected",
    }));
  });

  it("投资助理全自动触发仍会被执行层交易稳定器拦住同资产 24 小时重复操作", async () => {
    vi.mocked(buildWorkbenchBootstrap).mockResolvedValueOnce({
      account: { totalEquity: 100_000 },
      assetUniverse: [{
        assetKey: "US::MSFT",
        targetWeightPct: 5,
      }],
    } as Awaited<ReturnType<typeof buildWorkbenchBootstrap>>);
    vi.mocked(listDaaTradeTickets).mockResolvedValueOnce([{
      ticketId: "ticket-msft-buy",
      assetKey: "US::MSFT",
      symbol: "MSFT",
      side: "BUY",
      status: "executed",
      executedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    } as Awaited<ReturnType<typeof listDaaTradeTickets>>[number]]);

    const result = await executeAutoRebalanceCycle({
      cycle: {
        cycleId: "cycle-agent-stability",
        proposals: [{
          assetKey: "US::MSFT",
          symbol: "MSFT",
          currency: "USD",
          fxRateToBase: 1,
          side: "SELL",
          suggestedQty: 4,
          suggestedNotional: 2_000,
          price: 500,
          reason: "Agent 小幅降低目标权重",
          selected: true,
          hfContribution: null,
          targetWeightPct: 3,
        }],
        riskCheck: { overallStatus: "warn", items: [] },
        policySnapshot: policySnapshot("propose"),
      },
      systemConfig: normalizeSystemConfig({
        policy: {
          execution: {
            autoGenerateEnabled: true,
            autoExecuteEnabled: true,
          },
        },
      }),
      triggerSource: "agent_trigger",
      totalEquity: 100_000,
    });

    expect(result.executed).toBe(false);
    expect(result.blockedReason).toContain("自动交易稳定器");
    expect(result.blockedReason).toContain("最近 24 小时内已有 BUY 成交");
    expect(executeRebalanceViaGateway).not.toHaveBeenCalledWith(expect.objectContaining({
      cycleId: "cycle-agent-stability",
    }));
  });

  it("自动执行遇到闭市市场时阻断，不进入执行网关", async () => {
    vi.setSystemTime(new Date("2026-06-08T13:00:00.000Z"));

    const result = await executeAutoRebalanceCycle({
      cycle: {
        cycleId: "cycle-market-closed",
        proposals: [{
          assetKey: "US::AAPL",
          symbol: "AAPL",
          currency: "USD",
          fxRateToBase: 1,
          side: "BUY",
          suggestedQty: 3,
          suggestedNotional: 300,
          price: 100,
          reason: "test",
          selected: true,
          hfContribution: null,
        }],
        riskCheck: { overallStatus: "pass", items: [] },
        policySnapshot: policySnapshot("authorize_auto_execute"),
      },
      systemConfig: normalizeSystemConfig({
        policy: {
          execution: {
            autoGenerateEnabled: true,
            autoExecuteEnabled: true,
          },
        },
      }),
      triggerSource: "cron_drift_check",
      totalEquity: 10_000,
    });

    expect(result.executed).toBe(false);
    expect(result.blockedReason).toContain("当前不可执行");
    expect(executeRebalanceViaGateway).not.toHaveBeenCalledWith(expect.objectContaining({
      cycleId: "cycle-market-closed",
    }));
  });

  it("风险周期混合开市和闭市市场时只执行当前可交易提案并保留闭市提案", async () => {
    vi.setSystemTime(new Date("2026-06-08T14:00:00.000Z"));
    vi.mocked(buildWorkbenchBootstrap).mockResolvedValueOnce({
      account: { totalEquity: 10_000 },
      assetUniverse: [
        { assetKey: "US::AMD", holdingQty: 2.356222 },
        { assetKey: "HK::1810.HK", holdingQty: 764.879236 },
      ],
    } as Awaited<ReturnType<typeof buildWorkbenchBootstrap>>);
    vi.mocked(executeRebalanceViaGateway).mockResolvedValueOnce({
      logs: [{
        status: "executed",
        cycleId: "cycle-risk-mixed-market",
      }],
    } as Awaited<ReturnType<typeof executeRebalanceViaGateway>>);

    const openProposal = {
      assetKey: "US::AMD",
      symbol: "AMD",
      currency: "USD",
      fxRateToBase: 1,
      side: "SELL" as const,
      suggestedQty: 2,
      suggestedNotional: 300,
      price: 150,
      reason: "触发止盈阈值：浮盈 30.20%",
      selected: true,
      hfContribution: null,
    };
    const closedProposal = {
      assetKey: "HK::1810.HK",
      symbol: "1810.HK",
      currency: "HKD",
      fxRateToBase: 0.1275,
      side: "SELL" as const,
      suggestedQty: 100,
      suggestedNotional: 220,
      price: 22,
      reason: "触发止损阈值：浮亏 26.50%",
      selected: true,
      hfContribution: null,
    };

    const result = await executeAutoRebalanceCycle({
      cycle: {
        cycleId: "cycle-risk-mixed-market",
        proposals: [openProposal, closedProposal],
        riskCheck: { overallStatus: "warn", items: [] },
        policySnapshot: policySnapshot("authorize_auto_execute"),
      },
      systemConfig: normalizeSystemConfig({
        policy: {
          execution: {
            autoGenerateEnabled: true,
            autoExecuteEnabled: true,
          },
        },
      }),
      triggerSource: "risk",
      totalEquity: 10_000,
    });

    expect(result.executed).toBe(true);
    expect(result.ordersCount).toBe(1);
    expect(result.blockedReason).toContain("1810.HK");
    expect(result.blockedReason).toContain("后续重试");
    expect(patchDaaRebalanceCycle).toHaveBeenCalledWith(expect.objectContaining({
      cycleId: "cycle-risk-mixed-market",
      proposals: [
        expect.objectContaining({ assetKey: "US::AMD", selected: true }),
        expect.objectContaining({ assetKey: "HK::1810.HK", selected: false }),
      ],
    }));
    expect(patchDaaRebalanceCycle).toHaveBeenLastCalledWith(expect.objectContaining({
      cycleId: "cycle-risk-mixed-market",
      status: "reviewing",
      executedAt: null,
      proposals: [
        expect.objectContaining({ assetKey: "US::AMD", selected: false }),
        expect.objectContaining({ assetKey: "HK::1810.HK", selected: true }),
      ],
    }));
    expect(executeRebalanceViaGateway).toHaveBeenCalledWith(expect.objectContaining({
      cycleId: "cycle-risk-mixed-market",
      executeMode: "selected",
    }));
  });

  it("风险周期会在执行前取消当前无持仓的过期卖单，避免生成 rejected ticket", async () => {
    vi.setSystemTime(new Date("2026-07-07T05:03:00.000Z"));
    vi.mocked(buildWorkbenchBootstrap).mockResolvedValueOnce({
      account: { totalEquity: 10_000 },
      assetUniverse: [
        { assetKey: "HK::1810.HK", holdingQty: 0 },
      ],
    } as Awaited<ReturnType<typeof buildWorkbenchBootstrap>>);

    const result = await executeAutoRebalanceCycle({
      cycle: {
        cycleId: "cycle-stale-risk-sell",
        notes: "existing note",
        proposals: [{
          assetKey: "HK::1810.HK",
          symbol: "1810.HK",
          currency: "HKD",
          fxRateToBase: 0.1275,
          side: "SELL",
          suggestedQty: 764.879236,
          suggestedNotional: 2110.25,
          price: 21.64,
          sellAll: true,
          reason: "触发止损阈值：浮亏 29.63%",
          selected: true,
          hfContribution: null,
        }],
        riskCheck: { overallStatus: "warn", items: [] },
        policySnapshot: policySnapshot("authorize_auto_execute"),
      },
      systemConfig: normalizeSystemConfig({
        policy: {
          execution: {
            autoGenerateEnabled: true,
            autoExecuteEnabled: true,
          },
        },
      }),
      triggerSource: "risk",
      totalEquity: 10_000,
    });

    expect(result.executed).toBe(false);
    expect(result.ordersCount).toBe(0);
    expect(result.blockedReason).toContain("当前无持仓");
    expect(patchDaaRebalanceCycle).toHaveBeenCalledWith(expect.objectContaining({
      cycleId: "cycle-stale-risk-sell",
      status: "reviewing",
      proposals: [
        expect.objectContaining({ assetKey: "HK::1810.HK", selected: false }),
      ],
      notes: expect.stringContaining("当前无持仓"),
    }));
    expect(executeRebalanceViaGateway).not.toHaveBeenCalledWith(expect.objectContaining({
      cycleId: "cycle-stale-risk-sell",
    }));
  });
});
