import { daaPgPool } from "@/src/daa/pg/daaPg";

import { mapMemoryRow, normalizeChatText } from "./chatRepoMappers";
import { ensureChatRepoReady } from "./chatRepoSchema";
import type { DaaChatSessionMemory } from "./chatTypes";

export async function getChatSessionMemory(sessionId: string): Promise<DaaChatSessionMemory | null> {
  await ensureChatRepoReady();
  const pool = daaPgPool();
  const result = await pool.query(
    "SELECT session_id, summary_text, updated_at, meta_json FROM daa_chat_session_memory WHERE session_id = $1 LIMIT 1",
    [sessionId],
  );
  return result.rows[0] ? mapMemoryRow(result.rows[0] as Record<string, unknown>) : null;
}

export async function saveChatSessionMemory(input: {
  sessionId: string;
  summaryText?: string | null;
  metaJson?: Record<string, unknown>;
}): Promise<DaaChatSessionMemory> {
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
  return mapMemoryRow(result.rows[0] as Record<string, unknown>);
}
