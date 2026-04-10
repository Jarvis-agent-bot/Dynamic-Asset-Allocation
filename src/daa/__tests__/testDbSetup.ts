/**
 * testDbSetup.ts
 *
 * Test utility for integration tests that need a real PostgreSQL database.
 * Requires DAA_DB_URL or DATABASE_URL to be set.
 *
 * Tests using resetTestDb() will be skipped if no DB is configured.
 */

import { getDaaPgUrl } from "@/src/daa/pg/daaPg";

/**
 * Whether a real PostgreSQL database is available for integration tests.
 */
export function isTestDbAvailable(): boolean {
  return Boolean(getDaaPgUrl());
}

/**
 * Reset test data in the database. Call in beforeEach() to ensure clean state.
 * Throws if no DB is configured — pair with skipIfNoDb() in describe blocks.
 */
export async function resetTestDb(): Promise<void> {
  const { daaPgPool, withDaaPgClient } = await import("@/src/daa/pg/daaPg");
  const { runDaaStoreRuntimeMigrations } = await import("@/src/daa/store/runtimeMigrations");

  // Run schema migrations
  await withDaaPgClient(async ({ query }) => {
    await runDaaStoreRuntimeMigrations(query as any);
  });

  // Truncate all DAA tables
  const pool = daaPgPool();
  await pool.query(`
    DO $$ BEGIN
      TRUNCATE TABLE IF EXISTS daa_auth_audit_events CASCADE;
      TRUNCATE TABLE IF EXISTS daa_auth_sessions CASCADE;
      TRUNCATE TABLE IF EXISTS daa_auth_accounts CASCADE;
      TRUNCATE TABLE IF EXISTS daa_rebalance_proposals CASCADE;
      TRUNCATE TABLE IF EXISTS daa_rebalance_cycles CASCADE;
      TRUNCATE TABLE IF EXISTS daa_trade_tickets CASCADE;
      TRUNCATE TABLE IF EXISTS daa_cash_transactions CASCADE;
      TRUNCATE TABLE IF EXISTS daa_portfolio_positions CASCADE; -- 未使用，migration 残留
      TRUNCATE TABLE IF EXISTS daa_target_allocations CASCADE;
      TRUNCATE TABLE IF EXISTS daa_watchlist_entries CASCADE;
      TRUNCATE TABLE IF EXISTS daa_market_price_snapshots CASCADE;
      TRUNCATE TABLE IF EXISTS daa_today_cache CASCADE;
      TRUNCATE TABLE IF EXISTS daa_today_decision_log CASCADE;
      TRUNCATE TABLE IF EXISTS daa_assistant_sessions CASCADE;
      TRUNCATE TABLE IF EXISTS daa_assistant_messages CASCADE;
    EXCEPTION WHEN undefined_table THEN
      NULL;
    END $$;
  `);
}
