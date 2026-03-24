import {
  getChatSessionById,
  getChatSessionByKey,
  listChatMessages,
  listRecentChatSessions,
} from "./chatRepo";
import { buildWebAssistantSessionDescriptor } from "./channelAdapters";
import { buildAssistantThreadFromSession, buildAssistantThreads, type DaaAssistantThread } from "./chatThreadTypes";
import type { DaaAssistantConversationReadModel } from "./chatConversationTypes";
import type { DaaChatMessage, DaaChatSession, DaaChatSessionPreview } from "./chatTypes";

function resolveThread(
  threads: DaaAssistantThread[],
  session: DaaChatSession | null,
): DaaAssistantThread | null {
  if (!session) return null;
  return threads.find((item) => item.sessionId === session.sessionId) || buildAssistantThreadFromSession(session);
}

function buildAssistantConversationReadModel(input: {
  activeSession: DaaChatSession | null;
  selectedSession: DaaChatSession | null;
  messages: DaaChatMessage[];
  sessions: DaaChatSessionPreview[];
}): DaaAssistantConversationReadModel {
  const threads = buildAssistantThreads(input.sessions);
  const activeThread = resolveThread(threads, input.activeSession);
  const selectedThread = resolveThread(threads, input.selectedSession);

  return {
    activeSession: input.activeSession,
    selectedSession: input.selectedSession,
    activeThread,
    selectedThread,
    selectedSessionId: input.selectedSession?.sessionId || null,
    isPreviewingOtherThread: Boolean(
      input.activeSession
      && input.selectedSession
      && input.activeSession.sessionId !== input.selectedSession.sessionId,
    ),
    messages: input.messages,
    sessions: input.sessions,
    threads,
    stats: {
      messageCount: input.messages.length,
      threadCount: threads.length,
      webThreadCount: threads.filter((item) => item.channel === "web").length,
      telegramThreadCount: threads.filter((item) => item.channel === "telegram").length,
      latestMessageAt: threads[0]?.latestMessageAt || null,
    },
  };
}

async function loadAssistantConversationReadModel(input: {
  sessionId?: string | null;
  sessionKey?: string | null;
  messageLimit?: number;
  sessionLimit?: number;
}) {
  const sessionId = (input.sessionId || "").trim();
  const sessionKey = (input.sessionKey || "").trim();

  const [activeSession, selectedSessionById, sessions] = await Promise.all([
    sessionKey ? getChatSessionByKey(sessionKey) : Promise.resolve(null),
    sessionId ? getChatSessionById(sessionId) : Promise.resolve(null),
    listRecentChatSessions(input.sessionLimit || 8),
  ]);

  const selectedSession = selectedSessionById || activeSession;
  const messages = selectedSession
    ? await listChatMessages(selectedSession.sessionId, input.messageLimit || 16)
    : [];

  return buildAssistantConversationReadModel({
    activeSession,
    selectedSession,
    messages,
    sessions,
  });
}

export async function loadWebAssistantConversationReadModel(input: {
  accountId: string;
  username: string;
  sessionId?: string | null;
  messageLimit?: number;
  sessionLimit?: number;
}) {
  const descriptor = buildWebAssistantSessionDescriptor(input);
  return loadAssistantConversationReadModel({
    sessionId: input.sessionId,
    sessionKey: descriptor.sessionKey,
    messageLimit: input.messageLimit,
    sessionLimit: input.sessionLimit,
  });
}
