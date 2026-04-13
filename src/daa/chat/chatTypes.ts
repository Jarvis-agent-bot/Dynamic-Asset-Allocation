export type DaaChatChannel = "telegram" | "web";
export type DaaChatRole = "user" | "assistant" | "system";

export type DaaChatIntentKind =
  | "help"
  | "portfolio_status"
  | "risk_status"
  | "market_status"
  | "latest_cycle"
  | "rebalance_generate"
  | "rebalance_execute"
  | "confirm_action"
  | "cancel_action"
  | "trade"
  | "thesis_status"
  | "agent_briefing"
  | "llm_answer"
  | "unknown";

export type DaaChatSession = {
  sessionId: string;
  channel: DaaChatChannel;
  sessionKey: string;
  title: string | null;
  participantId: string | null;
  externalChatId: string | null;
  externalUserId: string | null;
  threadId: string | null;
  lastIntentKind: DaaChatIntentKind | null;
  lastUserText: string | null;
  lastAssistantText: string | null;
  latestMessageAt: string;
  createdAt: string;
  updatedAt: string;
  metaJson: Record<string, unknown>;
};

export type DaaChatMessage = {
  messageId: string;
  sessionId: string;
  role: DaaChatRole;
  body: string;
  intentKind: DaaChatIntentKind | null;
  status: "received" | "completed" | "failed";
  externalMessageId: string | null;
  createdAt: string;
  metaJson: Record<string, unknown>;
};

export type DaaChatSessionPreview = Pick<
  DaaChatSession,
  | "sessionId"
  | "channel"
  | "title"
  | "participantId"
  | "externalChatId"
  | "externalUserId"
  | "threadId"
  | "lastIntentKind"
  | "lastUserText"
  | "lastAssistantText"
  | "latestMessageAt"
  | "updatedAt"
>;

export type DaaChatPendingAction =
  | {
      kind: "trade";
      side: "BUY" | "SELL";
      symbol: string;
      qty: number | null;
      notional: number | null;
      createdAt: string;
      expiresAt: string;
    }
  | {
      kind: "rebalance_execute";
      cycleId: string;
      executeMode: "all";
      createdAt: string;
      expiresAt: string;
    };

export type DaaChatSessionMemory = {
  sessionId: string;
  summaryText: string;
  updatedAt: string;
  metaJson: Record<string, unknown> & {
    pendingAction?: DaaChatPendingAction | null;
  };
};
