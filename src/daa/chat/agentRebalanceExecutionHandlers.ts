import { appendAgentLearningEvent } from "@/src/daa/agent/agentLearningRepo";
import { executeRebalanceViaGateway } from "@/src/daa/modules/workbench/executionGateway";
import { generateWorkbenchRebalanceCycle } from "@/src/daa/modules/workbench/workbenchRebalanceCycleService";

import { appendChatToolCall } from "./chatRepo";
import { PENDING_ACTION_TTL_MS, toIsoFromNow } from "./agentContext";
import type { DaaAgentToolContext, DaaAgentToolExecutor, DaaAgentToolResult } from "./agentToolTypes";
import type { DaaChatPendingAction } from "./chatTypes";

function formatRebalanceConfirmationText(input: {
  cycleId: string;
  status: string;
  selectedCount: number;
  proposalCount: number;
}): string {
  return [
    `调仓周期 ${input.cycleId.slice(0, 8)} 已进入待确认。`,
    `当前状态 ${input.status}，候选 ${input.proposalCount}，已纳入执行 ${input.selectedCount}。`,
    "回复“确认”继续执行，回复“取消”放弃本次动作。",
  ].join("\n");
}

async function appendRebalanceLearning(input: {
  sessionId: string;
  cycleId: string;
  status: string;
  logCount: number;
  executionSummary: {
    ordersExecuted?: number;
    ordersSubmitted?: number;
    ordersFailed?: number;
    totalNotional?: number;
    newMaxDriftPct?: number;
  } | null | undefined;
}) {
  await appendAgentLearningEvent({
    eventType: "rebalance_execution",
    sessionId: input.sessionId,
    cycleId: input.cycleId,
    title: `执行周期 ${input.cycleId.slice(0, 8)}`,
    summary: [
      `状态 ${input.status}`,
      `日志 ${input.logCount} 条`,
      `成交 ${input.executionSummary?.ordersExecuted ?? 0}`,
      `已提交 ${input.executionSummary?.ordersSubmitted ?? 0}`,
      `失败 ${input.executionSummary?.ordersFailed ?? 0}`,
      input.executionSummary?.newMaxDriftPct != null ? `执行后最大偏移 ${input.executionSummary.newMaxDriftPct.toFixed(2)}%` : "",
    ].filter(Boolean).join(" | "),
    contextJson: {
      cycleId: input.cycleId,
      status: input.status,
      logCount: input.logCount,
      executionSummary: input.executionSummary || null,
    },
  });
}

async function appendCyclePlanningLearning(input: {
  sessionId: string;
  created: boolean;
  cycleId?: string | null;
  message: string;
  proposalCount?: number;
  selectedCount?: number;
  marketRegime?: string | null;
  portfolioStatus?: string | null;
}) {
  await appendAgentLearningEvent({
    eventType: input.created ? "rebalance_cycle_generated" : "rebalance_cycle_skipped",
    sessionId: input.sessionId,
    cycleId: input.cycleId || null,
    title: input.created
      ? `生成周期 ${(input.cycleId || "").slice(0, 8)}`
      : "跳过本轮调仓生成",
    summary: [
      input.message,
      input.proposalCount != null ? `建议 ${input.proposalCount}` : "",
      input.selectedCount != null ? `已选 ${input.selectedCount}` : "",
      input.marketRegime ? `市场 ${input.marketRegime}` : "",
      input.portfolioStatus ? `组合状态 ${input.portfolioStatus}` : "",
    ].filter(Boolean).join(" | "),
    contextJson: {
      created: input.created,
      cycleId: input.cycleId || null,
      proposalCount: input.proposalCount ?? null,
      selectedCount: input.selectedCount ?? null,
      marketRegime: input.marketRegime || null,
      portfolioStatus: input.portfolioStatus || null,
    },
  });
}

