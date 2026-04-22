import { appendChatToolCall } from "./chatRepo";
import { runAssistantBootstrap, runAssistantCognitiveCycle } from "./assistantBrain";
import type { DaaAgentToolContext, DaaAgentToolExecutor } from "./agentToolTypes";

export function createAssistantBrainExecutionHandlers(input: DaaAgentToolContext): Map<DaaAgentToolContext["intent"]["kind"], DaaAgentToolExecutor> {
  const handlers = new Map<DaaAgentToolContext["intent"]["kind"], DaaAgentToolExecutor>();

  handlers.set("agent_run", async () => {
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
