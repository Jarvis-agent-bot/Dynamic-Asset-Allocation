/**
 * Schema initialization.
 */

import { randomUUID } from "node:crypto";
import { withDaaPgClient } from "@/src/daa/pg/daaPg";
import { runDaaStoreRuntimeMigrations } from "@/src/daa/store/runtimeMigrations";
import { normalizeText } from "@/src/daa/utils/normalize";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import {
  archiveTable,
  ensureTableColumn,
  hasTable,
  isMissingRelationError,
  type SchemaQueryFn,
} from "./storeShared";
import {
  ensureSystemConfigRowInTx,
  ensureAccountStateRowInTx,
} from "./accountStore";

type DaaStoreState = {
  schemaInit: Promise<void> | null;
  runtimeMigrationInit: Promise<void> | null;
  marketCacheSchemaInit: Promise<void> | null;
};

const STORE_GLOBAL_KEY_ = "__daa_store_pg_state_v0__";


function getStoreState(): DaaStoreState {
  const g = globalThis as typeof globalThis & { [STORE_GLOBAL_KEY_]?: Partial<DaaStoreState> };
  const state = g[STORE_GLOBAL_KEY_] ?? {};
  state.schemaInit ??= null;
  state.runtimeMigrationInit ??= null;
  state.marketCacheSchemaInit ??= null;
  g[STORE_GLOBAL_KEY_] = state;
  return state as DaaStoreState;
}

async function isStoreSchemaReady(): Promise<boolean> {
  try {
    const requiredColumns = {
      daa_asset_master: [
        "asset_key",
        "symbol",
        "name",
        "display_name_zh",
        "market",
        "currency",
        "asset_class",
        "region",
        "exchange",
        "instrument_type",
        "market_group",
      ],
      daa_trade_tickets: [
        "owner_account_id",
        "ticket_id",
        "basket_id",
        "cycle_id",
        "asset_key",
        "pricing_mode",
        "price_source",
        "price_snapshot_at",
      ],
      daa_portfolio_ledger_events: [
        "owner_account_id",
        "event_id",
        "event_kind",
        "side",
        "amount",
        "base_currency",
        "account_base_currency",
        "amount_in_account_base",
        "fx_rate_to_account",
        "ticket_id",
        "cycle_id",
        "settlement_ts",
        "event_payload_json",
      ],
      daa_account_state_v2: [
        "id",
        "base_currency",
        "cash",
        "investable_cash",
        "frozen_cash",
        "total_equity",
        "updated_at",
      ],
      daa_equity_snapshots_v2: [
        "owner_account_id",
        "ts",
        "total_equity",
        "holdings_value",
        "cash",
        "source",
      ],
      daa_positions_v2: [
        "owner_account_id",
        "asset_key",
        "symbol",
        "market",
        "currency",
        "qty",
        "price",
        "cost_basis",
        "tags",
        "updated_at",
      ],
    } as const;

    await withDaaPgClient(async ({ query }) => {
      const tableNames = Object.keys(requiredColumns);
      const tablePlaceholders = tableNames.map((_, idx) => `$${idx + 1}`).join(", ");
      const columnsRes = await query(
        `SELECT table_name, column_name
         FROM information_schema.columns
         WHERE table_name IN (${tablePlaceholders})`,
        tableNames,
      );

      const existing = new Map<string, Set<string>>();
      for (const row of columnsRes.rows as Array<Record<string, unknown>>) {
        const tableName = normalizeText(row.table_name).toLowerCase();
        const columnName = normalizeText(row.column_name).toLowerCase();
        if (!tableName || !columnName) continue;
        if (!existing.has(tableName)) existing.set(tableName, new Set<string>());
        existing.get(tableName)!.add(columnName);
      }

      for (const [tableName, columns] of Object.entries(requiredColumns)) {
        const present = existing.get(tableName)?.size ? existing.get(tableName)! : null;
        if (!present) throw new Error(`relation ${tableName} does not exist`);
        for (const column of columns) {
          if (!present.has(column)) {
            throw new Error(`column ${column} does not exist`);
          }
        }
      }
    });
    return true;
  } catch (error) {
    if (isMissingRelationError(error, "daa_asset_master")) return false;
    if (isMissingRelationError(error, "daa_portfolio_ledger_events")) return false;
    if (error instanceof Error && /column\s+.+\s+does\s+not\s+exist/i.test(error.message)) return false;
    throw error;
  }
}

async function ensureDaaStoreRuntimeMigrationsApplied(): Promise<void> {
  const st = getStoreState();
  if (!st.runtimeMigrationInit) {
    st.runtimeMigrationInit = withDaaPgClient(async ({ query }) => {
      await query("BEGIN");
      try {
        await ensureSystemConfigRowInTx(query);
        await runDaaStoreRuntimeMigrations(query);
        await query("COMMIT");
      } catch (error) {
        try {
          await query("ROLLBACK");
        } catch (err) {
          logSwallowed("storeSchema.rollback", err);
        }
        throw error;
      }
    }).catch((error) => {
      st.runtimeMigrationInit = null;
      throw error;
    });
  }
  await st.runtimeMigrationInit;
}

async function ensureOwnerColumnsBeforeSchema(query: SchemaQueryFn): Promise<void> {
  const scopedTables = [
    "daa_positions_v2",
    "daa_broker_positions",
    "daa_watchlist_entries",
    "daa_target_allocations",
    "daa_equity_snapshots_v2",
    "daa_portfolio_ledger_events",
    "daa_trade_journal",
    "daa_trade_baskets",
    "daa_trade_tickets",
    "daa_broker_account_state",
    "daa_broker_order_snapshots",
    "daa_rebalance_cycles",
    "daa_cycle_reports",
    "daa_trigger_events",
    "daa_rebalance_decisions",
    "daa_execution_orders",
    "daa_execution_order_events",
    "daa_run_history",
    "daa_op_log",
    "daa_llm_feedback",
    "daa_notification_delivery_logs",
    "daa_job_execution_logs",
    "daa_research_threads",
    "daa_evidence_items",
    "daa_thesis_reviews",
    "daa_agent_runs",
    "daa_agent_memory",
    "daa_agent_decision_audit",
  ];

  for (const tableName of scopedTables) {
    if (!(await hasTable(query, tableName))) continue;
    await ensureTableColumn(query, tableName, "owner_account_id", "TEXT NOT NULL DEFAULT 'default'");
  }
}

