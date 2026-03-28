import { Pool } from "pg";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

type PgState = {
  pool: Pool | null;
  schemaInit: Promise<void> | null;
};

const GLOBAL_KEY = "__daa_pg_state_v0__";

function getState(): PgState {
  const g: any = globalThis as any;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = { pool: null, schemaInit: null } satisfies PgState;
  }
  return g[GLOBAL_KEY] as PgState;
}

export function getDaaPgUrl(): string | null {
  const daaDbUrl = typeof process.env.DAA_DB_URL === "string" ? process.env.DAA_DB_URL.trim() : "";
  const databaseUrl = typeof process.env.DATABASE_URL === "string" ? process.env.DATABASE_URL.trim() : "";
  const v = daaDbUrl || databaseUrl;
  if (!v) return null;

  // Allow sharing env with the Python service (sqlalchemy uses postgresql+psycopg://).
  return v.replace(/^postgresql\+psycopg:\/\//i, "postgresql://");
}

export function isDaaPgEnabled(): boolean {
  return Boolean(getDaaPgUrl());
}

export function daaPgPool(): Pool {
  const st = getState();
  if (st.pool) return st.pool;

  const url = getDaaPgUrl();
  if (!url) {
    throw new Error("DAA Postgres not configured (missing DAA_DB_URL or DATABASE_URL)");
  }

  const pool = new Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 30_000,
  });
  st.pool = pool;
  return pool;
}

export async function withDaaPgClient<T>(fn: (client: { query: Pool["query"] }) => Promise<T>): Promise<T> {
  const pool = daaPgPool();
  const client = await pool.connect();
  try {
    return await fn({ query: client.query.bind(client) });
  } finally {
    client.release();
  }
}

export async function ensureDaaAuthSchemaPg(): Promise<void> {
  const st = getState();
  if (!st.schemaInit) {
    st.schemaInit = withDaaPgClient(async ({ query }) => {
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

          CREATE TABLE IF NOT EXISTS daa_auth_audit_events (
            event_id TEXT PRIMARY KEY,
            created_at TEXT NOT NULL,
            kind TEXT NOT NULL,
            actor_user_id TEXT NOT NULL,
            account_id TEXT REFERENCES daa_auth_accounts(account_id) ON DELETE SET NULL,
            session_id TEXT REFERENCES daa_auth_sessions(session_id) ON DELETE SET NULL,
            payload_json TEXT NOT NULL DEFAULT '{}'
          );

          CREATE INDEX IF NOT EXISTS idx_daa_auth_audit_events_created
            ON daa_auth_audit_events(created_at DESC, event_id DESC);

          CREATE INDEX IF NOT EXISTS idx_daa_auth_audit_events_actor
            ON daa_auth_audit_events(actor_user_id, created_at DESC);

          CREATE INDEX IF NOT EXISTS idx_daa_auth_audit_events_actor_created_event
            ON daa_auth_audit_events(actor_user_id, created_at DESC, event_id DESC);
        `);

        await query("COMMIT");
      } catch (e) {
        try {
          await query("ROLLBACK");
        } catch (err) {
          logSwallowed("daaPg.ensureDaaAuthSchemaPg.rollback", err);
        }
        throw e;
      }
    }).catch((e) => {
      st.schemaInit = null;
      throw e;
    });
  }

  return st.schemaInit;
}
