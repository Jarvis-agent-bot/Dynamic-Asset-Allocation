import {
  evaluateBrainActionAuthority,
  evaluateManualRebalanceAuthority,
} from "@/src/daa/automation/automationAuthority";

import { describePendingAction, isPendingActionExpired } from "./agentContext";
import { executePendingRebalanceAction, createAssistantRebalanceHandlers } from "./agentRebalanceExecutionHandlers";
import { executePendingTradeAction, executeTradeIntent } from "./agentTradeExecutionHandlers";
import type { DaaAgentToolContext, DaaAgentToolExecutor, DaaAgentToolResult } from "./agentToolTypes";

function buildNoPendingActionReply(): DaaAgentToolResult {
  return {
    text: "当前没有待确认动作。你可以先发“执行调仓”或“买入 QQQ 10股”之类的命令。",
    intentKind: "confirm_action",
    pendingAction: null,
  };
}

function buildCancelledReply(): DaaAgentToolResult {
  return {
    text: "已取消当前待确认动作。",
    intentKind: "cancel_action",
    pendingAction: null,
  };
}

export function createAssistantExecutionHandlers(input: DaaAgentToolContext): Map<DaaAgentToolContext["intent"]["kind"], DaaAgentToolExecutor> {
  const handlers = new Map<DaaAgentToolContext["intent"]["kind"], DaaAgentToolExecutor>();

  for (const [intent, handler] of createAssistantRebalanceHandlers(input).entries()) {
    handlers.set(intent, handler);
  }

  handlers.set("confirm_action", async () => {
    const pendingAction = input.currentPendingAction;
    if (!pendingAction) return buildNoPendingActionReply();
    if (isPendingActionExpired(pendingAction)) {
      return {
        text: `待确认动作已过期，已自动清除。请重新发起。\n过期动作：${describePendingAction(pendingAction)}`,
        intentKind: "confirm_action",
        pendingAction: null,
      };
    }
    if (!input.allowExecution) {
      return {
        text: "当前会话只允许查询，不允许确认执行动作。",
        intentKind: "confirm_action",
        pendingAction,
      };
    }
    const pendingCycle = pendingAction.kind === "rebalance_execute"
      ? input.readModel.cycles.find((cycle) => cycle.cycleId === pendingAction.cycleId)
        ?? input.readModel.bootstrap.latestCycle
      : null;
    const permission = pendingAction.kind === "trade"
      ? evaluateBrainActionAuthority({
        systemConfig: input.systemConfig,
        action: "simulate_trade",
      })
      : evaluateManualRebalanceAuthority({
        systemConfig: input.systemConfig,
        cycleId: pendingAction.cycleId,
        proposalCount: pendingCycle?.proposals.length ?? (pendingAction.cycleId ? 1 : 0),
        executionVenueMode: "local",
      });
    if (!permission.allowed) {
      return {
        text: `${permission.reason}\n如需继续，请到设置页调整投资助理授权等级。`,
        intentKind: "confirm_action",
        pendingAction: null,
      };
    }
    if (pendingAction.kind === "trade") {
      return executePendingTradeAction({
        toolContext: input,
        pendingAction,
      });
    }
    return executePendingRebalanceAction({
      toolContext: input,
      pendingAction,
    });
  });

  handlers.set("cancel_action", async () => (
    input.currentPendingAction ? buildCancelledReply() : buildNoPendingActionReply()
  ));

  handlers.set("trade", async () => executeTradeIntent({ toolContext: input }));

  return handlers;
}
