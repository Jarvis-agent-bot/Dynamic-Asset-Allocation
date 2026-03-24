import { randomUUID } from "node:crypto";

import { daaPgPool } from "@/src/daa/pg/daaPg";

import { ensureChatRepoReady } from "./chatRepoSchema";

export async function appendChatToolCall(input: {
  sessionId: string;
  messageId?: string | null;
  toolName: string;
  status: "ok" | "failed";
  inputJson?: Record<string, unknown>;
  resultJson?: Record<string, unknown>;
  errorText?: string | null;
}) {
  await ensureChatRepoReady();
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
