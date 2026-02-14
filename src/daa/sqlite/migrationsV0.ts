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
];
