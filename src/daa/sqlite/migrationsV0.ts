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
];
