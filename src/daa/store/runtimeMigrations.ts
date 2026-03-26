import { randomUUID } from "node:crypto";

import { resolveInvestableCash } from "@/src/daa/account/resolveInvestableCash";
import { toFinite } from "@/src/daa/utils/normalize";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number }>;

type Migration = {
  id: string;
  apply: (query: QueryFn) => Promise<void>;
};

function parseConfigJson(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, any> : {};
    } catch (err) {
      logSwallowed("runtimeMigrations.parseConfigJson", err);
      return {};
    }
  }
  return typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function normalizeBaseCurrency(value: unknown, fallback = "USD"): string {
  const text = String(value || "").trim().toUpperCase();
  if (!text) return fallback;
  if (text === "RMB" || text === "CNH") return "CNY";
  return text;
}

function toIsoTimestamp(value: unknown): string {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? new Date(ms).toISOString() : "";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? new Date(value).toISOString() : "";
  }
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "";
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : "";
}

async function tableExists(query: QueryFn, tableName: string): Promise<boolean> {
  const result = await query(
    "SELECT 1 FROM information_schema.tables WHERE table_name = $1 LIMIT 1",
    [tableName],
  );
  return result.rows.length > 0;
}

async function ensureVersionTable(query: QueryFn): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS daa_schema_migrations_v1 (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function ensureAccountStateSeed(query: QueryFn): Promise<void> {
  const existing = await query(
    "SELECT id FROM daa_account_state_v2 WHERE id = 'default' LIMIT 1",
  );
  if (existing.rows.length > 0) return;

  const configRes = await query(
    "SELECT config_json FROM daa_system_config_v2 WHERE id = 'default' ORDER BY version DESC, updated_at DESC LIMIT 1",
  );
  const config = parseConfigJson(configRes.rows[0]?.config_json);
  const strategy = config?.strategy && typeof config.strategy === "object" ? config.strategy : {};
  const account = strategy?.account && typeof strategy.account === "object" ? strategy.account : {};

  const baseCurrency = normalizeBaseCurrency(account.baseCurrency, "USD");
  const cash = Math.max(0, toFinite(account.cash, 0));
  const frozenCash = Math.max(0, toFinite(account.frozenCash, 0));
  const investableCash = resolveInvestableCash({
    cash,
    frozenCash,
    investableCash: account.investableCash,
  });
  const totalEquityRaw = account.totalEquity == null ? Number.NaN : toFinite(account.totalEquity, Number.NaN);
  const totalEquity = Number.isFinite(totalEquityRaw) ? Math.max(0, totalEquityRaw) : null;

  await query(
    `INSERT INTO daa_account_state_v2 (
       id, base_currency, cash, investable_cash, frozen_cash, total_equity, updated_at
     ) VALUES (
       'default', $1, $2, $3, $4, $5, NOW()
     )`,
    [baseCurrency, cash, investableCash, frozenCash, totalEquity],
  );
}

const MIGRATIONS_: Migration[] = [
  {
    id: "20260309_account_state",
    async apply(query) {
      await query(`
        CREATE TABLE IF NOT EXISTS daa_account_state_v2 (
          id TEXT PRIMARY KEY,
          base_currency TEXT NOT NULL DEFAULT 'USD',
          cash NUMERIC NOT NULL DEFAULT 0,
          investable_cash NUMERIC NOT NULL DEFAULT 0,
          frozen_cash NUMERIC NOT NULL DEFAULT 0,
          total_equity NUMERIC,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await ensureAccountStateSeed(query);
    },
  },
  {
    id: "20260309_asset_domain_foundation",
    async apply(query) {
      await query(`
        CREATE TABLE IF NOT EXISTS daa_asset_master (
          asset_key TEXT PRIMARY KEY,
          symbol TEXT NOT NULL,
          market TEXT NOT NULL DEFAULT 'US',
          currency TEXT NOT NULL DEFAULT 'USD',
          asset_class TEXT NOT NULL DEFAULT 'EQUITY',
          region TEXT NOT NULL DEFAULT 'GLOBAL',
          exchange TEXT NOT NULL DEFAULT '',
          instrument_type TEXT NOT NULL DEFAULT 'STOCK',
          market_group TEXT NOT NULL DEFAULT 'GLOBAL_EQUITY',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS daa_portfolio_positions (
          asset_key TEXT PRIMARY KEY REFERENCES daa_asset_master(asset_key) ON DELETE CASCADE,
          holding_qty NUMERIC NOT NULL DEFAULT 0,
          holding_price NUMERIC NOT NULL DEFAULT 0,
          cost_basis NUMERIC,
          holding_tags TEXT[] NOT NULL DEFAULT '{}',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS daa_watchlist_entries (
          asset_key TEXT PRIMARY KEY REFERENCES daa_asset_master(asset_key) ON DELETE CASCADE,
          watch_enabled BOOLEAN NOT NULL DEFAULT FALSE,
          watch_tags TEXT[] NOT NULL DEFAULT '{}',
          notes TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS daa_target_allocations (
          asset_key TEXT PRIMARY KEY REFERENCES daa_asset_master(asset_key) ON DELETE CASCADE,
          target_weight_hint NUMERIC NOT NULL DEFAULT 0,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS daa_market_price_snapshots (
          asset_key TEXT PRIMARY KEY REFERENCES daa_asset_master(asset_key) ON DELETE CASCADE,
          last_price NUMERIC NOT NULL DEFAULT 0,
          price_updated_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await query(`
        INSERT INTO daa_asset_master (
          asset_key, symbol, market, currency, asset_class, region, exchange, instrument_type, market_group, created_at, updated_at
        )
        SELECT asset_key, symbol, market, currency, asset_class, region, exchange, instrument_type, market_group, created_at, updated_at
        FROM daa_asset_universe
        ON CONFLICT (asset_key) DO UPDATE
        SET symbol = EXCLUDED.symbol,
            market = EXCLUDED.market,
            currency = EXCLUDED.currency,
            asset_class = EXCLUDED.asset_class,
            region = EXCLUDED.region,
            exchange = EXCLUDED.exchange,
            instrument_type = EXCLUDED.instrument_type,
            market_group = EXCLUDED.market_group,
            updated_at = EXCLUDED.updated_at
      `);

      await query(`
        INSERT INTO daa_portfolio_positions (
          asset_key, holding_qty, holding_price, cost_basis, holding_tags, updated_at
        )
        SELECT asset_key, holding_qty, holding_price, cost_basis, holding_tags, updated_at
        FROM daa_asset_universe
        ON CONFLICT (asset_key) DO UPDATE
        SET holding_qty = EXCLUDED.holding_qty,
            holding_price = EXCLUDED.holding_price,
            cost_basis = EXCLUDED.cost_basis,
            holding_tags = EXCLUDED.holding_tags,
            updated_at = EXCLUDED.updated_at
      `);

      await query(`
        INSERT INTO daa_watchlist_entries (
          asset_key, watch_enabled, watch_tags, notes, created_at, updated_at
        )
        SELECT asset_key, watch_enabled, watch_tags, notes, created_at, updated_at
        FROM daa_asset_universe
        ON CONFLICT (asset_key) DO UPDATE
        SET watch_enabled = EXCLUDED.watch_enabled,
            watch_tags = EXCLUDED.watch_tags,
            notes = EXCLUDED.notes,
            updated_at = EXCLUDED.updated_at
      `);

      await query(`
        INSERT INTO daa_target_allocations (
          asset_key, target_weight_hint, updated_at
        )
        SELECT asset_key, target_weight_hint, updated_at
        FROM daa_asset_universe
        ON CONFLICT (asset_key) DO UPDATE
        SET target_weight_hint = EXCLUDED.target_weight_hint,
            updated_at = EXCLUDED.updated_at
      `);

      await query(`
        INSERT INTO daa_market_price_snapshots (
          asset_key, last_price, price_updated_at, updated_at
        )
        SELECT asset_key, last_price, price_updated_at, updated_at
        FROM daa_asset_universe
        ON CONFLICT (asset_key) DO UPDATE
        SET last_price = EXCLUDED.last_price,
            price_updated_at = EXCLUDED.price_updated_at,
            updated_at = EXCLUDED.updated_at
      `);
    },
  },
  {
    id: "20260309_strategy_lab_run_snapshots",
    async apply(query) {
      await query(`
        CREATE TABLE IF NOT EXISTS daa_strategy_lab_run_snapshots (
          run_id TEXT PRIMARY KEY,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          base_currency TEXT NOT NULL,
          start_date TEXT NOT NULL,
          end_date TEXT NOT NULL,
          request_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          summary_json JSONB NOT NULL DEFAULT '{}'::jsonb
        )
      `);
      await query("CREATE INDEX IF NOT EXISTS idx_daa_strategy_lab_run_snapshots_created_desc ON daa_strategy_lab_run_snapshots(created_at DESC)");
    },
  },
  {
    id: "20260309_job_execution_logs",
    async apply(query) {
      await query(`
        CREATE TABLE IF NOT EXISTS daa_job_execution_logs (
          job_id TEXT PRIMARY KEY,
          job_type TEXT NOT NULL,
          request_id TEXT,
          trigger_source TEXT NOT NULL,
          idempotency_key TEXT,
          status TEXT NOT NULL,
          started_at TIMESTAMPTZ NOT NULL,
          finished_at TIMESTAMPTZ,
          duration_ms BIGINT,
          result_json JSONB,
          error_text TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await query("CREATE INDEX IF NOT EXISTS idx_daa_job_execution_logs_type_started_desc ON daa_job_execution_logs(job_type, started_at DESC)");
      await query("CREATE INDEX IF NOT EXISTS idx_daa_job_execution_logs_request_id ON daa_job_execution_logs(request_id)");
    },
  },
  {
    id: "20260319_notification_delivery_logs",
    async apply(query) {
      await query(`
        CREATE TABLE IF NOT EXISTS daa_notification_delivery_logs (
          id TEXT PRIMARY KEY,
          channel TEXT NOT NULL,
          event_type TEXT NOT NULL,
          trigger_source TEXT NOT NULL DEFAULT 'unknown',
          success BOOLEAN NOT NULL DEFAULT FALSE,
          status_code INTEGER,
          error_code TEXT,
          error_message TEXT,
          recipient_hint TEXT,
          job_id TEXT,
          cycle_id TEXT,
          ticket_id TEXT,
          request_json JSONB,
          response_json JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await query("CREATE INDEX IF NOT EXISTS idx_daa_notification_delivery_logs_created_desc ON daa_notification_delivery_logs(created_at DESC)");
      await query("CREATE INDEX IF NOT EXISTS idx_daa_notification_delivery_logs_channel_created_desc ON daa_notification_delivery_logs(channel, created_at DESC)");
      await query("CREATE INDEX IF NOT EXISTS idx_daa_notification_delivery_logs_job_id ON daa_notification_delivery_logs(job_id)");
    },
  },
  {
    id: "20260319_current_ledger_opening_balance",
    async apply(query) {
      const hasLedgerTable = await tableExists(query, "daa_portfolio_ledger_events");
      if (!hasLedgerTable) return;

      const ledgerStartRes = await query(
        "SELECT MAX(ts) AS ledger_start_ts FROM daa_portfolio_ledger_events WHERE event_kind = 'ledger_reset'",
      );
      const ledgerStartTs = toIsoTimestamp(ledgerStartRes.rows[0]?.ledger_start_ts);
      if (!ledgerStartTs) return;

      const [openingExistsRes, snapshotRes, accountRes, activityRes, holdingRes] = await Promise.all([
        query(
          "SELECT 1 FROM daa_portfolio_ledger_events WHERE event_kind = 'opening_balance' AND ts >= $1 LIMIT 1",
          [ledgerStartTs],
        ),
        query(
          "SELECT cash FROM daa_equity_snapshots_v2 WHERE ts = $1 AND source = 'ledger_reset' ORDER BY ts DESC LIMIT 1",
          [ledgerStartTs],
        ),
        query(
          "SELECT base_currency, cash, frozen_cash, investable_cash FROM daa_account_state_v2 WHERE id = 'default' LIMIT 1",
        ),
        query(
          "SELECT COUNT(*) AS count FROM daa_portfolio_ledger_events WHERE event_kind <> 'ledger_reset' AND ts >= $1",
          [ledgerStartTs],
        ),
        query(
          "SELECT COUNT(*) AS count FROM daa_asset_universe WHERE holding_qty > 0 OR holding_price > 0 OR cost_basis IS NOT NULL",
        ),
      ]);

      const accountRow = accountRes.rows[0] || {};
      const baseCurrency = normalizeBaseCurrency(accountRow.base_currency, "USD");
      const snapshotCash = Math.max(0, toFinite(snapshotRes.rows[0]?.cash, Number.NaN));
      const currentCash = Math.max(0, toFinite(accountRow.cash, 0));
      const frozenCash = Math.max(0, toFinite(accountRow.frozen_cash, 0));
      const investableCash = resolveInvestableCash({
        cash: currentCash,
        frozenCash,
        investableCash: accountRow.investable_cash,
      });
      const openingCash = Number.isFinite(snapshotCash) ? snapshotCash : currentCash;
      const hasOpeningBalance = openingExistsRes.rows.length > 0;
      const activityCount = Math.max(0, toFinite(activityRes.rows[0]?.count, 0));
      const holdingCount = Math.max(0, toFinite(holdingRes.rows[0]?.count, 0));

      if (!hasOpeningBalance && openingCash > 0) {
        await query(
          `INSERT INTO daa_portfolio_ledger_events (
             event_id, ts, event_kind, side, amount, base_currency, account_base_currency,
             amount_in_account_base, fx_rate_to_account, ticket_id, cycle_id, settlement_ts, note, event_payload_json, created_at
           ) VALUES (
             $1,$2,'opening_balance','deposit',$3,$4,$4,$3,1,NULL,NULL,$2,$5,$6::jsonb,NOW()
           )`,
          [
            randomUUID(),
            ledgerStartTs,
            openingCash,
            baseCurrency,
            "当前工作账本期初余额",
            JSON.stringify({ entryKind: "opening_balance", reason: "runtime_backfill" }),
          ],
        );
      }

      if (holdingCount === 0 && activityCount === 0) {
        await query(
          `UPDATE daa_account_state_v2
           SET cash = $1,
               investable_cash = $2,
               frozen_cash = $3,
               total_equity = $1,
               updated_at = NOW()
           WHERE id = 'default'`,
          [openingCash, Math.min(openingCash, investableCash), frozenCash],
        );
      }
    },
  },
  {
    id: "20260319_broker_connector_foundation",
    async apply(query) {
      await query("ALTER TABLE daa_trade_tickets DROP CONSTRAINT IF EXISTS daa_trade_tickets_status_check");
      await query(
        "ALTER TABLE daa_trade_tickets ADD CONSTRAINT daa_trade_tickets_status_check CHECK (status IN ('ready', 'submitted', 'partially_filled', 'executed', 'canceled', 'rejected'))",
      ).catch(() => undefined);
      await query("ALTER TABLE daa_trade_tickets ADD COLUMN IF NOT EXISTS broker_kind TEXT");
      await query("ALTER TABLE daa_trade_tickets ADD COLUMN IF NOT EXISTS broker_account_id TEXT");
      await query("ALTER TABLE daa_trade_tickets ADD COLUMN IF NOT EXISTS broker_order_id TEXT");
      await query("ALTER TABLE daa_trade_tickets ADD COLUMN IF NOT EXISTS broker_status TEXT");
      await query("ALTER TABLE daa_trade_tickets ADD COLUMN IF NOT EXISTS filled_qty NUMERIC");
      await query("ALTER TABLE daa_trade_tickets ADD COLUMN IF NOT EXISTS avg_fill_price NUMERIC");
      await query("ALTER TABLE daa_trade_tickets ADD COLUMN IF NOT EXISTS last_broker_sync_at TIMESTAMPTZ");
      await query("ALTER TABLE daa_trade_tickets ADD COLUMN IF NOT EXISTS last_applied_fill_qty NUMERIC NOT NULL DEFAULT 0");
      await query("ALTER TABLE daa_trade_tickets ADD COLUMN IF NOT EXISTS broker_reject_reason TEXT");
      await query("ALTER TABLE daa_trade_tickets ADD COLUMN IF NOT EXISTS broker_raw_json JSONB");
      await query("CREATE INDEX IF NOT EXISTS idx_daa_trade_tickets_broker_order_id ON daa_trade_tickets(broker_order_id)");

      await query(`
        CREATE TABLE IF NOT EXISTS daa_broker_order_snapshots (
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
      await query("CREATE UNIQUE INDEX IF NOT EXISTS idx_daa_broker_order_snapshots_order_unique ON daa_broker_order_snapshots(broker_kind, broker_order_id)");
    },
  },
  {
    id: "20260326_price_history_ohlcv",
    async apply(query) {
      const hasPriceHistory = await tableExists(query, "daa_price_history");
      if (!hasPriceHistory) return;
      await query("ALTER TABLE daa_price_history ADD COLUMN IF NOT EXISTS open_price NUMERIC");
      await query("ALTER TABLE daa_price_history ADD COLUMN IF NOT EXISTS high_price NUMERIC");
      await query("ALTER TABLE daa_price_history ADD COLUMN IF NOT EXISTS low_price NUMERIC");
      await query("ALTER TABLE daa_price_history ADD COLUMN IF NOT EXISTS volume BIGINT");
    },
  },
  {
    id: "20260320_broker_portfolio_snapshots",
    async apply(query) {
      await query(`
        CREATE TABLE IF NOT EXISTS daa_broker_account_state (
          broker_kind TEXT PRIMARY KEY,
          account_id TEXT,
          base_currency TEXT NOT NULL DEFAULT 'USD',
          cash NUMERIC NOT NULL DEFAULT 0,
          investable_cash NUMERIC NOT NULL DEFAULT 0,
          frozen_cash NUMERIC NOT NULL DEFAULT 0,
          total_equity NUMERIC,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS daa_broker_positions (
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
          PRIMARY KEY (broker_kind, asset_key)
        )
      `);
      await query("CREATE INDEX IF NOT EXISTS idx_daa_broker_positions_kind_updated_desc ON daa_broker_positions(broker_kind, updated_at DESC)");
    },
  },
];

export async function runDaaStoreRuntimeMigrations(query: QueryFn): Promise<void> {
  await ensureVersionTable(query);
  for (const migration of MIGRATIONS_) {
    const existing = await query(
      "SELECT id FROM daa_schema_migrations_v1 WHERE id = $1 LIMIT 1",
      [migration.id],
    );
    if (existing.rows.length > 0) continue;
    await migration.apply(query);
    await query(
      "INSERT INTO daa_schema_migrations_v1 (id, applied_at) VALUES ($1, NOW()) ON CONFLICT (id) DO NOTHING",
      [migration.id],
    );
  }
}
