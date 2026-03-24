import {
  buildTelegramAssistantSessionDescriptor,
  type DaaAssistantSessionDescriptor,
  type TelegramInboundMessage,
} from "./channelAdapters";
import {
  findChatMessageByExternalMessageId,
  getOrCreateChatSession,
  listRecentChatSessions,
} from "./chatRepo";
import type { DaaChatChannel } from "./chatTypes";

async function ensureAssistantSession(descriptor: DaaAssistantSessionDescriptor) {
  return getOrCreateChatSession(descriptor);
}

async function findDuplicateUserInboundMessage(input: {
  sessionId: string;
  externalMessageId: string | null;
}) {
  if (!input.externalMessageId) return null;
  return findChatMessageByExternalMessageId({
    sessionId: input.sessionId,
    externalMessageId: input.externalMessageId,
    role: "user",
  });
}

export async function prepareTelegramAssistantSession(inbound: TelegramInboundMessage) {
  const descriptor = buildTelegramAssistantSessionDescriptor(inbound);
  const session = await ensureAssistantSession(descriptor);
  const duplicateMessage = await findDuplicateUserInboundMessage({
    sessionId: session.sessionId,
    externalMessageId: inbound.externalMessageId,
  });
  return {
    descriptor,
    session,
    duplicateMessage,
  };
}

export async function getLatestAssistantSessionByChannel(channel: DaaChatChannel) {
  const sessions = await listRecentChatSessions(12);
  const filtered = sessions.filter((item) => item.channel === channel);
  const [latest] = filtered;
  return latest || null;
}
