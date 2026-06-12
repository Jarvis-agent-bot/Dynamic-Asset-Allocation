import { daaPgPool } from "@/src/daa/pg/daaPg";

import { mapSessionStateRow, normalizeChatText } from "./chatRepoMappers";
import { ensureChatRepoReady } from "./chatRepoSchema";
import type { DaaChatSessionState } from "./chatTypes";

export async function getChatSessionState(sessionId: string): Promise<DaaChatSessionState | null> {
  await ensureChatRepoReady();
  const pool = daaPgPool();
  const result = await pool.query(
    "SELECT session_id, summary_text, updated_at, meta_json FROM daa_chat_session_memory WHERE session_id = $1 LIMIT 1",
    [sessionId],
  );
  return result.rows[0] ? mapSessionStateRow(result.rows[0] as Record<string, unknown>) : null;
}

export async function saveChatSessionState(input: {
  sessionId: string;
  summaryText?: string | null;
  metaJson?: Record<string, unknown>;
}): Promise<DaaChatSessionState> {
  await ensureChatRepoReady();
  const pool = daaPgPool();
  const result = await pool.query(
    `INSERT INTO daa_chat_session_memory (session_id, summary_text, updated_at, meta_json)
     VALUES ($1, $2, NOW(), $3::jsonb)
     ON CONFLICT (session_id) DO UPDATE
       SET summary_text = EXCLUDED.summary_text,
           updated_at = NOW(),
           meta_json = EXCLUDED.meta_json
     RETURNING session_id, summary_text, updated_at, meta_json`,
    [
      input.sessionId,
      normalizeChatText(input.summaryText),
      JSON.stringify(input.metaJson || {}),
    ],
  );
  return mapSessionStateRow(result.rows[0] as Record<string, unknown>);
}
