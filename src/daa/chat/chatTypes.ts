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
  | "trade"
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
