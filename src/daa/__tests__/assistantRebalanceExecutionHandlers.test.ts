import { describe, expect, it } from "vitest";

import { createAssistantRebalanceHandlers } from "@/src/daa/chat/agentRebalanceExecutionHandlers";
import { buildSystemConfigRow, buildWorkbenchBootstrap } from "@/src/daa/__tests__/testDataFactories";
import type { DaaAgentToolContext } from "@/src/daa/chat/agentToolTypes";
import type { RebalanceExecuteMode } from "@/src/daa/modules/workbench/rebalanceExecuteMode";

function buildContext(executeMode: RebalanceExecuteMode = "selected") {
  const latestCycle = {
    cycleId: "cycle-1",
    status: "reviewing" as const,
    triggerSource: "manual" as const,
    triggerReason: "test",
    snapshotAt: "2026-03-01T00:00:00.000Z",
    equitySnapshot: 1000,
    driftSnapshot: [],
    proposals: [
      {
        assetKey: "US::AAPL",
        symbol: "AAPL",
        currency: "USD",
        fxRateToBase: 1,
        side: "BUY" as const,
        suggestedQty: 1,
        suggestedNotional: 100,
        price: 100,
        reason: "selected",
        selected: true,
        hfContribution: null,
      },
      {
        assetKey: "US::MSFT",
        symbol: "MSFT",
        currency: "USD",
        fxRateToBase: 1,
        side: "BUY" as const,
        suggestedQty: 1,
        suggestedNotional: 100,
        price: 100,
        reason: "unselected",
        selected: false,
        hfContribution: null,
      },
    ],
    riskCheck: { overallStatus: "pass" as const, items: [] },
    executedAt: null,
    executedOrders: [],
    executionSummary: null,
    cancelledAt: null,
    cancelReason: null,
    notes: null,
    marketContext: null,
    agentDecisionSnapshot: null,
  };

  return {
    systemConfig: buildSystemConfigRow({ brain: { mode: "operator" } }).config,
    systemConfigVersion: 1,
    readModel: {
      bootstrap: buildWorkbenchBootstrap({ latestCycle }),
    } as DaaAgentToolContext["readModel"],
    recentMessages: [],
    sessionMemory: null,
    learningDigest: "",
    systemDigest: "",
    storedPendingAction: null,
    intent: { kind: "rebalance_execute" as const, rawText: "执行调仓", executeMode },
    currentPendingAction: null,
    allowExecution: true,
    requireConfirmation: true,
    sessionId: "session-1",
    userMessageId: "message-1",
  } satisfies DaaAgentToolContext;
}

describe("assistant-rebalance-execution-handlers", () => {
  it("助手执行调仓默认只把已选建议放入待确认动作", async () => {
    const handler = createAssistantRebalanceHandlers(buildContext()).get("rebalance_execute");

    const result = await handler?.();

    expect(result?.pendingAction).toMatchObject({
      kind: "rebalance_execute",
      cycleId: "cycle-1",
      executeMode: "selected",
    });
    expect(result?.text).toContain("已纳入执行 1");
  });

  it("用户明确要求全部执行时保留 all 模式", async () => {
    const handler = createAssistantRebalanceHandlers(buildContext("all")).get("rebalance_execute");

    const result = await handler?.();

    expect(result?.pendingAction).toMatchObject({
      kind: "rebalance_execute",
      cycleId: "cycle-1",
      executeMode: "all",
    });
    expect(result?.text).toContain("将执行全部 2 条建议");
    expect(result?.text).not.toContain("已纳入执行 1");
  });
});
