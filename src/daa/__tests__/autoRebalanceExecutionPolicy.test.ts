import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/daa/modules/workbench/executionGateway", () => ({
  executeRebalanceViaGateway: vi.fn(async () => ({ logs: [] })),
}));

vi.mock("@/src/daa/modules/workbench/workbenchReadService", () => ({
  buildWorkbenchBootstrap: vi.fn(async () => ({
    account: { totalEquity: 10_000 },
  })),
}));

vi.mock("@/src/daa/notify/telegram", () => ({
  sendTelegramByEnv: vi.fn(async () => false),
}));

vi.mock("@/src/daa/notify/feishu", () => ({
  sendFeishuByEnv: vi.fn(async () => false),
}));

import { executeAutoRebalanceCycle } from "@/src/daa/automation/autoRebalanceExecution";
import { normalizeSystemConfig } from "@/src/daa/config/systemConfig";
import { executeRebalanceViaGateway } from "@/src/daa/modules/workbench/executionGateway";
import type { PolicyDecisionSnapshot } from "@/src/daa/modules/policy-engine/policyTypes";

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
});
