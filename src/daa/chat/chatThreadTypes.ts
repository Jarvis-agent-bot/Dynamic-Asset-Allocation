import type { DaaChatChannel, DaaChatIntentKind, DaaChatSessionPreview } from "./chatTypes";

export type DaaAssistantThread = {
  threadKey: string;
  sessionId: string;
  channel: DaaChatChannel;
  title: string | null;
  participantId: string | null;
  externalChatId: string | null;
  externalUserId: string | null;
  threadId: string | null;
  sourceLabel: string;
  threadLabel: string;
  lastIntentKind: DaaChatIntentKind | null;
  lastUserText: string | null;
  lastAssistantText: string | null;
  latestSnippet: string | null;
  latestMessageAt: string;
  updatedAt: string;
};

export function buildAssistantThreadFromSession(session: DaaChatSessionPreview): DaaAssistantThread {
  const sourceLabel = session.channel === "telegram" ? "Telegram" : "Web";
  const threadLabel = session.channel === "telegram"
    ? (session.threadId ? `话题 ${session.threadId}` : "主会话")
    : "当前浏览器会话";
  return {
    threadKey: `${session.channel}:${session.externalChatId || "local"}:${session.externalUserId || "local"}:${session.threadId || "main"}`,
    sessionId: session.sessionId,
    channel: session.channel,
    title: session.title,
    participantId: session.participantId,
    externalChatId: session.externalChatId,
    externalUserId: session.externalUserId,
    threadId: session.threadId,
    sourceLabel,
    threadLabel,
    lastIntentKind: session.lastIntentKind,
    lastUserText: session.lastUserText,
    lastAssistantText: session.lastAssistantText,
    latestSnippet: session.lastAssistantText || session.lastUserText || null,
    latestMessageAt: session.latestMessageAt,
    updatedAt: session.updatedAt,
  };
}

export function buildAssistantThreads(sessions: DaaChatSessionPreview[]): DaaAssistantThread[] {
  return sessions.map((session) => buildAssistantThreadFromSession(session));
}
