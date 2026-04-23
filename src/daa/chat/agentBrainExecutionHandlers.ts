import { canBrainRunAction } from "@/src/daa/brain/brainPolicy";

import { appendChatToolCall } from "./chatRepo";
import { runAssistantBootstrap, runAssistantCognitiveCycle } from "./assistantBrain";
import type { DaaAgentToolContext, DaaAgentToolExecutor } from "./agentToolTypes";

export function createAssistantBrainExecutionHandlers(input: DaaAgentToolContext): Map<DaaAgentToolContext["intent"]["kind"], DaaAgentToolExecutor> {
  const handlers = new Map<DaaAgentToolContext["intent"]["kind"], DaaAgentToolExecutor>();

  handlers.set("agent_run", async () => {
    const permission = canBrainRunAction(input.systemConfig, "run_agent_cycle");
    if (!permission.allowed) {
      return {
        text: `${permission.reason}\n如需放开，请到设置页切换到「操作员」或「自动驾驶」模式。`,
        intentKind: "agent_run",
        pendingAction: input.currentPendingAction,
      };
    }
    const text = await runAssistantCognitiveCycle();
    await appendChatToolCall({
      sessionId: input.sessionId,
      messageId: input.userMessageId,
      toolName: "runCognitiveAgentCycle",
      status: "ok",
      resultJson: {
        source: "assistant_chat",
      },
    });
    return {
      text,
      intentKind: "agent_run",
      pendingAction: input.currentPendingAction,
    };
  });

  handlers.set("agent_bootstrap", async () => {
    const permission = canBrainRunAction(input.systemConfig, "bootstrap_theses");
    if (!permission.allowed) {
      return {
        text: `${permission.reason}\n如需放开，请到设置页切换到「操作员」或「自动驾驶」模式。`,
        intentKind: "agent_bootstrap",
        pendingAction: input.currentPendingAction,
      };
    }
    const text = await runAssistantBootstrap(input);
    await appendChatToolCall({
      sessionId: input.sessionId,
      messageId: input.userMessageId,
      toolName: "bootstrapTheses",
      status: "ok",
      resultJson: {
        source: "assistant_chat",
      },
    });
    return {
      text,
      intentKind: "agent_bootstrap",
      pendingAction: input.currentPendingAction,
    };
  });

  return handlers;
}
