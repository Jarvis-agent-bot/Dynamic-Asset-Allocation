import type { DaaChatChannel } from "./chatTypes";

export type DaaAssistantSessionDescriptor = {
  channel: DaaChatChannel;
  sessionKey: string;
  title: string | null;
  participantId: string | null;
  externalChatId: string | null;
  externalUserId: string | null;
  threadId: string | null;
};

type TelegramUpdate = {
  update_id?: number;
  message?: {
    message_id?: number;
    message_thread_id?: number;
    text?: string;
    chat?: { id?: number | string; type?: string; title?: string };
    from?: { id?: number | string; username?: string; first_name?: string; last_name?: string };
  };
};

export type TelegramInboundMessage = {
  updateId: number | null;
  text: string;
  chatId: string;
  userId: string;
  threadId: string | null;
  externalMessageId: string | null;
  replyToMessageId: string | null;
  title: string;
  participantId: string;
};

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function buildWebAssistantSessionDescriptor(input: {
  accountId: string;
  username: string;
}): DaaAssistantSessionDescriptor {
  return {
    channel: "web",
    sessionKey: `web:${input.accountId}`,
    title: `Web 助手 · ${input.username}`,
    participantId: input.username,
    externalChatId: null,
    externalUserId: input.accountId,
    threadId: null,
  };
}

export function parseTelegramInboundUpdate(update: TelegramUpdate): TelegramInboundMessage | null {
  const message = update.message;
  const text = normalizeText(message?.text);
  const chatId = message?.chat?.id == null ? "" : String(message.chat.id).trim();
  const userId = message?.from?.id == null ? "" : String(message.from.id).trim();
  const threadId = message?.message_thread_id == null ? "" : String(message.message_thread_id).trim();
  if (!text || !chatId || !userId) return null;

  const participantId = normalizeText(message?.from?.username)
    || [message?.from?.first_name, message?.from?.last_name].map(normalizeText).filter(Boolean).join(" ")
    || userId;

  return {
    updateId: update.update_id == null ? null : Number(update.update_id),
    text,
    chatId,
    userId,
    threadId: threadId || null,
    externalMessageId: message?.message_id == null ? null : String(message.message_id).trim(),
    replyToMessageId: message?.message_id == null ? null : String(message.message_id).trim(),
    title: normalizeText(message?.chat?.title)
      || normalizeText(message?.from?.username)
      || normalizeText(message?.from?.first_name)
      || "Telegram 助手",
    participantId,
  };
}

export function buildTelegramAssistantSessionDescriptor(input: TelegramInboundMessage): DaaAssistantSessionDescriptor {
  return {
    channel: "telegram",
    sessionKey: `telegram:${input.chatId}:${input.userId}:${input.threadId || "main"}`,
    title: input.title,
    participantId: input.participantId,
    externalChatId: input.chatId,
    externalUserId: input.userId,
    threadId: input.threadId,
  };
}
