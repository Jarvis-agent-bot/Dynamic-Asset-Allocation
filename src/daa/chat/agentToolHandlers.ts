import { createAssistantBrainExecutionHandlers } from "./agentBrainExecutionHandlers";
import type { DaaAgentToolContext, DaaAgentToolExecutor } from "./agentToolTypes";
import { createAssistantExecutionHandlers } from "./agentToolExecutionHandlers";
import { createAssistantQueryHandlers } from "./agentToolViewHandlers";
import { createAssistantReasoningHandlers } from "./agentToolReasoningHandlers";

function mergeHandlerMaps(
  ...maps: Array<Map<DaaAgentToolContext["intent"]["kind"], DaaAgentToolExecutor>>
): Map<DaaAgentToolContext["intent"]["kind"], DaaAgentToolExecutor> {
  const merged = new Map<DaaAgentToolContext["intent"]["kind"], DaaAgentToolExecutor>();
  for (const map of maps) {
    for (const [intent, handler] of map.entries()) {
      merged.set(intent, handler);
    }
  }
  return merged;
}

export function createAssistantToolHandlers(input: DaaAgentToolContext): Map<DaaAgentToolContext["intent"]["kind"], DaaAgentToolExecutor> {
  return mergeHandlerMaps(
    createAssistantQueryHandlers(input),
    createAssistantBrainExecutionHandlers(input),
    createAssistantExecutionHandlers(input),
    createAssistantReasoningHandlers(input),
  );
}