export async function executePendingRebalanceAction(input: {
  toolContext: DaaAgentToolContext;
  pendingAction: Extract<DaaChatPendingAction, { kind: "rebalance_execute" }>;
}): Promise<DaaAgentToolResult> {
  const result = await executeRebalanceViaGateway({
    cycleId: input.pendingAction.cycleId,
    executeMode: input.pendingAction.executeMode,
  });
  await appendChatToolCall({
    sessionId: input.toolContext.sessionId,
    messageId: input.toolContext.userMessageId,
    toolName: "executeWorkbenchRebalanceCycle",
    status: "ok",
    resultJson: {
      cycleId: result.cycle.cycleId,
      status: result.cycle.status,
      logCount: result.logs.length,
    },
  });
  await appendRebalanceLearning({
    sessionId: input.toolContext.sessionId,
    cycleId: result.cycle.cycleId,
    status: result.cycle.status,
    logCount: result.logs.length,
    executionSummary: result.cycle.executionSummary,
  });
  return {
    text: `已执行周期 ${result.cycle.cycleId.slice(0, 8)}。当前状态 ${result.cycle.status}，返回订单 ${result.logs.length} 条。`,
    intentKind: "rebalance_execute",
    pendingAction: null,
  };
}

export function createAssistantRebalanceHandlers(input: DaaAgentToolContext): Map<DaaAgentToolContext["intent"]["kind"], DaaAgentToolExecutor> {
  const handlers = new Map<DaaAgentToolContext["intent"]["kind"], DaaAgentToolExecutor>();

  handlers.set("rebalance_generate", async () => {
    const result = await generateWorkbenchRebalanceCycle({
      triggerSource: "manual",
      triggerReason: "assistant_chat",
      manual: true,
    });
    await appendChatToolCall({
      sessionId: input.sessionId,
      messageId: input.userMessageId,
      toolName: "generateWorkbenchRebalanceCycle",
      status: "ok",
      resultJson: {
        created: result.created,
        cycleId: result.cycle?.cycleId || null,
        portfolioStatus: result.portfolioStatus,
      },
    });
    await appendCyclePlanningLearning({
      sessionId: input.sessionId,
      created: result.created,
      cycleId: result.cycle?.cycleId || null,
      message: result.created
        ? `已生成新调仓周期 ${result.cycle?.cycleId.slice(0, 8)}`
        : result.message,
      proposalCount: result.cycle?.proposals.length,
      selectedCount: result.cycle?.proposals.filter((item) => item.selected).length,
      marketRegime: result.marketRegime || null,
      portfolioStatus: result.portfolioStatus || null,
    });
    return {
      text: result.created
        ? `已生成新调仓周期 ${result.cycle?.cycleId.slice(0, 8)}，当前状态 ${result.cycle?.status}，建议数 ${result.cycle?.proposals.length || 0}。`
        : result.message,
      intentKind: "rebalance_generate",
      pendingAction: input.currentPendingAction,
    };
  });

  handlers.set("rebalance_execute", async () => {
    const latestCycle = input.readModel.bootstrap.latestCycle;
    if (!latestCycle) {
      return {
        text: "当前没有可执行的调仓周期。先发“生成调仓建议”生成一轮，再执行。",
        intentKind: "rebalance_execute",
        pendingAction: null,
      };
    }
    if (input.requireConfirmation) {
      const pendingAction: DaaChatPendingAction = {
        kind: "rebalance_execute",
        cycleId: latestCycle.cycleId,
        executeMode: "all",
        createdAt: toIsoFromNow(),
        expiresAt: toIsoFromNow(PENDING_ACTION_TTL_MS),
      };
      return {
        text: formatRebalanceConfirmationText({
          cycleId: latestCycle.cycleId,
          status: latestCycle.status,
          selectedCount: latestCycle.proposals.filter((item) => item.selected).length,
          proposalCount: latestCycle.proposals.length,
        }),
        intentKind: "rebalance_execute",
        pendingAction,
      };
    }
    return executePendingRebalanceAction({
      toolContext: input,
      pendingAction: {
        kind: "rebalance_execute",
        cycleId: latestCycle.cycleId,
        executeMode: "all",
        createdAt: toIsoFromNow(),
        expiresAt: toIsoFromNow(PENDING_ACTION_TTL_MS),
      },
    });
  });

  return handlers;
}
