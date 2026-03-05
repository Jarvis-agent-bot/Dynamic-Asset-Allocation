import { randomUUID } from "node:crypto";

import { daaPgPoolV0, isDaaPgMemRuntimeV0, withDaaPgClientV0 } from "@/src/daa/pg/daaPgV0";
import { normalizeCurrencyAliasV2 } from "@/src/daa/config/currencyV2";
import { buildDaaAssetKeyV1, parseDaaAssetKeyV1 } from "@/src/daa/assetKeyV1";
import {
  inferMarketGroupV1,
  inferRegionByMarketV1,
  normalizeAssetClassV1,
  normalizeInstrumentTypeV1,
  normalizeRegionV1,
} from "@/src/daa/modules/workbench/assetTaxonomyV1";
import {
  applySystemConfigPatchesV2,
  DEFAULT_SYSTEM_CONFIG_V2,
  normalizeSystemConfigV2,
  type DaaSystemConfigEnvelopeV2,
  type DaaSystemConfigPatchV2,
  type DaaSystemConfigV2,
} from "@/src/daa/config/systemConfigV2";

type DaaStoreStateV1 = {
  schemaInit: Promise<void> | null;
};

const STORE_GLOBAL_KEY_V1 = "__daa_store_pg_state_v0__";

function getStoreStateV1(): DaaStoreStateV1 {
  const g = globalThis as any;
  if (!g[STORE_GLOBAL_KEY_V1]) {
    g[STORE_GLOBAL_KEY_V1] = { schemaInit: null } satisfies DaaStoreStateV1;
  }
  return g[STORE_GLOBAL_KEY_V1] as DaaStoreStateV1;
}

function toFiniteNumber(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toIsoString(v: unknown, fallback = new Date().toISOString()): string {
  const text = typeof v === "string" ? v.trim() : "";
  if (!text) return fallback;
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return fallback;
  return new Date(ms).toISOString();
}

function parseJsonb<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  }
  if (typeof v === "object") return v as T;
  return fallback;
}

function normalizeText(v: unknown, fallback = ""): string {
  const text = typeof v === "string" ? v.trim() : "";
  return text || fallback;
}

function isMissingRelationErrorV1(error: unknown, relation: string): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (!message) return false;
  const escaped = relation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`relation\\s+["']?${escaped}["']?\\s+does\\s+not\\s+exist`, "i").test(message);
}

type SchemaQueryFnV1 = (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number }>;

async function hasTableColumnV1(query: SchemaQueryFnV1, tableName: string, columnName: string): Promise<boolean> {
  const result = await query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_name = $1 AND column_name = $2
     LIMIT 1`,
    [tableName.toLowerCase(), columnName.toLowerCase()],
  );
  return result.rows.length > 0;
}

async function ensureTableColumnV1(
  query: SchemaQueryFnV1,
  tableName: string,
  columnName: string,
  definitionSql: string,
): Promise<void> {
  if (await hasTableColumnV1(query, tableName, columnName)) return;
  await query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definitionSql}`);
}

