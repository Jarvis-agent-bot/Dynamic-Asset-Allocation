import { Pool } from "pg";
import { createRequire } from "node:module";

type PgStateV0 = {
  pool: Pool | null;
  schemaInit: Promise<void> | null;
};

const GLOBAL_KEY = "__daa_pg_state_v0__";

function isProductionRuntimeV0(): boolean {
  return (process.env.NODE_ENV || "").toLowerCase() === "production";
}

function getStateV0(): PgStateV0 {
  const g: any = globalThis as any;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = { pool: null, schemaInit: null } satisfies PgStateV0;
  }
  return g[GLOBAL_KEY] as PgStateV0;
}

export function getDaaPgUrlV0(): string | null {
  const daaDbUrl = typeof process.env.DAA_DB_URL === "string" ? process.env.DAA_DB_URL.trim() : "";
  const databaseUrl = typeof process.env.DATABASE_URL === "string" ? process.env.DATABASE_URL.trim() : "";
  const v = daaDbUrl || databaseUrl;
  if (!v) return null;

  if (/^(sqlite:|file:)/i.test(v)) {
    // 开发环境下允许使用 sqlite/file 占位并自动回退到 pg-mem，避免鉴权接口直接 500。
    if (isProductionRuntimeV0()) {
      throw new Error("Postgres-only runtime: non-Postgres database configuration is not allowed");
    }
    return null;
  }

  const scheme = v.match(/^([a-z][a-z0-9+.-]*):\/\//i)?.[1]?.toLowerCase();
  if (scheme && !/^(postgres|postgresql|postgresql\+psycopg)$/.test(scheme)) {
    // 开发环境容错：错误 scheme 自动降级到 pg-mem，线上仍强制报错。
    if (isProductionRuntimeV0()) {
      throw new Error("Postgres-only runtime: unsupported database URL scheme");
    }
    return null;
  }

  // Allow sharing env with the Python service (sqlalchemy uses postgresql+psycopg://).
  return v.replace(/^postgresql\+psycopg:\/\//i, "postgresql://");
}

function isDaaPgMemEnabledV0(): boolean {
  const explicit = typeof process.env.DAA_PG_MEM === "string" && process.env.DAA_PG_MEM.trim() === "1";
  if (explicit) return true;

  if (isProductionRuntimeV0()) return false;

  // 本地开发兜底：未配置 PG URL 时自动启用 pg-mem，避免登录/鉴权接口直接 500。
  return !getDaaPgUrlV0();
}

export function isDaaPgMemRuntimeV0(): boolean {
  return isDaaPgMemEnabledV0();
}

function assertPgMemAllowedV0(): void {
  if (!isDaaPgMemEnabledV0()) return;
  if (isProductionRuntimeV0()) {
    throw new Error("DAA_PG_MEM must not be enabled in production");
  }
}

export function isDaaPgEnabledV0(): boolean {
  assertPgMemAllowedV0();
  return Boolean(getDaaPgUrlV0() || isDaaPgMemEnabledV0());
}

export function daaPgPoolV0(): Pool {
  const st = getStateV0();
  if (st.pool) return st.pool;

  assertPgMemAllowedV0();

  // DAA_PG_MEM=1 显式声明时优先使用 pg-mem，即使 DAA_DB_URL 也已配置（预览/测试场景）。
  if (isDaaPgMemEnabledV0()) {
    // Unit-test helper: create an in-memory Postgres-compatible pool via pg-mem.
    // Use createRequire() so this works in ESM (vitest) and CJS (Next server).
    const req = createRequire(import.meta.url);
    const { newDb } = req("pg-mem");
    const db = newDb({
      autoCreateForeignKeyIndices: true,
      // pg-mem 3.x 默认会对未完全实现的 AST 抛错；本地开发放宽以兼容 CREATE TABLE 约束声明。
      noAstCoverageCheck: true,
    });
    const adapter = db.adapters.createPg();
    const pool = new adapter.Pool();
    st.pool = pool;
    return pool;
  }

  const url = getDaaPgUrlV0();
  if (url) {
    const pool = new Pool({ connectionString: url });
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
