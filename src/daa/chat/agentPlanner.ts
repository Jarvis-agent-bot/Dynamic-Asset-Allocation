import { buildContextDigest, buildRecentConversation, describePendingAction, type DaaAssistantRuntimeContext } from "./agentContext";
import { planAssistantIntent } from "./intentParser";

export { assistantIntentKind, type AssistantPlanningResult, type DaaAssistantIntent } from "./intentParser";

export async function planAssistantTurn(input: {
  userText: string;
  allowExecution: boolean;
  runtimeContext: DaaAssistantRuntimeContext;
}) {
  return planAssistantIntent({
    userText: input.userText,
    allowExecution: input.allowExecution,
    contextDigest: buildContextDigest(input.runtimeContext.readModel),
    systemDigest: input.runtimeContext.systemDigest,
    sessionSummary: input.runtimeContext.sessionMemory?.summaryText || "",
    recentConversation: buildRecentConversation(input.runtimeContext.recentMessages),
    pendingActionDescription: describePendingAction(input.runtimeContext.storedPendingAction),
    learningDigest: input.runtimeContext.learningDigest,
  });
}
