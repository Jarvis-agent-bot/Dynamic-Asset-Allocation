import { Pool } from "pg";

type PgStateV0 = {
  pool: Pool | null;
  schemaInit: Promise<void> | null;
};

const GLOBAL_KEY = "__daa_pg_state_v0__";

function getStateV0(): PgStateV0 {
  const g: any = globalThis as any;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = { pool: null, schemaInit: null } satisfies PgStateV0;
  }
  return g[GLOBAL_KEY] as PgStateV0;
}

export function getDaaPgUrlV0(): string | null {
  const raw = typeof process.env.DAA_DB_URL === "string" ? process.env.DAA_DB_URL : typeof process.env.DATABASE_URL === "string" ? process.env.DATABASE_URL : "";
  const v = (raw || "").trim();
  if (!v) return null;

  // Allow sharing env with the Python service (sqlalchemy uses postgresql+psycopg://).
  return v.replace(/^postgresql\+psycopg:\/\//i, "postgresql://");
}

export function isDaaPgEnabledV0(): boolean {
  return Boolean(getDaaPgUrlV0());
}

export function daaPgPoolV0(): Pool {
  const st = getStateV0();
  if (st.pool) return st.pool;

  const url = getDaaPgUrlV0();
  if (!url) throw new Error("DAA Postgres not configured (missing DAA_DB_URL or DATABASE_URL)");

  st.pool = new Pool({ connectionString: url });
  return st.pool;
}

export async function withDaaPgClientV0<T>(fn: (client: { query: Pool["query"] }) => Promise<T>): Promise<T> {
  const pool = daaPgPoolV0();
  const client = await pool.connect();
  try {
    // Wrap only the `query` surface so callers don't depend on pg Client types.
    return await fn({ query: client.query.bind(client) });
  } finally {
    client.release();
  }
}

export async function ensureDaaAuthSchemaPgV0(): Promise<void> {
  const st = getStateV0();
  st.schemaInit ||= withDaaPgClientV0(async ({ query }) => {
    await query("BEGIN");
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS daa_auth_accounts (
          account_id TEXT PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          roles_json TEXT NOT NULL DEFAULT '[]',
          status TEXT NOT NULL DEFAULT 'active',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_daa_auth_accounts_status
          ON daa_auth_accounts(status);

        CREATE TABLE IF NOT EXISTS daa_auth_sessions (
          session_id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL REFERENCES daa_auth_accounts(account_id) ON DELETE CASCADE,
          token_sha256 TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          revoked_at TEXT,
          user_agent TEXT,
          ip TEXT,
          last_seen_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_daa_auth_sessions_account_created_at
          ON daa_auth_sessions(account_id, created_at);

        CREATE INDEX IF NOT EXISTS idx_daa_auth_sessions_expires_at
          ON daa_auth_sessions(expires_at);

        CREATE INDEX IF NOT EXISTS idx_daa_auth_sessions_revoked_at
          ON daa_auth_sessions(revoked_at);

        CREATE TABLE IF NOT EXISTS daa_auth_email_login_tokens (
          token_id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL REFERENCES daa_auth_accounts(account_id) ON DELETE CASCADE,
          token_sha256 TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          used_at TEXT,
          user_agent TEXT,
          ip TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_daa_auth_email_login_tokens_account_created_at
          ON daa_auth_email_login_tokens(account_id, created_at);

        CREATE INDEX IF NOT EXISTS idx_daa_auth_email_login_tokens_expires_at
          ON daa_auth_email_login_tokens(expires_at);

        CREATE INDEX IF NOT EXISTS idx_daa_auth_email_login_tokens_used_at
          ON daa_auth_email_login_tokens(used_at);
      `);

      await query("COMMIT");
    } catch (e) {
      try {
        await query("ROLLBACK");
      } catch {
        // ignore
      }
      throw e;
    }
  });

  return st.schemaInit;
}
