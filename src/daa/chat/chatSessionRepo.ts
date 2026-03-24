import { randomUUID } from "node:crypto";

import { daaPgPool } from "@/src/daa/pg/daaPg";

import { mapSessionPreview, mapSessionRow } from "./chatRepoMappers";
import { ensureChatRepoReady } from "./chatRepoSchema";
import type { DaaChatChannel, DaaChatSession, DaaChatSessionPreview } from "./chatTypes";

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
  await ensureChatRepoReady();
  const pool = daaPgPool();
  const existing = await pool.query(
    "SELECT * FROM daa_chat_sessions WHERE session_key = $1 LIMIT 1",
    [input.sessionKey],
  );
  if (existing.rows[0]) return mapSessionRow(existing.rows[0] as Record<string, unknown>);

  const result = await pool.query(
    `INSERT INTO daa_chat_sessions (
      session_id, channel, session_key, title, participant_id, external_chat_id, external_user_id, thread_id, meta_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
    RETURNING *`,
    [
      randomUUID(),
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

export async function listRecentChatSessions(limit = 8): Promise<DaaChatSessionPreview[]> {
  await ensureChatRepoReady();
  const pool = daaPgPool();
  const result = await pool.query(
    `SELECT *
     FROM daa_chat_sessions
     ORDER BY latest_message_at DESC
     LIMIT $1`,
    [Math.max(1, Math.min(20, Math.trunc(limit)))],
  );
  return result.rows.map((row) => mapSessionPreview(mapSessionRow(row as Record<string, unknown>)));
}

export async function getChatSessionById(sessionId: string): Promise<DaaChatSession | null> {
  await ensureChatRepoReady();
  const pool = daaPgPool();
  const result = await pool.query(
    "SELECT * FROM daa_chat_sessions WHERE session_id = $1 LIMIT 1",
    [sessionId],
  );
  return result.rows[0] ? mapSessionRow(result.rows[0] as Record<string, unknown>) : null;
}

export async function getChatSessionByKey(sessionKey: string): Promise<DaaChatSession | null> {
  await ensureChatRepoReady();
  const pool = daaPgPool();
  const result = await pool.query(
    "SELECT * FROM daa_chat_sessions WHERE session_key = $1 LIMIT 1",
    [sessionKey],
  );
  return result.rows[0] ? mapSessionRow(result.rows[0] as Record<string, unknown>) : null;
}
