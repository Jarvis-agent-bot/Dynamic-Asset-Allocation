import { Pool } from "pg";
import { createRequire } from "node:module";

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

  if (/^(sqlite:|file:)/i.test(v)) {
    throw new Error("Postgres-only runtime: non-Postgres database configuration is not allowed");
  }

  const scheme = v.match(/^([a-z][a-z0-9+.-]*):\/\//i)?.[1]?.toLowerCase();
  if (scheme && !/^(postgres|postgresql|postgresql\+psycopg)$/.test(scheme)) {
    throw new Error("Postgres-only runtime: unsupported database URL scheme");
  }

  // Allow sharing env with the Python service (sqlalchemy uses postgresql+psycopg://).
  return v.replace(/^postgresql\+psycopg:\/\//i, "postgresql://");
}

function isDaaPgMemEnabledV0(): boolean {
  return typeof process.env.DAA_PG_MEM === "string" && process.env.DAA_PG_MEM.trim() === "1";
}

export function isDaaPgEnabledV0(): boolean {
  return Boolean(getDaaPgUrlV0() || isDaaPgMemEnabledV0());
}

export function daaPgPoolV0(): Pool {
  const st = getStateV0();
  if (st.pool) return st.pool;

  const url = getDaaPgUrlV0();
  if (url) {
    const pool = new Pool({ connectionString: url });
    st.pool = pool;
    return pool;
  }

  if (isDaaPgMemEnabledV0()) {
    // Unit-test helper: create an in-memory Postgres-compatible pool via pg-mem.
    // Use createRequire() so this works in ESM (vitest) and CJS (Next server).
    const req = createRequire(import.meta.url);
    const { newDb } = req("pg-mem");
    const db = newDb({ autoCreateForeignKeyIndices: true });
    const adapter = db.adapters.createPg();
    const pool = new adapter.Pool();
    st.pool = pool;
    return pool;
  }

  throw new Error("DAA Postgres not configured (missing DAA_DB_URL or DATABASE_URL)");
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
  if (!st.schemaInit) {
    st.schemaInit = withDaaPgClientV0(async ({ query }) => {
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
        } catch {
          // ignore
        }
        throw e;
      }
    }).catch((e) => {
      // Allow future calls to retry after transient DB/network failures.
      st.schemaInit = null;
      throw e;
    });
  }

  return st.schemaInit;
}
