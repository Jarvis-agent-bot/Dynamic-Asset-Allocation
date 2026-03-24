import { randomUUID } from "node:crypto";

import { daaPgPool } from "@/src/daa/pg/daaPg";

import { mapMessageRow, normalizeChatText } from "./chatRepoMappers";
import { ensureChatRepoReady } from "./chatRepoSchema";
import type { DaaChatIntentKind, DaaChatMessage, DaaChatRole } from "./chatTypes";

export async function appendChatMessage(input: {
  sessionId: string;
  role: DaaChatRole;
  body: string;
  intentKind?: DaaChatIntentKind | null;
  status?: "received" | "completed" | "failed";
  externalMessageId?: string | null;
  metaJson?: Record<string, unknown>;
}): Promise<DaaChatMessage> {
  await ensureChatRepoReady();
  const pool = daaPgPool();
  const body = normalizeChatText(input.body);
  const result = await pool.query(
    `INSERT INTO daa_chat_messages (
      message_id, session_id, role, body, intent_kind, status, external_message_id, meta_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
    RETURNING *`,
    [
      randomUUID(),
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
  await ensureChatRepoReady();
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

export async function findChatMessageByExternalMessageId(input: {
  sessionId: string;
  externalMessageId: string;
  role?: DaaChatRole;
}): Promise<DaaChatMessage | null> {
  await ensureChatRepoReady();
  const pool = daaPgPool();
  const result = await pool.query(
    `SELECT *
     FROM daa_chat_messages
     WHERE session_id = $1
       AND external_message_id = $2
       AND ($3::text IS NULL OR role = $3)
     ORDER BY created_at DESC
     LIMIT 1`,
    [input.sessionId, input.externalMessageId, input.role || null],
  );
  return result.rows[0] ? mapMessageRow(result.rows[0] as Record<string, unknown>) : null;
}
