import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import type {
  DaaChatIntentKind,
  DaaChatMessage,
  DaaChatSession,
  DaaChatSessionMemory,
  DaaChatSessionPreview,
} from "./chatTypes";

export function normalizeChatText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toIsoString(value: unknown): string {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? new Date(ms).toISOString() : "";
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return "";
    const ms = Date.parse(text);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : text;
  }
  return "";
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch (err) {
      logSwallowed("chatRepoMappers.parseJsonb", err);
      return {};
    }
  }
  return {};
}

export function mapSessionRow(row: Record<string, unknown>): DaaChatSession {
  return {
    sessionId: normalizeChatText(row.session_id),
    channel: normalizeChatText(row.channel) === "telegram" ? "telegram" : "web",
    sessionKey: normalizeChatText(row.session_key),
    title: normalizeChatText(row.title) || null,
    participantId: normalizeChatText(row.participant_id) || null,
    externalChatId: normalizeChatText(row.external_chat_id) || null,
    externalUserId: normalizeChatText(row.external_user_id) || null,
    threadId: normalizeChatText(row.thread_id) || null,
    lastIntentKind: normalizeChatText(row.last_intent_kind) as DaaChatIntentKind || null,
    lastUserText: normalizeChatText(row.last_user_text) || null,
    lastAssistantText: normalizeChatText(row.last_assistant_text) || null,
    latestMessageAt: toIsoString(row.latest_message_at),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    metaJson: parseJsonObject(row.meta_json),
  };
}

export function mapSessionPreview(session: DaaChatSession): DaaChatSessionPreview {
  return {
    sessionId: session.sessionId,
    channel: session.channel,
    title: session.title,
    participantId: session.participantId,
    externalChatId: session.externalChatId,
    externalUserId: session.externalUserId,
    threadId: session.threadId,
    lastIntentKind: session.lastIntentKind,
    lastUserText: session.lastUserText,
    lastAssistantText: session.lastAssistantText,
    latestMessageAt: session.latestMessageAt,
    updatedAt: session.updatedAt,
  };
}

export function mapMessageRow(row: Record<string, unknown>): DaaChatMessage {
  return {
    messageId: normalizeChatText(row.message_id),
    sessionId: normalizeChatText(row.session_id),
    role: normalizeChatText(row.role) === "assistant" ? "assistant" : normalizeChatText(row.role) === "system" ? "system" : "user",
    body: normalizeChatText(row.body),
    intentKind: normalizeChatText(row.intent_kind) as DaaChatIntentKind || null,
    status: normalizeChatText(row.status) === "received" ? "received" : normalizeChatText(row.status) === "failed" ? "failed" : "completed",
    externalMessageId: normalizeChatText(row.external_message_id) || null,
    createdAt: toIsoString(row.created_at),
    metaJson: parseJsonObject(row.meta_json),
  };
}

export function mapMemoryRow(row: Record<string, unknown>): DaaChatSessionMemory {
  return {
    sessionId: normalizeChatText(row.session_id),
    summaryText: normalizeChatText(row.summary_text),
    updatedAt: toIsoString(row.updated_at),
    metaJson: parseJsonObject(row.meta_json),
  };
}
