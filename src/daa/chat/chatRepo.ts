import { randomUUID } from "node:crypto";

import { daaPgPool } from "@/src/daa/pg/daaPg";

import type { DaaChatChannel, DaaChatIntentKind, DaaChatMessage, DaaChatRole, DaaChatSession, DaaChatSessionPreview } from "./chatTypes";

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return {};
}

async function ensureChatTables() {
  const pool = daaPgPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS daa_chat_sessions (
      session_id TEXT PRIMARY KEY,
      channel TEXT NOT NULL,
      session_key TEXT NOT NULL UNIQUE,
      title TEXT NULL,
      participant_id TEXT NULL,
      external_chat_id TEXT NULL,
      external_user_id TEXT NULL,
      thread_id TEXT NULL,
      last_intent_kind TEXT NULL,
      last_user_text TEXT NULL,
      last_assistant_text TEXT NULL,
      latest_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      meta_json JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS daa_chat_messages (
      message_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES daa_chat_sessions(session_id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      body TEXT NOT NULL,
      intent_kind TEXT NULL,
      status TEXT NOT NULL DEFAULT 'completed',
      external_message_id TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      meta_json JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS daa_chat_session_memory (
      session_id TEXT PRIMARY KEY REFERENCES daa_chat_sessions(session_id) ON DELETE CASCADE,
      summary_text TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      meta_json JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS daa_chat_tool_calls (
      call_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES daa_chat_sessions(session_id) ON DELETE CASCADE,
      message_id TEXT NULL REFERENCES daa_chat_messages(message_id) ON DELETE SET NULL,
      tool_name TEXT NOT NULL,
      status TEXT NOT NULL,
      input_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      error_text TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS daa_chat_messages_session_created_idx ON daa_chat_messages(session_id, created_at DESC)");
  await pool.query("CREATE INDEX IF NOT EXISTS daa_chat_sessions_latest_idx ON daa_chat_sessions(latest_message_at DESC)");
}

async function ensureReady() {
  await ensureChatTables();
}

function mapSessionRow(row: Record<string, unknown>): DaaChatSession {
  return {
    sessionId: normalizeText(row.session_id),
    channel: normalizeText(row.channel) === "telegram" ? "telegram" : "web",
    sessionKey: normalizeText(row.session_key),
    title: normalizeText(row.title) || null,
    participantId: normalizeText(row.participant_id) || null,
    externalChatId: normalizeText(row.external_chat_id) || null,
    externalUserId: normalizeText(row.external_user_id) || null,
    threadId: normalizeText(row.thread_id) || null,
    lastIntentKind: normalizeText(row.last_intent_kind) as DaaChatIntentKind || null,
    lastUserText: normalizeText(row.last_user_text) || null,
    lastAssistantText: normalizeText(row.last_assistant_text) || null,
    latestMessageAt: normalizeText(row.latest_message_at),
    createdAt: normalizeText(row.created_at),
    updatedAt: normalizeText(row.updated_at),
    metaJson: parseJsonObject(row.meta_json),
  };
}

function mapMessageRow(row: Record<string, unknown>): DaaChatMessage {
  return {
    messageId: normalizeText(row.message_id),
    sessionId: normalizeText(row.session_id),
    role: normalizeText(row.role) === "assistant" ? "assistant" : normalizeText(row.role) === "system" ? "system" : "user",
    body: normalizeText(row.body),
    intentKind: normalizeText(row.intent_kind) as DaaChatIntentKind || null,
    status: normalizeText(row.status) === "received" ? "received" : normalizeText(row.status) === "failed" ? "failed" : "completed",
    externalMessageId: normalizeText(row.external_message_id) || null,
    createdAt: normalizeText(row.created_at),
    metaJson: parseJsonObject(row.meta_json),
  };
}

export async function getOrCreateChatSession(input: {
  channel: DaaChatChannel;
  sessionKey: string;
  title?: string | null;
  participantId?: string | null;
  externalChatId?: string | null;
  externalUserId?: string | null;
  threadId?: string | null;
  metaJson?: Record<string, unknown>;
}): Promise<DaaChatSession> {
  await ensureReady();
  const pool = daaPgPool();
  const existing = await pool.query(
    "SELECT * FROM daa_chat_sessions WHERE session_key = $1 LIMIT 1",
    [input.sessionKey],
  );
  if (existing.rows[0]) return mapSessionRow(existing.rows[0] as Record<string, unknown>);

  const sessionId = randomUUID();
  const result = await pool.query(
    `INSERT INTO daa_chat_sessions (
      session_id, channel, session_key, title, participant_id, external_chat_id, external_user_id, thread_id, meta_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
    RETURNING *`,
    [
      sessionId,
      input.channel,
      input.sessionKey,
      input.title || null,
      input.participantId || null,
      input.externalChatId || null,
      input.externalUserId || null,
      input.threadId || null,
      JSON.stringify(input.metaJson || {}),
    ],
  );
  return mapSessionRow(result.rows[0] as Record<string, unknown>);
}

export async function appendChatMessage(input: {
  sessionId: string;
  role: DaaChatRole;
  body: string;
  intentKind?: DaaChatIntentKind | null;
  status?: "received" | "completed" | "failed";
  externalMessageId?: string | null;
  metaJson?: Record<string, unknown>;
}): Promise<DaaChatMessage> {
  await ensureReady();
  const pool = daaPgPool();
  const messageId = randomUUID();
  const body = normalizeText(input.body);
  const result = await pool.query(
    `INSERT INTO daa_chat_messages (
      message_id, session_id, role, body, intent_kind, status, external_message_id, meta_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
    RETURNING *`,
    [
      messageId,
      input.sessionId,
      input.role,
      body,
      input.intentKind || null,
      input.status || "completed",
      input.externalMessageId || null,
      JSON.stringify(input.metaJson || {}),
    ],
  );

  await pool.query(
    `UPDATE daa_chat_sessions
     SET latest_message_at = NOW(),
         updated_at = NOW(),
         last_intent_kind = COALESCE($2, last_intent_kind),
         last_user_text = CASE WHEN $3 = 'user' THEN $4 ELSE last_user_text END,
         last_assistant_text = CASE WHEN $3 = 'assistant' THEN $4 ELSE last_assistant_text END,
         title = COALESCE(title, CASE WHEN $3 = 'user' THEN $5 ELSE NULL END)
     WHERE session_id = $1`,
    [input.sessionId, input.intentKind || null, input.role, body, body.slice(0, 48)],
  );

  return mapMessageRow(result.rows[0] as Record<string, unknown>);
}

export async function listChatMessages(sessionId: string, limit = 16): Promise<DaaChatMessage[]> {
  await ensureReady();
  const pool = daaPgPool();
  const result = await pool.query(
    `SELECT *
     FROM daa_chat_messages
     WHERE session_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [sessionId, Math.max(1, Math.min(60, Math.trunc(limit)))],
  );
  return result.rows
    .map((row) => mapMessageRow(row as Record<string, unknown>))
    .reverse();
}

export async function listRecentChatSessions(limit = 8): Promise<DaaChatSessionPreview[]> {
  await ensureReady();
  const pool = daaPgPool();
  const result = await pool.query(
    `SELECT *
     FROM daa_chat_sessions
     ORDER BY latest_message_at DESC
     LIMIT $1`,
    [Math.max(1, Math.min(20, Math.trunc(limit)))],
  );
  return result.rows.map((row) => {
    const session = mapSessionRow(row as Record<string, unknown>);
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
  });
}

export async function getChatSessionById(sessionId: string): Promise<DaaChatSession | null> {
  await ensureReady();
  const pool = daaPgPool();
  const result = await pool.query(
    "SELECT * FROM daa_chat_sessions WHERE session_id = $1 LIMIT 1",
    [sessionId],
  );
  return result.rows[0] ? mapSessionRow(result.rows[0] as Record<string, unknown>) : null;
}

export async function getChatSessionByKey(sessionKey: string): Promise<DaaChatSession | null> {
  await ensureReady();
  const pool = daaPgPool();
  const result = await pool.query(
    "SELECT * FROM daa_chat_sessions WHERE session_key = $1 LIMIT 1",
    [sessionKey],
  );
  return result.rows[0] ? mapSessionRow(result.rows[0] as Record<string, unknown>) : null;
}

export async function appendChatToolCall(input: {
  sessionId: string;
  messageId?: string | null;
  toolName: string;
  status: "ok" | "failed";
  inputJson?: Record<string, unknown>;
  resultJson?: Record<string, unknown>;
  errorText?: string | null;
}) {
  await ensureReady();
  const pool = daaPgPool();
  await pool.query(
    `INSERT INTO daa_chat_tool_calls (
      call_id, session_id, message_id, tool_name, status, input_json, result_json, error_text
    ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)`,
    [
      randomUUID(),
      input.sessionId,
      input.messageId || null,
      input.toolName,
      input.status,
      JSON.stringify(input.inputJson || {}),
      JSON.stringify(input.resultJson || {}),
      input.errorText || null,
    ],
  );
}
