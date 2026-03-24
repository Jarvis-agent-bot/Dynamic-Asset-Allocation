import { daaPgPool } from "@/src/daa/pg/daaPg";

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
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS daa_chat_messages_session_role_external_uidx
      ON daa_chat_messages(session_id, role, external_message_id)
      WHERE external_message_id IS NOT NULL
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS daa_chat_sessions_latest_idx ON daa_chat_sessions(latest_message_at DESC)");
}

export async function ensureChatRepoReady() {
  await ensureChatTables();
}
