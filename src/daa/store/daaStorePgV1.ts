import { randomUUID } from "node:crypto";

import { daaPgPoolV0, isDaaPgMemRuntimeV0, withDaaPgClientV0 } from "@/src/daa/pg/daaPgV0";
import { normalizeBaseCurrencyCodeV2, normalizeCurrencyAliasV2 } from "@/src/daa/config/currencyV2";
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

export type DaaStorePositionV1 = {
  id: string;
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

export type DaaStoreDataSourceV1 = {
  id: string;
  kind: "hf_fund" | "price_feed" | "news_feed" | "fx_feed" | "llm_analysis";
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

export type DaaStoreExecutionOrderEventV1 = {
  id: string;
  decisionId: string;
  orderId: string;
  eventType: "submit" | "cancel" | "skip" | "fill";
  payloadJson: Record<string, unknown>;
  createdAt: string;
};

export type DaaExecutionEventInputV1 = {
  orderId: string;
  type: "submit" | "cancel" | "skip" | "fill";
  fillQty?: number;
  fillPrice?: number;
  fee?: number;
  note?: string;
  final?: boolean;
  ts?: string;
};

export type DaaExecutionApplyEventsInputV1 = {
  decisionId: string;
  events: DaaExecutionEventInputV1[];
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

export type DaaStoreWatchlistCandidateV1 = {
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

function buildLegacyDataSourcesFromSystemConfigV2(config: DaaSystemConfigV2): DaaStoreDataSourceV1[] {
  return [
    {
      id: config.dataSources.hfFund.id,
      kind: "hf_fund",
      configJson: {
        funds: config.dataSources.hfFund.funds,
        marketScope: config.dataSources.hfFund.marketScope,
      },
      enabled: config.dataSources.hfFund.enabled,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: config.dataSources.priceFeed.id,
      kind: "price_feed",
      configJson: {
        provider: config.dataSources.priceFeed.provider,
        intervalMinutes: config.dataSources.priceFeed.intervalMinutes,
        symbols: config.dataSources.priceFeed.symbols,
      },
      enabled: config.dataSources.priceFeed.enabled,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: config.dataSources.newsFeed.id,
      kind: "news_feed",
      configJson: {
        provider: config.dataSources.newsFeed.provider,
        query: config.dataSources.newsFeed.query,
        symbols: config.dataSources.newsFeed.symbols,
        fusionWeights: config.dataSources.newsFeed.fusionWeights,
      },
      enabled: config.dataSources.newsFeed.enabled,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: config.dataSources.fxFeed.id,
      kind: "fx_feed",
      configJson: {
        provider: config.dataSources.fxFeed.provider,
        baseCurrency: config.dataSources.fxFeed.baseCurrency,
        pairs: config.dataSources.fxFeed.pairs,
      },
      enabled: config.dataSources.fxFeed.enabled,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: config.dataSources.llmAnalysis.id,
      kind: "llm_analysis",
      configJson: {
        provider: config.dataSources.llmAnalysis.provider,
        model: config.dataSources.llmAnalysis.model,
        enabledInDecision: config.dataSources.llmAnalysis.enabledInDecision,
        timeoutMs: config.dataSources.llmAnalysis.timeoutMs,
      },
      enabled: config.dataSources.llmAnalysis.enabled,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
}

const DEFAULT_DATA_SOURCES_V1: DaaStoreDataSourceV1[] = buildLegacyDataSourcesFromSystemConfigV2(DEFAULT_SYSTEM_CONFIG_V2);

export const DEFAULT_STRATEGY_CONFIG_V1 = {
  ...DEFAULT_SYSTEM_CONFIG_V2.strategy,
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

type LegacyDataSourceSnapshotV2 = {
  id: string;
  enabled: boolean;
  configJson: Record<string, unknown>;
};

function parseLegacyDataSourceMapV2(rows: Array<Record<string, unknown>>): Map<string, LegacyDataSourceSnapshotV2> {
  const out = new Map<string, LegacyDataSourceSnapshotV2>();
  for (const row of rows) {
    const kind = normalizeText(row.kind);
    if (!kind) continue;
    out.set(kind, {
      id: normalizeText(row.id),
      enabled: Boolean(row.enabled),
      configJson: parseJsonb<Record<string, unknown>>(row.config_json, {}),
    });
  }
  return out;
}

function parseLegacySymbolListV2(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const set = new Set<string>();
  for (const item of value) {
    const symbol = String(item ?? "").trim().toUpperCase();
    if (symbol) set.add(symbol);
  }
  return set.size > 0 ? [...set] : [...fallback];
}

function parseLegacyMarketScopeListV2(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const set = new Set<string>();
  for (const item of value) {
    const market = String(item ?? "").trim().toUpperCase();
    if (market) set.add(market);
  }
  return set.size > 0 ? [...set] : [...fallback];
}

function parseLegacyFusionWeightsV2(
  value: unknown,
  fallback: DaaSystemConfigV2["dataSources"]["newsFeed"]["fusionWeights"],
): DaaSystemConfigV2["dataSources"]["newsFeed"]["fusionWeights"] {
  if (!isRecordV1(value)) return { ...fallback };
  return {
    human: toFiniteNumber(value.human, fallback.human),
    news: toFiniteNumber(value.news, fallback.news),
    technical: toFiniteNumber(value.technical, fallback.technical),
  };
}

function parseLegacyFundRowsV2(
  value: unknown,
  fallback: DaaSystemConfigV2["dataSources"]["hfFund"]["funds"],
): DaaSystemConfigV2["dataSources"]["hfFund"]["funds"] {
  if (!Array.isArray(value)) return [...fallback];
  const out = new Map<string, DaaSystemConfigV2["dataSources"]["hfFund"]["funds"][number]>();
  for (const raw of value) {
    if (!isRecordV1(raw)) continue;
    const fundCode = normalizeText(raw.fundCode);
    if (!fundCode) continue;
    const kindRaw = normalizeText(raw.kind, "equity").toLowerCase();
    const kind: DaaSystemConfigV2["dataSources"]["hfFund"]["funds"][number]["kind"] = (
      kindRaw === "qdii" || kindRaw === "balanced" ? kindRaw : "equity"
    );
    out.set(fundCode, {
      fundCode,
      label: normalizeText(raw.label, `基金 ${fundCode}`),
      kind,
      enabled: raw.enabled !== false,
    });
  }
  return out.size > 0 ? [...out.values()] : [...fallback];
}

function parseLegacyFxPairsV2(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const set = new Set<string>();
  for (const item of value) {
    const pair = String(item ?? "").trim().toUpperCase().replace(/-/g, "/");
    if (!/^[A-Z]{3}\/[A-Z]{3}$/.test(pair)) continue;
    const [base, quote] = pair.split("/");
    set.add(`${normalizeCurrencyAliasV2(base)}/${normalizeCurrencyAliasV2(quote)}`);
  }
  return set.size > 0 ? [...set] : [...fallback];
}

function parseLegacyHfFundConfigV2(source?: LegacyDataSourceSnapshotV2): DaaSystemConfigV2["dataSources"]["hfFund"] {
  const defaults = DEFAULT_SYSTEM_CONFIG_V2.dataSources.hfFund;
  const config = source?.configJson ?? {};
  return {
    ...defaults,
    id: normalizeText(source?.id, defaults.id),
    enabled: source?.enabled !== false,
    funds: parseLegacyFundRowsV2(config.funds, defaults.funds),
    marketScope: parseLegacyMarketScopeListV2(config.marketScope, defaults.marketScope),
  };
}

function parseLegacyPriceFeedConfigV2(source?: LegacyDataSourceSnapshotV2): DaaSystemConfigV2["dataSources"]["priceFeed"] {
  const defaults = DEFAULT_SYSTEM_CONFIG_V2.dataSources.priceFeed;
  const config = source?.configJson ?? {};
  return {
    ...defaults,
    id: normalizeText(source?.id, defaults.id),
    enabled: source?.enabled !== false,
    provider: normalizeText(config.provider, defaults.provider),
    intervalMinutes: Math.max(1, Math.trunc(toFiniteNumber(config.intervalMinutes, defaults.intervalMinutes))),
    symbols: parseLegacySymbolListV2(config.symbols, defaults.symbols),
  };
}

function parseLegacyNewsFeedConfigV2(source?: LegacyDataSourceSnapshotV2): DaaSystemConfigV2["dataSources"]["newsFeed"] {
  const defaults = DEFAULT_SYSTEM_CONFIG_V2.dataSources.newsFeed;
  const config = source?.configJson ?? {};
  return {
    ...defaults,
    id: normalizeText(source?.id, defaults.id),
    enabled: source?.enabled !== false,
    provider: normalizeText(config.provider, defaults.provider),
    query: normalizeText(config.query, defaults.query),
    symbols: parseLegacySymbolListV2(config.symbols, defaults.symbols),
    fusionWeights: parseLegacyFusionWeightsV2(config.fusionWeights, defaults.fusionWeights),
  };
}

function parseLegacyFxFeedConfigV2(source?: LegacyDataSourceSnapshotV2): DaaSystemConfigV2["dataSources"]["fxFeed"] {
  const defaults = DEFAULT_SYSTEM_CONFIG_V2.dataSources.fxFeed;
  const config = source?.configJson ?? {};
  return {
    ...defaults,
    id: normalizeText(source?.id, defaults.id),
    enabled: source?.enabled !== false,
    provider: normalizeText(config.provider, defaults.provider),
    baseCurrency: normalizeBaseCurrencyCodeV2(config.baseCurrency, defaults.baseCurrency),
    pairs: parseLegacyFxPairsV2(config.pairs, defaults.pairs),
  };
}

function parseLegacyLlmConfigV2(source?: LegacyDataSourceSnapshotV2): DaaSystemConfigV2["dataSources"]["llmAnalysis"] {
  const defaults = DEFAULT_SYSTEM_CONFIG_V2.dataSources.llmAnalysis;
  const config = source?.configJson ?? {};
  return {
    ...defaults,
    id: normalizeText(source?.id, defaults.id),
    enabled: source?.enabled === true,
    provider: normalizeText(config.provider, defaults.provider),
    model: normalizeText(config.model, defaults.model),
    timeoutMs: Math.max(2000, Math.trunc(toFiniteNumber(config.timeoutMs, defaults.timeoutMs))),
    enabledInDecision: config.enabledInDecision === true,
  };
}

async function readLegacySystemConfigInTxV2(
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>,
): Promise<DaaSystemConfigV2> {
  const strategyRes = await query("SELECT config_json FROM daa_strategy_config WHERE id = 'default' LIMIT 1");
  const notificationRes = await query(
    "SELECT enabled, notify_on_drift, notify_on_rebalance, notify_on_price_alert FROM daa_notification_config WHERE id = 'default' LIMIT 1",
  );
  const dataSourceRes = await query("SELECT id, kind, config_json, enabled FROM daa_data_sources ORDER BY kind ASC, id ASC");

  const strategyJson = parseJsonb<Record<string, unknown>>(strategyRes.rows[0]?.config_json, DEFAULT_SYSTEM_CONFIG_V2.strategy as Record<string, unknown>);
  const notificationRow = notificationRes.rows[0];
  const dataSourceRows = dataSourceRes.rows || [];
  const dataSourceMap = parseLegacyDataSourceMapV2(dataSourceRows);

  const hfSource = dataSourceMap.get("hf_fund");
  const priceSource = dataSourceMap.get("price_feed");
  const newsSource = dataSourceMap.get("news_feed");
  const fxSource = dataSourceMap.get("fx_feed");
  const llmSource = dataSourceMap.get("llm_analysis");

  const merged: Record<string, unknown> = {
    ...DEFAULT_SYSTEM_CONFIG_V2,
    strategy: strategyJson,
    notification: {
      enabled: Boolean(notificationRow?.enabled),
      notifyOnDrift: notificationRow?.notify_on_drift !== false,
      notifyOnRebalance: notificationRow?.notify_on_rebalance !== false,
      notifyOnPriceAlert: Boolean(notificationRow?.notify_on_price_alert),
    },
    dataSources: {
      ...DEFAULT_SYSTEM_CONFIG_V2.dataSources,
      hfFund: parseLegacyHfFundConfigV2(hfSource),
      priceFeed: parseLegacyPriceFeedConfigV2(priceSource),
      newsFeed: parseLegacyNewsFeedConfigV2(newsSource),
      fxFeed: parseLegacyFxFeedConfigV2(fxSource),
      llmAnalysis: parseLegacyLlmConfigV2(llmSource),
    },
    backtest: {
      benchmarkSymbol: DEFAULT_SYSTEM_CONFIG_V2.backtest.benchmarkSymbol,
    },
  };

  return normalizeSystemConfigV2(merged);
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

  const migrated = await readLegacySystemConfigInTxV2(query);
  const result = await query(
    "INSERT INTO daa_system_config_v2 (id, version, config_json, updated_at) VALUES ('default', 1, $1::jsonb, NOW()) RETURNING id, version, config_json, updated_at",
    [JSON.stringify(migrated)],
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

          CREATE TABLE IF NOT EXISTS daa_hf_ingest_state (
            id TEXT PRIMARY KEY,
            last_ingest_at TIMESTAMPTZ,
            ingest_count BIGINT NOT NULL DEFAULT 0,
            latest_batch_json JSONB,
            latest_actors_json JSONB NOT NULL DEFAULT '[]'::jsonb,
            latest_holdings_json JSONB NOT NULL DEFAULT '[]'::jsonb,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE TABLE IF NOT EXISTS daa_watchlist_candidates (
            id TEXT PRIMARY KEY,
            symbol TEXT NOT NULL,
            market TEXT NOT NULL DEFAULT 'US',
            currency TEXT NOT NULL DEFAULT 'USD',
            enabled BOOLEAN NOT NULL DEFAULT TRUE,
            target_weight_hint NUMERIC NOT NULL DEFAULT 0,
            tags TEXT[] NOT NULL DEFAULT '{}',
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE UNIQUE INDEX IF NOT EXISTS idx_daa_watchlist_candidates_symbol_market
            ON daa_watchlist_candidates(symbol, market);

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
  return {
    id: normalizeText(row.id),
    symbol: normalizeText(row.symbol).toUpperCase(),
    market: normalizeText(row.market, "US").toUpperCase(),
    currency: normalizeText(row.currency, "USD").toUpperCase(),
    qty: toFiniteNumber(row.qty),
    price: toFiniteNumber(row.price),
    costBasis: row.cost_basis == null ? null : toFiniteNumber(row.cost_basis),
    tags: Array.isArray(row.tags) ? row.tags.map((x) => String(x)).filter(Boolean) : [],
    updatedAt: toIsoString(row.updated_at),
  };
}

export async function listDaaPositionsV1(): Promise<DaaStorePositionV1[]> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const result = await query(
      "SELECT id, symbol, market, currency, qty, price, cost_basis, tags, updated_at FROM daa_positions ORDER BY symbol ASC",
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

        await query(
          "INSERT INTO daa_positions (id, symbol, market, currency, qty, price, cost_basis, tags, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())",
          [id, symbol, market, currency, qty, price, costBasis, tags],
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
      "SELECT id, symbol, market, currency, qty, price, cost_basis, tags, updated_at FROM daa_positions ORDER BY symbol ASC",
    );
    return result.rows.map((row) => mapPositionRowV1(row as Record<string, unknown>));
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

  // 同步写回 legacy 表，确保历史 SQL 兼容逻辑可读取到账户现金变更。
  await query(
    "INSERT INTO daa_strategy_config (id, config_json, updated_at) VALUES ('default', $1, NOW()) ON CONFLICT (id) DO UPDATE SET config_json = EXCLUDED.config_json, updated_at = NOW()",
    [JSON.stringify(patched.configJson)],
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
  const system = await getDaaSystemConfigV2();
  const all = buildLegacyDataSourcesFromSystemConfigV2(system.config);
  const normalizedKind = normalizeText(kind);
  if (!normalizedKind) return all;
  return all.filter((row) => row.kind === normalizedKind);
}

export async function replaceDaaDataSourcesV1(rows: DaaStoreDataSourceV1[]): Promise<DaaStoreDataSourceV1[]> {
  const current = await getDaaSystemConfigV2();
  const next = normalizeSystemConfigV2(current.config);

  for (const raw of rows) {
    const kind = normalizeText(raw.kind);
    const configJson = parseJsonb<Record<string, unknown>>(raw.configJson, {});
    if (kind === "hf_fund") {
      next.dataSources.hfFund.id = normalizeText(raw.id, next.dataSources.hfFund.id);
      next.dataSources.hfFund.enabled = Boolean(raw.enabled);
      if (Array.isArray(configJson.funds)) next.dataSources.hfFund.funds = configJson.funds as any[];
      if (Array.isArray(configJson.marketScope)) next.dataSources.hfFund.marketScope = configJson.marketScope as string[];
      continue;
    }
    if (kind === "price_feed") {
      next.dataSources.priceFeed.id = normalizeText(raw.id, next.dataSources.priceFeed.id);
      next.dataSources.priceFeed.enabled = Boolean(raw.enabled);
      next.dataSources.priceFeed.provider = normalizeText(configJson.provider, next.dataSources.priceFeed.provider);
      if (configJson.intervalMinutes != null) next.dataSources.priceFeed.intervalMinutes = Math.max(1, Math.trunc(toFiniteNumber(configJson.intervalMinutes, next.dataSources.priceFeed.intervalMinutes)));
      if (Array.isArray(configJson.symbols)) next.dataSources.priceFeed.symbols = configJson.symbols as string[];
      continue;
    }
    if (kind === "news_feed") {
      next.dataSources.newsFeed.id = normalizeText(raw.id, next.dataSources.newsFeed.id);
      next.dataSources.newsFeed.enabled = Boolean(raw.enabled);
      next.dataSources.newsFeed.provider = normalizeText(configJson.provider, next.dataSources.newsFeed.provider);
      next.dataSources.newsFeed.query = normalizeText(configJson.query, "");
      if (Array.isArray(configJson.symbols)) next.dataSources.newsFeed.symbols = configJson.symbols as string[];
      if (isRecordV1(configJson.fusionWeights)) next.dataSources.newsFeed.fusionWeights = configJson.fusionWeights as any;
      continue;
    }
    if (kind === "fx_feed") {
      next.dataSources.fxFeed.id = normalizeText(raw.id, next.dataSources.fxFeed.id);
      next.dataSources.fxFeed.enabled = Boolean(raw.enabled);
      next.dataSources.fxFeed.provider = normalizeText(configJson.provider, next.dataSources.fxFeed.provider);
      next.dataSources.fxFeed.baseCurrency = normalizeCurrencyAliasV2(configJson.baseCurrency, next.dataSources.fxFeed.baseCurrency) as any;
      if (Array.isArray(configJson.pairs)) next.dataSources.fxFeed.pairs = configJson.pairs as string[];
      continue;
    }
    if (kind === "llm_analysis") {
      next.dataSources.llmAnalysis.id = normalizeText(raw.id, next.dataSources.llmAnalysis.id);
      next.dataSources.llmAnalysis.enabled = Boolean(raw.enabled);
      next.dataSources.llmAnalysis.provider = normalizeText(configJson.provider, next.dataSources.llmAnalysis.provider);
      next.dataSources.llmAnalysis.model = normalizeText(configJson.model, next.dataSources.llmAnalysis.model);
      if (configJson.timeoutMs != null) next.dataSources.llmAnalysis.timeoutMs = Math.max(2000, Math.trunc(toFiniteNumber(configJson.timeoutMs, next.dataSources.llmAnalysis.timeoutMs)));
      if (configJson.enabledInDecision != null) next.dataSources.llmAnalysis.enabledInDecision = Boolean(configJson.enabledInDecision);
    }
  }

  const saved = await saveDaaSystemConfigV2({ config: next, baseVersion: current.version });
  return buildLegacyDataSourcesFromSystemConfigV2(saved.config);
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

function mapWatchlistCandidateRowV1(row: Record<string, unknown>): DaaStoreWatchlistCandidateV1 {
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

export async function listDaaWatchlistCandidatesV1(): Promise<DaaStoreWatchlistCandidateV1[]> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const result = await query(
      "SELECT id, symbol, market, currency, enabled, target_weight_hint, tags, notes, created_at, updated_at FROM daa_watchlist_candidates ORDER BY symbol ASC, market ASC",
    );
    return result.rows.map((row) => mapWatchlistCandidateRowV1(row as Record<string, unknown>));
  });
}

export async function replaceDaaWatchlistCandidatesV1(
  rows: Array<Partial<DaaStoreWatchlistCandidateV1>>,
): Promise<DaaStoreWatchlistCandidateV1[]> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    await query("BEGIN");
    try {
      await query("DELETE FROM daa_watchlist_candidates");
      for (const raw of rows) {
        const symbol = normalizeText(raw.symbol).toUpperCase();
        if (!symbol) continue;
        const market = normalizeText(raw.market, "US").toUpperCase();
        const currency = normalizeText(raw.currency, "USD").toUpperCase();
        const id = normalizeText(raw.id, `${symbol}__${market}`);
        const enabled = raw.enabled !== false;
        const targetWeightHint = Math.max(0, toFiniteNumber(raw.targetWeightHint));
        const tags = Array.isArray(raw.tags) ? raw.tags.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean) : [];
        const notes = normalizeText(raw.notes || "");

        await query(
          "INSERT INTO daa_watchlist_candidates (id, symbol, market, currency, enabled, target_weight_hint, tags, notes, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())",
          [id, symbol, market, currency, enabled, targetWeightHint, tags, notes || null],
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
      "SELECT id, symbol, market, currency, enabled, target_weight_hint, tags, notes, created_at, updated_at FROM daa_watchlist_candidates ORDER BY symbol ASC, market ASC",
    );
    return result.rows.map((row) => mapWatchlistCandidateRowV1(row as Record<string, unknown>));
  });
}

function normalizeCcyCode(value: unknown, fallback = "USD"): string {
  return normalizeCurrencyAliasV2(value, fallback);
}

function normalizeFxPair(baseCcy: string, quoteCcy: string): string {
  return `${normalizeCcyCode(baseCcy)}/${normalizeCcyCode(quoteCcy)}`;
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

      const holdingsRes = await query("SELECT COALESCE(SUM(qty * price), 0) AS holdings_value FROM daa_positions");
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

const EXECUTION_ORDER_STATUSES_V1 = ["pending", "submitted", "partial", "executed", "canceled", "skipped"] as const;
const DECISION_STATUSES_V1 = ["pending", "partial", "executed", "canceled", "skipped"] as const;
const EXECUTION_EVENT_TYPES_V1 = ["submit", "cancel", "skip", "fill"] as const;

function normalizeExecutionOrderStatusV1(
  value: unknown,
  fallback: DaaStoreExecutionOrderV1["status"],
): DaaStoreExecutionOrderV1["status"] {
  const normalized = normalizeText(value, fallback).toLowerCase();
  return (EXECUTION_ORDER_STATUSES_V1 as readonly string[]).includes(normalized)
    ? (normalized as DaaStoreExecutionOrderV1["status"])
    : fallback;
}

function normalizeDecisionStatusV1(
  value: unknown,
  fallback: DaaStoreRebalanceDecisionV1["status"],
): DaaStoreRebalanceDecisionV1["status"] {
  const normalized = normalizeText(value, fallback).toLowerCase();
  return (DECISION_STATUSES_V1 as readonly string[]).includes(normalized)
    ? (normalized as DaaStoreRebalanceDecisionV1["status"])
    : fallback;
}

function canTransitExecutionOrderStatusV1(
  from: DaaStoreExecutionOrderV1["status"],
  to: DaaStoreExecutionOrderV1["status"],
): boolean {
  if (from === to) return true;
  const transitions: Record<DaaStoreExecutionOrderV1["status"], DaaStoreExecutionOrderV1["status"][]> = {
    pending: ["submitted", "partial", "executed", "canceled", "skipped"],
    submitted: ["partial", "executed", "canceled"],
    partial: ["partial", "executed", "canceled"],
    executed: [],
    canceled: [],
    skipped: [],
  };
  return transitions[from].includes(to);
}

function deriveDecisionStatusFromOrdersV1(allStatuses: DaaStoreExecutionOrderV1["status"][]): DaaStoreRebalanceDecisionV1["status"] {
  if (!allStatuses.length) return "pending";

  const allSkipped = allStatuses.every((status) => status === "skipped");
  if (allSkipped) return "skipped";

  const allCanceledLike = allStatuses.every((status) => status === "canceled" || status === "skipped");
  if (allCanceledLike) return "canceled";

  const allFinalized = allStatuses.every((status) => status === "executed" || status === "canceled" || status === "skipped");
  if (allFinalized) return "executed";

  const hasAnyDone = allStatuses.some(
    (status) => status === "partial" || status === "executed" || status === "canceled" || status === "skipped",
  );
  if (hasAnyDone) return "partial";

  return "pending";
}

function normalizeExecutionEventTypeV1(value: unknown): DaaExecutionEventInputV1["type"] | null {
  const normalized = normalizeText(value).toLowerCase();
  return (EXECUTION_EVENT_TYPES_V1 as readonly string[]).includes(normalized)
    ? (normalized as DaaExecutionEventInputV1["type"])
    : null;
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

function mapExecutionOrderRowV1(row: Record<string, unknown>): DaaStoreExecutionOrderV1 {
  return {
    orderId: normalizeText(row.order_id),
    decisionId: normalizeText(row.decision_id),
    symbol: normalizeText(row.symbol).toUpperCase(),
    side: normalizeText(row.side, "BUY") as DaaStoreExecutionOrderV1["side"],
    suggestedNotional: toFiniteNumber(row.suggested_notional),
    status: normalizeExecutionOrderStatusV1(row.status, "pending"),
    executedQty: toFiniteNumber(row.executed_qty),
    executedPrice: toFiniteNumber(row.executed_price),
    fee: toFiniteNumber(row.fee),
    bookedQty: Math.max(0, toFiniteNumber(row.booked_qty)),
    bookedNotional: Math.max(0, toFiniteNumber(row.booked_notional)),
    bookedFee: Math.max(0, toFiniteNumber(row.booked_fee)),
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

      const schemaVersion = Number((input.responseJson as any)?.schemaVersion || 0);
      if (schemaVersion !== 2) {
        throw new Error("responseJson must be UnifiedDecisionResultV2");
      }
      const executableOrdersRaw = Array.isArray((input.responseJson as any)?.plan?.executableOrders)
        ? (input.responseJson as any).plan.executableOrders
        : [];

      for (const orderRaw of executableOrdersRaw) {
        const symbol = normalizeText(orderRaw?.symbol).toUpperCase();
        const side = normalizeText(orderRaw?.side).toUpperCase();
        const notional = Math.max(0, toFiniteNumber(orderRaw?.notional));
        if (!symbol || (side !== "BUY" && side !== "SELL") || notional <= 0) continue;

        await query(
          "INSERT INTO daa_execution_orders (order_id, decision_id, symbol, side, suggested_notional, status, executed_qty, executed_price, fee, booked_qty, booked_notional, booked_fee, booked_at, notes, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,0,0,0,0,0,0,NULL,NULL,NOW(),NOW())",
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
      "SELECT order_id, decision_id, symbol, side, suggested_notional, status, executed_qty, executed_price, fee, booked_qty, booked_notional, booked_fee, notes, updated_at, booked_at FROM daa_execution_orders WHERE decision_id = $1 ORDER BY created_at ASC",
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
    const orderWhere = ids.map((_, idx) => `$${idx + 1}`).join(", ");
    const oRes = await query(
      `SELECT order_id, decision_id, symbol, side, suggested_notional, status, executed_qty, executed_price, fee, booked_qty, booked_notional, booked_fee, notes, updated_at, booked_at FROM daa_execution_orders WHERE decision_id IN (${orderWhere}) ORDER BY created_at ASC`,
      ids,
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

export async function applyDaaExecutionEventsV1(input: DaaExecutionApplyEventsInputV1): Promise<{
  decision: DaaStoreRebalanceDecisionV1;
  orders: DaaStoreExecutionOrderV1[];
  positions: DaaStorePositionV1[];
  account: {
    baseCurrency: string;
    cash: number;
    investableCash: number;
    frozenCash: number;
    totalEquity: number | null;
  };
  equitySnapshot: DaaStoreEquitySnapshotV1;
  applied: Array<{
    orderId: string;
    type: DaaExecutionEventInputV1["type"];
    fromStatus: DaaStoreExecutionOrderV1["status"];
    toStatus: DaaStoreExecutionOrderV1["status"];
    fillQty: number;
    fillNotional: number;
  }>;
}> {
  await ensureDaaStoreSchemaPgV1();

  return withDaaPgClientV0(async ({ query }) => {
    const decisionId = normalizeText(input.decisionId);
    if (!decisionId) throw new Error("decisionId required");

    const events = Array.isArray(input.events) ? input.events : [];
    if (!events.length) throw new Error("events required");

    await query("BEGIN");
    try {
      const decisionRes = await query(
        "SELECT id, request_json, response_json, should_rebalance, trigger_source, status, created_at FROM daa_rebalance_decisions WHERE id = $1 LIMIT 1 FOR UPDATE",
        [decisionId],
      );
      if (!decisionRes.rows.length) throw new Error("decision not found");

      const orderRows = await query(
        "SELECT order_id, decision_id, symbol, side, suggested_notional, status, executed_qty, executed_price, fee, booked_qty, booked_notional, booked_fee, notes, updated_at, booked_at FROM daa_execution_orders WHERE decision_id = $1 FOR UPDATE",
        [decisionId],
      );
      const orderMap = new Map<string, DaaStoreExecutionOrderV1>();
      for (const row of orderRows.rows as Array<Record<string, unknown>>) {
        const order = mapExecutionOrderRowV1(row);
        orderMap.set(order.orderId, order);
      }

      const positionsRes = await query(
        "SELECT id, symbol, market, currency, qty, price, cost_basis, tags, updated_at FROM daa_positions",
      );
      const positionsMap = new Map<string, DaaStorePositionV1>();
      for (const row of positionsRes.rows as Array<Record<string, unknown>>) {
        const position = mapPositionRowV1(row);
        positionsMap.set(position.symbol, position);
      }

      const strategyRes = await query(
        "SELECT config_json FROM daa_strategy_config WHERE id = 'default' LIMIT 1 FOR UPDATE",
      );
      const currentConfig = parseJsonb<Record<string, unknown>>(strategyRes.rows[0]?.config_json, { ...DEFAULT_STRATEGY_CONFIG_V1 });
      const accountRaw = isRecordV1(currentConfig.account) ? currentConfig.account : {};
      let accountCash = Math.max(0, toFiniteNumber(accountRaw.cash, 0));

      const applied: Array<{
        orderId: string;
        type: DaaExecutionEventInputV1["type"];
        fromStatus: DaaStoreExecutionOrderV1["status"];
        toStatus: DaaStoreExecutionOrderV1["status"];
        fillQty: number;
        fillNotional: number;
      }> = [];

      for (const rawEvent of events) {
        const eventType = normalizeExecutionEventTypeV1(rawEvent?.type);
        if (!eventType) throw new Error(`invalid execution event type: ${String(rawEvent?.type ?? "")}`);

        const orderId = normalizeText(rawEvent?.orderId);
        const order = orderMap.get(orderId);
        if (!order) throw new Error(`order not found in decision: ${orderId}`);

        const fromStatus = normalizeExecutionOrderStatusV1(order.status, "pending");
        let toStatus = fromStatus;
        let fillQty = 0;
        let fillNotional = 0;
        const note = normalizeText(rawEvent?.note, "");
        const nextNotes = note || order.notes || "";

        if (eventType === "submit") {
          if (fromStatus === "pending") toStatus = "submitted";
          else toStatus = fromStatus;
        } else if (eventType === "cancel") {
          if (fromStatus === "pending" || fromStatus === "submitted" || fromStatus === "partial") {
            toStatus = "canceled";
          } else {
            toStatus = fromStatus;
          }
        } else if (eventType === "skip") {
          if (fromStatus === "pending" || fromStatus === "submitted") {
            toStatus = "skipped";
          } else {
            toStatus = fromStatus;
          }
        } else {
          const qty = Math.max(0, toFiniteNumber(rawEvent?.fillQty, 0));
          const price = Math.max(0, toFiniteNumber(rawEvent?.fillPrice, 0));
          const fee = Math.max(0, toFiniteNumber(rawEvent?.fee, 0));
          const final = Boolean(rawEvent?.final);
          const fillTs = toIsoString(rawEvent?.ts, new Date().toISOString());
          if (!(qty > 0)) throw new Error(`fillQty must be > 0 for order ${order.symbol}`);
          if (!(price > 0)) throw new Error(`fillPrice must be > 0 for order ${order.symbol}`);

          const notional = qty * price;
          const existingPosition = positionsMap.get(order.symbol) ?? {
            id: order.symbol,
            symbol: order.symbol,
            market: "US",
            currency: "USD",
            qty: 0,
            price,
            costBasis: price,
            tags: [],
            updatedAt: new Date().toISOString(),
          };

          if (order.side === "BUY") {
            const cashOut = notional + fee;
            if (accountCash + 1e-9 < cashOut) {
              throw new Error(`insufficient cash for BUY ${order.symbol}: need ${cashOut.toFixed(2)}, have ${accountCash.toFixed(2)}`);
            }
            accountCash = Math.max(0, accountCash - cashOut);
            const prevQty = Math.max(0, existingPosition.qty);
            const nextQty = prevQty + qty;
            const prevCostBasis = Math.max(0, toFiniteNumber(existingPosition.costBasis, 0));
            const nextCostBasis = nextQty > 0
              ? ((prevQty * prevCostBasis) + (qty * price)) / nextQty
              : price;

            positionsMap.set(order.symbol, {
              ...existingPosition,
              qty: nextQty,
              price,
              costBasis: nextCostBasis,
              updatedAt: new Date().toISOString(),
            });
          } else {
            const prevQty = Math.max(0, existingPosition.qty);
            if (qty > prevQty + 1e-9) {
              throw new Error(`SELL qty exceeds holdings for ${order.symbol}: ${qty.toFixed(8)} > ${prevQty.toFixed(8)}`);
            }
            const cashIn = notional - fee;
            accountCash = Math.max(0, accountCash + cashIn);
            const nextQty = Math.max(0, prevQty - qty);
            if (nextQty <= 0) {
              positionsMap.delete(order.symbol);
            } else {
              positionsMap.set(order.symbol, {
                ...existingPosition,
                qty: nextQty,
                price,
                updatedAt: new Date().toISOString(),
              });
            }
          }

          await query(
            "INSERT INTO daa_trade_journal (id, symbol, side, qty, price, notional, fee, executed_at, source, rebalance_decision_id, execution_order_id, notes, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'exchange_fill',$9,$10,$11,NOW())",
            [randomUUID(), order.symbol, order.side, qty, price, notional, fee, fillTs, decisionId, orderId, nextNotes || null],
          );

          const nextBookedQty = Math.max(0, toFiniteNumber(order.bookedQty, 0)) + qty;
          const nextBookedNotional = Math.max(0, toFiniteNumber(order.bookedNotional, 0)) + notional;
          const nextBookedFee = Math.max(0, toFiniteNumber(order.bookedFee, 0)) + fee;
          const nextAvgPrice = nextBookedQty > 0 ? nextBookedNotional / nextBookedQty : 0;

          order.bookedQty = nextBookedQty;
          order.bookedNotional = nextBookedNotional;
          order.bookedFee = nextBookedFee;
          order.executedQty = nextBookedQty;
          order.executedPrice = nextAvgPrice;
          order.fee = nextBookedFee;
          order.bookedAt = order.bookedAt || fillTs;

          const autoDone = nextBookedNotional + 1e-6 >= Math.max(0, toFiniteNumber(order.suggestedNotional, 0));
          if (final || autoDone) {
            toStatus = "executed";
          } else {
            toStatus = "partial";
          }

          fillQty = qty;
          fillNotional = notional;
        }

        if (!canTransitExecutionOrderStatusV1(fromStatus, toStatus)) {
          throw new Error(`invalid order status transition: ${order.symbol} ${fromStatus} -> ${toStatus}`);
        }

        await query(
          "UPDATE daa_execution_orders SET status = $1, executed_qty = $2, executed_price = $3, fee = $4, booked_qty = $5, booked_notional = $6, booked_fee = $7, booked_at = $8, notes = $9, updated_at = NOW() WHERE order_id = $10",
          [
            toStatus,
            Math.max(0, toFiniteNumber(order.executedQty, 0)),
            Math.max(0, toFiniteNumber(order.executedPrice, 0)),
            Math.max(0, toFiniteNumber(order.fee, 0)),
            Math.max(0, toFiniteNumber(order.bookedQty, 0)),
            Math.max(0, toFiniteNumber(order.bookedNotional, 0)),
            Math.max(0, toFiniteNumber(order.bookedFee, 0)),
            order.bookedAt ?? null,
            nextNotes || null,
            orderId,
          ],
        );

        const payloadJson: Record<string, unknown> = {
          fromStatus,
          toStatus,
          fillQty,
          fillNotional,
          note: note || null,
        };
        if (eventType === "fill") {
          payloadJson.fillPrice = Math.max(0, toFiniteNumber(rawEvent?.fillPrice, 0));
          payloadJson.fee = Math.max(0, toFiniteNumber(rawEvent?.fee, 0));
          payloadJson.ts = toIsoString(rawEvent?.ts, new Date().toISOString());
          payloadJson.final = Boolean(rawEvent?.final);
        }

        await query(
          "INSERT INTO daa_execution_order_events (id, decision_id, order_id, event_type, payload_json, created_at) VALUES ($1,$2,$3,$4,$5,NOW())",
          [randomUUID(), decisionId, orderId, eventType, JSON.stringify(payloadJson)],
        );

        order.status = toStatus;
        order.notes = nextNotes || null;
        order.updatedAt = new Date().toISOString();
        orderMap.set(orderId, order);

        applied.push({
          orderId,
          type: eventType,
          fromStatus,
          toStatus,
          fillQty,
          fillNotional,
        });
      }

      await query("DELETE FROM daa_positions");
      for (const position of positionsMap.values()) {
        if (position.qty <= 0) continue;
        await query(
          "INSERT INTO daa_positions (id, symbol, market, currency, qty, price, cost_basis, tags, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())",
          [
            position.id,
            position.symbol,
            position.market,
            position.currency,
            position.qty,
            position.price,
            position.costBasis,
            position.tags,
          ],
        );
      }

      const allStatuses = [...orderMap.values()].map((order) => normalizeExecutionOrderStatusV1(order.status, "pending"));
      const decisionStatus = deriveDecisionStatusFromOrdersV1(allStatuses);
      await query("UPDATE daa_rebalance_decisions SET status = $1 WHERE id = $2", [decisionStatus, decisionId]);

      const account = await syncStrategyAccountCashInTxV1(query as DaaTxQueryFnV1, accountCash);
      const holdingsValue = [...positionsMap.values()].reduce((sum, p) => sum + Math.max(0, p.qty * p.price), 0);
      const totalEquity = holdingsValue + account.cash;
      const snapshotTs = new Date().toISOString();
      await query(
        "INSERT INTO daa_equity_snapshots (ts, total_equity, holdings_value, cash, source) VALUES ($1,$2,$3,$4,$5)",
        [snapshotTs, totalEquity, holdingsValue, account.cash, "execution_event"],
      );

      await query(
        "INSERT INTO daa_op_log (id, ts, level, message, context_json) VALUES ($1, NOW(), 'info', $2, $3)",
        [
          randomUUID(),
          `交易执行事件已应用：${applied.length} 条，现金 ${account.cash.toFixed(2)} ${account.baseCurrency}`,
          JSON.stringify({
            decisionId,
            appliedCount: applied.length,
            account,
            applied,
          }),
        ],
      );

      await query("COMMIT");

      const decisionLatestRes = await query(
        "SELECT id, request_json, response_json, should_rebalance, trigger_source, status, created_at FROM daa_rebalance_decisions WHERE id = $1 LIMIT 1",
        [decisionId],
      );
      const orderLatestRes = await query(
        "SELECT order_id, decision_id, symbol, side, suggested_notional, status, executed_qty, executed_price, fee, booked_qty, booked_notional, booked_fee, notes, updated_at, booked_at FROM daa_execution_orders WHERE decision_id = $1 ORDER BY created_at ASC",
        [decisionId],
      );
      const positionLatestRes = await query(
        "SELECT id, symbol, market, currency, qty, price, cost_basis, tags, updated_at FROM daa_positions ORDER BY symbol ASC",
      );

      return {
        decision: mapDecisionRowV1(decisionLatestRes.rows[0] as Record<string, unknown>),
        orders: orderLatestRes.rows.map((row) => mapExecutionOrderRowV1(row as Record<string, unknown>)),
        positions: positionLatestRes.rows.map((row) => mapPositionRowV1(row as Record<string, unknown>)),
        account,
        equitySnapshot: {
          ts: snapshotTs,
          totalEquity,
          holdingsValue,
          cash: account.cash,
          source: "execution_event",
        },
        applied,
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