async function isStoreSchemaReadyV1(): Promise<boolean> {
  try {
    const requiredColumns = {
      daa_asset_universe: [
        "asset_key",
        "symbol",
        "market",
        "currency",
        "asset_class",
        "region",
        "exchange",
        "instrument_type",
        "market_group",
      ],
      daa_trade_tickets: [
        "ticket_id",
        "basket_id",
        "asset_key",
        "pricing_mode",
        "price_source",
        "price_snapshot_at",
      ],
    } as const;

    await withDaaPgClientV0(async ({ query }) => {
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
    if (isMissingRelationErrorV1(error, "daa_asset_universe")) return false;
    if (error instanceof Error && /column\s+.+\s+does\s+not\s+exist/i.test(error.message)) return false;
    throw error;
  }
}

export type DaaStorePositionV1 = {
  id: string;
  assetKey: string;
  symbol: string;
  market: string;
  currency: string;
  qty: number;
  price: number;
  costBasis: number | null;
  tags: string[];
  updatedAt: string;
};

export type DaaStoreStrategyConfigV1 = {
  id: "default";
  configJson: Record<string, unknown>;
  updatedAt: string;
};

export type DaaStoreEquitySnapshotV1 = {
  ts: string;
  totalEquity: number;
  holdingsValue: number;
  cash: number;
  source: string;
};

export type DaaStoreNotificationConfigV1 = {
  id: "default";
  enabled: boolean;
  notifyOnDrift: boolean;
  notifyOnRebalance: boolean;
  notifyOnPriceAlert: boolean;
  updatedAt: string;
};

export type DaaStoreRebalanceDecisionV1 = {
  id: string;
  shouldRebalance: boolean;
  triggerSource: "manual" | "cron_drift" | "cron_scheduled";
  status: "pending" | "partial" | "executed" | "canceled" | "skipped";
  requestJson: Record<string, unknown>;
  responseJson: Record<string, unknown>;
  createdAt: string;
};

export type DaaStoreExecutionOrderV1 = {
  orderId: string;
  decisionId: string;
  symbol: string;
  side: "BUY" | "SELL";
  suggestedNotional: number;
  status: "pending" | "submitted" | "partial" | "executed" | "canceled" | "skipped";
  executedQty: number;
  executedPrice: number;
  fee: number;
  bookedQty: number;
  bookedNotional: number;
  bookedFee: number;
  notes: string | null;
  updatedAt: string;
  bookedAt?: string | null;
};

export type DaaStoreRunHistoryEntryV1 = {
  id: string;
  ts: string;
  triggerSource: string;
  requestJson: Record<string, unknown>;
  responseJson: Record<string, unknown>;
  summaryJson: Record<string, unknown>;
};

export type DaaStoreOpLogEntryV1 = {
  id: string;
  ts: string;
  level: "info" | "warn" | "error";
  message: string;
  contextJson: Record<string, unknown>;
};

export type DaaStoreCandidateAssetV1 = {
  id: string;
  symbol: string;
  market: string;
  currency: string;
  enabled: boolean;
  targetWeightHint: number;
  tags: string[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DaaStoreAssetUniverseRowV1 = {
  assetKey: string;
  symbol: string;
  market: string;
  currency: string;
  assetClass: string;
  region: string;
  exchange: string;
  instrumentType: string;
  marketGroup: string;
  holdingQty: number;
  holdingPrice: number;
  costBasis: number | null;
  holdingTags: string[];
  watchEnabled: boolean;
  targetWeightHint: number;
  watchTags: string[];
  notes: string | null;
  lastPrice: number;
  priceUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DaaStoreFxRateV1 = {
  id: string;
  baseCcy: string;
  quoteCcy: string;
  rate: number;
  source: string;
  asOfTs: string;
  updatedAt: string;
};

export type DaaStoreCashLedgerSideV1 = "deposit" | "withdraw";

export type DaaStoreCashLedgerEntryV1 = {
  id: string;
  ts: string;
  side: DaaStoreCashLedgerSideV1;
  amount: number;
  baseCurrency: string;
  note: string | null;
  createdAt: string;
};

export type DaaStoreCashLedgerApplyInputV1 = {
  side: DaaStoreCashLedgerSideV1;
  amount: number;
  baseCurrency?: string;
  note?: string;
};

export type DaaStoreTradeTicketSourceV1 = "manual" | "decision";
export type DaaStoreTradeTicketStatusV1 = "ready" | "executed" | "canceled" | "rejected";
export type DaaStoreTradeTicketSideV1 = "BUY" | "SELL";
export type DaaStoreTradeBasketStatusV1 = "draft" | "executing" | "executed" | "partial" | "canceled";
export type DaaStoreTradeBasketSourceV1 = "manual" | "decision" | "mixed" | "migration";

export type DaaStoreTradeBasketV1 = {
  basketId: string;
  source: DaaStoreTradeBasketSourceV1;
  status: DaaStoreTradeBasketStatusV1;
  decisionRefId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  executedAt: string | null;
};

export type DaaStoreTradeTicketV1 = {
  ticketId: string;
  basketId: string;
  assetKey: string;
  source: DaaStoreTradeTicketSourceV1;
  status: DaaStoreTradeTicketStatusV1;
  symbol: string;
  market: string;
  instrumentCurrency: string;
  baseCurrency: string;
  side: DaaStoreTradeTicketSideV1;
  qty: number;
  price: number;
  fee: number;
  grossNotional: number;
  fxRateToBase: number | null;
  notionalInBase: number;
  decisionRefId: string | null;
  reasonTags: string[];
  reasonText: string | null;
  snapshotBefore: Record<string, unknown>;
  snapshotAfter: Record<string, unknown> | null;
  rejectCode: string | null;
  rejectMessage: string | null;
  pricingMode: "manual" | "market";
  priceSource: string | null;
  priceSnapshotAt: string | null;
  createdBy: string;
  createdAt: string;
  executedAt: string | null;
  canceledAt: string | null;
  updatedAt: string;
};

export type DaaStoreCreateTradeTicketInputV1 = {
  basketId?: string;
  assetKey?: string;
  source?: DaaStoreTradeTicketSourceV1;
  side: DaaStoreTradeTicketSideV1;
  symbol: string;
  market?: string;
  instrumentCurrency?: string;
  qty: number;
  price: number;
  fee?: number;
  decisionRefId?: string | null;
  reasonTags?: string[];
  reasonText?: string;
  pricingMode?: "manual" | "market";
  priceSource?: string;
  priceSnapshotAt?: string;
  createdBy?: string;
};

export type DaaStoreExecuteTradeTicketsInputV1 = {
  basketId?: string;
  ticketIds?: string[];
};

export type DaaStoreExecuteTradeTicketsResultV1 = {
  results: Array<{
    ticketId: string;
    status: DaaStoreTradeTicketStatusV1;
    rejectCode?: string;
    rejectMessage?: string;
  }>;
  tickets: DaaStoreTradeTicketV1[];
  positions: DaaStorePositionV1[];
  account: {
    baseCurrency: string;
    cash: number;
    investableCash: number;
    frozenCash: number;
    totalEquity: number | null;
  };
  equitySnapshot: DaaStoreEquitySnapshotV1;
};

export type DaaStoreHumanIngestStateV1 = {
  id: "default";
  lastIngestAt: string | null;
  ingestCount: number;
  latestBatch: Record<string, unknown> | null;
  latestActors: Array<Record<string, unknown>>;
  latestHoldings: Array<Record<string, unknown>>;
  updatedAt: string;
};

export type DaaStoreSystemConfigRowV2 = {
  id: "default";
  version: number;
  config: DaaSystemConfigV2;
  updatedAt: string;
};

function mapSystemConfigRowV2(row: Record<string, unknown>): DaaStoreSystemConfigRowV2 {
  const versionRaw = Number(row.version);
  return {
    id: "default",
    version: Number.isFinite(versionRaw) && versionRaw > 0 ? Math.trunc(versionRaw) : 1,
    config: normalizeSystemConfigV2(parseJsonb<Record<string, unknown>>(row.config_json, DEFAULT_SYSTEM_CONFIG_V2)),
    updatedAt: toIsoString(row.updated_at),
  };
}

async function ensureSystemConfigRowInTxV2(
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number }>,
): Promise<DaaStoreSystemConfigRowV2> {
  if (isDaaPgMemRuntimeV0()) {
    await query(`
      CREATE TABLE IF NOT EXISTS daa_system_config_v2 (
        id TEXT,
        version BIGINT,
        config_json JSONB,
        updated_at TIMESTAMPTZ
      )
    `);
  } else {
    await query(`
      CREATE TABLE IF NOT EXISTS daa_system_config_v2 (
        id TEXT PRIMARY KEY,
        version BIGINT NOT NULL DEFAULT 1,
        config_json JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  const existing = await query(
    "SELECT id, version, config_json, updated_at FROM daa_system_config_v2 WHERE id='default' LIMIT 1",
  );
  if (existing.rows.length > 0) {
    return mapSystemConfigRowV2(existing.rows[0]);
  }

  const result = await query(
    "INSERT INTO daa_system_config_v2 (id, version, config_json, updated_at) VALUES ('default', 1, $1::jsonb, NOW()) RETURNING id, version, config_json, updated_at",
    [JSON.stringify(DEFAULT_SYSTEM_CONFIG_V2)],
  );
  return mapSystemConfigRowV2(result.rows[0]);
}

async function saveSystemConfigInTxV2(
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number }>,
  nextConfigRaw: unknown,
  baseVersion?: number,
): Promise<DaaStoreSystemConfigRowV2> {
  const current = await ensureSystemConfigRowInTxV2(query);
  if (baseVersion != null && current.version !== Math.trunc(baseVersion)) {
    throw new Error(`system_config_version_conflict:${current.version}`);
  }

  const nextConfig = normalizeSystemConfigV2(nextConfigRaw);
  const nextVersion = current.version + 1;
  const updated = await query(
    "UPDATE daa_system_config_v2 SET version = $1, config_json = $2::jsonb, updated_at = NOW() WHERE id = 'default' RETURNING id, version, config_json, updated_at",
    [nextVersion, JSON.stringify(nextConfig)],
  );
  return mapSystemConfigRowV2(updated.rows[0]);
}

export async function getDaaSystemConfigV2(): Promise<DaaStoreSystemConfigRowV2> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => ensureSystemConfigRowInTxV2(query as any));
}

export async function saveDaaSystemConfigV2(input: {
  config: unknown;
  baseVersion?: number;
}): Promise<DaaStoreSystemConfigRowV2> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    await query("BEGIN");
    try {
      const saved = await saveSystemConfigInTxV2(query as any, input.config, input.baseVersion);
      await query("COMMIT");
      return saved;
    } catch (error) {
      try {
        await query("ROLLBACK");
      } catch {
        // ignore
      }
      throw error;
    }
  });
}

export async function patchDaaSystemConfigV2(input: {
  patches: DaaSystemConfigPatchV2[];
  baseVersion?: number;
}): Promise<DaaStoreSystemConfigRowV2> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    await query("BEGIN");
    try {
      const current = await ensureSystemConfigRowInTxV2(query as any);
      if (input.baseVersion != null && current.version !== Math.trunc(input.baseVersion)) {
        throw new Error(`system_config_version_conflict:${current.version}`);
      }
      const nextConfig = applySystemConfigPatchesV2(current.config, Array.isArray(input.patches) ? input.patches : []);
      const saved = await saveSystemConfigInTxV2(query as any, nextConfig, current.version);
      await query("COMMIT");
      return saved;
    } catch (error) {
      try {
        await query("ROLLBACK");
      } catch {
        // ignore
      }
      throw error;
    }
  });
}

export async function ensureDaaStoreSchemaPgV1(): Promise<void> {
  const st = getStoreStateV1();
  if (st.schemaInit) {
    await st.schemaInit;
    const ready = await isStoreSchemaReadyV1();
    if (ready) return;
    st.schemaInit = null;
  }
  if (!st.schemaInit) {
    st.schemaInit = withDaaPgClientV0(async ({ query }) => {
      await query("BEGIN");
      try {
        await query(`
          CREATE TABLE IF NOT EXISTS daa_positions (
            id TEXT PRIMARY KEY,
            symbol TEXT NOT NULL,
            market TEXT NOT NULL DEFAULT 'US',
            currency TEXT NOT NULL DEFAULT 'USD',
            qty NUMERIC NOT NULL,
            price NUMERIC NOT NULL DEFAULT 0,
            cost_basis NUMERIC,
            tags TEXT[] NOT NULL DEFAULT '{}',
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE UNIQUE INDEX IF NOT EXISTS idx_daa_positions_symbol_market
            ON daa_positions(symbol, market);

          CREATE TABLE IF NOT EXISTS daa_asset_universe (
            asset_key TEXT PRIMARY KEY,
            symbol TEXT NOT NULL,
            market TEXT NOT NULL DEFAULT 'US',
            currency TEXT NOT NULL DEFAULT 'USD',
            asset_class TEXT NOT NULL DEFAULT 'EQUITY',
            region TEXT NOT NULL DEFAULT 'GLOBAL',
            exchange TEXT NOT NULL DEFAULT '',
            instrument_type TEXT NOT NULL DEFAULT 'STOCK',
            market_group TEXT NOT NULL DEFAULT 'GLOBAL_EQUITY',
            holding_qty NUMERIC NOT NULL DEFAULT 0,
            holding_price NUMERIC NOT NULL DEFAULT 0,
            cost_basis NUMERIC,
            holding_tags TEXT[] NOT NULL DEFAULT '{}',
            watch_enabled BOOLEAN NOT NULL DEFAULT FALSE,
            target_weight_hint NUMERIC NOT NULL DEFAULT 0,
            watch_tags TEXT[] NOT NULL DEFAULT '{}',
            notes TEXT,
            last_price NUMERIC NOT NULL DEFAULT 0,
            price_updated_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE UNIQUE INDEX IF NOT EXISTS idx_daa_asset_universe_symbol_market
            ON daa_asset_universe(symbol, market);

          CREATE TABLE IF NOT EXISTS daa_price_history (
            symbol TEXT NOT NULL,
            ts TIMESTAMPTZ NOT NULL,
            price NUMERIC NOT NULL,
            source TEXT NOT NULL DEFAULT 'yfinance',
            PRIMARY KEY (symbol, ts)
          );

          CREATE INDEX IF NOT EXISTS idx_daa_price_history_symbol_ts_desc
            ON daa_price_history(symbol, ts DESC);

          CREATE TABLE IF NOT EXISTS daa_trade_journal (
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
            ON daa_trade_journal(symbol, executed_at DESC);

          CREATE TABLE IF NOT EXISTS daa_trade_baskets (
            basket_id TEXT PRIMARY KEY,
            source TEXT NOT NULL CHECK (source IN ('manual', 'decision', 'mixed', 'migration')),
            status TEXT NOT NULL CHECK (status IN ('draft', 'executing', 'executed', 'partial', 'canceled')),
            decision_ref_id TEXT,
            created_by TEXT NOT NULL DEFAULT 'admin',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            executed_at TIMESTAMPTZ
          );

          CREATE INDEX IF NOT EXISTS idx_daa_trade_baskets_status_created_desc
            ON daa_trade_baskets(status, created_at DESC);

          CREATE TABLE IF NOT EXISTS daa_trade_tickets (
            ticket_id TEXT PRIMARY KEY,
            basket_id TEXT NOT NULL,
            asset_key TEXT NOT NULL,
            source TEXT NOT NULL CHECK (source IN ('manual', 'decision')),
            status TEXT NOT NULL CHECK (status IN ('ready', 'executed', 'canceled', 'rejected')),
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
            created_by TEXT NOT NULL DEFAULT 'admin',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            executed_at TIMESTAMPTZ,
            canceled_at TIMESTAMPTZ,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_daa_trade_tickets_created_desc
            ON daa_trade_tickets(created_at DESC);

          CREATE INDEX IF NOT EXISTS idx_daa_trade_tickets_status_created_desc
            ON daa_trade_tickets(status, created_at DESC);

          CREATE TABLE IF NOT EXISTS daa_rebalance_decisions (
            id TEXT PRIMARY KEY,
            request_json JSONB NOT NULL,
            response_json JSONB NOT NULL,
            should_rebalance BOOLEAN NOT NULL,
            trigger_source TEXT NOT NULL DEFAULT 'manual',
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_daa_rebalance_decisions_created_desc
            ON daa_rebalance_decisions(created_at DESC);

          CREATE INDEX IF NOT EXISTS idx_daa_rebalance_decisions_status_created_desc
            ON daa_rebalance_decisions(status, created_at DESC);

          CREATE TABLE IF NOT EXISTS daa_execution_orders (
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

          CREATE INDEX IF NOT EXISTS idx_daa_execution_orders_decision_status
            ON daa_execution_orders(decision_id, status);

          CREATE TABLE IF NOT EXISTS daa_execution_order_events (
            id TEXT PRIMARY KEY,
            decision_id TEXT NOT NULL REFERENCES daa_rebalance_decisions(id) ON DELETE CASCADE,
            order_id TEXT NOT NULL REFERENCES daa_execution_orders(order_id) ON DELETE CASCADE,
            event_type TEXT NOT NULL,
            payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_daa_execution_order_events_order_created_desc
            ON daa_execution_order_events(order_id, created_at DESC);

          CREATE TABLE IF NOT EXISTS daa_equity_snapshots (
            ts TIMESTAMPTZ PRIMARY KEY,
            total_equity NUMERIC NOT NULL,
            holdings_value NUMERIC NOT NULL,
            cash NUMERIC NOT NULL,
            source TEXT NOT NULL DEFAULT 'cron'
          );

          CREATE TABLE IF NOT EXISTS daa_cash_ledger (
            id TEXT PRIMARY KEY,
            ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            side TEXT NOT NULL CHECK (side IN ('deposit', 'withdraw')),
            amount NUMERIC NOT NULL CHECK (amount > 0),
            base_currency TEXT NOT NULL DEFAULT 'USD',
            note TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_daa_cash_ledger_ts_desc
            ON daa_cash_ledger(ts DESC);

          CREATE TABLE IF NOT EXISTS daa_run_history (
            id TEXT PRIMARY KEY,
            ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            trigger_source TEXT NOT NULL DEFAULT 'manual',
            request_json JSONB NOT NULL,
            response_json JSONB NOT NULL,
            summary_json JSONB NOT NULL
          );

          CREATE INDEX IF NOT EXISTS idx_daa_run_history_ts_desc
            ON daa_run_history(ts DESC);

          CREATE TABLE IF NOT EXISTS daa_op_log (
            id TEXT PRIMARY KEY,
            ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            level TEXT NOT NULL DEFAULT 'info',
            message TEXT NOT NULL,
            context_json JSONB NOT NULL DEFAULT '{}'::jsonb
          );

          CREATE INDEX IF NOT EXISTS idx_daa_op_log_ts_desc
            ON daa_op_log(ts DESC);

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
        `);

        await query("ALTER TABLE daa_execution_orders ADD COLUMN IF NOT EXISTS booked_at TIMESTAMPTZ");
        await query("ALTER TABLE daa_execution_orders ADD COLUMN IF NOT EXISTS booked_qty NUMERIC NOT NULL DEFAULT 0");
        await query("ALTER TABLE daa_execution_orders ADD COLUMN IF NOT EXISTS booked_notional NUMERIC NOT NULL DEFAULT 0");
        await query("ALTER TABLE daa_execution_orders ADD COLUMN IF NOT EXISTS booked_fee NUMERIC NOT NULL DEFAULT 0");
        await query("ALTER TABLE daa_trade_journal ADD COLUMN IF NOT EXISTS execution_order_id TEXT");
        await query("DROP INDEX IF EXISTS idx_daa_trade_journal_execution_order_unique");
        await query("ALTER TABLE daa_positions DROP COLUMN IF EXISTS liquidity_notional_24h");
        await query("ALTER TABLE daa_cash_ledger DROP COLUMN IF EXISTS channel");
        await query("ALTER TABLE daa_cash_ledger DROP COLUMN IF EXISTS reference_id");
        await ensureTableColumnV1(query as any, "daa_asset_universe", "asset_class", "TEXT NOT NULL DEFAULT 'EQUITY'");
        await ensureTableColumnV1(query as any, "daa_asset_universe", "region", "TEXT NOT NULL DEFAULT 'GLOBAL'");
        await ensureTableColumnV1(query as any, "daa_asset_universe", "exchange", "TEXT NOT NULL DEFAULT ''");
        await ensureTableColumnV1(query as any, "daa_asset_universe", "instrument_type", "TEXT NOT NULL DEFAULT 'STOCK'");
        await ensureTableColumnV1(query as any, "daa_asset_universe", "market_group", "TEXT NOT NULL DEFAULT 'GLOBAL_EQUITY'");
        await query(
          "CREATE INDEX IF NOT EXISTS idx_daa_asset_universe_market_class_region ON daa_asset_universe(market, asset_class, region)",
        );
        await query(
          "CREATE INDEX IF NOT EXISTS idx_daa_asset_universe_watch_enabled_updated_desc ON daa_asset_universe(watch_enabled, updated_at DESC)",
        );
        await ensureTableColumnV1(query as any, "daa_trade_tickets", "basket_id", "TEXT");
        await ensureTableColumnV1(query as any, "daa_trade_tickets", "asset_key", "TEXT");
        await ensureTableColumnV1(query as any, "daa_trade_tickets", "pricing_mode", "TEXT NOT NULL DEFAULT 'manual'");
        await ensureTableColumnV1(query as any, "daa_trade_tickets", "price_source", "TEXT");
        await ensureTableColumnV1(query as any, "daa_trade_tickets", "price_snapshot_at", "TIMESTAMPTZ");
        await query(
          "CREATE INDEX IF NOT EXISTS idx_daa_trade_tickets_basket_status_created_desc ON daa_trade_tickets(basket_id, status, created_at DESC)",
        );
        await query("ALTER TABLE daa_trade_tickets ALTER COLUMN basket_id DROP NOT NULL");
        await query("ALTER TABLE daa_trade_tickets ALTER COLUMN asset_key DROP NOT NULL");
        await query("UPDATE daa_positions SET id = CONCAT(symbol, '__', market) WHERE COALESCE(id, '') <> CONCAT(symbol, '__', market)");
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

        // 一次性迁移：把历史持仓合并进资产宇宙主表。
        await query(`
          INSERT INTO daa_asset_universe (
            asset_key,
            symbol,
            market,
            currency,
            holding_qty,
            holding_price,
            cost_basis,
            holding_tags,
            watch_enabled,
            target_weight_hint,
            watch_tags,
            notes,
            last_price,
            price_updated_at,
            created_at,
            updated_at
          )
          SELECT
            CONCAT(p.market, '::', p.symbol) AS asset_key,
            p.symbol,
            p.market,
            COALESCE(p.currency, 'USD') AS currency,
            COALESCE(p.qty, 0) AS holding_qty,
            COALESCE(p.price, 0) AS holding_price,
            p.cost_basis AS cost_basis,
            COALESCE(p.tags, '{}'::TEXT[]) AS holding_tags,
            FALSE AS watch_enabled,
            0 AS target_weight_hint,
            '{}'::TEXT[] AS watch_tags,
            NULL::TEXT AS notes,
            COALESCE(p.price, 0) AS last_price,
            CASE WHEN COALESCE(p.price, 0) > 0 THEN NOW() ELSE NULL END AS price_updated_at,
            NOW(),
            NOW()
          FROM daa_positions AS p
          ON CONFLICT (asset_key) DO UPDATE
          SET
            symbol = EXCLUDED.symbol,
            market = EXCLUDED.market,
            currency = EXCLUDED.currency,
            holding_qty = EXCLUDED.holding_qty,
            holding_price = EXCLUDED.holding_price,
            cost_basis = EXCLUDED.cost_basis,
            holding_tags = EXCLUDED.holding_tags,
            watch_enabled = EXCLUDED.watch_enabled,
            target_weight_hint = EXCLUDED.target_weight_hint,
            watch_tags = EXCLUDED.watch_tags,
            notes = EXCLUDED.notes,
            last_price = EXCLUDED.last_price,
            price_updated_at = EXCLUDED.price_updated_at,
            updated_at = NOW()
        `);
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

        await ensureSystemConfigRowInTxV2(query as any);

        await query("COMMIT");
      } catch (error) {
        try {
          await query("ROLLBACK");
        } catch {
          // ignore
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

function mapPositionRowV1(row: Record<string, unknown>): DaaStorePositionV1 {
  const symbol = normalizeText(row.symbol).toUpperCase();
  const market = normalizeText(row.market, "US").toUpperCase();
  return {
    id: normalizeText(row.id),
    assetKey: buildPositionKeyV1(symbol, market),
    symbol,
    market,
    currency: normalizeText(row.currency, "USD").toUpperCase(),
    qty: toFiniteNumber(row.qty),
    price: toFiniteNumber(row.price),
    costBasis: row.cost_basis == null ? null : toFiniteNumber(row.cost_basis),
    tags: Array.isArray(row.tags) ? row.tags.map((x) => String(x)).filter(Boolean) : [],
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapAssetUniverseRowV1(row: Record<string, unknown>): DaaStoreAssetUniverseRowV1 {
  const symbol = normalizeText(row.symbol).toUpperCase();
  const market = normalizeText(row.market, "US").toUpperCase();
  const assetClass = normalizeAssetClassV1(row.asset_class, "EQUITY");
  const region = normalizeRegionV1(row.region, inferRegionByMarketV1(market));
  const instrumentType = normalizeInstrumentTypeV1(row.instrument_type, "STOCK");
  return {
    assetKey: buildPositionKeyV1(symbol, market),
    symbol,
    market,
    currency: normalizeText(row.currency, "USD").toUpperCase(),
    assetClass,
    region,
    exchange: normalizeText(row.exchange, ""),
    instrumentType,
    marketGroup: normalizeText(row.market_group, inferMarketGroupV1({ market, assetClass })),
    holdingQty: Math.max(0, toFiniteNumber(row.holding_qty)),
    holdingPrice: Math.max(0, toFiniteNumber(row.holding_price)),
    costBasis: row.cost_basis == null ? null : Math.max(0, toFiniteNumber(row.cost_basis)),
    holdingTags: Array.isArray(row.holding_tags) ? row.holding_tags.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean) : [],
    watchEnabled: Boolean(row.watch_enabled),
    targetWeightHint: Math.max(0, toFiniteNumber(row.target_weight_hint)),
    watchTags: Array.isArray(row.watch_tags) ? row.watch_tags.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean) : [],
    notes: row.notes == null ? null : normalizeText(row.notes) || null,
    lastPrice: Math.max(0, toFiniteNumber(row.last_price)),
    priceUpdatedAt: row.price_updated_at == null ? null : toIsoString(row.price_updated_at),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

const ASSET_UNIVERSE_SELECT_COLUMNS_V1 = [
  "asset_key",
  "symbol",
  "market",
  "currency",
  "asset_class",
  "region",
  "exchange",
  "instrument_type",
  "market_group",
  "holding_qty",
  "holding_price",
  "cost_basis",
  "holding_tags",
  "watch_enabled",
  "target_weight_hint",
  "watch_tags",
  "notes",
  "last_price",
  "price_updated_at",
  "created_at",
  "updated_at",
].join(", ");

export async function listDaaAssetUniverseV1(): Promise<DaaStoreAssetUniverseRowV1[]> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const result = await query(`SELECT ${ASSET_UNIVERSE_SELECT_COLUMNS_V1} FROM daa_asset_universe ORDER BY symbol ASC, market ASC`);
    return result.rows.map((row) => mapAssetUniverseRowV1(row as Record<string, unknown>));
  });
}

export async function updateDaaAssetUniverseLastPriceV1(input: {
  assetKey: string;
  lastPrice: number;
  priceUpdatedAt?: string;
}): Promise<DaaStoreAssetUniverseRowV1 | null> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const assetKey = normalizeText(input.assetKey).toUpperCase();
    const lastPrice = Math.max(0, toFiniteNumber(input.lastPrice));
    if (!assetKey) throw new Error("assetKey is required");
    if (!(lastPrice > 0)) throw new Error("lastPrice must be > 0");
    const priceUpdatedAt = toIsoString(input.priceUpdatedAt, new Date().toISOString());

    const result = await query(
      `UPDATE daa_asset_universe
       SET last_price = $2, price_updated_at = $3, updated_at = NOW()
       WHERE asset_key = $1
       RETURNING ${ASSET_UNIVERSE_SELECT_COLUMNS_V1}`,
      [assetKey, lastPrice, priceUpdatedAt],
    );
    if (!result.rows.length) return null;
    return mapAssetUniverseRowV1(result.rows[0] as Record<string, unknown>);
  });
}

export async function upsertDaaAssetUniverseRowV1(input: {
  symbol: string;
  market?: string;
  currency?: string;
  assetClass?: string;
  region?: string;
  exchange?: string;
  instrumentType?: string;
  marketGroup?: string;
  watchEnabled?: boolean;
  targetWeightHint?: number;
  watchTags?: string[];
  notes?: string | null;
  lastPrice?: number;
  priceUpdatedAt?: string | null;
}): Promise<DaaStoreAssetUniverseRowV1> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const symbol = normalizeText(input.symbol).toUpperCase();
    const market = normalizeText(input.market, "US").toUpperCase();
    if (!symbol) throw new Error("symbol is required");
    const assetKey = buildPositionKeyV1(symbol, market);
    const currency = normalizeCcyCode(input.currency, "USD");
    const assetClass = normalizeAssetClassV1(input.assetClass, "EQUITY");
    const region = normalizeRegionV1(input.region, inferRegionByMarketV1(market));
    const exchange = normalizeText(input.exchange, "");
    const instrumentType = normalizeInstrumentTypeV1(input.instrumentType, "STOCK");
    const marketGroup = normalizeText(input.marketGroup, inferMarketGroupV1({ market, assetClass }));
    const watchEnabled = input.watchEnabled !== false;
    const targetWeightHint = Math.max(0, toFiniteNumber(input.targetWeightHint));
    const watchTags = Array.isArray(input.watchTags) ? input.watchTags.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean) : [];
    const notes = input.notes == null ? null : normalizeText(input.notes) || null;
    const lastPrice = Math.max(0, toFiniteNumber(input.lastPrice));
    const priceUpdatedAt = lastPrice > 0 ? toIsoString(input.priceUpdatedAt, new Date().toISOString()) : null;

    const result = await query(
      `INSERT INTO daa_asset_universe (
        asset_key, symbol, market, currency, asset_class, region, exchange, instrument_type, market_group,
        watch_enabled, target_weight_hint, watch_tags, notes, last_price, price_updated_at, created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),NOW()
      )
      ON CONFLICT (asset_key) DO UPDATE
      SET
        symbol = EXCLUDED.symbol,
        market = EXCLUDED.market,
        currency = EXCLUDED.currency,
        asset_class = EXCLUDED.asset_class,
        region = EXCLUDED.region,
        exchange = EXCLUDED.exchange,
        instrument_type = EXCLUDED.instrument_type,
        market_group = EXCLUDED.market_group,
        watch_enabled = EXCLUDED.watch_enabled,
        target_weight_hint = EXCLUDED.target_weight_hint,
        watch_tags = EXCLUDED.watch_tags,
        notes = EXCLUDED.notes,
        last_price = CASE WHEN EXCLUDED.last_price > 0 THEN EXCLUDED.last_price ELSE daa_asset_universe.last_price END,
        price_updated_at = CASE WHEN EXCLUDED.last_price > 0 THEN COALESCE(EXCLUDED.price_updated_at, NOW()) ELSE daa_asset_universe.price_updated_at END,
        updated_at = NOW()
      RETURNING ${ASSET_UNIVERSE_SELECT_COLUMNS_V1}`,
      [
        assetKey,
        symbol,
        market,
        currency,
        assetClass,
        region,
        exchange,
        instrumentType,
        marketGroup,
        watchEnabled,
        targetWeightHint,
        watchTags,
        notes,
        lastPrice,
        priceUpdatedAt,
      ],
    );
    return mapAssetUniverseRowV1(result.rows[0] as Record<string, unknown>);
  });
}

export async function patchDaaAssetUniverseRowV1(input: {
  assetKey: string;
  market?: string;
  currency?: string;
  assetClass?: string;
  region?: string;
  exchange?: string;
  instrumentType?: string;
  marketGroup?: string;
  watchEnabled?: boolean;
  targetWeightHint?: number;
  watchTags?: string[];
  notes?: string | null;
  lastPrice?: number;
  priceUpdatedAt?: string | null;
}): Promise<DaaStoreAssetUniverseRowV1> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const parsed = parseDaaAssetKeyV1(input.assetKey);
    if (!parsed) throw new Error("assetKey is required");
    const assetKey = buildPositionKeyV1(parsed.symbol, parsed.market);
    const currentRes = await query(`SELECT ${ASSET_UNIVERSE_SELECT_COLUMNS_V1} FROM daa_asset_universe WHERE asset_key = $1 LIMIT 1`, [assetKey]);
    if (!currentRes.rows.length) throw new Error(`asset not found: ${assetKey}`);
    const current = mapAssetUniverseRowV1(currentRes.rows[0] as Record<string, unknown>);

    const market = normalizeText(input.market, current.market).toUpperCase();
    const assetClass = normalizeAssetClassV1(input.assetClass, current.assetClass as any);
    const next = {
      symbol: current.symbol,
      market,
      currency: normalizeCcyCode(input.currency, current.currency),
      assetClass,
      region: normalizeRegionV1(input.region, current.region as any),
      exchange: normalizeText(input.exchange, current.exchange),
      instrumentType: normalizeInstrumentTypeV1(input.instrumentType, current.instrumentType as any),
      marketGroup: normalizeText(input.marketGroup, current.marketGroup || inferMarketGroupV1({ market, assetClass })),
      watchEnabled: input.watchEnabled == null ? current.watchEnabled : Boolean(input.watchEnabled),
      targetWeightHint: input.targetWeightHint == null ? current.targetWeightHint : Math.max(0, toFiniteNumber(input.targetWeightHint)),
      watchTags: input.watchTags == null ? current.watchTags : input.watchTags.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean),
      notes: input.notes === undefined ? current.notes : (input.notes == null ? null : normalizeText(input.notes) || null),
      lastPrice: input.lastPrice == null ? current.lastPrice : Math.max(0, toFiniteNumber(input.lastPrice)),
      priceUpdatedAt: input.priceUpdatedAt === undefined ? current.priceUpdatedAt : (input.priceUpdatedAt ? toIsoString(input.priceUpdatedAt, new Date().toISOString()) : null),
    };

    const updatedRes = await query(
      `UPDATE daa_asset_universe
       SET
         currency = $2,
         asset_class = $3,
         region = $4,
         exchange = $5,
         instrument_type = $6,
         market_group = $7,
         watch_enabled = $8,
         target_weight_hint = $9,
         watch_tags = $10,
         notes = $11,
         last_price = $12,
         price_updated_at = $13,
         updated_at = NOW()
       WHERE asset_key = $1
       RETURNING ${ASSET_UNIVERSE_SELECT_COLUMNS_V1}`,
      [
        assetKey,
        next.currency,
        next.assetClass,
        next.region,
        next.exchange,
        next.instrumentType,
        next.marketGroup,
        next.watchEnabled,
        next.targetWeightHint,
        next.watchTags,
        next.notes,
        next.lastPrice,
        next.priceUpdatedAt,
      ],
    );
    return mapAssetUniverseRowV1(updatedRes.rows[0] as Record<string, unknown>);
  });
}

export async function listDaaPositionsV1(): Promise<DaaStorePositionV1[]> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const result = await query(
      "SELECT asset_key, symbol, market, currency, holding_qty, holding_price, cost_basis, holding_tags, updated_at FROM daa_asset_universe WHERE holding_qty > 0 ORDER BY symbol ASC, market ASC",
    );
    return result.rows.map((row) => {
      const item = row as Record<string, unknown>;
      const symbol = normalizeText(item.symbol).toUpperCase();
      const market = normalizeText(item.market, "US").toUpperCase();
      return {
        id: buildPositionIdV1(symbol, market),
        assetKey: buildPositionKeyV1(symbol, market),
        symbol,
        market,
        currency: normalizeText(item.currency, "USD").toUpperCase(),
        qty: Math.max(0, toFiniteNumber(item.holding_qty)),
        price: Math.max(0, toFiniteNumber(item.holding_price)),
        costBasis: item.cost_basis == null ? null : Math.max(0, toFiniteNumber(item.cost_basis)),
        tags: Array.isArray(item.holding_tags) ? item.holding_tags.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean) : [],
        updatedAt: toIsoString(item.updated_at),
      } satisfies DaaStorePositionV1;
    });
  });
}

export async function replaceDaaPositionsV1(rows: Array<Partial<DaaStorePositionV1>>): Promise<DaaStorePositionV1[]> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    await query("BEGIN");
    try {
      await query(
        "UPDATE daa_asset_universe SET holding_qty = 0, holding_price = 0, cost_basis = NULL, holding_tags = '{}'::TEXT[], updated_at = NOW()",
      );
      for (const raw of rows) {
        const symbol = normalizeText(raw.symbol).toUpperCase();
        if (!symbol) continue;
        const market = normalizeText(raw.market, "US").toUpperCase();
        const assetKey = buildPositionKeyV1(symbol, market);
        const currency = normalizeText(raw.currency, "USD").toUpperCase();
        const qty = Math.max(0, toFiniteNumber(raw.qty));
        const price = Math.max(0, toFiniteNumber(raw.price));
        const lastPrice = price > 0 ? price : 0;
        const priceUpdatedAt = price > 0 ? new Date().toISOString() : null;
        const costBasis = raw.costBasis == null ? null : Math.max(0, toFiniteNumber(raw.costBasis));
        const tags = Array.isArray(raw.tags)
          ? raw.tags.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean)
          : [];

        await query(
          `
            INSERT INTO daa_asset_universe (
              asset_key, symbol, market, currency, holding_qty, holding_price, cost_basis, holding_tags, last_price, price_updated_at, created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()
            )
            ON CONFLICT (asset_key) DO UPDATE
            SET
              symbol = EXCLUDED.symbol,
              market = EXCLUDED.market,
              currency = EXCLUDED.currency,
              holding_qty = EXCLUDED.holding_qty,
              holding_price = EXCLUDED.holding_price,
              cost_basis = EXCLUDED.cost_basis,
              holding_tags = EXCLUDED.holding_tags,
              last_price = CASE
                WHEN EXCLUDED.holding_price > 0 THEN EXCLUDED.holding_price
                ELSE daa_asset_universe.last_price
              END,
              price_updated_at = CASE
                WHEN EXCLUDED.holding_price > 0 THEN NOW()
                ELSE daa_asset_universe.price_updated_at
              END,
              updated_at = NOW()
          `,
          [assetKey, symbol, market, currency, qty, price, costBasis, tags, lastPrice, priceUpdatedAt],
        );
      }

      await query(
        "DELETE FROM daa_asset_universe WHERE watch_enabled = FALSE AND holding_qty <= 0",
      );

      await query("COMMIT");
    } catch (error) {
      try {
        await query("ROLLBACK");
      } catch {
        // ignore
      }
      throw error;
    }

    const result = await query(
      "SELECT asset_key, symbol, market, currency, holding_qty, holding_price, cost_basis, holding_tags, updated_at FROM daa_asset_universe WHERE holding_qty > 0 ORDER BY symbol ASC, market ASC",
    );
    return result.rows.map((row) => {
      const item = row as Record<string, unknown>;
      const symbol = normalizeText(item.symbol).toUpperCase();
      const market = normalizeText(item.market, "US").toUpperCase();
      return {
        id: buildPositionIdV1(symbol, market),
        assetKey: buildPositionKeyV1(symbol, market),
        symbol,
        market,
        currency: normalizeText(item.currency, "USD").toUpperCase(),
        qty: Math.max(0, toFiniteNumber(item.holding_qty)),
        price: Math.max(0, toFiniteNumber(item.holding_price)),
        costBasis: item.cost_basis == null ? null : Math.max(0, toFiniteNumber(item.cost_basis)),
        tags: Array.isArray(item.holding_tags) ? item.holding_tags.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean) : [],
        updatedAt: toIsoString(item.updated_at),
      } satisfies DaaStorePositionV1;
    });
  });
}

export async function getDaaStrategyConfigV1(): Promise<DaaStoreStrategyConfigV1> {
  const row = await getDaaSystemConfigV2();
  return {
    id: "default",
    configJson: row.config.strategy as unknown as Record<string, unknown>,
    updatedAt: row.updatedAt,
  };
}

export async function saveDaaStrategyConfigV1(configJson: Record<string, unknown>): Promise<DaaStoreStrategyConfigV1> {
  const current = await getDaaSystemConfigV2();
  const merged = {
    ...current.config,
    strategy: configJson || {},
  };
  const saved = await saveDaaSystemConfigV2({ config: merged, baseVersion: current.version });
  return {
    id: "default",
    configJson: saved.config.strategy as unknown as Record<string, unknown>,
    updatedAt: saved.updatedAt,
  };
}

function isRecordV1(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resolveInvestableCashV1(cash: number, frozenCash: number, investableCashRaw: unknown): number {
  const safeCash = Math.max(0, toFiniteNumber(cash));
  const safeFrozen = Math.max(0, toFiniteNumber(frozenCash));
  const fallback = Math.max(0, safeCash - safeFrozen);
  const raw = toFiniteNumber(investableCashRaw, Number.NaN);
  if (!Number.isFinite(raw)) return fallback;
  if (raw <= 0 && safeCash > 0 && safeFrozen < safeCash) return fallback;
  return Math.max(0, Math.min(safeCash, raw));
}

function applyAccountCashDeltaToConfigV1(
  configJson: Record<string, unknown>,
  nextCash: number,
): {
  configJson: Record<string, unknown>;
  account: {
    baseCurrency: string;
    cash: number;
    investableCash: number;
    frozenCash: number;
    totalEquity: number | null;
  };
} {
  const baseConfig = isRecordV1(configJson) ? configJson : {};
  const accountRaw = isRecordV1(baseConfig.account) ? baseConfig.account : {};
  const baseCurrency = normalizeCcyCode(accountRaw.baseCurrency, "USD");
  const previousCash = Math.max(0, toFiniteNumber(accountRaw.cash, 0));
  const frozenCash = Math.max(0, toFiniteNumber(accountRaw.frozenCash, 0));
  const previousInvestable = resolveInvestableCashV1(previousCash, frozenCash, accountRaw.investableCash);
  const normalizedNextCash = Math.max(0, toFiniteNumber(nextCash, 0));
  const delta = normalizedNextCash - previousCash;
  const nextInvestable = Math.max(0, Math.min(normalizedNextCash, previousInvestable + delta));
  const totalEquityRaw = toFiniteNumber(accountRaw.totalEquity, Number.NaN);
  const totalEquity = Number.isFinite(totalEquityRaw) ? Math.max(0, totalEquityRaw) : null;

  const account = {
    baseCurrency,
    cash: normalizedNextCash,
    investableCash: nextInvestable,
    frozenCash,
    totalEquity,
  };

  return {
    configJson: {
      ...baseConfig,
      account: {
        ...accountRaw,
        ...account,
      },
    },
    account,
  };
}

type DaaQueryRowResultV1 = { rows: Array<Record<string, unknown>> };
type DaaTxQueryFnV1 = (sql: string, params?: unknown[]) => Promise<DaaQueryRowResultV1>;

async function syncStrategyAccountCashInTxV1(
  query: DaaTxQueryFnV1,
  nextCash: number,
): Promise<{
  baseCurrency: string;
  cash: number;
  investableCash: number;
  frozenCash: number;
  totalEquity: number | null;
}> {
  const currentSystem = await ensureSystemConfigRowInTxV2(query as any);
  const patched = applyAccountCashDeltaToConfigV1(currentSystem.config.strategy as unknown as Record<string, unknown>, nextCash);

  await query(
    "UPDATE daa_system_config_v2 SET version = $1, config_json = $2::jsonb, updated_at = NOW() WHERE id = 'default'",
    [
      currentSystem.version + 1,
      JSON.stringify(
        normalizeSystemConfigV2({
          ...currentSystem.config,
          strategy: patched.configJson,
        }),
      ),
    ],
  );
  return {
    ...patched.account,
    baseCurrency: normalizeCurrencyAliasV2(patched.account.baseCurrency, "USD"),
  };
}

function mapEquitySnapshotRowV1(row: Record<string, unknown>): DaaStoreEquitySnapshotV1 {
  return {
    ts: toIsoString(row.ts),
    totalEquity: toFiniteNumber(row.total_equity),
    holdingsValue: toFiniteNumber(row.holdings_value),
    cash: toFiniteNumber(row.cash),
    source: normalizeText(row.source, "cron"),
  };
}

export async function listDaaEquitySnapshotsV1(limit = 200): Promise<DaaStoreEquitySnapshotV1[]> {
  await ensureDaaStoreSchemaPgV1();
  const n = Math.max(1, Math.min(2000, Math.trunc(toFiniteNumber(limit, 200))));
  return withDaaPgClientV0(async ({ query }) => {
    const result = await query(
      "SELECT ts, total_equity, holdings_value, cash, source FROM daa_equity_snapshots ORDER BY ts DESC LIMIT $1",
      [n],
    );
    return result.rows.map((row) => mapEquitySnapshotRowV1(row as Record<string, unknown>));
  });
}

export async function appendDaaEquitySnapshotV1(snapshot: Partial<DaaStoreEquitySnapshotV1>): Promise<DaaStoreEquitySnapshotV1> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const ts = toIsoString(snapshot.ts, new Date().toISOString());
    const totalEquity = Math.max(0, toFiniteNumber(snapshot.totalEquity));
    const holdingsValue = Math.max(0, toFiniteNumber(snapshot.holdingsValue));
    const cash = Math.max(0, toFiniteNumber(snapshot.cash));
    const source = normalizeText(snapshot.source, "manual");

    await query(
      "INSERT INTO daa_equity_snapshots (ts, total_equity, holdings_value, cash, source) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (ts) DO UPDATE SET total_equity=EXCLUDED.total_equity, holdings_value=EXCLUDED.holdings_value, cash=EXCLUDED.cash, source=EXCLUDED.source",
      [ts, totalEquity, holdingsValue, cash, source],
    );

    const result = await query(
      "SELECT ts, total_equity, holdings_value, cash, source FROM daa_equity_snapshots WHERE ts = $1 LIMIT 1",
      [ts],
    );
    return mapEquitySnapshotRowV1(result.rows[0] as Record<string, unknown>);
  });
}

function mapHumanIngestStateRowV1(row: Record<string, unknown>): DaaStoreHumanIngestStateV1 {
  return {
    id: "default",
    lastIngestAt: row.last_ingest_at == null ? null : toIsoString(row.last_ingest_at, new Date().toISOString()),
    ingestCount: Math.max(0, Math.trunc(toFiniteNumber(row.ingest_count, 0))),
    latestBatch: parseJsonb<Record<string, unknown> | null>(row.latest_batch_json, null),
    latestActors: parseJsonb<Array<Record<string, unknown>>>(row.latest_actors_json, []),
    latestHoldings: parseJsonb<Array<Record<string, unknown>>>(row.latest_holdings_json, []),
    updatedAt: toIsoString(row.updated_at),
  };
}

export async function getDaaHumanIngestStateV1(): Promise<DaaStoreHumanIngestStateV1 | null> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const result = await query(
      "SELECT id, last_ingest_at, ingest_count, latest_batch_json, latest_actors_json, latest_holdings_json, updated_at FROM daa_hf_ingest_state WHERE id = 'default' LIMIT 1",
    );
    if (!result.rows.length) return null;
    return mapHumanIngestStateRowV1(result.rows[0] as Record<string, unknown>);
  });
}

export async function saveDaaHumanIngestStateV1(input: {
  lastIngestAt?: string | null;
  ingestCount?: number;
  latestBatch?: Record<string, unknown> | null;
  latestActors?: Array<Record<string, unknown>>;
  latestHoldings?: Array<Record<string, unknown>>;
}): Promise<DaaStoreHumanIngestStateV1> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const lastIngestAt = input.lastIngestAt ? toIsoString(input.lastIngestAt, new Date().toISOString()) : null;
    const ingestCount = Math.max(0, Math.trunc(toFiniteNumber(input.ingestCount, 0)));
    const latestBatch = input.latestBatch && typeof input.latestBatch === "object" ? input.latestBatch : null;
    const latestActors = Array.isArray(input.latestActors) ? input.latestActors : [];
    const latestHoldings = Array.isArray(input.latestHoldings) ? input.latestHoldings : [];

    await query(
      "INSERT INTO daa_hf_ingest_state (id, last_ingest_at, ingest_count, latest_batch_json, latest_actors_json, latest_holdings_json, updated_at) VALUES ('default',$1,$2,$3,$4,$5,NOW()) ON CONFLICT (id) DO UPDATE SET last_ingest_at = EXCLUDED.last_ingest_at, ingest_count = EXCLUDED.ingest_count, latest_batch_json = EXCLUDED.latest_batch_json, latest_actors_json = EXCLUDED.latest_actors_json, latest_holdings_json = EXCLUDED.latest_holdings_json, updated_at = NOW()",
      [lastIngestAt, ingestCount, JSON.stringify(latestBatch), JSON.stringify(latestActors), JSON.stringify(latestHoldings)],
    );

    const result = await query(
      "SELECT id, last_ingest_at, ingest_count, latest_batch_json, latest_actors_json, latest_holdings_json, updated_at FROM daa_hf_ingest_state WHERE id = 'default' LIMIT 1",
    );
    return mapHumanIngestStateRowV1(result.rows[0] as Record<string, unknown>);
  });
}

function mapCandidateAssetRowV1(row: Record<string, unknown>): DaaStoreCandidateAssetV1 {
  return {
    id: normalizeText(row.id),
    symbol: normalizeText(row.symbol).toUpperCase(),
    market: normalizeText(row.market, "US").toUpperCase(),
    currency: normalizeText(row.currency, "USD").toUpperCase(),
    enabled: Boolean(row.enabled),
    targetWeightHint: Math.max(0, toFiniteNumber(row.target_weight_hint)),
    tags: Array.isArray(row.tags) ? row.tags.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean) : [],
    notes: row.notes == null ? null : normalizeText(row.notes) || null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

export async function listDaaCandidateAssetsV1(): Promise<DaaStoreCandidateAssetV1[]> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const result = await query(
      "SELECT asset_key, symbol, market, currency, watch_enabled, target_weight_hint, watch_tags, notes, created_at, updated_at FROM daa_asset_universe WHERE watch_enabled = TRUE ORDER BY symbol ASC, market ASC",
    );
    return result.rows.map((row) => {
      const item = row as Record<string, unknown>;
      return mapCandidateAssetRowV1({
        id: item.asset_key,
        symbol: item.symbol,
        market: item.market,
        currency: item.currency,
        enabled: item.watch_enabled,
        target_weight_hint: item.target_weight_hint,
        tags: item.watch_tags,
        notes: item.notes,
        created_at: item.created_at,
        updated_at: item.updated_at,
      });
    });
  });
}

export async function replaceDaaCandidateAssetsV1(
  rows: Array<Partial<DaaStoreCandidateAssetV1>>,
): Promise<DaaStoreCandidateAssetV1[]> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    await query("BEGIN");
    try {
      await query(
        "UPDATE daa_asset_universe SET watch_enabled = FALSE, target_weight_hint = 0, watch_tags = '{}'::TEXT[], notes = NULL, updated_at = NOW()",
      );
      for (const raw of rows) {
        const symbol = normalizeText(raw.symbol).toUpperCase();
        if (!symbol) continue;
        const market = normalizeText(raw.market, "US").toUpperCase();
        const currency = normalizeText(raw.currency, "USD").toUpperCase();
        const assetKey = buildPositionKeyV1(symbol, market);
        const enabled = raw.enabled !== false;
        const targetWeightHint = Math.max(0, toFiniteNumber(raw.targetWeightHint));
        const tags = Array.isArray(raw.tags) ? raw.tags.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean) : [];
        const notes = normalizeText(raw.notes || "");

        await query(
          `
            INSERT INTO daa_asset_universe (
              asset_key, symbol, market, currency, watch_enabled, target_weight_hint, watch_tags, notes, created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()
            )
            ON CONFLICT (asset_key) DO UPDATE
            SET
              symbol = EXCLUDED.symbol,
              market = EXCLUDED.market,
              currency = EXCLUDED.currency,
              watch_enabled = EXCLUDED.watch_enabled,
              target_weight_hint = EXCLUDED.target_weight_hint,
              watch_tags = EXCLUDED.watch_tags,
              notes = EXCLUDED.notes,
              updated_at = NOW()
          `,
          [assetKey, symbol, market, currency, enabled, targetWeightHint, tags, notes || null],
        );
      }
      await query(
        "DELETE FROM daa_asset_universe WHERE watch_enabled = FALSE AND holding_qty <= 0",
      );
      await query("COMMIT");
    } catch (error) {
      try {
        await query("ROLLBACK");
      } catch {
        // ignore
      }
      throw error;
    }

    const result = await query(
      "SELECT asset_key, symbol, market, currency, watch_enabled, target_weight_hint, watch_tags, notes, created_at, updated_at FROM daa_asset_universe WHERE watch_enabled = TRUE ORDER BY symbol ASC, market ASC",
    );
    return result.rows.map((row) => {
      const item = row as Record<string, unknown>;
      return mapCandidateAssetRowV1({
        id: item.asset_key,
        symbol: item.symbol,
        market: item.market,
        currency: item.currency,
        enabled: item.watch_enabled,
        target_weight_hint: item.target_weight_hint,
        tags: item.watch_tags,
        notes: item.notes,
        created_at: item.created_at,
        updated_at: item.updated_at,
      });
    });
  });
}

function normalizeCcyCode(value: unknown, fallback = "USD"): string {
  return normalizeCurrencyAliasV2(value, fallback);
}

function normalizeFxPair(baseCcy: string, quoteCcy: string): string {
  return `${normalizeCcyCode(baseCcy)}/${normalizeCcyCode(quoteCcy)}`;
}

function buildPositionKeyV1(symbol: string, market: string): string {
  return buildDaaAssetKeyV1(normalizeText(symbol).toUpperCase(), normalizeText(market, "US").toUpperCase());
}

function buildPositionIdV1(symbol: string, market: string): string {
  return `${normalizeText(symbol).toUpperCase()}__${normalizeText(market, "US").toUpperCase()}`;
}

type DaaFxLookupMapV1 = Map<string, number>;

function buildFxLookupMapV1(rows: Array<Record<string, unknown>>): DaaFxLookupMapV1 {
  const out = new Map<string, number>();
  for (const row of rows) {
    const base = normalizeCcyCode(row.base_ccy, "USD");
    const quote = normalizeCcyCode(row.quote_ccy, "USD");
    const rate = Math.max(0, toFiniteNumber(row.rate, 0));
    if (!base || !quote || rate <= 0) continue;
    out.set(normalizeFxPair(base, quote), rate);
  }
  return out;
}

function resolveFxRateToBaseV1(
  baseCurrency: string,
  instrumentCurrency: string,
  fxMap: DaaFxLookupMapV1,
): number | null {
  const base = normalizeCcyCode(baseCurrency, "USD");
  const local = normalizeCcyCode(instrumentCurrency, base);
  if (local === base) return 1;
  const direct = fxMap.get(normalizeFxPair(local, base));
  if (direct && direct > 0) return direct;
  const reverse = fxMap.get(normalizeFxPair(base, local));
  if (reverse && reverse > 0) return 1 / reverse;
  return null;
}

function normalizeTradeTicketSourceV1(value: unknown): DaaStoreTradeTicketSourceV1 {
  const text = normalizeText(value, "manual").toLowerCase();
  return text === "decision" ? "decision" : "manual";
}

function normalizeTradeTicketStatusV1(value: unknown): DaaStoreTradeTicketStatusV1 {
  const text = normalizeText(value, "ready").toLowerCase();
  if (text === "executed") return "executed";
  if (text === "canceled") return "canceled";
  if (text === "rejected") return "rejected";
  return "ready";
}

function normalizeTradeBasketStatusV1(value: unknown): DaaStoreTradeBasketStatusV1 {
  const text = normalizeText(value, "draft").toLowerCase();
  if (text === "executing") return "executing";
  if (text === "executed") return "executed";
  if (text === "partial") return "partial";
  if (text === "canceled") return "canceled";
  return "draft";
}

function normalizeTradeBasketSourceV1(value: unknown): DaaStoreTradeBasketSourceV1 {
  const text = normalizeText(value, "manual").toLowerCase();
  if (text === "decision") return "decision";
  if (text === "mixed") return "mixed";
  if (text === "migration") return "migration";
  return "manual";
}

function deriveDecisionStatusFromTradeTicketsV1(
  statuses: DaaStoreTradeTicketStatusV1[],
): DaaStoreRebalanceDecisionV1["status"] {
  if (!statuses.length) return "pending";
  if (statuses.every((status) => status === "ready")) return "pending";
  if (statuses.every((status) => status === "executed")) return "executed";
  if (statuses.every((status) => status === "canceled" || status === "rejected")) return "canceled";
  return "partial";
}

function deriveBasketStatusFromTicketsV1(statuses: DaaStoreTradeTicketStatusV1[]): DaaStoreTradeBasketStatusV1 {
  if (!statuses.length) return "canceled";
  if (statuses.every((status) => status === "ready")) return "draft";
  if (statuses.every((status) => status === "executed")) return "executed";
  if (statuses.every((status) => status === "canceled" || status === "rejected")) return "canceled";
  return "partial";
}

function normalizeTradeTicketSideV1(value: unknown): DaaStoreTradeTicketSideV1 {
  const text = normalizeText(value, "BUY").toUpperCase();
  return text === "SELL" ? "SELL" : "BUY";
}

function normalizeTradePricingModeV1(value: unknown): "manual" | "market" {
  const mode = normalizeText(value, "manual").toLowerCase();
  return mode === "market" ? "market" : "manual";
}

function mapTradeBasketRowV1(row: Record<string, unknown>): DaaStoreTradeBasketV1 {
  return {
    basketId: normalizeText(row.basket_id),
    source: normalizeTradeBasketSourceV1(row.source),
    status: normalizeTradeBasketStatusV1(row.status),
    decisionRefId: row.decision_ref_id == null ? null : normalizeText(row.decision_ref_id) || null,
    createdBy: normalizeText(row.created_by, "admin"),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    executedAt: row.executed_at == null ? null : toIsoString(row.executed_at),
  };
}

function mapTradeTicketRowV1(row: Record<string, unknown>): DaaStoreTradeTicketV1 {
  const symbol = normalizeText(row.symbol).toUpperCase();
  const market = normalizeText(row.market, "US").toUpperCase();
  const derivedAssetKey = buildPositionKeyV1(symbol, market);
  return {
    ticketId: normalizeText(row.ticket_id),
    basketId: normalizeText(row.basket_id, "basket_migrated"),
    assetKey: normalizeText(row.asset_key, derivedAssetKey).toUpperCase(),
    source: normalizeTradeTicketSourceV1(row.source),
    status: normalizeTradeTicketStatusV1(row.status),
    symbol,
    market,
    instrumentCurrency: normalizeCcyCode(row.instrument_currency, "USD"),
    baseCurrency: normalizeCcyCode(row.base_currency, "USD"),
    side: normalizeTradeTicketSideV1(row.side),
    qty: Math.max(0, toFiniteNumber(row.qty)),
    price: Math.max(0, toFiniteNumber(row.price)),
    fee: Math.max(0, toFiniteNumber(row.fee)),
    grossNotional: Math.max(0, toFiniteNumber(row.gross_notional)),
    fxRateToBase: row.fx_rate_to_base == null ? null : Math.max(0, toFiniteNumber(row.fx_rate_to_base)),
    notionalInBase: Math.max(0, toFiniteNumber(row.notional_in_base)),
    decisionRefId: row.decision_ref_id == null ? null : normalizeText(row.decision_ref_id) || null,
    reasonTags: Array.isArray(row.reason_tags) ? row.reason_tags.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean) : [],
    reasonText: row.reason_text == null ? null : normalizeText(row.reason_text) || null,
    snapshotBefore: parseJsonb<Record<string, unknown>>(row.snapshot_before_json, {}),
    snapshotAfter: row.snapshot_after_json == null ? null : parseJsonb<Record<string, unknown>>(row.snapshot_after_json, {}),
    rejectCode: row.reject_code == null ? null : normalizeText(row.reject_code) || null,
    rejectMessage: row.reject_message == null ? null : normalizeText(row.reject_message) || null,
    pricingMode: normalizeTradePricingModeV1(row.pricing_mode),
    priceSource: row.price_source == null ? null : normalizeText(row.price_source) || null,
    priceSnapshotAt: row.price_snapshot_at == null ? null : toIsoString(row.price_snapshot_at),
    createdBy: normalizeText(row.created_by, "admin"),
    createdAt: toIsoString(row.created_at),
    executedAt: row.executed_at == null ? null : toIsoString(row.executed_at),
    canceledAt: row.canceled_at == null ? null : toIsoString(row.canceled_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapFxRateRowV1(row: Record<string, unknown>): DaaStoreFxRateV1 {
  return {
    id: normalizeText(row.id),
    baseCcy: normalizeCcyCode(row.base_ccy),
    quoteCcy: normalizeCcyCode(row.quote_ccy),
    rate: Math.max(0, toFiniteNumber(row.rate)),
    source: normalizeText(row.source, "manual"),
    asOfTs: toIsoString(row.as_of_ts),
    updatedAt: toIsoString(row.updated_at),
  };
}

export async function listDaaFxRatesV1(): Promise<DaaStoreFxRateV1[]> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const result = await query(
      "SELECT id, base_ccy, quote_ccy, rate, source, as_of_ts, updated_at FROM daa_fx_rates ORDER BY base_ccy ASC, quote_ccy ASC",
    );
    return result.rows.map((row) => mapFxRateRowV1(row as Record<string, unknown>));
  });
}

export async function replaceDaaFxRatesV1(rows: Array<Partial<DaaStoreFxRateV1>>): Promise<DaaStoreFxRateV1[]> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    await query("BEGIN");
    try {
      await query("DELETE FROM daa_fx_rates");
      const dedup = new Map<string, { id: string; baseCcy: string; quoteCcy: string; rate: number; source: string; asOfTs: string }>();
      for (const raw of rows) {
        const baseCcy = normalizeCcyCode(raw.baseCcy, "USD");
        const quoteCcy = normalizeCcyCode(raw.quoteCcy, "USD");
        const rate = Math.max(0, toFiniteNumber(raw.rate));
        if (rate <= 0) continue;
        const pair = normalizeFxPair(baseCcy, quoteCcy);
        const id = normalizeText(raw.id, pair);
        const source = normalizeText(raw.source, "manual");
        const asOfTs = toIsoString(raw.asOfTs, new Date().toISOString());
        dedup.set(pair, { id, baseCcy, quoteCcy, rate, source, asOfTs });
      }

      for (const row of dedup.values()) {
        await query(
          "INSERT INTO daa_fx_rates (id, base_ccy, quote_ccy, rate, source, as_of_ts, updated_at) VALUES ($1,$2,$3,$4,$5,$6,NOW())",
          [row.id, row.baseCcy, row.quoteCcy, row.rate, row.source, row.asOfTs],
        );
      }
      await query("COMMIT");
    } catch (error) {
      try {
        await query("ROLLBACK");
      } catch {
        // ignore
      }
      throw error;
    }
    const result = await query(
      "SELECT id, base_ccy, quote_ccy, rate, source, as_of_ts, updated_at FROM daa_fx_rates ORDER BY base_ccy ASC, quote_ccy ASC",
    );
    return result.rows.map((row) => mapFxRateRowV1(row as Record<string, unknown>));
  });
}

export async function upsertDaaFxRatesV1(rows: Array<Partial<DaaStoreFxRateV1>>): Promise<DaaStoreFxRateV1[]> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    await query("BEGIN");
    try {
      for (const raw of rows) {
        const baseCcy = normalizeCcyCode(raw.baseCcy, "USD");
        const quoteCcy = normalizeCcyCode(raw.quoteCcy, "USD");
        const rate = Math.max(0, toFiniteNumber(raw.rate));
        if (rate <= 0) continue;
        const id = normalizeText(raw.id, normalizeFxPair(baseCcy, quoteCcy));
        const source = normalizeText(raw.source, "manual");
        const asOfTs = toIsoString(raw.asOfTs, new Date().toISOString());

        await query(
          "INSERT INTO daa_fx_rates (id, base_ccy, quote_ccy, rate, source, as_of_ts, updated_at) VALUES ($1,$2,$3,$4,$5,$6,NOW()) ON CONFLICT (id) DO UPDATE SET base_ccy = EXCLUDED.base_ccy, quote_ccy = EXCLUDED.quote_ccy, rate = EXCLUDED.rate, source = EXCLUDED.source, as_of_ts = EXCLUDED.as_of_ts, updated_at = NOW()",
          [id, baseCcy, quoteCcy, rate, source, asOfTs],
        );
      }
      await query("COMMIT");
    } catch (error) {
      try {
        await query("ROLLBACK");
      } catch {
        // ignore
      }
      throw error;
    }
    const result = await query(
      "SELECT id, base_ccy, quote_ccy, rate, source, as_of_ts, updated_at FROM daa_fx_rates ORDER BY base_ccy ASC, quote_ccy ASC",
    );
    return result.rows.map((row) => mapFxRateRowV1(row as Record<string, unknown>));
  });
}

function mapCashLedgerRowV1(row: Record<string, unknown>): DaaStoreCashLedgerEntryV1 {
  const normalizedSide = normalizeText(row.side, "deposit").toLowerCase();
  const side: DaaStoreCashLedgerSideV1 = normalizedSide === "withdraw" ? "withdraw" : "deposit";
  return {
    id: normalizeText(row.id),
    ts: toIsoString(row.ts),
    side,
    amount: Math.max(0, toFiniteNumber(row.amount)),
    baseCurrency: normalizeCcyCode(row.base_currency, "USD"),
    note: row.note == null ? null : String(row.note),
    createdAt: toIsoString(row.created_at),
  };
}

export async function listDaaCashLedgerEntriesV1(limit = 100): Promise<DaaStoreCashLedgerEntryV1[]> {
  await ensureDaaStoreSchemaPgV1();
  const n = Math.max(1, Math.min(1000, Math.trunc(toFiniteNumber(limit, 100))));
  return withDaaPgClientV0(async ({ query }) => {
    const result = await query(
      "SELECT id, ts, side, amount, base_currency, note, created_at FROM daa_cash_ledger ORDER BY ts DESC LIMIT $1",
      [n],
    );
    return result.rows.map((row) => mapCashLedgerRowV1(row as Record<string, unknown>));
  });
}

export async function appendDaaCashLedgerEntryV1(input: DaaStoreCashLedgerApplyInputV1): Promise<{
  entry: DaaStoreCashLedgerEntryV1;
  account: {
    baseCurrency: string;
    cash: number;
    investableCash: number;
    frozenCash: number;
    totalEquity: number | null;
  };
  equitySnapshot: DaaStoreEquitySnapshotV1;
}> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const sideRaw = normalizeText(input.side, "deposit").toLowerCase();
    const side: DaaStoreCashLedgerSideV1 = sideRaw === "withdraw" ? "withdraw" : "deposit";
    const amount = Math.max(0, toFiniteNumber(input.amount));
    if (amount <= 0) throw new Error("cash ledger amount must be greater than 0");

    const note = normalizeText(input.note, "");
    const entryId = randomUUID();

    await query("BEGIN");
    try {
      const systemRow = await ensureSystemConfigRowInTxV2(query as any);
      const currentConfig = systemRow.config.strategy as unknown as Record<string, unknown>;
      const accountRaw = isRecordV1(currentConfig.account) ? currentConfig.account : {};
      const currentCash = Math.max(0, toFiniteNumber(accountRaw.cash, 0));
      const nextCash = side === "deposit" ? currentCash + amount : currentCash - amount;
      if (nextCash < -1e-9) {
        throw new Error(`insufficient cash for withdraw: ${amount.toFixed(2)} > ${currentCash.toFixed(2)}`);
      }
      const normalizedNextCash = Math.max(0, nextCash);
      const account = await syncStrategyAccountCashInTxV1(query as DaaTxQueryFnV1, normalizedNextCash);
      const baseCurrency = normalizeCcyCode(input.baseCurrency, account.baseCurrency);

      const ts = new Date().toISOString();
      await query(
        "INSERT INTO daa_cash_ledger (id, ts, side, amount, base_currency, note, created_at) VALUES ($1,$2,$3,$4,$5,$6,NOW())",
        [entryId, ts, side, amount, baseCurrency, note || null],
      );

      const holdingsRes = await query("SELECT COALESCE(SUM(holding_qty * holding_price), 0) AS holdings_value FROM daa_asset_universe");
      const holdingsValue = Math.max(0, toFiniteNumber((holdingsRes.rows[0] as Record<string, unknown> | undefined)?.holdings_value));
      const totalEquity = holdingsValue + account.cash;
      await query(
        "INSERT INTO daa_equity_snapshots (ts, total_equity, holdings_value, cash, source) VALUES ($1,$2,$3,$4,$5)",
        [ts, totalEquity, holdingsValue, account.cash, "cash_ledger"],
      );

      const opLogMessage = side === "deposit"
        ? `资金入金 ${amount.toFixed(2)} ${baseCurrency}（余额 ${account.cash.toFixed(2)}）`
        : `资金出金 ${amount.toFixed(2)} ${baseCurrency}（余额 ${account.cash.toFixed(2)}）`;
      await query(
        "INSERT INTO daa_op_log (id, ts, level, message, context_json) VALUES ($1, NOW(), 'info', $2, $3)",
        [
          randomUUID(),
          opLogMessage,
          JSON.stringify({
            side,
            amount,
            baseCurrency,
            note: note || null,
          }),
        ],
      );

      await query("COMMIT");

      const entryRes = await query(
        "SELECT id, ts, side, amount, base_currency, note, created_at FROM daa_cash_ledger WHERE id = $1 LIMIT 1",
        [entryId],
      );

      return {
        entry: mapCashLedgerRowV1(entryRes.rows[0] as Record<string, unknown>),
        account,
        equitySnapshot: {
          ts,
          totalEquity,
          holdingsValue,
          cash: account.cash,
          source: "cash_ledger",
        },
      };
    } catch (error) {
      try {
        await query("ROLLBACK");
      } catch {
        // ignore
      }
      throw error;
    }
  });
}

export async function createDaaTradeBasketV1(input: {
  source?: DaaStoreTradeBasketSourceV1;
  decisionRefId?: string | null;
  createdBy?: string;
} = {}): Promise<DaaStoreTradeBasketV1> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const basketId = randomUUID();
    const source = normalizeTradeBasketSourceV1(input.source);
    const decisionRefId = normalizeText(input.decisionRefId, "") || null;
    const createdBy = normalizeText(input.createdBy, "admin");
    const inserted = await query(
      "INSERT INTO daa_trade_baskets (basket_id, source, status, decision_ref_id, created_by, created_at, updated_at) VALUES ($1,$2,'draft',$3,$4,NOW(),NOW()) RETURNING basket_id, source, status, decision_ref_id, created_by, created_at, updated_at, executed_at",
      [basketId, source, decisionRefId, createdBy],
    );
    return mapTradeBasketRowV1(inserted.rows[0] as Record<string, unknown>);
  });
}

export async function getActiveDaaTradeBasketV1(opts: {
  source?: DaaStoreTradeBasketSourceV1;
  createIfMissing?: boolean;
  decisionRefId?: string | null;
  createdBy?: string;
} = {}): Promise<DaaStoreTradeBasketV1 | null> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const source = opts.source ? normalizeTradeBasketSourceV1(opts.source) : null;
    const params: unknown[] = [];
    const where: string[] = ["status = 'draft'"];
    if (source) {
      params.push(source);
      where.push(`source = $${params.length}`);
    }
    const sql = `SELECT basket_id, source, status, decision_ref_id, created_by, created_at, updated_at, executed_at FROM daa_trade_baskets WHERE ${where.join(" AND ")} ORDER BY updated_at DESC LIMIT 1`;
    const row = await query(sql, params);
    if (row.rows.length > 0) return mapTradeBasketRowV1(row.rows[0] as Record<string, unknown>);
    if (!opts.createIfMissing) return null;
    const basketId = randomUUID();
    const decisionRefId = normalizeText(opts.decisionRefId, "") || null;
    const createdBy = normalizeText(opts.createdBy, "admin");
    const inserted = await query(
      "INSERT INTO daa_trade_baskets (basket_id, source, status, decision_ref_id, created_by, created_at, updated_at) VALUES ($1,$2,'draft',$3,$4,NOW(),NOW()) RETURNING basket_id, source, status, decision_ref_id, created_by, created_at, updated_at, executed_at",
      [basketId, source ?? "manual", decisionRefId, createdBy],
    );
    return mapTradeBasketRowV1(inserted.rows[0] as Record<string, unknown>);
  });
}

export async function listDaaTradeBasketsV1(opts: {
  status?: DaaStoreTradeBasketStatusV1;
  limit?: number;
} = {}): Promise<DaaStoreTradeBasketV1[]> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const limit = Math.max(1, Math.min(200, Math.trunc(toFiniteNumber(opts.limit, 100))));
    const params: unknown[] = [];
    const where: string[] = [];
    if (opts.status) {
      params.push(normalizeTradeBasketStatusV1(opts.status));
      where.push(`status = $${params.length}`);
    }
    params.push(limit);
    const sql = [
      "SELECT basket_id, source, status, decision_ref_id, created_by, created_at, updated_at, executed_at FROM daa_trade_baskets",
      where.length ? `WHERE ${where.join(" AND ")}` : "",
      `ORDER BY updated_at DESC LIMIT $${params.length}`,
    ].filter(Boolean).join(" ");
    const rows = await query(sql, params);
    return rows.rows.map((row) => mapTradeBasketRowV1(row as Record<string, unknown>));
  });
}

export async function listDaaTradeTicketsV1(opts: {
  basketId?: string;
  limit?: number;
  status?: DaaStoreTradeTicketStatusV1;
  source?: DaaStoreTradeTicketSourceV1;
} = {}): Promise<DaaStoreTradeTicketV1[]> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const limit = Math.max(1, Math.min(500, Math.trunc(toFiniteNumber(opts.limit, 100))));
    const where: string[] = [];
    const params: unknown[] = [];

    if (opts.status) {
      params.push(normalizeTradeTicketStatusV1(opts.status));
      where.push(`status = $${params.length}`);
    }
    if (opts.source) {
      params.push(normalizeTradeTicketSourceV1(opts.source));
      where.push(`source = $${params.length}`);
    }
    if (opts.basketId) {
      params.push(normalizeText(opts.basketId));
      where.push(`basket_id = $${params.length}`);
    }

    params.push(limit);
    const sql = [
      "SELECT ticket_id, basket_id, asset_key, source, status, symbol, market, instrument_currency, base_currency, side, qty, price, fee, gross_notional, fx_rate_to_base, notional_in_base, decision_ref_id, reason_tags, reason_text, snapshot_before_json, snapshot_after_json, reject_code, reject_message, pricing_mode, price_source, price_snapshot_at, created_by, created_at, executed_at, canceled_at, updated_at",
      "FROM daa_trade_tickets",
      where.length ? `WHERE ${where.join(" AND ")}` : "",
      `ORDER BY created_at DESC LIMIT $${params.length}`,
    ].filter(Boolean).join(" ");
    const rows = await query(sql, params);
    return rows.rows.map((row) => mapTradeTicketRowV1(row as Record<string, unknown>));
  });
}

export async function getDaaTradeBasketV1(basketId: string): Promise<DaaStoreTradeBasketV1 | null> {
  await ensureDaaStoreSchemaPgV1();
  const id = normalizeText(basketId);
  if (!id) return null;
  return withDaaPgClientV0(async ({ query }) => {
    const result = await query(
      "SELECT basket_id, source, status, decision_ref_id, created_by, created_at, updated_at, executed_at FROM daa_trade_baskets WHERE basket_id = $1 LIMIT 1",
      [id],
    );
    if (!result.rows.length) return null;
    return mapTradeBasketRowV1(result.rows[0] as Record<string, unknown>);
  });
}

export async function updateDaaTradeTicketV1(input: {
  ticketId: string;
  qty?: number;
  price?: number;
  fee?: number;
  reasonText?: string | null;
  reasonTags?: string[];
}): Promise<DaaStoreTradeTicketV1> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const ticketId = normalizeText(input.ticketId);
    if (!ticketId) throw new Error("ticketId is required");
    await query("BEGIN");
    try {
      const existingRes = await query(
        "SELECT ticket_id, basket_id, asset_key, source, status, symbol, market, instrument_currency, base_currency, side, qty, price, fee, gross_notional, fx_rate_to_base, notional_in_base, decision_ref_id, reason_tags, reason_text, snapshot_before_json, snapshot_after_json, reject_code, reject_message, pricing_mode, price_source, price_snapshot_at, created_by, created_at, executed_at, canceled_at, updated_at FROM daa_trade_tickets WHERE ticket_id = $1 LIMIT 1 FOR UPDATE",
        [ticketId],
      );
      if (!existingRes.rows.length) throw new Error("ticket not found");
      const current = mapTradeTicketRowV1(existingRes.rows[0] as Record<string, unknown>);
      if (current.status !== "ready") throw new Error(`ticket status not editable: ${current.status}`);

      const qty = input.qty == null ? current.qty : Math.max(0, toFiniteNumber(input.qty, 0));
      const price = input.price == null ? current.price : Math.max(0, toFiniteNumber(input.price, 0));
      const fee = input.fee == null ? current.fee : Math.max(0, toFiniteNumber(input.fee, 0));
      if (qty <= 0) throw new Error("qty must be greater than 0");
      if (price <= 0) throw new Error("price must be greater than 0");

      const reasonText = input.reasonText == null ? current.reasonText : (normalizeText(input.reasonText) || null);
      const reasonTags = Array.isArray(input.reasonTags)
        ? input.reasonTags.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean)
        : current.reasonTags;

      const grossNotional = qty * price;
      const fxRateToBase = current.fxRateToBase ?? 1;
      const notionalInBase = grossNotional * fxRateToBase;
      await query(
        "UPDATE daa_trade_tickets SET qty = $1, price = $2, fee = $3, gross_notional = $4, notional_in_base = $5, reason_text = $6, reason_tags = $7, updated_at = NOW() WHERE ticket_id = $8",
        [qty, price, fee, grossNotional, notionalInBase, reasonText, reasonTags, ticketId],
      );
      await query("UPDATE daa_trade_baskets SET updated_at = NOW() WHERE basket_id = $1", [current.basketId]);

      const updatedRes = await query(
        "SELECT ticket_id, basket_id, asset_key, source, status, symbol, market, instrument_currency, base_currency, side, qty, price, fee, gross_notional, fx_rate_to_base, notional_in_base, decision_ref_id, reason_tags, reason_text, snapshot_before_json, snapshot_after_json, reject_code, reject_message, pricing_mode, price_source, price_snapshot_at, created_by, created_at, executed_at, canceled_at, updated_at FROM daa_trade_tickets WHERE ticket_id = $1 LIMIT 1",
        [ticketId],
      );
      await query("COMMIT");
      return mapTradeTicketRowV1(updatedRes.rows[0] as Record<string, unknown>);
    } catch (error) {
      try {
        await query("ROLLBACK");
      } catch {
        // ignore
      }
      throw error;
    }
  });
}

export async function cancelDaaTradeTicketV1(ticketIdRaw: string): Promise<DaaStoreTradeTicketV1> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const ticketId = normalizeText(ticketIdRaw);
    if (!ticketId) throw new Error("ticketId is required");
    await query("BEGIN");
    try {
      const existingRes = await query(
        "SELECT ticket_id, basket_id, asset_key, source, status, symbol, market, instrument_currency, base_currency, side, qty, price, fee, gross_notional, fx_rate_to_base, notional_in_base, decision_ref_id, reason_tags, reason_text, snapshot_before_json, snapshot_after_json, reject_code, reject_message, pricing_mode, price_source, price_snapshot_at, created_by, created_at, executed_at, canceled_at, updated_at FROM daa_trade_tickets WHERE ticket_id = $1 LIMIT 1 FOR UPDATE",
        [ticketId],
      );
      if (!existingRes.rows.length) throw new Error("ticket not found");
      const current = mapTradeTicketRowV1(existingRes.rows[0] as Record<string, unknown>);
      if (current.status !== "ready") throw new Error(`ticket status not cancelable: ${current.status}`);
      await query(
        "UPDATE daa_trade_tickets SET status = 'canceled', canceled_at = NOW(), updated_at = NOW() WHERE ticket_id = $1",
        [ticketId],
      );
      await query("UPDATE daa_trade_baskets SET updated_at = NOW() WHERE basket_id = $1", [current.basketId]);
      const updatedRes = await query(
        "SELECT ticket_id, basket_id, asset_key, source, status, symbol, market, instrument_currency, base_currency, side, qty, price, fee, gross_notional, fx_rate_to_base, notional_in_base, decision_ref_id, reason_tags, reason_text, snapshot_before_json, snapshot_after_json, reject_code, reject_message, pricing_mode, price_source, price_snapshot_at, created_by, created_at, executed_at, canceled_at, updated_at FROM daa_trade_tickets WHERE ticket_id = $1 LIMIT 1",
        [ticketId],
      );
      await query("COMMIT");
      return mapTradeTicketRowV1(updatedRes.rows[0] as Record<string, unknown>);
    } catch (error) {
      try {
        await query("ROLLBACK");
      } catch {
        // ignore
      }
      throw error;
    }
  });
}

export async function executeDaaTradeBasketV1(basketId: string): Promise<DaaStoreExecuteTradeTicketsResultV1> {
  const id = normalizeText(basketId);
  if (!id) throw new Error("basketId is required");
  return executeDaaTradeTicketsV1({ basketId: id });
}

export async function createDaaTradeTicketV1(input: DaaStoreCreateTradeTicketInputV1): Promise<DaaStoreTradeTicketV1> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const symbol = normalizeText(input.symbol).toUpperCase();
    const market = normalizeText(input.market, "US").toUpperCase();
    const assetKey = buildPositionKeyV1(symbol, market);
    const instrumentCurrency = normalizeCcyCode(input.instrumentCurrency, "USD");
    const side = normalizeTradeTicketSideV1(input.side);
    const source = normalizeTradeTicketSourceV1(input.source);
    const sourceForBasket = source === "decision" ? "decision" : "manual";
    const qty = Math.max(0, toFiniteNumber(input.qty, 0));
    const price = Math.max(0, toFiniteNumber(input.price, 0));
    const fee = Math.max(0, toFiniteNumber(input.fee, 0));
    const basketIdInput = normalizeText(input.basketId);
    const decisionRefId = normalizeText(input.decisionRefId, "") || null;
    const reasonText = normalizeText(input.reasonText, "") || null;
    const reasonTags = Array.isArray(input.reasonTags)
      ? input.reasonTags.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean)
      : [];
    const pricingMode = normalizeTradePricingModeV1(input.pricingMode);
    const priceSource = normalizeText(input.priceSource, "") || null;
    const priceSnapshotAt = input.priceSnapshotAt ? toIsoString(input.priceSnapshotAt, new Date().toISOString()) : null;
    const createdBy = normalizeText(input.createdBy, "admin");

    if (!symbol) throw new Error("symbol is required");
    if (normalizeText(input.assetKey)) {
      const parsedAssetKey = parseDaaAssetKeyV1(input.assetKey);
      const expectedAssetKey = buildPositionKeyV1(symbol, market);
      if (!parsedAssetKey || buildPositionKeyV1(parsedAssetKey.symbol, parsedAssetKey.market) !== expectedAssetKey) {
        throw new Error(`assetKey 与 symbol/market 不一致: ${input.assetKey}`);
      }
    }
    if (qty <= 0) throw new Error("qty must be greater than 0");
    if (price <= 0) throw new Error("price must be greater than 0");

    const ticketId = randomUUID();
    const grossNotional = qty * price;

    await query("BEGIN");
    try {
      const systemRow = await ensureSystemConfigRowInTxV2(query as any);
      const strategyRaw = (isRecordV1(systemRow.config.strategy) ? systemRow.config.strategy : {}) as Record<string, unknown>;
      const accountRaw = (isRecordV1(strategyRaw.account) ? strategyRaw.account : {}) as Record<string, unknown>;
      const baseCurrency = normalizeCcyCode(accountRaw.baseCurrency, "USD");
      const cash = Math.max(0, toFiniteNumber(accountRaw.cash, 0));

      let basketId = basketIdInput;
      if (!basketId) {
        const draftRes = await query(
          "SELECT basket_id FROM daa_trade_baskets WHERE status = 'draft' AND source = $1 ORDER BY updated_at DESC LIMIT 1",
          [sourceForBasket],
        );
        basketId = normalizeText((draftRes.rows[0] as Record<string, unknown> | undefined)?.basket_id);
      }
      if (!basketId) {
        basketId = randomUUID();
        await query(
          "INSERT INTO daa_trade_baskets (basket_id, source, status, decision_ref_id, created_by, created_at, updated_at) VALUES ($1,$2,'draft',$3,$4,NOW(),NOW())",
          [basketId, sourceForBasket, decisionRefId, createdBy],
        );
      } else {
        const basketRes = await query(
          "SELECT basket_id, status, source FROM daa_trade_baskets WHERE basket_id = $1 LIMIT 1 FOR UPDATE",
          [basketId],
        );
        const basketRow = basketRes.rows[0] as Record<string, unknown> | undefined;
        if (!basketRow) {
          throw new Error(`basket not found: ${basketId}`);
        }
        const basketStatus = normalizeTradeBasketStatusV1(basketRow.status);
        if (basketStatus !== "draft") {
          throw new Error(`basket is not editable: ${basketStatus}`);
        }
      }

      const posRes = await query(
        "SELECT holding_qty FROM daa_asset_universe WHERE asset_key = $1 LIMIT 1 FOR UPDATE",
        [assetKey],
      );
      const positionQty = Math.max(0, toFiniteNumber((posRes.rows[0] as Record<string, unknown> | undefined)?.holding_qty, 0));

      const fxRes = await query("SELECT base_ccy, quote_ccy, rate FROM daa_fx_rates");
      const fxMap = buildFxLookupMapV1(fxRes.rows as Array<Record<string, unknown>>);
      const fxRateToBase = resolveFxRateToBaseV1(baseCurrency, instrumentCurrency, fxMap);
      if (fxRateToBase == null || fxRateToBase <= 0) {
        throw new Error(`fx rate missing: ${instrumentCurrency}/${baseCurrency}`);
      }
      const notionalInBase = grossNotional * fxRateToBase;

      const snapshotBefore = {
        cash,
        positionQty,
      };

      await query(
        "INSERT INTO daa_trade_tickets (ticket_id, basket_id, asset_key, source, status, symbol, market, instrument_currency, base_currency, side, qty, price, fee, gross_notional, fx_rate_to_base, notional_in_base, decision_ref_id, reason_tags, reason_text, snapshot_before_json, pricing_mode, price_source, price_snapshot_at, created_by, created_at, updated_at) VALUES ($1,$2,$3,$4,'ready',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20,$21,$22,$23,NOW(),NOW())",
        [
          ticketId,
          basketId,
          assetKey,
          source,
          symbol,
          market,
          instrumentCurrency,
          baseCurrency,
          side,
          qty,
          price,
          fee,
          grossNotional,
          fxRateToBase,
          notionalInBase,
          decisionRefId,
          reasonTags,
          reasonText,
          JSON.stringify(snapshotBefore),
          pricingMode,
          priceSource,
          priceSnapshotAt,
          createdBy,
        ],
      );
      await query(
        "UPDATE daa_trade_baskets SET updated_at = NOW(), source = CASE WHEN source <> $1 THEN 'mixed' ELSE source END WHERE basket_id = $2",
        [sourceForBasket, basketId],
      );

      const inserted = await query(
        "SELECT ticket_id, basket_id, asset_key, source, status, symbol, market, instrument_currency, base_currency, side, qty, price, fee, gross_notional, fx_rate_to_base, notional_in_base, decision_ref_id, reason_tags, reason_text, snapshot_before_json, snapshot_after_json, reject_code, reject_message, pricing_mode, price_source, price_snapshot_at, created_by, created_at, executed_at, canceled_at, updated_at FROM daa_trade_tickets WHERE ticket_id = $1 LIMIT 1",
        [ticketId],
      );
      await query("COMMIT");
      return mapTradeTicketRowV1(inserted.rows[0] as Record<string, unknown>);
    } catch (error) {
      try {
        await query("ROLLBACK");
      } catch {
        // ignore
      }
      throw error;
    }
  });
}

export async function executeDaaTradeTicketsV1(input: DaaStoreExecuteTradeTicketsInputV1): Promise<DaaStoreExecuteTradeTicketsResultV1> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const basketId = normalizeText(input.basketId);
    let ticketIds = [...new Set((Array.isArray(input.ticketIds) ? input.ticketIds : []).map((item) => normalizeText(item)).filter(Boolean))];
    if (!ticketIds.length && basketId) {
      const rows = await query(
        "SELECT ticket_id FROM daa_trade_tickets WHERE basket_id = $1 AND status = 'ready' ORDER BY created_at ASC",
        [basketId],
      );
      ticketIds = rows.rows.map((row) => normalizeText((row as Record<string, unknown>).ticket_id)).filter(Boolean);
    }
    if (!ticketIds.length) throw new Error("ticketIds is required");
    if (ticketIds.length > 200) throw new Error("ticketIds exceeds limit(200)");

    await query("BEGIN");
    try {
      const placeholders = ticketIds.map((_, idx) => `$${idx + 1}`).join(", ");
      const ticketRows = await query(
        `SELECT ticket_id, basket_id, asset_key, source, status, symbol, market, instrument_currency, base_currency, side, qty, price, fee, gross_notional, fx_rate_to_base, notional_in_base, decision_ref_id, reason_tags, reason_text, snapshot_before_json, snapshot_after_json, reject_code, reject_message, pricing_mode, price_source, price_snapshot_at, created_by, created_at, executed_at, canceled_at, updated_at FROM daa_trade_tickets WHERE ticket_id IN (${placeholders}) FOR UPDATE`,
        ticketIds,
      );
      const ticketMap = new Map<string, DaaStoreTradeTicketV1>();
      for (const row of ticketRows.rows as Array<Record<string, unknown>>) {
        const ticket = mapTradeTicketRowV1(row);
        ticketMap.set(ticket.ticketId, ticket);
      }

      const positionsRes = await query("SELECT asset_key, symbol, market, currency, asset_class, region, exchange, instrument_type, market_group, holding_qty, holding_price, cost_basis, holding_tags, watch_enabled, target_weight_hint, watch_tags, notes, last_price, price_updated_at, created_at, updated_at FROM daa_asset_universe FOR UPDATE");
      const positionsMap = new Map<string, DaaStorePositionV1>();
      for (const row of positionsRes.rows as Array<Record<string, unknown>>) {
        const item = mapAssetUniverseRowV1(row);
        const pos: DaaStorePositionV1 = {
          id: item.assetKey,
          assetKey: item.assetKey,
          symbol: item.symbol,
          market: item.market,
          currency: item.currency,
          qty: item.holdingQty,
          price: item.holdingPrice,
          costBasis: item.costBasis,
          tags: item.holdingTags,
          updatedAt: item.updatedAt,
        };
        positionsMap.set(buildPositionKeyV1(pos.symbol, pos.market), pos);
      }

      const systemRow = await ensureSystemConfigRowInTxV2(query as any);
      const strategyRaw = (isRecordV1(systemRow.config.strategy) ? systemRow.config.strategy : {}) as Record<string, unknown>;
      const accountRaw = (isRecordV1(strategyRaw.account) ? strategyRaw.account : {}) as Record<string, unknown>;
      const baseCurrency = normalizeCcyCode(accountRaw.baseCurrency, "USD");
      let accountCash = Math.max(0, toFiniteNumber(accountRaw.cash, 0));

      const fxRes = await query("SELECT base_ccy, quote_ccy, rate FROM daa_fx_rates");
      const fxMap = buildFxLookupMapV1(fxRes.rows as Array<Record<string, unknown>>);

      const results: DaaStoreExecuteTradeTicketsResultV1["results"] = [];
      const nowIso = new Date().toISOString();

      for (const ticketId of ticketIds) {
        const ticket = ticketMap.get(ticketId);
        if (!ticket) {
          results.push({
            ticketId,
            status: "rejected",
            rejectCode: "TICKET_NOT_FOUND",
            rejectMessage: "ticket 不存在",
          });
          continue;
        }

        if (ticket.status !== "ready") {
          results.push({
            ticketId,
            status: "rejected",
            rejectCode: "TICKET_STATUS_INVALID",
            rejectMessage: `ticket 当前状态不可执行：${ticket.status}`,
          });
          continue;
        }

        const positionKey = normalizeText(ticket.assetKey, buildPositionKeyV1(ticket.symbol, ticket.market)).toUpperCase();
        const existingPosition = positionsMap.get(positionKey) ?? {
          id: buildPositionIdV1(ticket.symbol, ticket.market),
          assetKey: positionKey,
          symbol: ticket.symbol,
          market: ticket.market,
          currency: ticket.instrumentCurrency,
          qty: 0,
          price: ticket.price,
          costBasis: ticket.price,
          tags: [],
          updatedAt: nowIso,
        };

        const fxRate = ticket.fxRateToBase && ticket.fxRateToBase > 0
          ? ticket.fxRateToBase
          : resolveFxRateToBaseV1(baseCurrency, ticket.instrumentCurrency, fxMap);
        if (!fxRate || fxRate <= 0) {
          const rejectMessage = `缺少汇率：${ticket.instrumentCurrency}/${baseCurrency}`;
          await query(
            "UPDATE daa_trade_tickets SET status = 'rejected', reject_code = 'FX_RATE_MISSING', reject_message = $1, updated_at = NOW() WHERE ticket_id = $2",
            [rejectMessage, ticket.ticketId],
          );
          results.push({
            ticketId: ticket.ticketId,
            status: "rejected",
            rejectCode: "FX_RATE_MISSING",
            rejectMessage,
          });
          continue;
        }

        const grossNotional = ticket.qty * ticket.price;
        const feeInBase = ticket.fee * fxRate;
        const notionalInBase = grossNotional * fxRate;

        if (ticket.side === "BUY") {
          const cashOut = notionalInBase + feeInBase;
          if (accountCash + 1e-9 < cashOut) {
            const rejectMessage = `可用现金不足：需要 ${cashOut.toFixed(2)} ${baseCurrency}，当前 ${accountCash.toFixed(2)} ${baseCurrency}`;
            await query(
              "UPDATE daa_trade_tickets SET status = 'rejected', reject_code = 'INSUFFICIENT_CASH', reject_message = $1, updated_at = NOW() WHERE ticket_id = $2",
              [rejectMessage, ticket.ticketId],
            );
            results.push({
              ticketId: ticket.ticketId,
              status: "rejected",
              rejectCode: "INSUFFICIENT_CASH",
              rejectMessage,
            });
            continue;
          }

          accountCash = Math.max(0, accountCash - cashOut);
          const prevQty = Math.max(0, existingPosition.qty);
          const nextQty = prevQty + ticket.qty;
          const prevCostBasis = Math.max(0, toFiniteNumber(existingPosition.costBasis, existingPosition.price));
          const nextCostBasis = nextQty > 0 ? ((prevQty * prevCostBasis) + (ticket.qty * ticket.price)) / nextQty : ticket.price;
          positionsMap.set(positionKey, {
            ...existingPosition,
            qty: nextQty,
            price: ticket.price,
            costBasis: nextCostBasis,
            currency: ticket.instrumentCurrency,
            updatedAt: nowIso,
          });
        } else {
          const prevQty = Math.max(0, existingPosition.qty);
          if (ticket.qty > prevQty + 1e-9) {
            const rejectMessage = `持仓不足：卖出 ${ticket.qty.toFixed(6)}，当前持仓 ${prevQty.toFixed(6)}`;
            await query(
              "UPDATE daa_trade_tickets SET status = 'rejected', reject_code = 'INSUFFICIENT_POSITION', reject_message = $1, updated_at = NOW() WHERE ticket_id = $2",
              [rejectMessage, ticket.ticketId],
            );
            results.push({
              ticketId: ticket.ticketId,
              status: "rejected",
              rejectCode: "INSUFFICIENT_POSITION",
              rejectMessage,
            });
            continue;
          }
          accountCash = Math.max(0, accountCash + notionalInBase - feeInBase);
          const nextQty = Math.max(0, prevQty - ticket.qty);
          if (nextQty <= 0) {
            positionsMap.delete(positionKey);
          } else {
            positionsMap.set(positionKey, {
              ...existingPosition,
              qty: nextQty,
              price: ticket.price,
              updatedAt: nowIso,
            });
          }
        }

        await query(
          "INSERT INTO daa_trade_journal (id, symbol, side, qty, price, notional, fee, executed_at, source, notes, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())",
          [
            randomUUID(),
            ticket.symbol,
            ticket.side,
            ticket.qty,
            ticket.price,
            grossNotional,
            ticket.fee,
            nowIso,
            ticket.source,
            ticket.reasonText,
          ],
        );

        const snapshotAfter = {
          cash: accountCash,
          positionQty: positionsMap.get(positionKey)?.qty ?? 0,
        };
        await query(
          "UPDATE daa_trade_tickets SET status = 'executed', reject_code = NULL, reject_message = NULL, fx_rate_to_base = $1, gross_notional = $2, notional_in_base = $3, snapshot_after_json = $4::jsonb, executed_at = $5, updated_at = NOW() WHERE ticket_id = $6",
          [fxRate, grossNotional, notionalInBase, JSON.stringify(snapshotAfter), nowIso, ticket.ticketId],
        );

        results.push({
          ticketId: ticket.ticketId,
          status: "executed",
        });
      }

      await query(
        "UPDATE daa_asset_universe SET holding_qty = 0, holding_price = 0, cost_basis = NULL, holding_tags = '{}'::TEXT[], updated_at = NOW() WHERE holding_qty > 0",
      );
      for (const position of positionsMap.values()) {
        if (position.qty <= 0) continue;
        const lastPrice = position.price > 0 ? position.price : 0;
        const priceUpdatedAt = position.price > 0 ? nowIso : null;
        await query(
          `
            INSERT INTO daa_asset_universe (
              asset_key, symbol, market, currency, holding_qty, holding_price, cost_basis, holding_tags, last_price, price_updated_at, created_at, updated_at
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW()
            )
            ON CONFLICT (asset_key) DO UPDATE
            SET
              symbol = EXCLUDED.symbol,
              market = EXCLUDED.market,
              currency = EXCLUDED.currency,
              holding_qty = EXCLUDED.holding_qty,
              holding_price = EXCLUDED.holding_price,
              cost_basis = EXCLUDED.cost_basis,
              holding_tags = EXCLUDED.holding_tags,
              last_price = CASE
                WHEN EXCLUDED.holding_price > 0 THEN EXCLUDED.holding_price
                ELSE daa_asset_universe.last_price
              END,
              price_updated_at = CASE
                WHEN EXCLUDED.holding_price > 0 THEN NOW()
                ELSE daa_asset_universe.price_updated_at
              END,
              updated_at = NOW()
          `,
          [
            buildPositionKeyV1(position.symbol, position.market),
            position.symbol,
            position.market,
            position.currency,
            position.qty,
            position.price,
            position.costBasis,
            position.tags,
            lastPrice,
            priceUpdatedAt,
          ],
        );
      }
      await query("DELETE FROM daa_asset_universe WHERE watch_enabled = FALSE AND holding_qty <= 0");

      const account = await syncStrategyAccountCashInTxV1(query as DaaTxQueryFnV1, accountCash);
      const holdingsValue = [...positionsMap.values()].reduce((sum, p) => {
        const notional = Math.max(0, p.qty * p.price);
        if (notional <= 0) return sum;
        const fxRate = resolveFxRateToBaseV1(baseCurrency, p.currency, fxMap);
        if (!fxRate || fxRate <= 0) return sum;
        return sum + (notional * fxRate);
      }, 0);
      const totalEquity = holdingsValue + account.cash;
      const snapshotTs = new Date().toISOString();
      await query(
        "INSERT INTO daa_equity_snapshots (ts, total_equity, holdings_value, cash, source) VALUES ($1,$2,$3,$4,$5)",
        [snapshotTs, totalEquity, holdingsValue, account.cash, "trade_ticket"],
      );

      await query(
        "INSERT INTO daa_op_log (id, ts, level, message, context_json) VALUES ($1, NOW(), 'info', $2, $3)",
        [
          randomUUID(),
          `Trade ticket 执行完成：成功 ${results.filter((r) => r.status === "executed").length}，失败 ${results.filter((r) => r.status === "rejected").length}`,
          JSON.stringify({
            ticketIds,
            results,
            account,
          }),
        ],
      );

      const touchedDecisionIds = [...new Set(
        ticketIds
          .map((ticketId) => ticketMap.get(ticketId)?.decisionRefId ?? null)
          .filter((decisionId): decisionId is string => Boolean(decisionId)),
      )];
      if (touchedDecisionIds.length > 0) {
        const decisionPlaceholders = touchedDecisionIds.map((_, idx) => `$${idx + 1}`).join(", ");
        const decisionTicketRows = await query(
          `SELECT decision_ref_id, status FROM daa_trade_tickets WHERE decision_ref_id IN (${decisionPlaceholders})`,
          touchedDecisionIds,
        );
        const statusByDecision = new Map<string, DaaStoreTradeTicketStatusV1[]>();
        for (const row of decisionTicketRows.rows as Array<Record<string, unknown>>) {
          const decisionRefId = normalizeText(row.decision_ref_id);
          if (!decisionRefId) continue;
          const status = normalizeTradeTicketStatusV1(row.status);
          if (!statusByDecision.has(decisionRefId)) statusByDecision.set(decisionRefId, []);
          statusByDecision.get(decisionRefId)!.push(status);
        }
        for (const decisionId of touchedDecisionIds) {
          const statuses = statusByDecision.get(decisionId) ?? [];
          const nextStatus = deriveDecisionStatusFromTradeTicketsV1(statuses);
          await query(
            "UPDATE daa_rebalance_decisions SET status = $1 WHERE id = $2",
            [nextStatus, decisionId],
          );
        }
      }

      const touchedBasketIds = [...new Set(
        ticketIds
          .map((ticketId) => ticketMap.get(ticketId)?.basketId ?? null)
          .filter((id): id is string => Boolean(id)),
      )];
      if (touchedBasketIds.length > 0) {
        const basketPlaceholders = touchedBasketIds.map((_, idx) => `$${idx + 1}`).join(", ");
        const basketTicketRows = await query(
          `SELECT basket_id, status FROM daa_trade_tickets WHERE basket_id IN (${basketPlaceholders})`,
          touchedBasketIds,
        );
        const statusByBasket = new Map<string, DaaStoreTradeTicketStatusV1[]>();
        for (const row of basketTicketRows.rows as Array<Record<string, unknown>>) {
          const id = normalizeText(row.basket_id);
          if (!id) continue;
          const status = normalizeTradeTicketStatusV1(row.status);
          if (!statusByBasket.has(id)) statusByBasket.set(id, []);
          statusByBasket.get(id)!.push(status);
        }
        for (const id of touchedBasketIds) {
          const statuses = statusByBasket.get(id) ?? [];
          const nextStatus = deriveBasketStatusFromTicketsV1(statuses);
          await query(
            "UPDATE daa_trade_baskets SET status = $1, updated_at = NOW(), executed_at = CASE WHEN $1 IN ('executed','partial','canceled') THEN COALESCE(executed_at, NOW()) ELSE executed_at END WHERE basket_id = $2",
            [nextStatus, id],
          );
        }
      }

      const latestTicketRows = await query(
        `SELECT ticket_id, basket_id, asset_key, source, status, symbol, market, instrument_currency, base_currency, side, qty, price, fee, gross_notional, fx_rate_to_base, notional_in_base, decision_ref_id, reason_tags, reason_text, snapshot_before_json, snapshot_after_json, reject_code, reject_message, pricing_mode, price_source, price_snapshot_at, created_by, created_at, executed_at, canceled_at, updated_at FROM daa_trade_tickets WHERE ticket_id IN (${placeholders}) ORDER BY created_at DESC`,
        ticketIds,
      );
      const latestPositionsRows = await query(
        "SELECT asset_key, symbol, market, currency, holding_qty, holding_price, cost_basis, holding_tags, updated_at FROM daa_asset_universe WHERE holding_qty > 0 ORDER BY symbol ASC, market ASC",
      );

      await query("COMMIT");

      return {
        results,
        tickets: latestTicketRows.rows.map((row) => mapTradeTicketRowV1(row as Record<string, unknown>)),
        positions: latestPositionsRows.rows.map((row) => {
          const item = row as Record<string, unknown>;
          const symbol = normalizeText(item.symbol).toUpperCase();
          const market = normalizeText(item.market, "US").toUpperCase();
          return {
            id: buildPositionIdV1(symbol, market),
            assetKey: buildPositionKeyV1(symbol, market),
            symbol,
            market,
            currency: normalizeText(item.currency, "USD").toUpperCase(),
            qty: Math.max(0, toFiniteNumber(item.holding_qty)),
            price: Math.max(0, toFiniteNumber(item.holding_price)),
            costBasis: item.cost_basis == null ? null : Math.max(0, toFiniteNumber(item.cost_basis)),
            tags: Array.isArray(item.holding_tags) ? item.holding_tags.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean) : [],
            updatedAt: toIsoString(item.updated_at),
          } satisfies DaaStorePositionV1;
        }),
        account,
        equitySnapshot: {
          ts: snapshotTs,
          totalEquity,
          holdingsValue,
          cash: account.cash,
          source: "trade_ticket",
        },
      };
    } catch (error) {
      try {
        await query("ROLLBACK");
      } catch {
        // ignore
      }
      throw error;
    }
  });
}

export async function getDaaNotificationConfigV1(): Promise<DaaStoreNotificationConfigV1> {
  const system = await getDaaSystemConfigV2();
  return {
    id: "default",
    enabled: system.config.notification.enabled,
    notifyOnDrift: system.config.notification.notifyOnDrift,
    notifyOnRebalance: system.config.notification.notifyOnRebalance,
    notifyOnPriceAlert: system.config.notification.notifyOnPriceAlert,
    updatedAt: system.updatedAt,
  };
}

export async function saveDaaNotificationConfigV1(input: Partial<DaaStoreNotificationConfigV1>): Promise<DaaStoreNotificationConfigV1> {
  const current = await getDaaSystemConfigV2();
  const next = normalizeSystemConfigV2({
    ...current.config,
    notification: {
      ...current.config.notification,
      enabled: input.enabled ?? current.config.notification.enabled,
      notifyOnDrift: input.notifyOnDrift ?? current.config.notification.notifyOnDrift,
      notifyOnRebalance: input.notifyOnRebalance ?? current.config.notification.notifyOnRebalance,
      notifyOnPriceAlert: input.notifyOnPriceAlert ?? current.config.notification.notifyOnPriceAlert,
    },
  });
  const saved = await saveDaaSystemConfigV2({ config: next, baseVersion: current.version });
  return {
    id: "default",
    enabled: saved.config.notification.enabled,
    notifyOnDrift: saved.config.notification.notifyOnDrift,
    notifyOnRebalance: saved.config.notification.notifyOnRebalance,
    notifyOnPriceAlert: saved.config.notification.notifyOnPriceAlert,
    updatedAt: saved.updatedAt,
  };
}

function mapRunHistoryRowV1(row: Record<string, unknown>): DaaStoreRunHistoryEntryV1 {
  return {
    id: normalizeText(row.id),
    ts: toIsoString(row.ts),
    triggerSource: normalizeText(row.trigger_source, "manual"),
    requestJson: parseJsonb<Record<string, unknown>>(row.request_json, {}),
    responseJson: parseJsonb<Record<string, unknown>>(row.response_json, {}),
    summaryJson: parseJsonb<Record<string, unknown>>(row.summary_json, {}),
  };
}

function mapOpLogRowV1(row: Record<string, unknown>): DaaStoreOpLogEntryV1 {
  const normalizedLevel = normalizeText(row.level, "info").toLowerCase();
  const level = normalizedLevel === "warn" || normalizedLevel === "error" ? normalizedLevel : "info";
  return {
    id: normalizeText(row.id),
    ts: toIsoString(row.ts),
    level,
    message: normalizeText(row.message),
    contextJson: parseJsonb<Record<string, unknown>>(row.context_json, {}),
  };
}

export async function appendDaaRunHistoryV1(input: {
  requestJson: Record<string, unknown>;
  responseJson: Record<string, unknown>;
  summaryJson?: Record<string, unknown>;
  triggerSource?: string;
}): Promise<DaaStoreRunHistoryEntryV1> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const id = randomUUID();
    const triggerSource = normalizeText(input.triggerSource, "manual");
    await query(
      "INSERT INTO daa_run_history (id, ts, trigger_source, request_json, response_json, summary_json) VALUES ($1, NOW(), $2, $3, $4, $5)",
      [
        id,
        triggerSource,
        JSON.stringify(input.requestJson || {}),
        JSON.stringify(input.responseJson || {}),
        JSON.stringify(input.summaryJson || {}),
      ],
    );

    const result = await query(
      "SELECT id, ts, trigger_source, request_json, response_json, summary_json FROM daa_run_history WHERE id = $1 LIMIT 1",
      [id],
    );
    return mapRunHistoryRowV1(result.rows[0] as Record<string, unknown>);
  });
}

export async function listDaaRunHistoryV1(limit = 50): Promise<DaaStoreRunHistoryEntryV1[]> {
  await ensureDaaStoreSchemaPgV1();
  const n = Math.max(1, Math.min(500, Math.trunc(toFiniteNumber(limit, 50))));
  return withDaaPgClientV0(async ({ query }) => {
    const result = await query(
      "SELECT id, ts, trigger_source, request_json, response_json, summary_json FROM daa_run_history ORDER BY ts DESC LIMIT $1",
      [n],
    );
    return result.rows.map((row) => mapRunHistoryRowV1(row as Record<string, unknown>));
  });
}

export async function appendDaaOpLogV1(input: {
  level?: "info" | "warn" | "error";
  message: string;
  contextJson?: Record<string, unknown>;
}): Promise<DaaStoreOpLogEntryV1> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const id = randomUUID();
    const level = normalizeText(input.level, "info").toLowerCase();
    const normalizedLevel = level === "warn" || level === "error" ? level : "info";
    const message = normalizeText(input.message);
    if (!message) throw new Error("op log message required");

    await query(
      "INSERT INTO daa_op_log (id, ts, level, message, context_json) VALUES ($1, NOW(), $2, $3, $4)",
      [id, normalizedLevel, message, JSON.stringify(input.contextJson || {})],
    );

    const result = await query(
      "SELECT id, ts, level, message, context_json FROM daa_op_log WHERE id = $1 LIMIT 1",
      [id],
    );
    return mapOpLogRowV1(result.rows[0] as Record<string, unknown>);
  });
}

export async function listDaaOpLogV1(limit = 100): Promise<DaaStoreOpLogEntryV1[]> {
  await ensureDaaStoreSchemaPgV1();
  const n = Math.max(1, Math.min(500, Math.trunc(toFiniteNumber(limit, 100))));
  return withDaaPgClientV0(async ({ query }) => {
    const result = await query(
      "SELECT id, ts, level, message, context_json FROM daa_op_log ORDER BY ts DESC LIMIT $1",
      [n],
    );
    return result.rows.map((row) => mapOpLogRowV1(row as Record<string, unknown>));
  });
}

export async function appendPriceHistoryRowsV1(rows: Array<{ symbol: string; ts?: string; price: number; source?: string }>): Promise<number> {
  if (!rows.length) return 0;
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    let inserted = 0;
    await query("BEGIN");
    try {
      for (const row of rows) {
        const symbol = normalizeText(row.symbol).toUpperCase();
        const price = Math.max(0, toFiniteNumber(row.price));
        if (!symbol || price <= 0) continue;
        const ts = toIsoString(row.ts, new Date().toISOString());
        const source = normalizeText(row.source, "yfinance");

        await query(
          "INSERT INTO daa_price_history (symbol, ts, price, source) VALUES ($1,$2,$3,$4) ON CONFLICT (symbol, ts) DO UPDATE SET price = EXCLUDED.price, source = EXCLUDED.source",
          [symbol, ts, price, source],
        );
        inserted += 1;
      }
      await query("COMMIT");
    } catch (error) {
      try {
        await query("ROLLBACK");
      } catch {
        // ignore
      }
      throw error;
    }

    return inserted;
  });
}

export async function latestPriceBySymbolsV1(symbols: string[]): Promise<Record<string, number>> {
  await ensureDaaStoreSchemaPgV1();
  const uniq = [...new Set(symbols.map((x) => normalizeText(x).toUpperCase()).filter(Boolean))];
  if (!uniq.length) return {};
  return withDaaPgClientV0(async ({ query }) => {
    const result = await query(
      "SELECT DISTINCT ON (symbol) symbol, price FROM daa_price_history WHERE symbol = ANY($1) ORDER BY symbol, ts DESC",
      [uniq],
    );

    const out: Record<string, number> = {};
    for (const row of result.rows as Array<Record<string, unknown>>) {
      const symbol = normalizeText(row.symbol).toUpperCase();
      const price = toFiniteNumber(row.price);
      if (symbol && price > 0) out[symbol] = price;
    }
    return out;
  });
}

const DECISION_STATUSES_V1 = ["pending", "partial", "executed", "canceled", "skipped"] as const;

function normalizeDecisionStatusV1(
  value: unknown,
  fallback: DaaStoreRebalanceDecisionV1["status"],
): DaaStoreRebalanceDecisionV1["status"] {
  const normalized = normalizeText(value, fallback).toLowerCase();
  return (DECISION_STATUSES_V1 as readonly string[]).includes(normalized)
    ? (normalized as DaaStoreRebalanceDecisionV1["status"])
    : fallback;
}

function mapDecisionRowV1(row: Record<string, unknown>): DaaStoreRebalanceDecisionV1 {
  return {
    id: normalizeText(row.id),
    shouldRebalance: Boolean(row.should_rebalance),
    triggerSource: normalizeText(row.trigger_source, "manual") as DaaStoreRebalanceDecisionV1["triggerSource"],
    status: normalizeDecisionStatusV1(row.status, "pending"),
    requestJson: parseJsonb<Record<string, unknown>>(row.request_json, {}),
    responseJson: parseJsonb<Record<string, unknown>>(row.response_json, {}),
    createdAt: toIsoString(row.created_at),
  };
}

export async function createDaaRebalanceDecisionV1(input: {
  requestJson: Record<string, unknown>;
  responseJson: Record<string, unknown>;
  shouldRebalance: boolean;
  triggerSource?: DaaStoreRebalanceDecisionV1["triggerSource"];
}): Promise<{ decision: DaaStoreRebalanceDecisionV1; orders: DaaStoreExecutionOrderV1[] }> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const decisionId = randomUUID();
    const triggerSource = normalizeText(input.triggerSource, "manual") as DaaStoreRebalanceDecisionV1["triggerSource"];

    await query("BEGIN");
    try {
      await query(
        "INSERT INTO daa_rebalance_decisions (id, request_json, response_json, should_rebalance, trigger_source, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,NOW())",
        [
          decisionId,
          JSON.stringify(input.requestJson || {}),
          JSON.stringify(input.responseJson || {}),
          Boolean(input.shouldRebalance),
          triggerSource,
          input.shouldRebalance ? "pending" : "executed",
        ],
      );

      const schemaVersion = Number((input.responseJson as any)?.schemaVersion || 0);
      if (schemaVersion !== 2) {
        throw new Error("responseJson must be UnifiedDecisionResultV2");
      }

      await query("COMMIT");
    } catch (error) {
      try {
        await query("ROLLBACK");
      } catch {
        // ignore
      }
      throw error;
    }

    const dRes = await query(
      "SELECT id, request_json, response_json, should_rebalance, trigger_source, status, created_at FROM daa_rebalance_decisions WHERE id = $1 LIMIT 1",
      [decisionId],
    );

    return {
      decision: mapDecisionRowV1(dRes.rows[0] as Record<string, unknown>),
      orders: [],
    };
  });
}

export async function listDaaRebalanceDecisionsV1(opts?: {
  limit?: number;
  status?: DaaStoreRebalanceDecisionV1["status"];
}): Promise<Array<DaaStoreRebalanceDecisionV1 & { orders: DaaStoreExecutionOrderV1[] }>> {
  await ensureDaaStoreSchemaPgV1();
  const limit = Math.max(1, Math.min(500, Math.trunc(toFiniteNumber(opts?.limit, 50))));
  const status = normalizeText(opts?.status);

  return withDaaPgClientV0(async ({ query }) => {
    const dRes = status
      ? await query(
        "SELECT id, request_json, response_json, should_rebalance, trigger_source, status, created_at FROM daa_rebalance_decisions WHERE status = $1 ORDER BY created_at DESC LIMIT $2",
        [status, limit],
      )
      : await query(
        "SELECT id, request_json, response_json, should_rebalance, trigger_source, status, created_at FROM daa_rebalance_decisions ORDER BY created_at DESC LIMIT $1",
        [limit],
      );

    const decisions = dRes.rows.map((row) => mapDecisionRowV1(row as Record<string, unknown>));
    if (!decisions.length) return [];

    return decisions.map((decision) => ({
      ...decision,
      orders: [],
    }));
  });
}

export async function closeDaaStorePoolV1(): Promise<void> {
  const pool = daaPgPoolV0();
  await pool.end();
}
