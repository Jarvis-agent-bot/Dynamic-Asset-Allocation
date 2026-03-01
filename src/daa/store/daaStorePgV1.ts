import { randomUUID } from "node:crypto";

import { daaPgPoolV0, withDaaPgClientV0 } from "@/src/daa/pg/daaPgV0";

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

export type DaaStorePositionV1 = {
  id: string;
  symbol: string;
  market: string;
  currency: string;
  qty: number;
  price: number;
  costBasis: number | null;
  tags: string[];
  liquidityNotional24h: number;
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

export type DaaStoreDataSourceV1 = {
  id: string;
  kind: "hf_fund" | "price_feed" | "news_feed";
  configJson: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
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
  status: "pending" | "partial" | "executed" | "skipped";
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
  status: "pending" | "executed" | "skipped" | "partial";
  executedQty: number;
  executedPrice: number;
  fee: number;
  notes: string | null;
  updatedAt: string;
  bookedAt?: string | null;
};

export type DaaExecutionConfirmOrderInputV1 = {
  orderId: string;
  status: "pending" | "executed" | "skipped" | "partial";
  executedQty?: number;
  executedPrice?: number;
  fee?: number;
  notes?: string;
};

export type DaaExecutionConfirmInputV1 = {
  decisionId: string;
  cash?: number;
  orders: DaaExecutionConfirmOrderInputV1[];
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

const DEFAULT_DATA_SOURCES_V1: DaaStoreDataSourceV1[] = [
  {
    id: "hf_fund.default",
    kind: "hf_fund",
    configJson: {
      funds: [
        { fundCode: "006533", label: "易方达科融混合", kind: "equity", enabled: true },
        { fundCode: "100055", label: "富国全球科技互联网", kind: "qdii", enabled: true },
        { fundCode: "005827", label: "易方达蓝筹精选", kind: "equity", enabled: true },
        { fundCode: "110011", label: "易方达中小盘", kind: "equity", enabled: true },
        { fundCode: "161725", label: "招商中证白酒指数", kind: "equity", enabled: true },
      ],
    },
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "price_feed.default",
    kind: "price_feed",
    configJson: {
      provider: "yfinance",
      intervalMinutes: 5,
      symbols: ["SPY", "QQQ", "BND", "TSLA"],
    },
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "news_feed.default",
    kind: "news_feed",
    configJson: {
      provider: "yahoo_rss",
      query: "SPY OR QQQ OR TSLA",
    },
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export const DEFAULT_STRATEGY_CONFIG_V1 = {
  account: { cash: 0, totalEquity: null },
  constraints: {
    maxPositionPct: 1,
    minNotional: 200,
    maxOrderPctOfNav: 0.1,
    maxOrderPctOfLiquidity: 0.15,
  },
  policy: {
    baseDriftTriggerPct: 0.05,
    strongTrendDriftTriggerPct: 0.1,
    riskOffConsensusPct: 0.6,
    riskOffScalePct: 0.7,
    valueTrapThesisDriftPct: 0.12,
    sbIsolationScorePct: 0.35,
  },
  risk: {
    maxDrawdownPct: 0.15,
    perAssetStopLossPct: 0.2,
    maxConcentrationPct: 0.3,
    correlationCapPct: 0.6,
    maxTotalRiskExposurePct: 0.7,
  },
  targetWeights: {},
};

export async function ensureDaaStoreSchemaPgV1(): Promise<void> {
  const st = getStoreStateV1();
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
            liquidity_notional_24h NUMERIC NOT NULL DEFAULT 0,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE UNIQUE INDEX IF NOT EXISTS idx_daa_positions_symbol_market
            ON daa_positions(symbol, market);

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

          CREATE UNIQUE INDEX IF NOT EXISTS idx_daa_trade_journal_execution_order_unique
            ON daa_trade_journal(execution_order_id) WHERE execution_order_id IS NOT NULL;

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
            booked_at TIMESTAMPTZ,
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_daa_execution_orders_decision_status
            ON daa_execution_orders(decision_id, status);

          CREATE TABLE IF NOT EXISTS daa_equity_snapshots (
            ts TIMESTAMPTZ PRIMARY KEY,
            total_equity NUMERIC NOT NULL,
            holdings_value NUMERIC NOT NULL,
            cash NUMERIC NOT NULL,
            source TEXT NOT NULL DEFAULT 'cron'
          );

          CREATE TABLE IF NOT EXISTS daa_strategy_config (
            id TEXT PRIMARY KEY,
            config_json JSONB NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS daa_data_sources (
            id TEXT PRIMARY KEY,
            kind TEXT NOT NULL,
            config_json JSONB NOT NULL,
            enabled BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_daa_data_sources_kind_enabled
            ON daa_data_sources(kind, enabled);

          CREATE TABLE IF NOT EXISTS daa_notification_config (
            id TEXT PRIMARY KEY,
            enabled BOOLEAN NOT NULL DEFAULT FALSE,
            notify_on_drift BOOLEAN NOT NULL DEFAULT TRUE,
            notify_on_rebalance BOOLEAN NOT NULL DEFAULT TRUE,
            notify_on_price_alert BOOLEAN NOT NULL DEFAULT FALSE,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

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
        `);

        await query("ALTER TABLE daa_execution_orders ADD COLUMN IF NOT EXISTS booked_at TIMESTAMPTZ");
        await query("ALTER TABLE daa_trade_journal ADD COLUMN IF NOT EXISTS execution_order_id TEXT");
        await query(
          "CREATE UNIQUE INDEX IF NOT EXISTS idx_daa_trade_journal_execution_order_unique ON daa_trade_journal(execution_order_id) WHERE execution_order_id IS NOT NULL",
        );

        await query(
          "INSERT INTO daa_strategy_config (id, config_json) VALUES ('default', $1) ON CONFLICT (id) DO NOTHING",
          [JSON.stringify(DEFAULT_STRATEGY_CONFIG_V1)],
        );

        await query(
          "INSERT INTO daa_notification_config (id, enabled, notify_on_drift, notify_on_rebalance, notify_on_price_alert) VALUES ('default', false, true, true, false) ON CONFLICT (id) DO NOTHING",
        );

        for (const source of DEFAULT_DATA_SOURCES_V1) {
          await query(
            "INSERT INTO daa_data_sources (id, kind, config_json, enabled) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING",
            [source.id, source.kind, JSON.stringify(source.configJson), source.enabled],
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
    }).catch((error) => {
      st.schemaInit = null;
      throw error;
    });
  }

  return st.schemaInit;
}

function mapPositionRowV1(row: Record<string, unknown>): DaaStorePositionV1 {
  return {
    id: normalizeText(row.id),
    symbol: normalizeText(row.symbol).toUpperCase(),
    market: normalizeText(row.market, "US").toUpperCase(),
    currency: normalizeText(row.currency, "USD").toUpperCase(),
    qty: toFiniteNumber(row.qty),
    price: toFiniteNumber(row.price),
    costBasis: row.cost_basis == null ? null : toFiniteNumber(row.cost_basis),
    tags: Array.isArray(row.tags) ? row.tags.map((x) => String(x)).filter(Boolean) : [],
    liquidityNotional24h: toFiniteNumber(row.liquidity_notional_24h),
    updatedAt: toIsoString(row.updated_at),
  };
}

export async function listDaaPositionsV1(): Promise<DaaStorePositionV1[]> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const result = await query(
      "SELECT id, symbol, market, currency, qty, price, cost_basis, tags, liquidity_notional_24h, updated_at FROM daa_positions ORDER BY symbol ASC",
    );
    return result.rows.map((row) => mapPositionRowV1(row as Record<string, unknown>));
  });
}

export async function replaceDaaPositionsV1(rows: Array<Partial<DaaStorePositionV1>>): Promise<DaaStorePositionV1[]> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    await query("BEGIN");
    try {
      await query("DELETE FROM daa_positions");
      for (const raw of rows) {
        const symbol = normalizeText(raw.symbol).toUpperCase();
        if (!symbol) continue;
        const id = normalizeText(raw.id, `${symbol}`);
        const market = normalizeText(raw.market, "US").toUpperCase();
        const currency = normalizeText(raw.currency, "USD").toUpperCase();
        const qty = Math.max(0, toFiniteNumber(raw.qty));
        const price = Math.max(0, toFiniteNumber(raw.price));
        const costBasis = raw.costBasis == null ? null : Math.max(0, toFiniteNumber(raw.costBasis));
        const tags = Array.isArray(raw.tags)
          ? raw.tags.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean)
          : [];
        const liquidityNotional24h = Math.max(0, toFiniteNumber(raw.liquidityNotional24h));

        await query(
          "INSERT INTO daa_positions (id, symbol, market, currency, qty, price, cost_basis, tags, liquidity_notional_24h, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())",
          [id, symbol, market, currency, qty, price, costBasis, tags, liquidityNotional24h],
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
      "SELECT id, symbol, market, currency, qty, price, cost_basis, tags, liquidity_notional_24h, updated_at FROM daa_positions ORDER BY symbol ASC",
    );
    return result.rows.map((row) => mapPositionRowV1(row as Record<string, unknown>));
  });
}

export async function getDaaStrategyConfigV1(): Promise<DaaStoreStrategyConfigV1> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const result = await query(
      "SELECT id, config_json, updated_at FROM daa_strategy_config WHERE id = 'default' LIMIT 1",
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      return {
        id: "default",
        configJson: { ...DEFAULT_STRATEGY_CONFIG_V1 },
        updatedAt: new Date().toISOString(),
      };
    }
    return {
      id: "default",
      configJson: parseJsonb<Record<string, unknown>>(row.config_json, { ...DEFAULT_STRATEGY_CONFIG_V1 }),
      updatedAt: toIsoString(row.updated_at),
    };
  });
}

export async function saveDaaStrategyConfigV1(configJson: Record<string, unknown>): Promise<DaaStoreStrategyConfigV1> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    await query(
      "INSERT INTO daa_strategy_config (id, config_json, updated_at) VALUES ('default', $1, NOW()) ON CONFLICT (id) DO UPDATE SET config_json = EXCLUDED.config_json, updated_at = NOW()",
      [JSON.stringify(configJson || {})],
    );

    const result = await query("SELECT id, config_json, updated_at FROM daa_strategy_config WHERE id='default' LIMIT 1");
    const row = result.rows[0] as Record<string, unknown>;
    return {
      id: "default",
      configJson: parseJsonb<Record<string, unknown>>(row.config_json, { ...DEFAULT_STRATEGY_CONFIG_V1 }),
      updatedAt: toIsoString(row.updated_at),
    };
  });
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

function mapDataSourceRowV1(row: Record<string, unknown>): DaaStoreDataSourceV1 {
  return {
    id: normalizeText(row.id),
    kind: normalizeText(row.kind) as DaaStoreDataSourceV1["kind"],
    configJson: parseJsonb<Record<string, unknown>>(row.config_json, {}),
    enabled: Boolean(row.enabled),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

export async function listDaaDataSourcesV1(kind?: string): Promise<DaaStoreDataSourceV1[]> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const normalizedKind = normalizeText(kind);
    const result = normalizedKind
      ? await query(
        "SELECT id, kind, config_json, enabled, created_at, updated_at FROM daa_data_sources WHERE kind = $1 ORDER BY id ASC",
        [normalizedKind],
      )
      : await query("SELECT id, kind, config_json, enabled, created_at, updated_at FROM daa_data_sources ORDER BY kind ASC, id ASC");

    return result.rows.map((row) => mapDataSourceRowV1(row as Record<string, unknown>));
  });
}

export async function replaceDaaDataSourcesV1(rows: DaaStoreDataSourceV1[]): Promise<DaaStoreDataSourceV1[]> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    await query("BEGIN");
    try {
      for (const raw of rows) {
        const id = normalizeText(raw.id);
        const kind = normalizeText(raw.kind);
        if (!id || !kind) continue;

        await query(
          "INSERT INTO daa_data_sources (id, kind, config_json, enabled, created_at, updated_at) VALUES ($1,$2,$3,$4,NOW(),NOW()) ON CONFLICT (id) DO UPDATE SET kind = EXCLUDED.kind, config_json = EXCLUDED.config_json, enabled = EXCLUDED.enabled, updated_at = NOW()",
          [id, kind, JSON.stringify(raw.configJson || {}), Boolean(raw.enabled)],
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

    const result = await query("SELECT id, kind, config_json, enabled, created_at, updated_at FROM daa_data_sources ORDER BY kind ASC, id ASC");
    return result.rows.map((row) => mapDataSourceRowV1(row as Record<string, unknown>));
  });
}

export async function getDaaNotificationConfigV1(): Promise<DaaStoreNotificationConfigV1> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const result = await query(
      "SELECT id, enabled, notify_on_drift, notify_on_rebalance, notify_on_price_alert, updated_at FROM daa_notification_config WHERE id='default' LIMIT 1",
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      return {
        id: "default",
        enabled: false,
        notifyOnDrift: true,
        notifyOnRebalance: true,
        notifyOnPriceAlert: false,
        updatedAt: new Date().toISOString(),
      };
    }
    return {
      id: "default",
      enabled: Boolean(row.enabled),
      notifyOnDrift: Boolean(row.notify_on_drift),
      notifyOnRebalance: Boolean(row.notify_on_rebalance),
      notifyOnPriceAlert: Boolean(row.notify_on_price_alert),
      updatedAt: toIsoString(row.updated_at),
    };
  });
}

export async function saveDaaNotificationConfigV1(input: Partial<DaaStoreNotificationConfigV1>): Promise<DaaStoreNotificationConfigV1> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    await query(
      "INSERT INTO daa_notification_config (id, enabled, notify_on_drift, notify_on_rebalance, notify_on_price_alert, updated_at) VALUES ('default', $1, $2, $3, $4, NOW()) ON CONFLICT (id) DO UPDATE SET enabled = EXCLUDED.enabled, notify_on_drift = EXCLUDED.notify_on_drift, notify_on_rebalance = EXCLUDED.notify_on_rebalance, notify_on_price_alert = EXCLUDED.notify_on_price_alert, updated_at = NOW()",
      [
        Boolean(input.enabled),
        input.notifyOnDrift ?? true,
        input.notifyOnRebalance ?? true,
        input.notifyOnPriceAlert ?? false,
      ],
    );

    const result = await query(
      "SELECT id, enabled, notify_on_drift, notify_on_rebalance, notify_on_price_alert, updated_at FROM daa_notification_config WHERE id='default' LIMIT 1",
    );
    const row = result.rows[0] as Record<string, unknown>;
    return {
      id: "default",
      enabled: Boolean(row.enabled),
      notifyOnDrift: Boolean(row.notify_on_drift),
      notifyOnRebalance: Boolean(row.notify_on_rebalance),
      notifyOnPriceAlert: Boolean(row.notify_on_price_alert),
      updatedAt: toIsoString(row.updated_at),
    };
  });
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

function mapDecisionRowV1(row: Record<string, unknown>): DaaStoreRebalanceDecisionV1 {
  return {
    id: normalizeText(row.id),
    shouldRebalance: Boolean(row.should_rebalance),
    triggerSource: normalizeText(row.trigger_source, "manual") as DaaStoreRebalanceDecisionV1["triggerSource"],
    status: normalizeText(row.status, "pending") as DaaStoreRebalanceDecisionV1["status"],
    requestJson: parseJsonb<Record<string, unknown>>(row.request_json, {}),
    responseJson: parseJsonb<Record<string, unknown>>(row.response_json, {}),
    createdAt: toIsoString(row.created_at),
  };
}

function mapExecutionOrderRowV1(row: Record<string, unknown>): DaaStoreExecutionOrderV1 {
  return {
    orderId: normalizeText(row.order_id),
    decisionId: normalizeText(row.decision_id),
    symbol: normalizeText(row.symbol).toUpperCase(),
    side: normalizeText(row.side, "BUY") as DaaStoreExecutionOrderV1["side"],
    suggestedNotional: toFiniteNumber(row.suggested_notional),
    status: normalizeText(row.status, "pending") as DaaStoreExecutionOrderV1["status"],
    executedQty: toFiniteNumber(row.executed_qty),
    executedPrice: toFiniteNumber(row.executed_price),
    fee: toFiniteNumber(row.fee),
    notes: row.notes == null ? null : String(row.notes),
    updatedAt: toIsoString(row.updated_at),
    bookedAt: row.booked_at == null ? null : toIsoString(row.booked_at),
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

      const executableOrdersRaw = Array.isArray((input.responseJson as any)?.executableOrders)
        ? (input.responseJson as any).executableOrders
        : [];

      for (const orderRaw of executableOrdersRaw) {
        const symbol = normalizeText(orderRaw?.symbol).toUpperCase();
        const side = normalizeText(orderRaw?.side).toUpperCase();
        const notional = Math.max(0, toFiniteNumber(orderRaw?.notional));
        if (!symbol || (side !== "BUY" && side !== "SELL") || notional <= 0) continue;

        await query(
          "INSERT INTO daa_execution_orders (order_id, decision_id, symbol, side, suggested_notional, status, executed_qty, executed_price, fee, booked_at, notes, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,0,0,0,NULL,NULL,NOW(),NOW())",
          [randomUUID(), decisionId, symbol, side, notional, "pending"],
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

    const dRes = await query(
      "SELECT id, request_json, response_json, should_rebalance, trigger_source, status, created_at FROM daa_rebalance_decisions WHERE id = $1 LIMIT 1",
      [decisionId],
    );

    const oRes = await query(
      "SELECT order_id, decision_id, symbol, side, suggested_notional, status, executed_qty, executed_price, fee, notes, updated_at, booked_at FROM daa_execution_orders WHERE decision_id = $1 ORDER BY created_at ASC",
      [decisionId],
    );

    return {
      decision: mapDecisionRowV1(dRes.rows[0] as Record<string, unknown>),
      orders: oRes.rows.map((row) => mapExecutionOrderRowV1(row as Record<string, unknown>)),
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

    const ids = decisions.map((d) => d.id);
    const oRes = await query(
      "SELECT order_id, decision_id, symbol, side, suggested_notional, status, executed_qty, executed_price, fee, notes, updated_at, booked_at FROM daa_execution_orders WHERE decision_id = ANY($1) ORDER BY created_at ASC",
      [ids],
    );

    const ordersByDecision = new Map<string, DaaStoreExecutionOrderV1[]>();
    for (const row of oRes.rows as Array<Record<string, unknown>>) {
      const order = mapExecutionOrderRowV1(row);
      if (!ordersByDecision.has(order.decisionId)) ordersByDecision.set(order.decisionId, []);
      ordersByDecision.get(order.decisionId)!.push(order);
    }

    return decisions.map((decision) => ({
      ...decision,
      orders: ordersByDecision.get(decision.id) ?? [],
    }));
  });
}

export async function confirmDaaRebalanceExecutionV1(input: DaaExecutionConfirmInputV1): Promise<{
  decision: DaaStoreRebalanceDecisionV1;
  orders: DaaStoreExecutionOrderV1[];
  positions: DaaStorePositionV1[];
  equitySnapshot: DaaStoreEquitySnapshotV1;
}> {
  await ensureDaaStoreSchemaPgV1();

  return withDaaPgClientV0(async ({ query }) => {
    const decisionId = normalizeText(input.decisionId);
    if (!decisionId) throw new Error("decisionId required");

    const orderInputs = Array.isArray(input.orders) ? input.orders : [];

    await query("BEGIN");
    try {
      const dRes = await query(
        "SELECT id, request_json, response_json, should_rebalance, trigger_source, status, created_at FROM daa_rebalance_decisions WHERE id = $1 LIMIT 1 FOR UPDATE",
        [decisionId],
      );
      if (!dRes.rows.length) throw new Error("decision not found");

      const oRes = await query(
        "SELECT order_id, decision_id, symbol, side, suggested_notional, status, executed_qty, executed_price, fee, notes, updated_at, booked_at FROM daa_execution_orders WHERE decision_id = $1 FOR UPDATE",
        [decisionId],
      );
      const existingOrders = oRes.rows.map((row) => mapExecutionOrderRowV1(row as Record<string, unknown>));
      const existingById = new Map(existingOrders.map((o) => [o.orderId, o]));

      const pRes = await query(
        "SELECT id, symbol, market, currency, qty, price, cost_basis, tags, liquidity_notional_24h, updated_at FROM daa_positions",
      );
      const positionsMap = new Map<string, DaaStorePositionV1>();
      for (const row of pRes.rows as Array<Record<string, unknown>>) {
        const p = mapPositionRowV1(row);
        positionsMap.set(p.symbol, p);
      }

      for (const item of orderInputs) {
        const orderId = normalizeText(item.orderId);
        const oldOrder = existingById.get(orderId);
        if (!oldOrder) continue;

        const status = normalizeText(item.status, oldOrder.status) as DaaStoreExecutionOrderV1["status"];
        const executedQty = Math.max(0, toFiniteNumber(item.executedQty, oldOrder.executedQty));
        const executedPrice = Math.max(0, toFiniteNumber(item.executedPrice, oldOrder.executedPrice));
        const fee = Math.max(0, toFiniteNumber(item.fee, oldOrder.fee));
        const notes = normalizeText(item.notes, oldOrder.notes || "");

        await query(
          "UPDATE daa_execution_orders SET status = $1, executed_qty = $2, executed_price = $3, fee = $4, notes = $5, updated_at = NOW() WHERE order_id = $6",
          [status, executedQty, executedPrice, fee, notes || null, orderId],
        );

        const shouldBookTrade = (status === "executed" || status === "partial") && executedQty > 0 && executedPrice > 0;
        if (!shouldBookTrade) continue;

        const notional = executedQty * executedPrice;
        const insertTradeResult = await query(
          "INSERT INTO daa_trade_journal (id, symbol, side, qty, price, notional, fee, executed_at, source, rebalance_decision_id, execution_order_id, notes, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),'rebalance_sync',$8,$9,$10,NOW()) ON CONFLICT (execution_order_id) DO NOTHING RETURNING id",
          [randomUUID(), oldOrder.symbol, oldOrder.side, executedQty, executedPrice, notional, fee, decisionId, orderId, notes || null],
        );
        // 幂等保护：同一执行单只记账一次，重复提交不再二次改仓。
        if (!insertTradeResult.rowCount) continue;

        await query(
          "UPDATE daa_execution_orders SET booked_at = COALESCE(booked_at, NOW()) WHERE order_id = $1",
          [orderId],
        );

        const current = positionsMap.get(oldOrder.symbol) ?? {
          id: oldOrder.symbol,
          symbol: oldOrder.symbol,
          market: "US",
          currency: "USD",
          qty: 0,
          price: executedPrice,
          costBasis: executedPrice,
          tags: [],
          liquidityNotional24h: 0,
          updatedAt: new Date().toISOString(),
        };

        const nextQty = oldOrder.side === "BUY"
          ? current.qty + executedQty
          : Math.max(0, current.qty - executedQty);

        positionsMap.set(oldOrder.symbol, {
          ...current,
          qty: nextQty,
          price: executedPrice,
          costBasis: current.costBasis ?? executedPrice,
          updatedAt: new Date().toISOString(),
        });
      }

      await query("DELETE FROM daa_positions");
      for (const position of positionsMap.values()) {
        if (position.qty <= 0) continue;
        await query(
          "INSERT INTO daa_positions (id, symbol, market, currency, qty, price, cost_basis, tags, liquidity_notional_24h, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())",
          [
            position.id,
            position.symbol,
            position.market,
            position.currency,
            position.qty,
            position.price,
            position.costBasis,
            position.tags,
            position.liquidityNotional24h,
          ],
        );
      }

      const statusRes = await query(
        "SELECT status FROM daa_execution_orders WHERE decision_id = $1",
        [decisionId],
      );
      const allStatuses = statusRes.rows.map((row) => normalizeText((row as Record<string, unknown>).status, "pending"));
      let decisionStatus: DaaStoreRebalanceDecisionV1["status"] = "pending";
      if (allStatuses.length > 0 && allStatuses.every((s) => s === "skipped")) decisionStatus = "skipped";
      else if (allStatuses.length > 0 && allStatuses.every((s) => s === "executed" || s === "skipped")) decisionStatus = "executed";
      else if (allStatuses.some((s) => s === "executed" || s === "partial" || s === "skipped")) decisionStatus = "partial";

      await query("UPDATE daa_rebalance_decisions SET status = $1 WHERE id = $2", [decisionStatus, decisionId]);

      const positions = [...positionsMap.values()].filter((p) => p.qty > 0);
      const holdingsValue = positions.reduce((sum, p) => sum + p.qty * p.price, 0);
      const cash = Math.max(0, toFiniteNumber(input.cash, 0));
      const totalEquity = holdingsValue + cash;

      const snapshotTs = new Date().toISOString();
      await query(
        "INSERT INTO daa_equity_snapshots (ts, total_equity, holdings_value, cash, source) VALUES ($1,$2,$3,$4,'execution_confirm')",
        [snapshotTs, totalEquity, holdingsValue, cash],
      );

      await query("COMMIT");

      const latestDecisionRes = await query(
        "SELECT id, request_json, response_json, should_rebalance, trigger_source, status, created_at FROM daa_rebalance_decisions WHERE id = $1 LIMIT 1",
        [decisionId],
      );
      const latestOrdersRes = await query(
        "SELECT order_id, decision_id, symbol, side, suggested_notional, status, executed_qty, executed_price, fee, notes, updated_at, booked_at FROM daa_execution_orders WHERE decision_id = $1 ORDER BY created_at ASC",
        [decisionId],
      );

      const latestPositionsRes = await query(
        "SELECT id, symbol, market, currency, qty, price, cost_basis, tags, liquidity_notional_24h, updated_at FROM daa_positions ORDER BY symbol ASC",
      );

      return {
        decision: mapDecisionRowV1(latestDecisionRes.rows[0] as Record<string, unknown>),
        orders: latestOrdersRes.rows.map((row) => mapExecutionOrderRowV1(row as Record<string, unknown>)),
        positions: latestPositionsRes.rows.map((row) => mapPositionRowV1(row as Record<string, unknown>)),
        equitySnapshot: {
          ts: snapshotTs,
          totalEquity,
          holdingsValue,
          cash,
          source: "execution_confirm",
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

export async function reconcileDecisionPositionsV1(decisionId: string): Promise<{
  decisionId: string;
  expected: Array<{ symbol: string; qty: number }>;
  actual: Array<{ symbol: string; qty: number }>;
  drift: Array<{ symbol: string; expectedQty: number; actualQty: number; diffQty: number }>;
}> {
  await ensureDaaStoreSchemaPgV1();

  return withDaaPgClientV0(async ({ query }) => {
    const normalizedId = normalizeText(decisionId);
    if (!normalizedId) throw new Error("decisionId required");

    const decisionRes = await query(
      "SELECT request_json FROM daa_rebalance_decisions WHERE id = $1 LIMIT 1",
      [normalizedId],
    );
    if (!decisionRes.rows.length) throw new Error("decision not found");

    const requestJson = parseJsonb<Record<string, unknown>>((decisionRes.rows[0] as Record<string, unknown>).request_json, {});
    const expectedRows = Array.isArray(requestJson.positions) ? requestJson.positions : [];
    const expectedMap = new Map<string, number>();
    for (const row of expectedRows as Array<Record<string, unknown>>) {
      const symbol = normalizeText(row.symbol).toUpperCase();
      if (!symbol) continue;
      expectedMap.set(symbol, (expectedMap.get(symbol) ?? 0) + Math.max(0, toFiniteNumber(row.qty)));
    }

    const actualRes = await query("SELECT symbol, qty FROM daa_positions ORDER BY symbol ASC");
    const actualMap = new Map<string, number>();
    for (const row of actualRes.rows as Array<Record<string, unknown>>) {
      const symbol = normalizeText(row.symbol).toUpperCase();
      if (!symbol) continue;
      actualMap.set(symbol, Math.max(0, toFiniteNumber(row.qty)));
    }

    const allSymbols = [...new Set([...expectedMap.keys(), ...actualMap.keys()])].sort();
    const drift = allSymbols.map((symbol) => {
      const expectedQty = expectedMap.get(symbol) ?? 0;
      const actualQty = actualMap.get(symbol) ?? 0;
      return {
        symbol,
        expectedQty,
        actualQty,
        diffQty: Number((actualQty - expectedQty).toFixed(8)),
      };
    });

    return {
      decisionId: normalizedId,
      expected: [...expectedMap.entries()].map(([symbol, qty]) => ({ symbol, qty })),
      actual: [...actualMap.entries()].map(([symbol, qty]) => ({ symbol, qty })),
      drift,
    };
  });
}

export async function closeDaaStorePoolV1(): Promise<void> {
  const pool = daaPgPoolV0();
  await pool.end();
}
