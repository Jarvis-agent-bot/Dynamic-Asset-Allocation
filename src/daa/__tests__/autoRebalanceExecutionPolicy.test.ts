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
}));

import { executeAutoRebalanceCycle } from "@/src/daa/automation/autoRebalanceExecution";
import { normalizeSystemConfig } from "@/src/daa/config/systemConfig";
import { executeRebalanceViaGateway } from "@/src/daa/modules/workbench/executionGateway";
import type { PolicyDecisionSnapshot } from "@/src/daa/modules/policy-engine/policyTypes";
import { buildWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";
import { listDaaTradeTickets } from "@/src/daa/store/daaStorePg";

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

  it("Agent 全自动触发会绕过 policy propose、单笔上限和风控 warn，直接进入执行网关", async () => {
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
          reason: "Agent 全自动目标权重",
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
            message: "测试风险不再阻断 Agent 全自动执行",
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

  it("Agent 全自动触发仍会被执行层交易稳定器拦住同资产 24 小时重复操作", async () => {
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
});