export async function ensureDaaStoreSchemaPg(): Promise<void> {
  const st = getStoreState();
  if (st.schemaInit) {
    await st.schemaInit;
    await ensureDaaStoreRuntimeMigrationsApplied();
    const ready = await isStoreSchemaReady();
    if (ready) return;
    st.schemaInit = null;
  }
  if (!st.schemaInit) {
    st.schemaInit = withDaaPgClient(async ({ query }) => {
      await query("BEGIN");
      try {
        const archivedLedgerV1 = ([
          await archiveTable(query, "daa_account_state"),
          await archiveTable(query, "daa_cash_ledger"),
          await archiveTable(query, "daa_equity_snapshots"),
          await archiveTable(query, "daa_positions"),
        ]).some(Boolean);

        await ensureOwnerColumnsBeforeSchema(query);

        await query(`
          CREATE TABLE IF NOT EXISTS daa_positions_v2 (
            owner_account_id TEXT NOT NULL DEFAULT 'default',
            asset_key TEXT NOT NULL,
            symbol TEXT NOT NULL,
            market TEXT NOT NULL DEFAULT 'US',
            currency TEXT NOT NULL DEFAULT 'USD',
            qty NUMERIC NOT NULL,
            price NUMERIC NOT NULL DEFAULT 0,
            cost_basis NUMERIC,
            tags TEXT[] NOT NULL DEFAULT '{}',
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (owner_account_id, asset_key)
          );

          CREATE UNIQUE INDEX IF NOT EXISTS idx_daa_positions_v2_owner_symbol_market
            ON daa_positions_v2(owner_account_id, symbol, market);

          CREATE TABLE IF NOT EXISTS daa_account_state_v2 (
            id TEXT PRIMARY KEY,
            base_currency TEXT NOT NULL DEFAULT 'USD',
            cash NUMERIC NOT NULL DEFAULT 0,
            investable_cash NUMERIC NOT NULL DEFAULT 0,
            frozen_cash NUMERIC NOT NULL DEFAULT 0,
            total_equity NUMERIC,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS daa_equity_snapshots_v2 (
            owner_account_id TEXT NOT NULL DEFAULT 'default',
            ts TIMESTAMPTZ NOT NULL,
            total_equity NUMERIC NOT NULL,
            holdings_value NUMERIC NOT NULL,
            cash NUMERIC NOT NULL,
            source TEXT NOT NULL DEFAULT 'cron',
            PRIMARY KEY (owner_account_id, ts)
          );

          CREATE TABLE IF NOT EXISTS daa_portfolio_ledger_events (
            owner_account_id TEXT NOT NULL DEFAULT 'default',
            event_id TEXT PRIMARY KEY,
            ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            event_kind TEXT NOT NULL,
            side TEXT CHECK (side IN ('deposit', 'withdraw')),
            amount NUMERIC NOT NULL DEFAULT 0,
            base_currency TEXT NOT NULL DEFAULT 'USD',
            account_base_currency TEXT,
            amount_in_account_base NUMERIC,
            fx_rate_to_account NUMERIC,
            ticket_id TEXT,
            cycle_id TEXT,
            settlement_ts TIMESTAMPTZ,
            note TEXT,
            event_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_daa_portfolio_ledger_events_owner_ts_desc
            ON daa_portfolio_ledger_events(owner_account_id, ts DESC);

          CREATE UNIQUE INDEX IF NOT EXISTS idx_daa_portfolio_ledger_events_ticket_unique
            ON daa_portfolio_ledger_events(owner_account_id, ticket_id)
            WHERE ticket_id IS NOT NULL;

          CREATE TABLE IF NOT EXISTS daa_trade_journal (
            owner_account_id TEXT NOT NULL DEFAULT 'default',
            id TEXT PRIMARY KEY,
            symbol TEXT NOT NULL,
            side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
            qty NUMERIC NOT NULL,
            price NUMERIC NOT NULL,
            notional NUMERIC NOT NULL,
            fee NUMERIC NOT NULL DEFAULT 0,
            executed_at TIMESTAMPTZ NOT NULL,
            source TEXT NOT NULL DEFAULT 'manual',
            rebalance_decision_id TEXT,
            execution_order_id TEXT,
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_daa_trade_journal_symbol_executed_desc
            ON daa_trade_journal(owner_account_id, symbol, executed_at DESC);

          CREATE TABLE IF NOT EXISTS daa_trade_baskets (
            owner_account_id TEXT NOT NULL DEFAULT 'default',
            basket_id TEXT PRIMARY KEY,
            source TEXT NOT NULL CHECK (source IN ('manual', 'decision', 'mixed', 'migration')),
            status TEXT NOT NULL CHECK (status IN ('draft', 'executing', 'executed', 'partial', 'canceled')),
            decision_ref_id TEXT,
            created_by TEXT NOT NULL DEFAULT 'admin',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            executed_at TIMESTAMPTZ
          );

          CREATE INDEX IF NOT EXISTS idx_daa_trade_baskets_owner_status_created_desc
            ON daa_trade_baskets(owner_account_id, status, created_at DESC);

          CREATE TABLE IF NOT EXISTS daa_trade_tickets (
            owner_account_id TEXT NOT NULL DEFAULT 'default',
            ticket_id TEXT PRIMARY KEY,
            basket_id TEXT NOT NULL,
            asset_key TEXT NOT NULL,
            cycle_id TEXT,
            source TEXT NOT NULL CHECK (source IN ('manual', 'decision')),
            status TEXT NOT NULL,
            symbol TEXT NOT NULL,
            market TEXT NOT NULL DEFAULT 'US',
            instrument_currency TEXT NOT NULL DEFAULT 'USD',
            base_currency TEXT NOT NULL DEFAULT 'USD',
            side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
            qty NUMERIC NOT NULL,
            price NUMERIC NOT NULL,
            fee NUMERIC NOT NULL DEFAULT 0,
            gross_notional NUMERIC NOT NULL,
            fx_rate_to_base NUMERIC,
            notional_in_base NUMERIC NOT NULL,
            decision_ref_id TEXT,
            reason_tags TEXT[] NOT NULL DEFAULT '{}',
            reason_text TEXT,
            snapshot_before_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            snapshot_after_json JSONB,
            reject_code TEXT,
            reject_message TEXT,
            pricing_mode TEXT NOT NULL DEFAULT 'manual',
            price_source TEXT,
            price_snapshot_at TIMESTAMPTZ,
            broker_kind TEXT,
            broker_account_id TEXT,
            broker_order_id TEXT,
            broker_status TEXT,
            filled_qty NUMERIC,
            avg_fill_price NUMERIC,
            last_broker_sync_at TIMESTAMPTZ,
            last_applied_fill_qty NUMERIC NOT NULL DEFAULT 0,
            broker_reject_reason TEXT,
            broker_raw_json JSONB,
            created_by TEXT NOT NULL DEFAULT 'admin',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            executed_at TIMESTAMPTZ,
            canceled_at TIMESTAMPTZ,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT daa_trade_tickets_status_check CHECK (status IN ('ready', 'submitted', 'partially_filled', 'executed', 'canceled', 'rejected'))
          );

          CREATE INDEX IF NOT EXISTS idx_daa_trade_tickets_owner_created_desc
            ON daa_trade_tickets(owner_account_id, created_at DESC);

          CREATE INDEX IF NOT EXISTS idx_daa_trade_tickets_owner_status_created_desc
            ON daa_trade_tickets(owner_account_id, status, created_at DESC);

          CREATE INDEX IF NOT EXISTS idx_daa_trade_tickets_owner_cycle_created_desc
            ON daa_trade_tickets(owner_account_id, cycle_id, created_at DESC);

          CREATE INDEX IF NOT EXISTS idx_daa_trade_tickets_owner_symbol_created_desc
            ON daa_trade_tickets(owner_account_id, UPPER(symbol), created_at DESC);

          CREATE TABLE IF NOT EXISTS daa_broker_account_state (
            owner_account_id TEXT NOT NULL DEFAULT 'default',
            broker_kind TEXT NOT NULL,
            account_id TEXT,
            base_currency TEXT NOT NULL DEFAULT 'USD',
            cash NUMERIC NOT NULL DEFAULT 0,
            investable_cash NUMERIC NOT NULL DEFAULT 0,
            frozen_cash NUMERIC NOT NULL DEFAULT 0,
            total_equity NUMERIC,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (owner_account_id, broker_kind)
          );

          CREATE TABLE IF NOT EXISTS daa_broker_positions (
            owner_account_id TEXT NOT NULL DEFAULT 'default',
            broker_kind TEXT NOT NULL,
            account_id TEXT,
            asset_key TEXT NOT NULL,
            symbol TEXT NOT NULL,
            market TEXT NOT NULL DEFAULT 'US',
            currency TEXT NOT NULL DEFAULT 'USD',
            qty NUMERIC NOT NULL DEFAULT 0,
            price NUMERIC NOT NULL DEFAULT 0,
            cost_basis NUMERIC,
            tags TEXT[] NOT NULL DEFAULT '{}',
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (owner_account_id, broker_kind, asset_key)
          );

          CREATE INDEX IF NOT EXISTS idx_daa_broker_positions_owner_kind_updated_desc
            ON daa_broker_positions(owner_account_id, broker_kind, updated_at DESC);

          CREATE TABLE IF NOT EXISTS daa_broker_order_snapshots (
            owner_account_id TEXT NOT NULL DEFAULT 'default',
            ticket_id TEXT PRIMARY KEY REFERENCES daa_trade_tickets(ticket_id) ON DELETE CASCADE,
            broker_kind TEXT NOT NULL,
            broker_account_id TEXT,
            broker_order_id TEXT NOT NULL,
            status TEXT NOT NULL,
            filled_qty NUMERIC,
            avg_fill_price NUMERIC,
            raw_json JSONB,
            synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE UNIQUE INDEX IF NOT EXISTS idx_daa_broker_order_snapshots_owner_order_unique
            ON daa_broker_order_snapshots(owner_account_id, broker_kind, broker_order_id);

          CREATE TABLE IF NOT EXISTS daa_rebalance_cycles (
            owner_account_id TEXT NOT NULL DEFAULT 'default',
            cycle_id TEXT PRIMARY KEY,
            status TEXT NOT NULL DEFAULT 'generated',
            trigger_source TEXT NOT NULL,
            trigger_reason TEXT NOT NULL DEFAULT '',
            snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            equity_snapshot NUMERIC NOT NULL DEFAULT 0,
            drift_snapshot_json JSONB NOT NULL DEFAULT '[]'::jsonb,
            proposals_json JSONB NOT NULL DEFAULT '[]'::jsonb,
            risk_check_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            execution_started_at TIMESTAMPTZ,
            executed_at TIMESTAMPTZ,
            executed_orders_json JSONB NOT NULL DEFAULT '[]'::jsonb,
            execution_summary_json JSONB,
            cancelled_at TIMESTAMPTZ,
            cancel_reason TEXT,
            notes TEXT,
            market_context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            policy_decision_id TEXT,
            intent_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
            signal_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
            policy_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            proposal_plan_id TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_daa_rebalance_cycles_owner_created_desc
            ON daa_rebalance_cycles(owner_account_id, created_at DESC);

          CREATE INDEX IF NOT EXISTS idx_daa_rebalance_cycles_owner_status_created_desc
            ON daa_rebalance_cycles(owner_account_id, status, created_at DESC);

          CREATE TABLE IF NOT EXISTS daa_cycle_reports (
            owner_account_id TEXT NOT NULL DEFAULT 'default',
            cycle_id TEXT PRIMARY KEY REFERENCES daa_rebalance_cycles(cycle_id) ON DELETE CASCADE,
            before_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            after_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            execution_stats_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            pnl_attribution_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            risk_delta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_daa_cycle_reports_created_desc
            ON daa_cycle_reports(created_at DESC);

          CREATE TABLE IF NOT EXISTS daa_trigger_events (
            owner_account_id TEXT NOT NULL DEFAULT 'default',
            event_id TEXT PRIMARY KEY,
            idempotency_key TEXT NOT NULL,
            trigger_source TEXT NOT NULL,
            trigger_reason TEXT NOT NULL DEFAULT '',
            cycle_id TEXT REFERENCES daa_rebalance_cycles(cycle_id) ON DELETE SET NULL,
            status TEXT NOT NULL DEFAULT 'accepted',
            details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_daa_trigger_events_owner_created_desc
            ON daa_trigger_events(owner_account_id, created_at DESC);

          CREATE INDEX IF NOT EXISTS idx_daa_trigger_events_source_created_desc
            ON daa_trigger_events(owner_account_id, trigger_source, created_at DESC);

          CREATE UNIQUE INDEX IF NOT EXISTS idx_daa_trigger_events_owner_idempotency_key
            ON daa_trigger_events(owner_account_id, idempotency_key);

          CREATE TABLE IF NOT EXISTS daa_rebalance_decisions (
            owner_account_id TEXT NOT NULL DEFAULT 'default',
            id TEXT PRIMARY KEY,
            request_json JSONB NOT NULL,
            response_json JSONB NOT NULL,
            should_rebalance BOOLEAN NOT NULL,
            trigger_source TEXT NOT NULL DEFAULT 'manual',
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_daa_rebalance_decisions_owner_created_desc
            ON daa_rebalance_decisions(owner_account_id, created_at DESC);

          CREATE INDEX IF NOT EXISTS idx_daa_rebalance_decisions_owner_status_created_desc
            ON daa_rebalance_decisions(owner_account_id, status, created_at DESC);

          CREATE TABLE IF NOT EXISTS daa_execution_orders (
            owner_account_id TEXT NOT NULL DEFAULT 'default',
            order_id TEXT PRIMARY KEY,
            decision_id TEXT NOT NULL REFERENCES daa_rebalance_decisions(id) ON DELETE CASCADE,
            symbol TEXT NOT NULL,
            side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
            suggested_notional NUMERIC NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            executed_qty NUMERIC NOT NULL DEFAULT 0,
            executed_price NUMERIC NOT NULL DEFAULT 0,
            fee NUMERIC NOT NULL DEFAULT 0,
            booked_qty NUMERIC NOT NULL DEFAULT 0,
            booked_notional NUMERIC NOT NULL DEFAULT 0,
            booked_fee NUMERIC NOT NULL DEFAULT 0,
            booked_at TIMESTAMPTZ,
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_daa_execution_orders_owner_decision_status
            ON daa_execution_orders(owner_account_id, decision_id, status);

          CREATE TABLE IF NOT EXISTS daa_execution_order_events (
            owner_account_id TEXT NOT NULL DEFAULT 'default',
            id TEXT PRIMARY KEY,
            decision_id TEXT NOT NULL REFERENCES daa_rebalance_decisions(id) ON DELETE CASCADE,
            order_id TEXT NOT NULL REFERENCES daa_execution_orders(order_id) ON DELETE CASCADE,
            event_type TEXT NOT NULL,
            payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_daa_execution_order_events_order_created_desc
            ON daa_execution_order_events(owner_account_id, order_id, created_at DESC);

          CREATE TABLE IF NOT EXISTS daa_run_history (
            owner_account_id TEXT NOT NULL DEFAULT 'default',
            id TEXT PRIMARY KEY,
            ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            trigger_source TEXT NOT NULL DEFAULT 'manual',
            request_json JSONB NOT NULL,
            response_json JSONB NOT NULL,
            summary_json JSONB NOT NULL
          );

          CREATE INDEX IF NOT EXISTS idx_daa_run_history_owner_ts_desc
            ON daa_run_history(owner_account_id, ts DESC);

          CREATE TABLE IF NOT EXISTS daa_op_log (
            owner_account_id TEXT NOT NULL DEFAULT 'default',
            id TEXT PRIMARY KEY,
            ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            level TEXT NOT NULL DEFAULT 'info',
            message TEXT NOT NULL,
            context_json JSONB NOT NULL DEFAULT '{}'::jsonb
          );

          CREATE INDEX IF NOT EXISTS idx_daa_op_log_owner_ts_desc
            ON daa_op_log(owner_account_id, ts DESC);

          CREATE TABLE IF NOT EXISTS daa_hf_ingest_state (
            id TEXT PRIMARY KEY,
            last_ingest_at TIMESTAMPTZ,
            ingest_count BIGINT NOT NULL DEFAULT 0,
            latest_batch_json JSONB,
            latest_actors_json JSONB NOT NULL DEFAULT '[]'::jsonb,
            latest_holdings_json JSONB NOT NULL DEFAULT '[]'::jsonb,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS daa_fx_rates (
            id TEXT PRIMARY KEY,
            base_ccy TEXT NOT NULL,
            quote_ccy TEXT NOT NULL,
            rate NUMERIC NOT NULL,
            source TEXT NOT NULL DEFAULT 'manual',
            as_of_ts TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE UNIQUE INDEX IF NOT EXISTS idx_daa_fx_rates_pair
            ON daa_fx_rates(base_ccy, quote_ccy);

          CREATE TABLE IF NOT EXISTS daa_llm_feedback (
            owner_account_id TEXT NOT NULL DEFAULT 'default',
            id TEXT PRIMARY KEY,
            context_id TEXT NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('insight', 'decision')),
            score TEXT NOT NULL CHECK (score IN ('up', 'down')),
            comment TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_daa_llm_feedback_owner_created_desc
            ON daa_llm_feedback(owner_account_id, created_at DESC);

          CREATE INDEX IF NOT EXISTS idx_daa_llm_feedback_owner_context_created_desc
            ON daa_llm_feedback(owner_account_id, context_id, created_at DESC);
        `);

        await query("ALTER TABLE daa_execution_orders ADD COLUMN IF NOT EXISTS booked_at TIMESTAMPTZ");
        await query("ALTER TABLE daa_execution_orders ADD COLUMN IF NOT EXISTS booked_qty NUMERIC NOT NULL DEFAULT 0");
        await query("ALTER TABLE daa_execution_orders ADD COLUMN IF NOT EXISTS booked_notional NUMERIC NOT NULL DEFAULT 0");
        await query("ALTER TABLE daa_execution_orders ADD COLUMN IF NOT EXISTS booked_fee NUMERIC NOT NULL DEFAULT 0");
        await query("ALTER TABLE daa_trade_journal ADD COLUMN IF NOT EXISTS execution_order_id TEXT");
        await query("DROP INDEX IF EXISTS idx_daa_trade_journal_execution_order_unique");
        await ensureTableColumn(query, "daa_trade_tickets", "basket_id", "TEXT");
        await ensureTableColumn(query, "daa_trade_tickets", "asset_key", "TEXT");
        await ensureTableColumn(query, "daa_trade_tickets", "cycle_id", "TEXT");
        await ensureTableColumn(query, "daa_trade_tickets", "pricing_mode", "TEXT NOT NULL DEFAULT 'manual'");
        await ensureTableColumn(query, "daa_trade_tickets", "price_source", "TEXT");
        await ensureTableColumn(query, "daa_trade_tickets", "price_snapshot_at", "TIMESTAMPTZ");
        await ensureTableColumn(query, "daa_trade_tickets", "broker_kind", "TEXT");
        await ensureTableColumn(query, "daa_trade_tickets", "broker_account_id", "TEXT");
        await ensureTableColumn(query, "daa_trade_tickets", "broker_order_id", "TEXT");
        await ensureTableColumn(query, "daa_trade_tickets", "broker_status", "TEXT");
        await ensureTableColumn(query, "daa_trade_tickets", "filled_qty", "NUMERIC");
        await ensureTableColumn(query, "daa_trade_tickets", "avg_fill_price", "NUMERIC");
        await ensureTableColumn(query, "daa_trade_tickets", "last_broker_sync_at", "TIMESTAMPTZ");
        await ensureTableColumn(query, "daa_trade_tickets", "last_applied_fill_qty", "NUMERIC NOT NULL DEFAULT 0");
        await ensureTableColumn(query, "daa_trade_tickets", "broker_reject_reason", "TEXT");
        await ensureTableColumn(query, "daa_trade_tickets", "broker_raw_json", "JSONB");
        await query("ALTER TABLE daa_trade_tickets DROP CONSTRAINT IF EXISTS daa_trade_tickets_status_check");
        await query(
          "ALTER TABLE daa_trade_tickets ADD CONSTRAINT daa_trade_tickets_status_check CHECK (status IN ('ready', 'submitted', 'partially_filled', 'executed', 'canceled', 'rejected'))",
        ).catch(() => undefined);
        await ensureTableColumn(query, "daa_rebalance_cycles", "market_context_json", "JSONB NOT NULL DEFAULT '{}'::jsonb");
        await ensureTableColumn(query, "daa_rebalance_cycles", "execution_started_at", "TIMESTAMPTZ");
        await ensureTableColumn(query, "daa_rebalance_cycles", "policy_decision_id", "TEXT");
        await ensureTableColumn(query, "daa_rebalance_cycles", "intent_ids_json", "JSONB NOT NULL DEFAULT '[]'::jsonb");
        await ensureTableColumn(query, "daa_rebalance_cycles", "signal_ids_json", "JSONB NOT NULL DEFAULT '[]'::jsonb");
        await ensureTableColumn(query, "daa_rebalance_cycles", "policy_snapshot_json", "JSONB NOT NULL DEFAULT '{}'::jsonb");
        await ensureTableColumn(query, "daa_rebalance_cycles", "proposal_plan_id", "TEXT");
        await query(
          "UPDATE daa_rebalance_cycles SET execution_started_at = NOW() WHERE status = 'executing' AND executed_at IS NULL AND execution_started_at IS NULL",
        );
        await query(
          "CREATE INDEX IF NOT EXISTS idx_daa_trade_tickets_basket_status_created_desc ON daa_trade_tickets(owner_account_id, basket_id, status, created_at DESC)",
        );
        await query(
          "CREATE INDEX IF NOT EXISTS idx_daa_trade_tickets_cycle_created_desc ON daa_trade_tickets(owner_account_id, cycle_id, created_at DESC)",
        );
        await query(
          "CREATE INDEX IF NOT EXISTS idx_daa_trade_tickets_owner_symbol_created_desc ON daa_trade_tickets(owner_account_id, UPPER(symbol), created_at DESC)",
        );
        await query("CREATE INDEX IF NOT EXISTS idx_daa_trade_tickets_broker_order_id ON daa_trade_tickets(owner_account_id, broker_order_id)");
        await query("ALTER TABLE daa_trade_tickets ALTER COLUMN basket_id DROP NOT NULL");
        await query("ALTER TABLE daa_trade_tickets ALTER COLUMN asset_key DROP NOT NULL");
        await query("UPDATE daa_trade_tickets SET asset_key = CONCAT(market, '::', symbol) WHERE asset_key IS NULL OR asset_key = ''");
        await query(
          "INSERT INTO daa_trade_baskets (basket_id, source, status, decision_ref_id, created_by, created_at, updated_at, executed_at) VALUES ('basket_migrated', 'migration', 'executed', NULL, 'migration', NOW(), NOW(), NOW()) ON CONFLICT (basket_id) DO NOTHING",
        );
        await query("UPDATE daa_trade_tickets SET basket_id = 'basket_migrated' WHERE basket_id IS NULL OR basket_id = ''");
        await query("ALTER TABLE daa_trade_tickets ALTER COLUMN basket_id SET NOT NULL");
        await query("ALTER TABLE daa_trade_tickets ALTER COLUMN asset_key SET NOT NULL");
        await query("ALTER TABLE daa_trade_tickets DROP CONSTRAINT IF EXISTS fk_daa_trade_tickets_basket");
        await query(
          "ALTER TABLE daa_trade_tickets ADD CONSTRAINT fk_daa_trade_tickets_basket FOREIGN KEY (basket_id) REFERENCES daa_trade_baskets(basket_id) ON DELETE RESTRICT",
        );
        await query(`
          CREATE TABLE IF NOT EXISTS daa_broker_account_state (
            owner_account_id TEXT NOT NULL DEFAULT 'default',
            broker_kind TEXT NOT NULL,
            account_id TEXT,
            base_currency TEXT NOT NULL DEFAULT 'USD',
            cash NUMERIC NOT NULL DEFAULT 0,
            investable_cash NUMERIC NOT NULL DEFAULT 0,
            frozen_cash NUMERIC NOT NULL DEFAULT 0,
            total_equity NUMERIC,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (owner_account_id, broker_kind)
          )
        `);
        await query(`
          CREATE TABLE IF NOT EXISTS daa_broker_positions (
            owner_account_id TEXT NOT NULL DEFAULT 'default',
            broker_kind TEXT NOT NULL,
            account_id TEXT,
            asset_key TEXT NOT NULL,
            symbol TEXT NOT NULL,
            market TEXT NOT NULL DEFAULT 'US',
            currency TEXT NOT NULL DEFAULT 'USD',
            qty NUMERIC NOT NULL DEFAULT 0,
            price NUMERIC NOT NULL DEFAULT 0,
            cost_basis NUMERIC,
            tags TEXT[] NOT NULL DEFAULT '{}',
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (owner_account_id, broker_kind, asset_key)
          )
        `);
        await query(
          "CREATE INDEX IF NOT EXISTS idx_daa_broker_positions_owner_kind_updated_desc ON daa_broker_positions(owner_account_id, broker_kind, updated_at DESC)",
        );
        await query(`
          CREATE TABLE IF NOT EXISTS daa_broker_order_snapshots (
            owner_account_id TEXT NOT NULL DEFAULT 'default',
            ticket_id TEXT PRIMARY KEY REFERENCES daa_trade_tickets(ticket_id) ON DELETE CASCADE,
            broker_kind TEXT NOT NULL,
            broker_account_id TEXT,
            broker_order_id TEXT NOT NULL,
            status TEXT NOT NULL,
            filled_qty NUMERIC,
            avg_fill_price NUMERIC,
            raw_json JSONB,
            synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);
        await query(
          "CREATE UNIQUE INDEX IF NOT EXISTS idx_daa_broker_order_snapshots_owner_order_unique ON daa_broker_order_snapshots(owner_account_id, broker_kind, broker_order_id)",
        );
        await query("DROP TABLE IF EXISTS daa_watchlist_candidates");

        await query(
          "INSERT INTO daa_fx_rates (id, base_ccy, quote_ccy, rate, source, as_of_ts, updated_at) VALUES ('USD/USD', 'USD', 'USD', 1, 'bootstrap', NOW(), NOW()) ON CONFLICT (id) DO NOTHING",
        );
        await query(
          "INSERT INTO daa_fx_rates (id, base_ccy, quote_ccy, rate, source, as_of_ts, updated_at) VALUES ('USD/CNY', 'USD', 'CNY', 7.2, 'bootstrap', NOW(), NOW()) ON CONFLICT (id) DO NOTHING",
        );
        await query(
          "INSERT INTO daa_fx_rates (id, base_ccy, quote_ccy, rate, source, as_of_ts, updated_at) VALUES ('USD/HKD', 'USD', 'HKD', 7.8, 'bootstrap', NOW(), NOW()) ON CONFLICT (id) DO NOTHING",
        );

        await ensureSystemConfigRowInTx(query);
        await runDaaStoreRuntimeMigrations(query);
        if (archivedLedgerV1) {
          await query("DELETE FROM daa_portfolio_ledger_events");
          await query("DELETE FROM daa_equity_snapshots_v2");
          await query("DELETE FROM daa_positions_v2");
          await query("DELETE FROM daa_account_state_v2");
          const account = await ensureAccountStateRowInTx(query);
          const resetTs = new Date().toISOString();
          await query(
            `INSERT INTO daa_portfolio_ledger_events (
               owner_account_id, event_id, ts, event_kind, side, amount, base_currency, account_base_currency,
               amount_in_account_base, fx_rate_to_account, ticket_id, cycle_id, settlement_ts, note, event_payload_json, created_at
             ) VALUES (
               'default',$1,$2,'ledger_reset','deposit',0,$3,$3,0,1,NULL,NULL,$2,$4,$5::jsonb,NOW()
             )`,
            [
              randomUUID(),
              resetTs,
              account.baseCurrency,
              "账本 V2 已启用，旧现金流水/权益快照/账户状态已归档到 archived_v1，当前账本从空状态重新开始。",
              JSON.stringify({ reason: "archive_reset", version: "v2" }),
            ],
          );
          if (account.cash > 0) {
            await query(
              `INSERT INTO daa_portfolio_ledger_events (
                 owner_account_id, event_id, ts, event_kind, side, amount, base_currency, account_base_currency,
                 amount_in_account_base, fx_rate_to_account, ticket_id, cycle_id, settlement_ts, note, event_payload_json, created_at
               ) VALUES (
                 'default',$1,$2,'opening_balance','deposit',$3,$4,$4,$3,1,NULL,NULL,$2,$5,$6::jsonb,NOW()
               )`,
              [
                randomUUID(),
                resetTs,
                account.cash,
                account.baseCurrency,
                "当前工作账本期初余额",
                JSON.stringify({ entryKind: "opening_balance", reason: "archive_reset" }),
              ],
            );
          }
          await query(
            "INSERT INTO daa_equity_snapshots_v2 (owner_account_id, ts, total_equity, holdings_value, cash, source) VALUES ('default',$1,$2,$3,$4,$5)",
            [resetTs, account.cash, 0, account.cash, "ledger_reset"],
          );
          await query(
            "INSERT INTO daa_op_log (owner_account_id, id, ts, level, message, context_json) VALUES ('default', $1, NOW(), 'warn', $2, $3::jsonb)",
            [
              randomUUID(),
              "账本 V2 已启用，旧账本已归档并按约定重置当前工作账本。",
              JSON.stringify({ resetAt: resetTs }),
            ],
          );
        } else {
          await ensureAccountStateRowInTx(query);
        }

        await query("COMMIT");
      } catch (error) {
        try {
          await query("ROLLBACK");
        } catch (err) {
          logSwallowed("storeSchema.rollback", err);
        }
        throw error;
      }
    }).catch((error) => {
      st.schemaInit = null;
      throw error;
    });
  }

  return st.schemaInit;
}

export async function ensureDaaMarketCacheSchemaPg(): Promise<void> {
  const st = getStoreState();
  if (st.marketCacheSchemaInit) {
    await st.marketCacheSchemaInit;
    return;
  }
  st.marketCacheSchemaInit = withDaaPgClient(async ({ query }) => {
    await query("BEGIN");
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS daa_market_price_snapshot (
          provider TEXT NOT NULL,
          market TEXT NOT NULL,
          symbol TEXT NOT NULL,
          normalized_symbol TEXT NOT NULL,
          currency TEXT NOT NULL DEFAULT 'USD',
          price NUMERIC NOT NULL DEFAULT 0,
          status TEXT NOT NULL CHECK (status IN ('fresh','stale','missing','error','unsupported')),
          as_of_ts TIMESTAMPTZ,
          fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          source TEXT NOT NULL DEFAULT 'market_cache',
          error_code TEXT,
          error_message TEXT,
          raw_ref_id TEXT,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (provider, market, symbol)
        );

        CREATE INDEX IF NOT EXISTS idx_daa_market_price_snapshot_status_fetched_desc
          ON daa_market_price_snapshot(status, fetched_at DESC);
        CREATE INDEX IF NOT EXISTS idx_daa_market_price_snapshot_market_symbol
          ON daa_market_price_snapshot(market, symbol);

        CREATE TABLE IF NOT EXISTS daa_market_price_history_v1 (
          provider TEXT NOT NULL,
          market TEXT NOT NULL,
          symbol TEXT NOT NULL,
          as_of_ts TIMESTAMPTZ NOT NULL,
          price NUMERIC NOT NULL,
          currency TEXT NOT NULL DEFAULT 'USD',
          source TEXT NOT NULL DEFAULT 'market_cache',
          fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          raw_ref_id TEXT,
          PRIMARY KEY (provider, market, symbol, as_of_ts)
        );
        CREATE INDEX IF NOT EXISTS idx_daa_market_price_history_v1_symbol_asof_desc
          ON daa_market_price_history_v1(symbol, as_of_ts DESC);
        CREATE INDEX IF NOT EXISTS idx_daa_market_price_history_v1_upper_symbol_asof_desc
          ON daa_market_price_history_v1(UPPER(symbol), as_of_ts DESC);

        CREATE TABLE IF NOT EXISTS daa_market_candles_v1 (
          provider TEXT NOT NULL,
          market TEXT NOT NULL,
          symbol TEXT NOT NULL,
          interval TEXT NOT NULL CHECK (interval IN ('1d','1h')),
          ts TIMESTAMPTZ NOT NULL,
          open NUMERIC NOT NULL,
          high NUMERIC NOT NULL,
          low NUMERIC NOT NULL,
          close NUMERIC NOT NULL,
          volume NUMERIC,
          adj_close NUMERIC,
          currency TEXT NOT NULL DEFAULT 'USD',
          source TEXT NOT NULL DEFAULT 'market_cache',
          fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          raw_ref_id TEXT,
          PRIMARY KEY (provider, market, symbol, interval, ts)
        );
        CREATE INDEX IF NOT EXISTS idx_daa_market_candles_v1_symbol_interval_ts_desc
          ON daa_market_candles_v1(symbol, interval, ts DESC);
        CREATE INDEX IF NOT EXISTS idx_daa_market_candles_v1_upper_symbol_interval_ts_desc
          ON daa_market_candles_v1(UPPER(symbol), interval, ts DESC);

        CREATE TABLE IF NOT EXISTS daa_fx_rate_history_v1 (
          provider TEXT NOT NULL,
          base_ccy TEXT NOT NULL,
          quote_ccy TEXT NOT NULL,
          as_of_ts TIMESTAMPTZ NOT NULL,
          rate NUMERIC NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('fresh','stale','missing','error')),
          fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          error_code TEXT,
          error_message TEXT,
          raw_ref_id TEXT,
          PRIMARY KEY (provider, base_ccy, quote_ccy, as_of_ts)
        );
        CREATE INDEX IF NOT EXISTS idx_daa_fx_rate_history_v1_pair_asof_desc
          ON daa_fx_rate_history_v1(base_ccy, quote_ccy, as_of_ts DESC);

        CREATE TABLE IF NOT EXISTS daa_news_item_snapshot_v1 (
          provider TEXT NOT NULL,
          symbol TEXT NOT NULL,
          item_hash TEXT NOT NULL,
          title TEXT NOT NULL,
          link TEXT,
          published_at TIMESTAMPTZ,
          fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          sentiment_score NUMERIC NOT NULL DEFAULT 0,
          source_credibility NUMERIC NOT NULL DEFAULT 0,
          freshness NUMERIC NOT NULL DEFAULT 0,
          raw_ref_id TEXT,
          PRIMARY KEY (provider, symbol, item_hash)
        );
        CREATE INDEX IF NOT EXISTS idx_daa_news_item_snapshot_v1_symbol_published_desc
          ON daa_news_item_snapshot_v1(symbol, published_at DESC);

        CREATE TABLE IF NOT EXISTS daa_news_signal_snapshot_v1 (
          provider TEXT NOT NULL,
          symbol TEXT NOT NULL,
          score_pct NUMERIC NOT NULL DEFAULT 50,
          confidence_pct NUMERIC NOT NULL DEFAULT 0,
          evidence_count INTEGER NOT NULL DEFAULT 0,
          reasons_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          llm_summary TEXT,
          llm_drivers_json JSONB,
          llm_major_event_json JSONB,
          llm_action_hint TEXT,
          item_hash_set TEXT,
          generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (provider, symbol)
        );
        CREATE INDEX IF NOT EXISTS idx_daa_news_signal_snapshot_v1_generated_desc
          ON daa_news_signal_snapshot_v1(generated_at DESC);

        CREATE TABLE IF NOT EXISTS daa_news_event_snapshot_v1 (
          provider TEXT NOT NULL,
          symbol TEXT NOT NULL,
          event_hash TEXT NOT NULL,
          item_hash TEXT NOT NULL,
          title TEXT NOT NULL,
          link TEXT,
          source TEXT,
          published_at TIMESTAMPTZ,
          score_pct NUMERIC NOT NULL DEFAULT 50,
          confidence_pct NUMERIC NOT NULL DEFAULT 0,
          llm_summary TEXT,
          llm_drivers_json JSONB,
          llm_major_event_json JSONB,
          llm_action_hint TEXT,
          analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (provider, symbol, event_hash)
        );
        CREATE INDEX IF NOT EXISTS idx_daa_news_event_snapshot_v1_symbol_published_desc
          ON daa_news_event_snapshot_v1(symbol, (COALESCE(published_at, analyzed_at)) DESC);
        CREATE INDEX IF NOT EXISTS idx_daa_news_event_snapshot_v1_symbol_item
          ON daa_news_event_snapshot_v1(symbol, item_hash);

          CREATE TABLE IF NOT EXISTS daa_news_event_graph_v1 (
            provider TEXT NOT NULL,
            symbol TEXT NOT NULL,
          event_hash TEXT NOT NULL,
          item_hash TEXT NOT NULL,
          theme_key TEXT NOT NULL,
          theme_label_zh TEXT NOT NULL,
          related_assets_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          event_score_pct NUMERIC NOT NULL DEFAULT 50,
          reasons_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (provider, symbol, event_hash, theme_key)
          );
          CREATE INDEX IF NOT EXISTS idx_daa_news_event_graph_v1_theme_generated
            ON daa_news_event_graph_v1(theme_key, generated_at DESC);
          CREATE INDEX IF NOT EXISTS idx_daa_news_event_graph_v1_symbol_generated
            ON daa_news_event_graph_v1(symbol, generated_at DESC);

          CREATE TABLE IF NOT EXISTS daa_news_event_related_asset_v1 (
            provider TEXT NOT NULL,
            symbol TEXT NOT NULL,
            event_hash TEXT NOT NULL,
            theme_key TEXT NOT NULL,
            related_asset_key TEXT NOT NULL,
            related_symbol TEXT NOT NULL,
            related_market TEXT NOT NULL DEFAULT 'US',
            relation TEXT NOT NULL DEFAULT 'related'
              CHECK (relation IN ('source', 'same_theme', 'related')),
            confidence_pct NUMERIC NOT NULL DEFAULT 50
              CHECK (confidence_pct >= 0 AND confidence_pct <= 100),
            reason_zh TEXT NOT NULL DEFAULT '',
            generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (provider, symbol, event_hash, theme_key, related_asset_key)
          );
          CREATE INDEX IF NOT EXISTS idx_daa_news_event_related_asset_v1_related_generated
            ON daa_news_event_related_asset_v1(related_asset_key, generated_at DESC);
          CREATE INDEX IF NOT EXISTS idx_daa_news_event_related_asset_v1_symbol_generated
            ON daa_news_event_related_asset_v1(symbol, generated_at DESC);

          CREATE TABLE IF NOT EXISTS daa_news_portfolio_impact_v1 (
            id TEXT PRIMARY KEY,
          owner_account_id TEXT NOT NULL DEFAULT 'default',
          provider TEXT NOT NULL,
          symbol TEXT NOT NULL,
          event_hash TEXT NOT NULL,
          asset_key TEXT NOT NULL,
            impact_scope TEXT NOT NULL
              CHECK (impact_scope IN ('holding', 'watchlist', 'target', 'related_candidate')),
            impact_level TEXT NOT NULL
              CHECK (impact_level IN ('none', 'watch', 'review', 'risk')),
            impact_score_pct NUMERIC NOT NULL DEFAULT 0
              CHECK (impact_score_pct >= 0 AND impact_score_pct <= 100),
            recommended_action TEXT NOT NULL DEFAULT 'record'
              CHECK (recommended_action IN ('record', 'investigate', 'review_thesis', 'candidate_watchlist')),
            reason_zh TEXT NOT NULL DEFAULT '',
            generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (owner_account_id, provider, symbol, event_hash, asset_key)
        );
          CREATE INDEX IF NOT EXISTS idx_daa_news_portfolio_impact_v1_owner_generated
            ON daa_news_portfolio_impact_v1(owner_account_id, generated_at DESC);
          CREATE INDEX IF NOT EXISTS idx_daa_news_portfolio_impact_v1_owner_symbol_generated
            ON daa_news_portfolio_impact_v1(owner_account_id, symbol, generated_at DESC);

          CREATE TABLE IF NOT EXISTS daa_discovery_candidates_v1 (
          id TEXT PRIMARY KEY,
          owner_account_id TEXT NOT NULL DEFAULT 'default',
          topic_key TEXT NOT NULL,
          topic_label_zh TEXT NOT NULL,
          asset_key TEXT NOT NULL,
          symbol TEXT NOT NULL,
          market TEXT NOT NULL,
          name TEXT,
          display_name_zh TEXT,
            score_pct NUMERIC NOT NULL DEFAULT 0
              CHECK (score_pct >= 0 AND score_pct <= 100),
            confidence TEXT NOT NULL DEFAULT 'low'
              CHECK (confidence IN ('low', 'medium', 'high')),
            status TEXT NOT NULL DEFAULT 'new'
              CHECK (status IN ('new', 'watching', 'dismissed', 'archived')),
            reason_zh TEXT NOT NULL DEFAULT '',
            risk_notes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
            evidence_refs_json JSONB NOT NULL DEFAULT '[]'::jsonb,
            discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            seen_count INTEGER NOT NULL DEFAULT 1 CHECK (seen_count >= 1),
            reviewed_at TIMESTAMPTZ,
            promoted_at TIMESTAMPTZ,
            dismissed_at TIMESTAMPTZ,
            archived_at TIMESTAMPTZ,
            status_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (owner_account_id, topic_key, asset_key)
          );
          CREATE INDEX IF NOT EXISTS idx_daa_discovery_candidates_v1_owner_status_score
            ON daa_discovery_candidates_v1(owner_account_id, status, score_pct DESC);
          CREATE INDEX IF NOT EXISTS idx_daa_discovery_candidates_v1_owner_status_score_updated
            ON daa_discovery_candidates_v1(owner_account_id, status, score_pct DESC, updated_at DESC);

        CREATE TABLE IF NOT EXISTS daa_market_indicator_snapshot_v1 (
          id TEXT PRIMARY KEY,
          indicator_key TEXT NOT NULL,
          scope TEXT NOT NULL DEFAULT 'portfolio',
          subject_key TEXT NOT NULL DEFAULT 'GLOBAL',
          stance TEXT NOT NULL DEFAULT 'neutral',
          risk_off_score_pct NUMERIC NOT NULL DEFAULT 50,
          confidence_pct NUMERIC NOT NULL DEFAULT 40,
          raw_value NUMERIC,
          unit TEXT,
          percentile_252 NUMERIC,
          zscore_60 NUMERIC,
          trend_1d_pct NUMERIC,
          trend_7d_pct NUMERIC,
          trend_30d_pct NUMERIC,
          source TEXT NOT NULL,
          reasons_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          components_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          generated_at TIMESTAMPTZ NOT NULL,
          expire_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_daa_market_indicator_snapshot_v1_key_generated_desc
          ON daa_market_indicator_snapshot_v1(indicator_key, generated_at DESC);

        CREATE TABLE IF NOT EXISTS daa_hf_holding_snapshot_v1 (
          provider TEXT NOT NULL,
          fund_code TEXT NOT NULL,
          report_date DATE NOT NULL,
          symbol TEXT NOT NULL,
          market TEXT NOT NULL,
          weight_pct NUMERIC NOT NULL DEFAULT 0,
          prev_weight_pct NUMERIC NOT NULL DEFAULT 0,
          disclosed_at TIMESTAMPTZ,
          confidence_pct NUMERIC NOT NULL DEFAULT 0,
          source_ref TEXT,
          fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          raw_ref_id TEXT,
          PRIMARY KEY (provider, fund_code, report_date, symbol)
        );
        CREATE INDEX IF NOT EXISTS idx_daa_hf_holding_snapshot_v1_symbol_report_desc
          ON daa_hf_holding_snapshot_v1(symbol, report_date DESC);
        CREATE INDEX IF NOT EXISTS idx_daa_hf_holding_snapshot_v1_fund_report_desc
          ON daa_hf_holding_snapshot_v1(fund_code, report_date DESC);

        CREATE TABLE IF NOT EXISTS daa_hf_signal_snapshot_v1 (
          provider TEXT NOT NULL,
          symbol TEXT NOT NULL,
          aggregated_score_pct NUMERIC NOT NULL DEFAULT 0,
          conviction_pct NUMERIC NOT NULL DEFAULT 0,
          thesis_drift_pct NUMERIC NOT NULL DEFAULT 0,
          fund_count INTEGER NOT NULL DEFAULT 0,
          funds_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (provider, symbol)
        );
        CREATE INDEX IF NOT EXISTS idx_daa_hf_signal_snapshot_v1_generated_desc
          ON daa_hf_signal_snapshot_v1(generated_at DESC);

        CREATE TABLE IF NOT EXISTS daa_external_payload_raw_v1 (
          id TEXT PRIMARY KEY,
          provider TEXT NOT NULL,
          resource TEXT NOT NULL,
          subject_key TEXT NOT NULL DEFAULT '',
          request_url TEXT NOT NULL DEFAULT '',
          request_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          response_status INTEGER NOT NULL DEFAULT 0,
          response_headers_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          payload_json JSONB,
          payload_text TEXT,
          fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          expire_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_daa_external_payload_raw_v1_provider_resource_subject_fetched
          ON daa_external_payload_raw_v1(provider, resource, subject_key, fetched_at DESC);
        CREATE INDEX IF NOT EXISTS idx_daa_external_payload_raw_v1_expire_at
          ON daa_external_payload_raw_v1(expire_at);

        CREATE TABLE IF NOT EXISTS daa_external_request_log_v1 (
          id TEXT PRIMARY KEY,
          provider TEXT NOT NULL,
          resource TEXT NOT NULL,
          subject_key TEXT NOT NULL DEFAULT '',
          endpoint_host TEXT NOT NULL DEFAULT '',
          http_status INTEGER NOT NULL DEFAULT 0,
          error_code TEXT NOT NULL DEFAULT '',
          error_message TEXT NOT NULL DEFAULT '',
          latency_ms INTEGER NOT NULL DEFAULT 0,
          retry_count INTEGER NOT NULL DEFAULT 0,
          cache_status TEXT NOT NULL DEFAULT '',
          caller TEXT NOT NULL DEFAULT '',
          raw_ref_id TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_daa_external_request_log_v1_created_desc
          ON daa_external_request_log_v1(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_daa_external_request_log_v1_provider_resource_created
          ON daa_external_request_log_v1(provider, resource, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_daa_external_request_log_v1_subject_created
          ON daa_external_request_log_v1(subject_key, created_at DESC);

      `);
      await query("COMMIT");
    } catch (error) {
      try {
        await query("ROLLBACK");
      } catch (err) {
        logSwallowed("storeSchema.rollback", err);
      }
      throw error;
    }
  });
  try {
    await st.marketCacheSchemaInit;
  } catch (error) {
    st.marketCacheSchemaInit = null;
    throw error;
  }
}
