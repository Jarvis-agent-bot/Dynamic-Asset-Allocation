export type SqliteMigrationV0 = {
  id: string;
  sql: string;
};

// v0: bootstrap schema for the DAA workflow SQLite store.
export const DAA_SQLITE_MIGRATIONS_V0: SqliteMigrationV0[] = [
  {
    id: "0001_init",
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS daa_runs (
        run_id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS daa_run_portfolio (
        run_id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES daa_runs(run_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS daa_run_confirm (
        run_id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES daa_runs(run_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS daa_run_executed (
        run_id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES daa_runs(run_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS daa_run_audit_events (
        event_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        kind TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        FOREIGN KEY(run_id) REFERENCES daa_runs(run_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_daa_run_audit_events_run_created_at
        ON daa_run_audit_events(run_id, created_at);
    `,
  },

  // v1: add actor/source columns so the dashboard can filter audit history efficiently.
  {
    id: "0002_runs_actor_source_columns",
    sql: `
      ALTER TABLE daa_runs ADD COLUMN actor TEXT;
      ALTER TABLE daa_runs ADD COLUMN source TEXT;

      -- Best-effort backfill from existing payload_json.
      UPDATE daa_runs
      SET
        actor = NULLIF(TRIM(CAST(json_extract(payload_json, '$.actor') AS TEXT)), ''),
        source = NULLIF(TRIM(CAST(json_extract(payload_json, '$.source') AS TEXT)), '')
      WHERE actor IS NULL OR source IS NULL;

      -- Fill remaining actors from heuristics so actor filter works for older rows.
      UPDATE daa_runs
      SET actor = CASE
        WHEN actor IS NOT NULL AND actor != '' THEN actor
        WHEN lower(COALESCE(source, '')) LIKE '%/daa/dashboard%' OR lower(kind) LIKE '%dashboard%' THEN 'dashboard'
        WHEN lower(COALESCE(source, '')) LIKE '%/daa/market/funds%' OR lower(kind) LIKE '%market-funds%' THEN 'market-funds'
        ELSE 'unknown'
      END
      WHERE actor IS NULL OR actor = '';

      CREATE INDEX IF NOT EXISTS idx_daa_runs_created_at ON daa_runs(created_at);
      CREATE INDEX IF NOT EXISTS idx_daa_runs_actor_created_at ON daa_runs(actor, created_at);
    `,
  },

  // v2: migration audit table for boot-time runner diagnostics.
  {
    id: "0003_schema_migration_audit",
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migration_audit_events (
        event_id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        migration_id TEXT NOT NULL,
        status TEXT NOT NULL,
        payload_json TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_schema_migration_audit_events_created_at
        ON schema_migration_audit_events(created_at);

      CREATE INDEX IF NOT EXISTS idx_schema_migration_audit_events_migration_id_created_at
        ON schema_migration_audit_events(migration_id, created_at);
    `,
  },

  // v3: allow operators to activate/deactivate admin tokens without redeploying.
  {
    id: "0004_admin_user_status",
    sql: `
      CREATE TABLE IF NOT EXISTS daa_admin_user_status (
        user_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_daa_admin_user_status_status
        ON daa_admin_user_status(status);
    `,
  },

  // v4: add actor_user_id on audit events so the dashboard can filter edits by admin user/token.
  {
    id: "0005_run_audit_events_actor_user_id",
    sql: `
      ALTER TABLE daa_run_audit_events ADD COLUMN actor_user_id TEXT;

      CREATE INDEX IF NOT EXISTS idx_daa_run_audit_events_actor_created_at
        ON daa_run_audit_events(actor_user_id, created_at, event_id);
    `,
  },

  // v5: auth accounts + sessions (for dashboard login; replaces token-only auth over time).
  {
    id: "0006_auth_accounts_sessions",
    sql: `
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
        account_id TEXT NOT NULL,
        token_sha256 TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        user_agent TEXT,
        ip TEXT,
        last_seen_at TEXT,
        FOREIGN KEY(account_id) REFERENCES daa_auth_accounts(account_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_daa_auth_sessions_account_created_at
        ON daa_auth_sessions(account_id, created_at);

      CREATE INDEX IF NOT EXISTS idx_daa_auth_sessions_expires_at
        ON daa_auth_sessions(expires_at);

      CREATE INDEX IF NOT EXISTS idx_daa_auth_sessions_revoked_at
        ON daa_auth_sessions(revoked_at);
    `,
  },

  // v6: email login tokens (passwordless magic link) for dashboard auth.
  {
    id: "0007_auth_email_login_tokens",
    sql: `
      CREATE TABLE IF NOT EXISTS daa_auth_email_login_tokens (
        token_id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        token_sha256 TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        user_agent TEXT,
        ip TEXT,
        FOREIGN KEY(account_id) REFERENCES daa_auth_accounts(account_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_daa_auth_email_login_tokens_account_created_at
        ON daa_auth_email_login_tokens(account_id, created_at);

      CREATE INDEX IF NOT EXISTS idx_daa_auth_email_login_tokens_expires_at
        ON daa_auth_email_login_tokens(expires_at);

      CREATE INDEX IF NOT EXISTS idx_daa_auth_email_login_tokens_used_at
        ON daa_auth_email_login_tokens(used_at);
    `,
  },
];
