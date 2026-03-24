import type { DaaAssistantIntent } from "./agentPlanner";
import type { DaaAssistantRuntimeContext } from "./agentContext";
import type { DaaChatIntentKind, DaaChatPendingAction } from "./chatTypes";

export type DaaAgentToolResult = {
  text: string;
  intentKind: DaaChatIntentKind;
  pendingAction: DaaChatPendingAction | null;
};

export type DaaAgentToolContext = DaaAssistantRuntimeContext & {
  intent: DaaAssistantIntent;
  currentPendingAction: DaaChatPendingAction | null;
  allowExecution: boolean;
  requireConfirmation: boolean;
  sessionId: string;
  userMessageId: string;
};

export type DaaAgentToolMeta = {
  intent: DaaAssistantIntent["kind"];
  name: string;
  description: string;
};

export type DaaAgentToolExecutor = () => Promise<DaaAgentToolResult>;
