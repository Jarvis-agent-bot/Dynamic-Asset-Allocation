import { createHash, randomUUID } from "node:crypto";

import { daaPgPoolV0, withDaaPgClientV0 } from "@/src/daa/pg/daaPgV0";
import { resolveInvestableCashV1 as resolveRuntimeInvestableCashV1 } from "@/src/daa/account/resolveInvestableCashV1";
import { runDaaStoreRuntimeMigrationsV1 } from "@/src/daa/store/runtimeMigrationsV1";
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
import type {
  DaaMarketContextV1,
  DaaMarketIndicatorKeyV1,
  DaaMarketIndicatorSnapshotV1,
  DaaMarketRegimeV1,
} from "@/src/daa/modules/marketContext/marketContextTypesV1";
import { buildFxLookupToBaseV1, summarizeMarkToMarketPortfolioV1 } from "@/src/daa/modules/portfolio/portfolioValuationV1";
import type { ProposalDecisionContextV1 } from "@/src/daa/modules/workbench/workbenchTypesV1";

type DaaStoreStateV1 = {
  schemaInit: Promise<void> | null;
  runtimeMigrationInit: Promise<void> | null;
  marketCacheSchemaInit: Promise<void> | null;
};

const STORE_GLOBAL_KEY_V1 = "__daa_store_pg_state_v0__";

function getStoreStateV1(): DaaStoreStateV1 {
  const g = globalThis as any;
  if (!g[STORE_GLOBAL_KEY_V1]) {
    g[STORE_GLOBAL_KEY_V1] = { schemaInit: null, runtimeMigrationInit: null, marketCacheSchemaInit: null } satisfies DaaStoreStateV1;
  } else {
    if (!("runtimeMigrationInit" in g[STORE_GLOBAL_KEY_V1])) {
      g[STORE_GLOBAL_KEY_V1].runtimeMigrationInit = null;
    }
    if (!("marketCacheSchemaInit" in g[STORE_GLOBAL_KEY_V1])) {
      g[STORE_GLOBAL_KEY_V1].marketCacheSchemaInit = null;
    }
  }
  return g[STORE_GLOBAL_KEY_V1] as DaaStoreStateV1;
}

function toFiniteNumber(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toIsoString(v: unknown, fallback = "1970-01-01T00:00:00.000Z"): string {
  if (v instanceof Date) {
    const ms = v.getTime();
    return Number.isFinite(ms) ? new Date(ms).toISOString() : fallback;
  }
  if (typeof v === "number") {
    return Number.isFinite(v) ? new Date(v).toISOString() : fallback;
  }
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

function toBoolean(v: unknown, fallback = false): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const text = v.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(text)) return true;
    if (["0", "false", "no", "off"].includes(text)) return false;
  }
  return fallback;
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
        "cycle_id",
        "asset_key",
        "pricing_mode",
        "price_source",
        "price_snapshot_at",
      ],
      daa_cash_ledger: [
        "entry_kind",
        "account_base_currency",
        "amount_in_account_base",
        "fx_rate_to_account",
        "ticket_id",
        "cycle_id",
        "settlement_ts",
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

export type DaaStoreMarketPriceStatusV1 = "fresh" | "stale" | "missing" | "error" | "unsupported";
export type DaaStoreFxRateHistoryStatusV1 = "fresh" | "stale" | "missing" | "error";
export type DaaStoreIngestJobStatusV1 = "ok" | "partial" | "failed";

export type DaaStoreMarketPriceSnapshotV1 = {
  provider: string;
  market: string;
  symbol: string;
  normalizedSymbol: string;
  currency: string;
  price: number;
  status: DaaStoreMarketPriceStatusV1;
  priceUpdatedAt: string | null;
  source: string;
  errorCode: string | null;
  errorMessage: string | null;
  rawRefId: string | null;
  updatedAt: string;
};

export type DaaStoreMarketPriceHistoryV1 = {
  provider: string;
  market: string;
  symbol: string;
  ts: string;
  price: number;
  currency: string;
  source: string;
  rawRefId: string | null;
};

export type DaaStoreFxRateHistoryV1 = {
  provider: string;
  baseCcy: string;
  quoteCcy: string;
  asOfTs: string;
  rate: number;
  status: DaaStoreFxRateHistoryStatusV1;
  fetchedAt: string;
  errorCode: string | null;
  errorMessage: string | null;
  rawRefId: string | null;
};

export type DaaStoreNewsItemSnapshotV1 = {
  provider: string;
  symbol: string;
  itemHash: string;
  title: string;
  link: string | null;
  publishedAt: string | null;
  fetchedAt: string;
  sentimentScore: number;
  sourceCredibility: number;
  freshness: number;
  rawRefId: string | null;
};

export type DaaStoreNewsSignalSnapshotV1 = {
  provider: string;
  symbol: string;
  scorePct: number;
  confidencePct: number;
  evidenceCount: number;
  reasonsJson: string[];
  generatedAt: string;
  updatedAt: string;
};

export type DaaStoreMarketIndicatorSnapshotV1 = {
  id: string;
  key: DaaMarketIndicatorKeyV1;
  scope: string;
  subjectKey: string;
  stance: DaaMarketRegimeV1 | "neutral";
  riskOffScorePct: number;
  confidencePct: number;
  rawValue: number | null;
  unit: string | null;
  percentile252: number | null;
  zscore60: number | null;
  trend1dPct: number | null;
  trend7dPct: number | null;
  trend30dPct: number | null;
  source: string;
  reasonsJson: string[];
  componentsJson: Record<string, unknown>;
  generatedAt: string;
  expireAt: string | null;
  createdAt: string;
};

export type DaaStoreHfHoldingSnapshotV1 = {
  provider: string;
  fundCode: string;
  reportDate: string;
  symbol: string;
  market: string;
  weightPct: number;
  prevWeightPct: number;
  disclosedAt: string | null;
  confidencePct: number;
  sourceRef: string | null;
  fetchedAt: string;
  rawRefId: string | null;
};

export type DaaStoreHfSignalSnapshotV1 = {
  provider: string;
  symbol: string;
  aggregatedScorePct: number;
  convictionPct: number;
  thesisDriftPct: number;
  fundCount: number;
  fundsJson: Array<Record<string, unknown>>;
  generatedAt: string;
  updatedAt: string;
};

export type DaaStoreExternalPayloadRawV1 = {
  id: string;
  provider: string;
  resource: string;
  subjectKey: string;
  requestUrl: string;
  requestJson: Record<string, unknown>;
  responseStatus: number;
  responseHeadersJson: Record<string, unknown>;
  payloadJson: Record<string, unknown> | null;
  payloadText: string | null;
  fetchedAt: string;
  expireAt: string;
  createdAt: string;
};

export type DaaStoreIngestJobLogV1 = {
  jobId: string;
  jobType: string;
  triggerSource: string;
  status: DaaStoreIngestJobStatusV1;
  startedAt: string;
  finishedAt: string;
  totalCount: number;
  successCount: number;
  failureCount: number;
  diagnosticsJson: Record<string, unknown>;
};

export type DaaStoreCashLedgerSideV1 = "deposit" | "withdraw";
export type DaaStoreCashLedgerEntryKindV1 = "manual" | "trade_execution";

export type DaaStoreCashLedgerEntryV1 = {
  id: string;
  ts: string;
  side: DaaStoreCashLedgerSideV1;
  amount: number;
  baseCurrency: string;
  entryKind: DaaStoreCashLedgerEntryKindV1 | null;
  accountBaseCurrency: string | null;
  amountInAccountBase: number | null;
  fxRateToAccount: number | null;
  ticketId: string | null;
  cycleId: string | null;
  settlementTs: string | null;
  note: string | null;
  createdAt: string;
};

export type DaaStoreCashLedgerApplyInputV1 = {
  side: DaaStoreCashLedgerSideV1;
  amount: number;
  baseCurrency?: string;
  note?: string;
  entryKind?: DaaStoreCashLedgerEntryKindV1;
  accountBaseCurrency?: string;
  amountInAccountBase?: number;
  fxRateToAccount?: number;
  ticketId?: string | null;
  cycleId?: string | null;
  settlementTs?: string | null;
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
  cycleId: string | null;
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
  cycleId?: string | null;
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

export type DaaStoreRiskRuleV1 =
  | "max_position"
  | "max_order_pct"
  | "concentration"
  | "stop_loss_breach"
  | "total_weight";

export type DaaStorePreTradeRiskCheckItemV1 = {
  rule: DaaStoreRiskRuleV1;
  status: "pass" | "warn" | "block";
  current: number;
  limit: number;
  message: string;
};

export type DaaStorePreTradeRiskCheckV1 = {
  overallStatus: "pass" | "warn" | "block";
  items: DaaStorePreTradeRiskCheckItemV1[];
};

export type DaaStoreRebalanceCycleStatusV1 = "generated" | "reviewing" | "executing" | "completed" | "cancelled";
export type DaaStoreRebalanceTriggerSourceV1 = "calendar" | "drift" | "manual" | "risk" | "cash_idle";

export type DaaStoreRebalanceCycleV1 = {
  cycleId: string;
  status: DaaStoreRebalanceCycleStatusV1;
  triggerSource: DaaStoreRebalanceTriggerSourceV1;
  triggerReason: string;
  snapshotAt: string;
  equitySnapshot: number;
  driftSnapshot: Array<{
    assetKey: string;
    symbol: string;
    actualPct: number;
    targetPct: number;
    driftPct: number;
  }>;
  proposals: Array<{
    assetKey: string;
    symbol: string;
    currency: string;
    fxRateToBase: number | null;
    side: "BUY" | "SELL";
    suggestedQty: number;
    suggestedNotional: number;
    price: number;
    reason: string;
    selected: boolean;
    hfContribution: string | null;
    decisionContext?: ProposalDecisionContextV1 | null;
  }>;
  riskCheck: DaaStorePreTradeRiskCheckV1;
  executedAt: string | null;
  executedOrders: string[];
  executionSummary: {
    ordersExecuted: number;
    ordersFailed: number;
    totalNotional: number;
    newMaxDriftPct: number;
  } | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  notes: string | null;
  marketContext?: DaaMarketContextV1 | null;
  createdAt: string;
};

export type DaaStoreCycleReportV1 = {
  cycleId: string;
  triggerSource: DaaStoreRebalanceTriggerSourceV1;
  cycleStatus: DaaStoreRebalanceCycleStatusV1;
  cycleCreatedAt: string;
  reportCreatedAt: string;
  executionSummary: DaaStoreRebalanceCycleV1["executionSummary"];
  beforeSnapshot: {
    totalEquity: number;
    holdingsValue: number;
    cash: number;
    hhiPct: number;
    maxWeightPct: number;
    maxDriftPct: number;
    maxDrawdownPct: number;
  };
  afterSnapshot: {
    totalEquity: number;
    holdingsValue: number;
    cash: number;
    hhiPct: number;
    maxWeightPct: number;
    maxDriftPct: number;
    maxDrawdownPct: number;
  };
  executionStats: {
    ordersExecuted: number;
    ordersFailed: number;
    totalNotional: number;
    feeTotal: number;
  };
  pnlAttribution: {
    realizedPnl: number;
    unrealizedPnl: number;
    feeTotal: number;
    fxImpact: number;
    topContributors: Array<{
      symbol: string;
      pnl: number;
      side: "BUY" | "SELL" | "HOLD";
    }>;
  };
  riskDelta: {
    maxDrawdownBefore: number;
    maxDrawdownAfter: number;
    hhiBefore: number;
    hhiAfter: number;
    maxWeightBefore: number;
    maxWeightAfter: number;
    maxDriftBefore: number;
    maxDriftAfter: number;
  };
};

export type DaaStoreTriggerEventV1 = {
  eventId: string;
  idempotencyKey: string;
  triggerSource: DaaStoreRebalanceTriggerSourceV1;
  triggerReason: string;
  cycleId: string | null;
  status: "accepted" | "skipped" | "conflict";
  detailsJson: Record<string, unknown>;
  createdAt: string;
};

export type DaaStoreLlmFeedbackV1 = {
  id: string;
  contextId: string;
  type: "insight" | "decision";
  score: "up" | "down";
  comment: string | null;
  createdAt: string;
};

export type DaaStoreCreateRebalanceCycleInputV1 = {
  cycleId?: string;
  status?: DaaStoreRebalanceCycleStatusV1;
  triggerSource: DaaStoreRebalanceTriggerSourceV1;
  triggerReason: string;
  snapshotAt?: string;
  equitySnapshot: number;
  driftSnapshot: DaaStoreRebalanceCycleV1["driftSnapshot"];
  proposals: DaaStoreRebalanceCycleV1["proposals"];
  riskCheck: DaaStorePreTradeRiskCheckV1;
  notes?: string | null;
  marketContext?: DaaMarketContextV1 | null;
};

export type DaaStorePatchRebalanceCycleInputV1 = {
  cycleId: string;
  status?: DaaStoreRebalanceCycleStatusV1;
  triggerReason?: string;
  riskCheck?: DaaStorePreTradeRiskCheckV1;
  proposals?: DaaStoreRebalanceCycleV1["proposals"];
  executedAt?: string | null;
  executedOrders?: string[];
  executionSummary?: DaaStoreRebalanceCycleV1["executionSummary"];
  cancelledAt?: string | null;
  cancelReason?: string | null;
  notes?: string | null;
  marketContext?: DaaMarketContextV1 | null;
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

export type DaaStoreAccountStateV1 = {
  id: "default";
  baseCurrency: string;
  cash: number;
  investableCash: number;
  frozenCash: number;
  totalEquity: number | null;
  updatedAt: string;
};

function mapAccountStateRowV1(row: Record<string, unknown>): DaaStoreAccountStateV1 {
  const totalEquityRaw = row.total_equity == null ? Number.NaN : toFiniteNumber(row.total_equity, Number.NaN);
  return {
    id: "default",
    baseCurrency: normalizeCurrencyAliasV2(normalizeText(row.base_currency, "USD"), "USD"),
    cash: Math.max(0, toFiniteNumber(row.cash, 0)),
    investableCash: Math.max(0, toFiniteNumber(row.investable_cash, 0)),
    frozenCash: Math.max(0, toFiniteNumber(row.frozen_cash, 0)),
    totalEquity: Number.isFinite(totalEquityRaw) ? Math.max(0, totalEquityRaw) : null,
    updatedAt: toIsoString(row.updated_at),
  };
}

function mergeRuntimeAccountIntoSystemConfigV2(
  configRaw: DaaSystemConfigV2,
  account: Pick<DaaStoreAccountStateV1, "baseCurrency" | "cash" | "investableCash" | "frozenCash" | "totalEquity">,
): DaaSystemConfigV2 {
  const normalized = normalizeSystemConfigV2(configRaw);
  return {
    ...normalized,
    strategy: {
      ...normalized.strategy,
      account: {
        ...normalized.strategy.account,
        baseCurrency: normalizeCurrencyAliasV2(account.baseCurrency, normalized.strategy.account.baseCurrency) as DaaSystemConfigV2["strategy"]["account"]["baseCurrency"],
        cash: Math.max(0, toFiniteNumber(account.cash, 0)),
        investableCash: Math.max(0, toFiniteNumber(account.investableCash, 0)),
        frozenCash: Math.max(0, toFiniteNumber(account.frozenCash, 0)),
        totalEquity: account.totalEquity == null ? null : Math.max(0, toFiniteNumber(account.totalEquity, 0)),
      },
    },
  };
}

function mergeSystemConfigRowWithAccountStateV1(
  row: DaaStoreSystemConfigRowV2,
  account: DaaStoreAccountStateV1,
): DaaStoreSystemConfigRowV2 {
  return {
    ...row,
    config: mergeRuntimeAccountIntoSystemConfigV2(row.config, account),
  };
}

function stripRuntimeAccountFromConfigV2(configRaw: unknown): {
  sanitizedConfig: DaaSystemConfigV2;
  runtimeAccount: {
    baseCurrency: string;
    cash: unknown;
    investableCash: unknown;
    frozenCash: unknown;
    totalEquity: unknown;
  };
} {
  const normalized = normalizeSystemConfigV2(configRaw);
  const rootRaw = isRecordV1(configRaw) ? configRaw : {};
  const strategyRaw = isRecordV1(rootRaw.strategy) ? rootRaw.strategy : {};
  const accountRaw = isRecordV1(strategyRaw.account) ? strategyRaw.account : {};
  const runtimeAccount = {
    baseCurrency: normalizeCurrencyAliasV2(
      normalizeText(accountRaw.baseCurrency, normalized.strategy.account.baseCurrency),
      normalized.strategy.account.baseCurrency,
    ),
    cash: Object.prototype.hasOwnProperty.call(accountRaw, "cash") ? accountRaw.cash : normalized.strategy.account.cash,
    investableCash: Object.prototype.hasOwnProperty.call(accountRaw, "investableCash") ? accountRaw.investableCash : normalized.strategy.account.investableCash,
    frozenCash: Object.prototype.hasOwnProperty.call(accountRaw, "frozenCash") ? accountRaw.frozenCash : normalized.strategy.account.frozenCash,
    totalEquity: Object.prototype.hasOwnProperty.call(accountRaw, "totalEquity") ? accountRaw.totalEquity : normalized.strategy.account.totalEquity,
  };
  return {
    sanitizedConfig: {
      ...normalized,
      strategy: {
        ...normalized.strategy,
        account: {
          ...normalized.strategy.account,
          cash: 0,
          investableCash: 0,
          frozenCash: 0,
          totalEquity: null,
        },
      },
    },
    runtimeAccount,
  };
}

async function ensureAccountStateRowInTxV1(
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number }>,
): Promise<DaaStoreAccountStateV1> {
  await query(`
    CREATE TABLE IF NOT EXISTS daa_account_state (
      id TEXT PRIMARY KEY,
      base_currency TEXT NOT NULL DEFAULT 'USD',
      cash NUMERIC NOT NULL DEFAULT 0,
      investable_cash NUMERIC NOT NULL DEFAULT 0,
      frozen_cash NUMERIC NOT NULL DEFAULT 0,
      total_equity NUMERIC,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const existing = await query(
    "SELECT id, base_currency, cash, investable_cash, frozen_cash, total_equity, updated_at FROM daa_account_state WHERE id = 'default' LIMIT 1",
  );
  if (existing.rows.length > 0) {
    return mapAccountStateRowV1(existing.rows[0]);
  }

  const systemRow = await ensureSystemConfigRowInTxV2(query);
  const strategyRaw = (isRecordV1(systemRow.config.strategy) ? systemRow.config.strategy : {}) as Record<string, unknown>;
  const accountRaw = (isRecordV1(strategyRaw.account) ? strategyRaw.account : {}) as Record<string, unknown>;
  const baseCurrency = normalizeCurrencyAliasV2(normalizeText(accountRaw.baseCurrency, "USD"), "USD");
  const cash = Math.max(0, toFiniteNumber(accountRaw.cash, 0));
  const frozenCash = Math.max(0, toFiniteNumber(accountRaw.frozenCash, 0));
  const investableCash = resolveInvestableCashV1(cash, frozenCash, accountRaw.investableCash);
  const totalEquityRaw = accountRaw.totalEquity == null ? Number.NaN : toFiniteNumber(accountRaw.totalEquity, Number.NaN);
  const totalEquity = Number.isFinite(totalEquityRaw) ? Math.max(0, totalEquityRaw) : null;

  const inserted = await query(
    `INSERT INTO daa_account_state (
      id, base_currency, cash, investable_cash, frozen_cash, total_equity, updated_at
    ) VALUES (
      'default', $1, $2, $3, $4, $5, NOW()
    ) RETURNING id, base_currency, cash, investable_cash, frozen_cash, total_equity, updated_at`,
    [baseCurrency, cash, investableCash, frozenCash, totalEquity],
  );
  return mapAccountStateRowV1(inserted.rows[0]);
}

async function getAccountStateForUpdateInTxV1(
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number }>,
): Promise<DaaStoreAccountStateV1> {
  await ensureAccountStateRowInTxV1(query);
  const locked = await query(
    "SELECT id, base_currency, cash, investable_cash, frozen_cash, total_equity, updated_at FROM daa_account_state WHERE id = 'default' LIMIT 1 FOR UPDATE",
  );
  if (locked.rows.length > 0) {
    return mapAccountStateRowV1(locked.rows[0]);
  }
  return ensureAccountStateRowInTxV1(query);
}

async function writeAccountStateInTxV1(
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number }>,
  nextRaw: {
    baseCurrency?: unknown;
    cash?: unknown;
    investableCash?: unknown;
    frozenCash?: unknown;
    totalEquity?: unknown;
  },
): Promise<DaaStoreAccountStateV1> {
  const current = await getAccountStateForUpdateInTxV1(query);
  const cash = Object.prototype.hasOwnProperty.call(nextRaw, "cash")
    ? Math.max(0, toFiniteNumber(nextRaw.cash, current.cash))
    : current.cash;
  const baseCurrency = normalizeCurrencyAliasV2(
    normalizeText(nextRaw.baseCurrency, current.baseCurrency),
    current.baseCurrency,
  );
  const frozenCash = Object.prototype.hasOwnProperty.call(nextRaw, "frozenCash")
    ? Math.max(0, Math.min(cash, toFiniteNumber(nextRaw.frozenCash, current.frozenCash)))
    : current.frozenCash;
  const investableSource = Object.prototype.hasOwnProperty.call(nextRaw, "investableCash")
    ? nextRaw.investableCash
    : current.investableCash;
  const investableCash = resolveInvestableCashV1(cash, frozenCash, investableSource);
  let totalEquity = current.totalEquity;
  if (Object.prototype.hasOwnProperty.call(nextRaw, "totalEquity")) {
    if (nextRaw.totalEquity == null) {
      totalEquity = null;
    } else {
      const totalEquityRaw = toFiniteNumber(nextRaw.totalEquity, Number.NaN);
      totalEquity = Number.isFinite(totalEquityRaw) ? Math.max(0, totalEquityRaw) : current.totalEquity;
    }
  }

  const updated = await query(
    `UPDATE daa_account_state
     SET base_currency = $2,
         cash = $3,
         investable_cash = $4,
         frozen_cash = $5,
         total_equity = $6,
         updated_at = NOW()
     WHERE id = 'default'
     RETURNING id, base_currency, cash, investable_cash, frozen_cash, total_equity, updated_at`,
    ["default", baseCurrency, cash, investableCash, frozenCash, totalEquity],
  );
  if (updated.rows.length > 0) {
    return mapAccountStateRowV1(updated.rows[0]);
  }
  return ensureAccountStateRowInTxV1(query);
}

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
  await query(`
    CREATE TABLE IF NOT EXISTS daa_system_config_v2 (
      id TEXT PRIMARY KEY,
      version BIGINT NOT NULL DEFAULT 1,
      config_json JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const existing = await query(
    "SELECT id, version, config_json, updated_at FROM daa_system_config_v2 WHERE id='default' ORDER BY version DESC, updated_at DESC",
  );
  if (existing.rows.length > 1) {
    const latest = mapSystemConfigRowV2(existing.rows[0]);
    await query("DELETE FROM daa_system_config_v2 WHERE id = 'default'");
    const restored = await query(
      "INSERT INTO daa_system_config_v2 (id, version, config_json, updated_at) VALUES ('default', $1, $2::jsonb, $3) RETURNING id, version, config_json, updated_at",
      [Math.max(1, Math.trunc(latest.version)), JSON.stringify(latest.config), latest.updatedAt],
    );
    await query("CREATE UNIQUE INDEX IF NOT EXISTS idx_daa_system_config_v2_id ON daa_system_config_v2(id)");
    return mapSystemConfigRowV2(restored.rows[0]);
  }
  if (existing.rows.length > 0) {
    await query("CREATE UNIQUE INDEX IF NOT EXISTS idx_daa_system_config_v2_id ON daa_system_config_v2(id)");
    return mapSystemConfigRowV2(existing.rows[0]);
  }

  const result = await query(
    "INSERT INTO daa_system_config_v2 (id, version, config_json, updated_at) VALUES ('default', 1, $1::jsonb, NOW()) RETURNING id, version, config_json, updated_at",
    [JSON.stringify(DEFAULT_SYSTEM_CONFIG_V2)],
  );
  await query("CREATE UNIQUE INDEX IF NOT EXISTS idx_daa_system_config_v2_id ON daa_system_config_v2(id)");
  return mapSystemConfigRowV2(result.rows[0]);
}

async function getSystemConfigRowForUpdateInTxV2(
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number }>,
): Promise<DaaStoreSystemConfigRowV2> {
  await ensureSystemConfigRowInTxV2(query);
  const locked = await query(
    "SELECT id, version, config_json, updated_at FROM daa_system_config_v2 WHERE id='default' ORDER BY version DESC, updated_at DESC LIMIT 1 FOR UPDATE",
  );
  if (locked.rows.length > 0) {
    return mapSystemConfigRowV2(locked.rows[0]);
  }
  return ensureSystemConfigRowInTxV2(query);
}

async function writeSystemConfigCasInTxV2(
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number }>,
  nextConfigRaw: unknown,
  expectedVersion: number,
): Promise<DaaStoreSystemConfigRowV2> {
  const nextConfig = normalizeSystemConfigV2(nextConfigRaw);
  const updated = await query(
    "UPDATE daa_system_config_v2 SET version = version + 1, config_json = $2::jsonb, updated_at = NOW() WHERE id = 'default' AND version = $1 RETURNING id, version, config_json, updated_at",
    [Math.max(1, Math.trunc(expectedVersion)), JSON.stringify(nextConfig)],
  );
  if (updated.rows.length > 0) {
    return mapSystemConfigRowV2(updated.rows[0]);
  }
  const latest = await ensureSystemConfigRowInTxV2(query);
  throw new Error(`system_config_version_conflict:${latest.version}`);
}

async function saveSystemConfigInTxV2(
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number }>,
  nextConfigRaw: unknown,
  baseVersion?: number,
): Promise<DaaStoreSystemConfigRowV2> {
  const current = await ensureSystemConfigRowInTxV2(query);
  const expectedVersion = baseVersion != null ? Math.trunc(baseVersion) : current.version;
  return writeSystemConfigCasInTxV2(query, nextConfigRaw, expectedVersion);
}

export async function getDaaSystemConfigV2(): Promise<DaaStoreSystemConfigRowV2> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const row = await ensureSystemConfigRowInTxV2(query as any);
    const account = await ensureAccountStateRowInTxV1(query as any);
    return mergeSystemConfigRowWithAccountStateV1(row, account);
  });
}

export async function saveDaaSystemConfigV2(input: {
  config: unknown;
  baseVersion?: number;
}): Promise<DaaStoreSystemConfigRowV2> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    await query("BEGIN");
    try {
      const { sanitizedConfig, runtimeAccount } = stripRuntimeAccountFromConfigV2(input.config);
      const saved = await saveSystemConfigInTxV2(query as any, sanitizedConfig, input.baseVersion);
      const account = await writeAccountStateInTxV1(query as any, runtimeAccount);
      await query("COMMIT");
      return mergeSystemConfigRowWithAccountStateV1(saved, account);
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
      const current = await getSystemConfigRowForUpdateInTxV2(query as any);
      const currentAccount = await getAccountStateForUpdateInTxV1(query as any);
      const mergedCurrent = mergeSystemConfigRowWithAccountStateV1(current, currentAccount);
      const nextConfig = applySystemConfigPatchesV2(mergedCurrent.config, Array.isArray(input.patches) ? input.patches : []);
      const { sanitizedConfig, runtimeAccount } = stripRuntimeAccountFromConfigV2(nextConfig);
      const saved = await saveSystemConfigInTxV2(query as any, sanitizedConfig, input.baseVersion ?? current.version);
      const account = await writeAccountStateInTxV1(query as any, runtimeAccount);
      await query("COMMIT");
      return mergeSystemConfigRowWithAccountStateV1(saved, account);
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

async function ensureDaaStoreRuntimeMigrationsAppliedV1(): Promise<void> {
  const st = getStoreStateV1();
  if (!st.runtimeMigrationInit) {
    st.runtimeMigrationInit = withDaaPgClientV0(async ({ query }) => {
      await query("BEGIN");
      try {
        await ensureSystemConfigRowInTxV2(query as any);
        await runDaaStoreRuntimeMigrationsV1(query as any);
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
      st.runtimeMigrationInit = null;
      throw error;
    });
  }
  await st.runtimeMigrationInit;
}

export async function ensureDaaStoreSchemaPgV1(): Promise<void> {
  const st = getStoreStateV1();
  if (st.schemaInit) {
    await st.schemaInit;
    await ensureDaaStoreRuntimeMigrationsAppliedV1();
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
            cycle_id TEXT,
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

          CREATE INDEX IF NOT EXISTS idx_daa_trade_tickets_cycle_created_desc
            ON daa_trade_tickets(cycle_id, created_at DESC);

          CREATE TABLE IF NOT EXISTS daa_rebalance_cycles (
            cycle_id TEXT PRIMARY KEY,
            status TEXT NOT NULL DEFAULT 'generated',
            trigger_source TEXT NOT NULL,
            trigger_reason TEXT NOT NULL DEFAULT '',
            snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            equity_snapshot NUMERIC NOT NULL DEFAULT 0,
            drift_snapshot_json JSONB NOT NULL DEFAULT '[]'::jsonb,
            proposals_json JSONB NOT NULL DEFAULT '[]'::jsonb,
            risk_check_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            executed_at TIMESTAMPTZ,
            executed_orders_json JSONB NOT NULL DEFAULT '[]'::jsonb,
            execution_summary_json JSONB,
            cancelled_at TIMESTAMPTZ,
            cancel_reason TEXT,
            notes TEXT,
            market_context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_daa_rebalance_cycles_created_desc
            ON daa_rebalance_cycles(created_at DESC);

          CREATE INDEX IF NOT EXISTS idx_daa_rebalance_cycles_status_created_desc
            ON daa_rebalance_cycles(status, created_at DESC);

          CREATE TABLE IF NOT EXISTS daa_cycle_reports (
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
            event_id TEXT PRIMARY KEY,
            idempotency_key TEXT NOT NULL UNIQUE,
            trigger_source TEXT NOT NULL,
            trigger_reason TEXT NOT NULL DEFAULT '',
            cycle_id TEXT REFERENCES daa_rebalance_cycles(cycle_id) ON DELETE SET NULL,
            status TEXT NOT NULL DEFAULT 'accepted',
            details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_daa_trigger_events_created_desc
            ON daa_trigger_events(created_at DESC);

          CREATE INDEX IF NOT EXISTS idx_daa_trigger_events_source_created_desc
            ON daa_trigger_events(trigger_source, created_at DESC);

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
            entry_kind TEXT,
            account_base_currency TEXT,
            amount_in_account_base NUMERIC,
            fx_rate_to_account NUMERIC,
            ticket_id TEXT,
            cycle_id TEXT,
            settlement_ts TIMESTAMPTZ,
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

          CREATE TABLE IF NOT EXISTS daa_llm_feedback (
            id TEXT PRIMARY KEY,
            context_id TEXT NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('insight', 'decision')),
            score TEXT NOT NULL CHECK (score IN ('up', 'down')),
            comment TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_daa_llm_feedback_created_desc
            ON daa_llm_feedback(created_at DESC);

          CREATE INDEX IF NOT EXISTS idx_daa_llm_feedback_context_created_desc
            ON daa_llm_feedback(context_id, created_at DESC);
        `);

        await query("ALTER TABLE daa_execution_orders ADD COLUMN IF NOT EXISTS booked_at TIMESTAMPTZ");
        await query("ALTER TABLE daa_execution_orders ADD COLUMN IF NOT EXISTS booked_qty NUMERIC NOT NULL DEFAULT 0");
        await query("ALTER TABLE daa_execution_orders ADD COLUMN IF NOT EXISTS booked_notional NUMERIC NOT NULL DEFAULT 0");
        await query("ALTER TABLE daa_execution_orders ADD COLUMN IF NOT EXISTS booked_fee NUMERIC NOT NULL DEFAULT 0");
        await query("ALTER TABLE daa_trade_journal ADD COLUMN IF NOT EXISTS execution_order_id TEXT");
        await query("DROP INDEX IF EXISTS idx_daa_trade_journal_execution_order_unique");
        await query("ALTER TABLE daa_positions DROP COLUMN IF EXISTS liquidity_notional_24h");
        const cashLedgerRequiredColumns = [
          "entry_kind",
          "account_base_currency",
          "amount_in_account_base",
          "fx_rate_to_account",
          "ticket_id",
          "cycle_id",
          "settlement_ts",
        ];
        const cashLedgerMissingColumns = [] as string[];
        for (const columnName of cashLedgerRequiredColumns) {
          if (!(await hasTableColumnV1(query as any, "daa_cash_ledger", columnName))) {
            cashLedgerMissingColumns.push(columnName);
          }
        }
        if (cashLedgerMissingColumns.length > 0) {
          await query("DROP INDEX IF EXISTS idx_daa_cash_ledger_ticket_unique");
          await query("DROP TABLE IF EXISTS daa_cash_ledger CASCADE");
          await query("DROP INDEX IF EXISTS daa_cash_ledger_pkey");
          await query(`
            CREATE TABLE daa_cash_ledger (
              id TEXT PRIMARY KEY,
              ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              side TEXT NOT NULL CHECK (side IN ('deposit', 'withdraw')),
              amount NUMERIC NOT NULL CHECK (amount > 0),
              base_currency TEXT NOT NULL DEFAULT 'USD',
              entry_kind TEXT,
              account_base_currency TEXT,
              amount_in_account_base NUMERIC,
              fx_rate_to_account NUMERIC,
              ticket_id TEXT,
              cycle_id TEXT,
              settlement_ts TIMESTAMPTZ,
              note TEXT,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
          `);
          await query("CREATE INDEX IF NOT EXISTS idx_daa_cash_ledger_ts_desc ON daa_cash_ledger(ts DESC)");
        } else {
          await query("ALTER TABLE daa_cash_ledger DROP COLUMN IF EXISTS channel");
          await query("ALTER TABLE daa_cash_ledger DROP COLUMN IF EXISTS reference_id");
        }
        await query("CREATE UNIQUE INDEX IF NOT EXISTS idx_daa_cash_ledger_ticket_unique ON daa_cash_ledger(ticket_id)");
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
        await ensureTableColumnV1(query as any, "daa_trade_tickets", "cycle_id", "TEXT");
        await ensureTableColumnV1(query as any, "daa_trade_tickets", "pricing_mode", "TEXT NOT NULL DEFAULT 'manual'");
        await ensureTableColumnV1(query as any, "daa_trade_tickets", "price_source", "TEXT");
        await ensureTableColumnV1(query as any, "daa_trade_tickets", "price_snapshot_at", "TIMESTAMPTZ");
        await ensureTableColumnV1(query as any, "daa_rebalance_cycles", "market_context_json", "JSONB NOT NULL DEFAULT '{}'::jsonb");
        await query(
          "CREATE INDEX IF NOT EXISTS idx_daa_trade_tickets_basket_status_created_desc ON daa_trade_tickets(basket_id, status, created_at DESC)",
        );
        await query(
          "CREATE INDEX IF NOT EXISTS idx_daa_trade_tickets_cycle_created_desc ON daa_trade_tickets(cycle_id, created_at DESC)",
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
        await runDaaStoreRuntimeMigrationsV1(query as any);

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
  holdingQty?: number;
  holdingPrice?: number;
  costBasis?: number | null;
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
      holdingQty: input.holdingQty == null ? current.holdingQty : Math.max(0, toFiniteNumber(input.holdingQty)),
      holdingPrice: input.holdingPrice == null ? current.holdingPrice : Math.max(0, toFiniteNumber(input.holdingPrice)),
      costBasis: input.costBasis === undefined ? current.costBasis : (input.costBasis == null ? null : Math.max(0, toFiniteNumber(input.costBasis))),
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
         holding_qty = $10,
         holding_price = $11,
         cost_basis = $12,
         watch_tags = $13,
         notes = $14,
         last_price = $15,
         price_updated_at = $16,
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
        next.holdingQty,
        next.holdingPrice,
        next.costBasis,
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
  return resolveRuntimeInvestableCashV1({
    cash,
    frozenCash,
    investableCash: investableCashRaw,
  });
}

function applyAccountCashDeltaToConfigV1(
  configJson: Record<string, unknown>,
  nextCash: number,
  nextTotalEquity?: number | null,
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
  const totalEquityRaw = nextTotalEquity == null ? Number.NaN : toFiniteNumber(nextTotalEquity, Number.NaN);
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
  opts: {
    totalEquity?: number | null;
  } = {},
): Promise<{
  baseCurrency: string;
  cash: number;
  investableCash: number;
  frozenCash: number;
  totalEquity: number | null;
}> {
  const currentAccount = await getAccountStateForUpdateInTxV1(query as any);
  const normalizedNextCash = Math.max(0, toFiniteNumber(nextCash, currentAccount.cash));
  const previousInvestable = resolveInvestableCashV1(currentAccount.cash, currentAccount.frozenCash, currentAccount.investableCash);
  const delta = normalizedNextCash - currentAccount.cash;
  const nextInvestable = Math.max(0, Math.min(normalizedNextCash, previousInvestable + delta));
  const account = await writeAccountStateInTxV1(query as any, {
    baseCurrency: currentAccount.baseCurrency,
    cash: normalizedNextCash,
    investableCash: nextInvestable,
    frozenCash: currentAccount.frozenCash,
    totalEquity: Object.prototype.hasOwnProperty.call(opts, "totalEquity") ? opts.totalEquity ?? null : currentAccount.totalEquity,
  });
  return {
    ...account,
    baseCurrency: normalizeCurrencyAliasV2(account.baseCurrency, "USD"),
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

async function buildPortfolioSnapshotFromAssetUniverseInTxV1(
  query: DaaTxQueryFnV1,
  input: { baseCurrency: string; cash: number },
): Promise<{ holdingsValue: number; totalEquity: number }> {
  const [holdingsRes, fxRes] = await Promise.all([
    query("SELECT symbol, market, currency, holding_qty, holding_price, last_price FROM daa_asset_universe WHERE holding_qty > 0"),
    query("SELECT base_ccy, quote_ccy, rate FROM daa_fx_rates"),
  ]);
  const summary = summarizeMarkToMarketPortfolioV1({
    positions: holdingsRes.rows.map((row) => ({
      symbol: normalizeText(row.symbol).toUpperCase(),
      market: normalizeText(row.market, "US").toUpperCase(),
      currency: normalizeCcyCode(row.currency, input.baseCurrency),
      qty: Math.max(0, toFiniteNumber(row.holding_qty, 0)),
      holdingPrice: Math.max(0, toFiniteNumber(row.holding_price, 0)),
      lastPrice: Math.max(0, toFiniteNumber(row.last_price, 0)),
    })),
    baseCurrency: input.baseCurrency,
    cash: input.cash,
    fxLookup: buildFxLookupToBaseV1((fxRes.rows as Array<Record<string, unknown>>).map((row) => ({
      baseCcy: row.base_ccy,
      quoteCcy: row.quote_ccy,
      rate: row.rate,
    }))),
  });
  return {
    holdingsValue: summary.holdingsValue,
    totalEquity: summary.totalEquity,
  };
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
    cycleId: row.cycle_id == null ? null : normalizeText(row.cycle_id) || null,
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

function normalizeRebalanceCycleStatusV1(value: unknown): DaaStoreRebalanceCycleStatusV1 {
  const text = normalizeText(value, "generated").toLowerCase();
  if (text === "reviewing") return "reviewing";
  if (text === "executing") return "executing";
  if (text === "completed") return "completed";
  if (text === "cancelled" || text === "canceled") return "cancelled";
  return "generated";
}

function normalizeRebalanceTriggerSourceV1(value: unknown): DaaStoreRebalanceTriggerSourceV1 {
  const text = normalizeText(value, "manual").toLowerCase();
  if (text === "calendar") return "calendar";
  if (text === "drift") return "drift";
  if (text === "risk") return "risk";
  if (text === "cash_idle") return "cash_idle";
  return "manual";
}

function normalizeRiskRuleV1(value: unknown): DaaStoreRiskRuleV1 {
  const text = normalizeText(value).toLowerCase();
  if (text === "max_order_pct") return "max_order_pct";
  if (text === "concentration") return "concentration";
  if (text === "stop_loss_breach") return "stop_loss_breach";
  if (text === "total_weight") return "total_weight";
  return "max_position";
}

function normalizeRiskStatusV1(value: unknown): "pass" | "warn" | "block" {
  const text = normalizeText(value, "pass").toLowerCase();
  if (text === "warn") return "warn";
  if (text === "block") return "block";
  return "pass";
}

function normalizeMarketIndicatorKeyV1(value: unknown): DaaMarketIndicatorKeyV1 | null {
  const text = normalizeText(value, "").toLowerCase();
  if (text === "vix") return "vix";
  if (text === "qqq_spy_ratio") return "qqq_spy_ratio";
  if (text === "fxi_volatility") return "fxi_volatility";
  if (text === "kweb_fxi_ratio") return "kweb_fxi_ratio";
  if (text === "btc_eth_ratio") return "btc_eth_ratio";
  if (text === "btc_volatility") return "btc_volatility";
  if (text === "gold_silver_ratio") return "gold_silver_ratio";
  return null;
}

function normalizeMarketRegimeV1Store(value: unknown): DaaMarketRegimeV1 | "neutral" {
  const text = normalizeText(value, "neutral").toLowerCase();
  if (text === "risk_on") return "risk_on";
  if (text === "risk_off") return "risk_off";
  if (text === "transitional") return "transitional";
  return "neutral";
}

function normalizeStringArrayV1(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeText(item)).filter(Boolean);
}

function normalizeProposalDecisionContextV1(value: unknown): ProposalDecisionContextV1 | null {
  if (!isRecordV1(value)) return null;
  return {
    driftReason: normalizeText(value.driftReason, ""),
    signalAction: value.signalAction === "open_or_add" || value.signalAction === "watch" || value.signalAction === "reduce_or_avoid"
      ? value.signalAction
      : null,
    signalScore: value.signalScore == null ? null : clampNumberV1(toFiniteNumber(value.signalScore, 0), 0, 100),
    signalConfidence: value.signalConfidence == null ? null : clampNumberV1(toFiniteNumber(value.signalConfidence, 0), 0, 100),
    signalConflict: toBoolean(value.signalConflict, false),
    llmAdjustment: value.llmAdjustment === "execute" || value.llmAdjustment === "reduce_size" || value.llmAdjustment === "skip" || value.llmAdjustment === "increase_priority"
      ? value.llmAdjustment
      : null,
    llmConfidence: value.llmConfidence == null ? null : clampNumberV1(toFiniteNumber(value.llmConfidence, 0), 0, 100),
    llmRationale: value.llmRationale == null ? null : normalizeText(value.llmRationale) || null,
    marketRegime: normalizeMarketRegimeV1Store(value.marketRegime || value.effectiveMarketRegime) === "neutral"
      ? null
      : (normalizeMarketRegimeV1Store(value.marketRegime || value.effectiveMarketRegime) as DaaMarketRegimeV1),
    ruleBasedMarketRegime: normalizeMarketRegimeV1Store(value.ruleBasedMarketRegime) === "neutral"
      ? null
      : (normalizeMarketRegimeV1Store(value.ruleBasedMarketRegime) as DaaMarketRegimeV1),
    llmMarketRegime: normalizeMarketRegimeV1Store(value.llmMarketRegime) === "neutral"
      ? null
      : (normalizeMarketRegimeV1Store(value.llmMarketRegime) as DaaMarketRegimeV1),
    effectiveMarketRegime: normalizeMarketRegimeV1Store(value.effectiveMarketRegime) === "neutral"
      ? null
      : (normalizeMarketRegimeV1Store(value.effectiveMarketRegime) as DaaMarketRegimeV1),
    marketIndicatorFlags: normalizeStringArrayV1(value.marketIndicatorFlags),
    conflictFlags: normalizeStringArrayV1(value.conflictFlags),
    finalQtyMultiplier: clampNumberV1(toFiniteNumber(value.finalQtyMultiplier, 1), 0, 1),
  };
}

function normalizeMarketIndicatorScopeV1Store(value: unknown): DaaMarketIndicatorSnapshotV1["scope"] {
  const text = normalizeText(value, "us_equity").toLowerCase();
  if (text === "hk_cn_equity") return "hk_cn_equity";
  if (text === "crypto") return "crypto";
  if (text === "macro_defensive") return "macro_defensive";
  return "us_equity";
}

function normalizeMarketIndicatorSnapshotJsonV1(value: unknown): DaaMarketIndicatorSnapshotV1 | null {
  if (!isRecordV1(value)) return null;
  const key = normalizeMarketIndicatorKeyV1(value.key);
  if (!key) return null;
  return {
    key,
    label: normalizeText(value.label, "市场指标"),
    category: value.category === "relative_value" || value.category === "sentiment" ? value.category : "volatility",
    scope: normalizeMarketIndicatorScopeV1Store(value.scope),
    stance: normalizeMarketRegimeV1Store(value.stance),
    riskOffScorePct: clampNumberV1(toFiniteNumber(value.riskOffScorePct, 50), 0, 100),
    confidencePct: clampNumberV1(toFiniteNumber(value.confidencePct, 40), 0, 100),
    rawValue: value.rawValue == null ? null : toFiniteNumber(value.rawValue, 0),
    unit: value.unit == null ? undefined : normalizeText(value.unit) || undefined,
    percentile252: value.percentile252 == null ? null : toFiniteNumber(value.percentile252, 0),
    zscore60: value.zscore60 == null ? null : toFiniteNumber(value.zscore60, 0),
    trend1dPct: value.trend1dPct == null ? null : toFiniteNumber(value.trend1dPct, 0),
    trend7dPct: value.trend7dPct == null ? null : toFiniteNumber(value.trend7dPct, 0),
    trend30dPct: value.trend30dPct == null ? null : toFiniteNumber(value.trend30dPct, 0),
    reason: normalizeText(value.reason, ""),
    source: normalizeText(value.source, "market_cache"),
    generatedAt: toIsoString(value.generatedAt, new Date().toISOString()),
  };
}

function normalizeMarketScopeContextJsonV1(value: unknown): DaaMarketContextV1["scopes"][number] | null {
  if (!isRecordV1(value)) return null;
  const indicators = (Array.isArray(value.indicators) ? value.indicators : [])
    .map((item) => normalizeMarketIndicatorSnapshotJsonV1(item))
    .filter((item): item is DaaMarketIndicatorSnapshotV1 => Boolean(item));
  const scope = normalizeMarketIndicatorScopeV1Store(value.scope);
  if (!indicators.length && value.regime == null && value.generatedAt == null) return null;
  return {
    scope,
    label: normalizeText(value.label, scope),
    generatedAt: toIsoString(value.generatedAt, new Date().toISOString()),
    regime: normalizeMarketRegimeV1Store(value.regime) === "neutral" ? "transitional" : (normalizeMarketRegimeV1Store(value.regime) as DaaMarketRegimeV1),
    riskOffScorePct: clampNumberV1(toFiniteNumber(value.riskOffScorePct, 50), 0, 100),
    confidencePct: clampNumberV1(toFiniteNumber(value.confidencePct, 40), 0, 100),
    buyScale: clampNumberV1(toFiniteNumber(value.buyScale, 1), 0, 1),
    highRiskBuyScale: clampNumberV1(toFiniteNumber(value.highRiskBuyScale, 0.95), 0, 1),
    reasons: normalizeStringArrayV1(value.reasons),
    indicators,
  };
}

function normalizeMarketContextJsonV1(value: unknown): DaaMarketContextV1 | null {
  if (!isRecordV1(value)) return null;
  const indicatorsRaw = Array.isArray(value.indicators) ? value.indicators : [];
  const indicators = indicatorsRaw
    .map((item) => normalizeMarketIndicatorSnapshotJsonV1(item))
    .filter((item): item is DaaMarketIndicatorSnapshotV1 => Boolean(item));
  const scopesRaw = Array.isArray(value.scopes) ? value.scopes : [];
  const scopes = scopesRaw
    .map((item) => normalizeMarketScopeContextJsonV1(item))
    .filter((item): item is DaaMarketContextV1["scopes"][number] => Boolean(item));
  const reasons = normalizeStringArrayV1(value.reasons);
  const hasPayload = indicators.length > 0
    || scopes.length > 0
    || reasons.length > 0
    || value.regime != null
    || value.generatedAt != null;
  if (!hasPayload) return null;
  return {
    generatedAt: toIsoString(value.generatedAt, new Date().toISOString()),
    regime: normalizeMarketRegimeV1Store(value.regime) === "neutral" ? "transitional" : (normalizeMarketRegimeV1Store(value.regime) as DaaMarketRegimeV1),
    riskOffScorePct: clampNumberV1(toFiniteNumber(value.riskOffScorePct, 50), 0, 100),
    confidencePct: clampNumberV1(toFiniteNumber(value.confidencePct, 40), 0, 100),
    buyScale: clampNumberV1(toFiniteNumber(value.buyScale, 1), 0, 1),
    highRiskBuyScale: clampNumberV1(toFiniteNumber(value.highRiskBuyScale, 0.95), 0, 1),
    reasons,
    indicators,
    scopes,
  };
}

function normalizePreTradeRiskCheckV1(value: unknown): DaaStorePreTradeRiskCheckV1 {
  const raw = parseJsonb<Record<string, unknown>>(value, {});
  const itemsRaw = Array.isArray(raw.items) ? raw.items : [];
  const items: DaaStorePreTradeRiskCheckItemV1[] = [];
  for (const itemRaw of itemsRaw) {
    const item = isRecordV1(itemRaw) ? itemRaw : {};
    items.push({
      rule: normalizeRiskRuleV1(item.rule),
      status: normalizeRiskStatusV1(item.status),
      current: toFiniteNumber(item.current, 0),
      limit: toFiniteNumber(item.limit, 0),
      message: normalizeText(item.message, ""),
    });
  }
  const overallStatus = normalizeRiskStatusV1(raw.overallStatus);
  return {
    overallStatus,
    items,
  };
}

function normalizeDriftSnapshotV1(value: unknown): DaaStoreRebalanceCycleV1["driftSnapshot"] {
  if (!Array.isArray(value)) return [];
  const out: DaaStoreRebalanceCycleV1["driftSnapshot"] = [];
  for (const rowRaw of value) {
    const row = isRecordV1(rowRaw) ? rowRaw : {};
    const symbol = normalizeText(row.symbol).toUpperCase();
    const assetKey = normalizeText(row.assetKey, symbol ? `US::${symbol}` : "").toUpperCase();
    if (!symbol || !assetKey) continue;
    out.push({
      assetKey,
      symbol,
      actualPct: toFiniteNumber(row.actualPct, 0),
      targetPct: toFiniteNumber(row.targetPct, 0),
      driftPct: toFiniteNumber(row.driftPct, 0),
    });
  }
  return out;
}

function normalizeCycleProposalsV1(value: unknown): DaaStoreRebalanceCycleV1["proposals"] {
  if (!Array.isArray(value)) return [];
  const out: DaaStoreRebalanceCycleV1["proposals"] = [];
  for (const rowRaw of value) {
    const row = isRecordV1(rowRaw) ? rowRaw : {};
    const symbol = normalizeText(row.symbol).toUpperCase();
    const assetKey = normalizeText(row.assetKey, symbol ? `US::${symbol}` : "").toUpperCase();
    if (!symbol || !assetKey) continue;
    const side = normalizeText(row.side, "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY";
    out.push({
      assetKey,
      symbol,
      currency: normalizeCcyCode(row.currency, "USD"),
      fxRateToBase: row.fxRateToBase == null ? null : Math.max(0, toFiniteNumber(row.fxRateToBase, 0)),
      side,
      suggestedQty: Math.max(0, toFiniteNumber(row.suggestedQty, 0)),
      suggestedNotional: Math.max(0, toFiniteNumber(row.suggestedNotional, 0)),
      price: Math.max(0, toFiniteNumber(row.price, 0)),
      reason: normalizeText(row.reason, ""),
      selected: toBoolean(row.selected, true),
      hfContribution: normalizeText(row.hfContribution, "") || null,
      decisionContext: normalizeProposalDecisionContextV1(row.decisionContext),
    });
  }
  return out;
}

function mapRebalanceCycleRowV1(row: Record<string, unknown>): DaaStoreRebalanceCycleV1 {
  const executionSummaryRaw = row.execution_summary_json == null ? null : parseJsonb<Record<string, unknown>>(row.execution_summary_json, {});
  const executionSummary = executionSummaryRaw
    ? {
      ordersExecuted: Math.max(0, toFiniteNumber(executionSummaryRaw.ordersExecuted, 0)),
      ordersFailed: Math.max(0, toFiniteNumber(executionSummaryRaw.ordersFailed, 0)),
      totalNotional: Math.max(0, toFiniteNumber(executionSummaryRaw.totalNotional, 0)),
      newMaxDriftPct: Math.max(0, toFiniteNumber(executionSummaryRaw.newMaxDriftPct, 0)),
    }
    : null;

  const executedOrdersRaw = parseJsonb<unknown[]>(row.executed_orders_json, []);
  const executedOrders = Array.isArray(executedOrdersRaw)
    ? executedOrdersRaw.map((item) => normalizeText(item)).filter(Boolean)
    : [];

  return {
    cycleId: normalizeText(row.cycle_id),
    status: normalizeRebalanceCycleStatusV1(row.status),
    triggerSource: normalizeRebalanceTriggerSourceV1(row.trigger_source),
    triggerReason: normalizeText(row.trigger_reason),
    snapshotAt: toIsoString(row.snapshot_at),
    equitySnapshot: Math.max(0, toFiniteNumber(row.equity_snapshot, 0)),
    driftSnapshot: normalizeDriftSnapshotV1(parseJsonb<unknown[]>(row.drift_snapshot_json, [])),
    proposals: normalizeCycleProposalsV1(parseJsonb<unknown[]>(row.proposals_json, [])),
    riskCheck: normalizePreTradeRiskCheckV1(row.risk_check_json),
    executedAt: row.executed_at == null ? null : toIsoString(row.executed_at),
    executedOrders,
    executionSummary,
    cancelledAt: row.cancelled_at == null ? null : toIsoString(row.cancelled_at),
    cancelReason: row.cancel_reason == null ? null : normalizeText(row.cancel_reason) || null,
    notes: row.notes == null ? null : normalizeText(row.notes) || null,
    marketContext: row.market_context_json == null ? null : normalizeMarketContextJsonV1(parseJsonb<Record<string, unknown>>(row.market_context_json, {})),
    createdAt: toIsoString(row.created_at),
  };
}

function mapCycleReportRowV1(row: Record<string, unknown>): DaaStoreCycleReportV1 {
  const before = parseJsonb<Record<string, unknown>>(row.before_snapshot_json, {});
  const after = parseJsonb<Record<string, unknown>>(row.after_snapshot_json, {});
  const executionStats = parseJsonb<Record<string, unknown>>(row.execution_stats_json, {});
  const pnl = parseJsonb<Record<string, unknown>>(row.pnl_attribution_json, {});
  const riskDelta = parseJsonb<Record<string, unknown>>(row.risk_delta_json, {});
  const topContributorsRaw = Array.isArray(pnl.topContributors) ? pnl.topContributors : [];

  const topContributors = topContributorsRaw.map((itemRaw) => {
    const item = isRecordV1(itemRaw) ? itemRaw : {};
    const sideRaw = normalizeText(item.side, "HOLD").toUpperCase();
    const side = sideRaw === "BUY" || sideRaw === "SELL" ? sideRaw : "HOLD";
    return {
      symbol: normalizeText(item.symbol, "UNKNOWN").toUpperCase(),
      pnl: toFiniteNumber(item.pnl, 0),
      side: side as "BUY" | "SELL" | "HOLD",
    };
  });

  return {
    cycleId: normalizeText(row.cycle_id),
    triggerSource: normalizeRebalanceTriggerSourceV1(row.trigger_source),
    cycleStatus: normalizeRebalanceCycleStatusV1(row.cycle_status),
    cycleCreatedAt: toIsoString(row.cycle_created_at),
    reportCreatedAt: toIsoString(row.created_at),
    executionSummary: {
      ordersExecuted: Math.max(0, toFiniteNumber(executionStats.ordersExecuted, 0)),
      ordersFailed: Math.max(0, toFiniteNumber(executionStats.ordersFailed, 0)),
      totalNotional: Math.max(0, toFiniteNumber(executionStats.totalNotional, 0)),
      newMaxDriftPct: Math.max(0, toFiniteNumber(executionStats.newMaxDriftPct, 0)),
    },
    beforeSnapshot: {
      totalEquity: Math.max(0, toFiniteNumber(before.totalEquity, 0)),
      holdingsValue: Math.max(0, toFiniteNumber(before.holdingsValue, 0)),
      cash: Math.max(0, toFiniteNumber(before.cash, 0)),
      hhiPct: Math.max(0, toFiniteNumber(before.hhiPct, 0)),
      maxWeightPct: Math.max(0, toFiniteNumber(before.maxWeightPct, 0)),
      maxDriftPct: Math.max(0, toFiniteNumber(before.maxDriftPct, 0)),
      maxDrawdownPct: Math.max(0, toFiniteNumber(before.maxDrawdownPct, 0)),
    },
    afterSnapshot: {
      totalEquity: Math.max(0, toFiniteNumber(after.totalEquity, 0)),
      holdingsValue: Math.max(0, toFiniteNumber(after.holdingsValue, 0)),
      cash: Math.max(0, toFiniteNumber(after.cash, 0)),
      hhiPct: Math.max(0, toFiniteNumber(after.hhiPct, 0)),
      maxWeightPct: Math.max(0, toFiniteNumber(after.maxWeightPct, 0)),
      maxDriftPct: Math.max(0, toFiniteNumber(after.maxDriftPct, 0)),
      maxDrawdownPct: Math.max(0, toFiniteNumber(after.maxDrawdownPct, 0)),
    },
    executionStats: {
      ordersExecuted: Math.max(0, toFiniteNumber(executionStats.ordersExecuted, 0)),
      ordersFailed: Math.max(0, toFiniteNumber(executionStats.ordersFailed, 0)),
      totalNotional: Math.max(0, toFiniteNumber(executionStats.totalNotional, 0)),
      feeTotal: Math.max(0, toFiniteNumber(executionStats.feeTotal, 0)),
    },
    pnlAttribution: {
      realizedPnl: toFiniteNumber(pnl.realizedPnl, 0),
      unrealizedPnl: toFiniteNumber(pnl.unrealizedPnl, 0),
      feeTotal: Math.max(0, toFiniteNumber(pnl.feeTotal, 0)),
      fxImpact: toFiniteNumber(pnl.fxImpact, 0),
      topContributors,
    },
    riskDelta: {
      maxDrawdownBefore: Math.max(0, toFiniteNumber(riskDelta.maxDrawdownBefore, 0)),
      maxDrawdownAfter: Math.max(0, toFiniteNumber(riskDelta.maxDrawdownAfter, 0)),
      hhiBefore: Math.max(0, toFiniteNumber(riskDelta.hhiBefore, 0)),
      hhiAfter: Math.max(0, toFiniteNumber(riskDelta.hhiAfter, 0)),
      maxWeightBefore: Math.max(0, toFiniteNumber(riskDelta.maxWeightBefore, 0)),
      maxWeightAfter: Math.max(0, toFiniteNumber(riskDelta.maxWeightAfter, 0)),
      maxDriftBefore: Math.max(0, toFiniteNumber(riskDelta.maxDriftBefore, 0)),
      maxDriftAfter: Math.max(0, toFiniteNumber(riskDelta.maxDriftAfter, 0)),
    },
  };
}

function mapTriggerEventRowV1(row: Record<string, unknown>): DaaStoreTriggerEventV1 {
  const statusRaw = normalizeText(row.status, "accepted").toLowerCase();
  const status = statusRaw === "skipped" || statusRaw === "conflict" ? statusRaw : "accepted";
  return {
    eventId: normalizeText(row.event_id),
    idempotencyKey: normalizeText(row.idempotency_key),
    triggerSource: normalizeRebalanceTriggerSourceV1(row.trigger_source),
    triggerReason: normalizeText(row.trigger_reason),
    cycleId: row.cycle_id == null ? null : normalizeText(row.cycle_id) || null,
    status: status as "accepted" | "skipped" | "conflict",
    detailsJson: parseJsonb<Record<string, unknown>>(row.details_json, {}),
    createdAt: toIsoString(row.created_at),
  };
}

function mapLlmFeedbackRowV1(row: Record<string, unknown>): DaaStoreLlmFeedbackV1 {
  const typeRaw = normalizeText(row.type, "insight").toLowerCase();
  const scoreRaw = normalizeText(row.score, "up").toLowerCase();
  return {
    id: normalizeText(row.id),
    contextId: normalizeText(row.context_id),
    type: typeRaw === "decision" ? "decision" : "insight",
    score: scoreRaw === "down" ? "down" : "up",
    comment: row.comment == null ? null : normalizeText(row.comment) || null,
    createdAt: toIsoString(row.created_at),
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
  const normalizedEntryKind = normalizeText(row.entry_kind).toLowerCase();
  const entryKind: DaaStoreCashLedgerEntryKindV1 | null = normalizedEntryKind === "trade_execution"
    ? "trade_execution"
    : (normalizedEntryKind === "manual" ? "manual" : null);
  return {
    id: normalizeText(row.id),
    ts: toIsoString(row.ts),
    side,
    amount: Math.max(0, toFiniteNumber(row.amount)),
    baseCurrency: normalizeCcyCode(row.base_currency, "USD"),
    entryKind,
    accountBaseCurrency: row.account_base_currency == null ? null : normalizeCcyCode(row.account_base_currency, "USD"),
    amountInAccountBase: row.amount_in_account_base == null ? null : Math.max(0, toFiniteNumber(row.amount_in_account_base)),
    fxRateToAccount: row.fx_rate_to_account == null ? null : Math.max(0, toFiniteNumber(row.fx_rate_to_account)),
    ticketId: row.ticket_id == null ? null : normalizeText(row.ticket_id) || null,
    cycleId: row.cycle_id == null ? null : normalizeText(row.cycle_id) || null,
    settlementTs: row.settlement_ts == null ? null : toIsoString(row.settlement_ts),
    note: row.note == null ? null : String(row.note),
    createdAt: toIsoString(row.created_at),
  };
}

export async function listDaaCashLedgerEntriesV1(limit = 100): Promise<DaaStoreCashLedgerEntryV1[]> {
  await ensureDaaStoreSchemaPgV1();
  const n = Math.max(1, Math.min(1000, Math.trunc(toFiniteNumber(limit, 100))));
  return withDaaPgClientV0(async ({ query }) => {
    const result = await query(
      "SELECT id, ts, side, amount, base_currency, entry_kind, account_base_currency, amount_in_account_base, fx_rate_to_account, ticket_id, cycle_id, settlement_ts, note, created_at FROM daa_cash_ledger ORDER BY ts DESC LIMIT $1",
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

    const rawEntryKind = normalizeText(input.entryKind, "manual").toLowerCase();
    const entryKind: DaaStoreCashLedgerEntryKindV1 = rawEntryKind === "trade_execution" ? "trade_execution" : "manual";
    const note = normalizeText(input.note, "");
    const entryId = randomUUID();

    await query("BEGIN");
    try {
      const accountState = await getAccountStateForUpdateInTxV1(query as any);
      const currentCash = Math.max(0, toFiniteNumber(accountState.cash, 0));
      const accountBaseCurrency = normalizeCcyCode(accountState.baseCurrency, "USD");
      const entryCurrency = normalizeCcyCode(input.baseCurrency, accountBaseCurrency);
      const fxRes = await query("SELECT base_ccy, quote_ccy, rate FROM daa_fx_rates");
      const fxMap = buildFxLookupMapV1(fxRes.rows as Array<Record<string, unknown>>);

      let fxRateToAccount = input.fxRateToAccount != null ? Math.max(0, toFiniteNumber(input.fxRateToAccount, 0)) : 0;
      if (!(fxRateToAccount > 0)) {
        fxRateToAccount = resolveFxRateToBaseV1(accountBaseCurrency, entryCurrency, fxMap) ?? 0;
      }
      if (!(fxRateToAccount > 0) && entryCurrency === "USDC" && accountBaseCurrency === "USD") {
        fxRateToAccount = 1;
      }
      if (!(fxRateToAccount > 0)) {
        throw new Error(`missing fx rate for cash-ledger: ${entryCurrency}/${accountBaseCurrency}`);
      }

      const amountInAccountBase = input.amountInAccountBase != null && toFiniteNumber(input.amountInAccountBase, 0) > 0
        ? Math.max(0, toFiniteNumber(input.amountInAccountBase, 0))
        : amount * fxRateToAccount;
      const nextCash = side === "deposit" ? currentCash + amountInAccountBase : currentCash - amountInAccountBase;
      if (nextCash < -1e-9) {
        throw new Error(
          `insufficient cash for withdraw: ${amount.toFixed(2)} ${entryCurrency} (约 ${amountInAccountBase.toFixed(2)} ${accountBaseCurrency}) > ${currentCash.toFixed(2)} ${accountBaseCurrency}`,
        );
      }

      const normalizedNextCash = Math.max(0, nextCash);
      const valuation = await buildPortfolioSnapshotFromAssetUniverseInTxV1(query as DaaTxQueryFnV1, {
        baseCurrency: accountBaseCurrency,
        cash: normalizedNextCash,
      });
      const account = await syncStrategyAccountCashInTxV1(query as DaaTxQueryFnV1, normalizedNextCash, {
        totalEquity: valuation.totalEquity,
      });
      const ts = input.settlementTs ? toIsoString(input.settlementTs, new Date().toISOString()) : new Date().toISOString();
      const settlementTs = input.settlementTs ? toIsoString(input.settlementTs, ts) : null;
      await query(
        "INSERT INTO daa_cash_ledger (id, ts, side, amount, base_currency, entry_kind, account_base_currency, amount_in_account_base, fx_rate_to_account, ticket_id, cycle_id, settlement_ts, note, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())",
        [
          entryId,
          ts,
          side,
          amount,
          entryCurrency,
          entryKind,
          account.baseCurrency,
          amountInAccountBase,
          fxRateToAccount,
          input.ticketId ? normalizeText(input.ticketId) || null : null,
          input.cycleId ? normalizeText(input.cycleId) || null : null,
          settlementTs,
          note || null,
        ],
      );

      await query(
        "INSERT INTO daa_equity_snapshots (ts, total_equity, holdings_value, cash, source) VALUES ($1,$2,$3,$4,$5)",
        [ts, valuation.totalEquity, valuation.holdingsValue, account.cash, "cash_ledger"],
      );

      const opLogMessage = side === "deposit"
        ? `资金入金 ${amount.toFixed(2)} ${entryCurrency}（折算 ${amountInAccountBase.toFixed(2)} ${account.baseCurrency}，余额 ${account.cash.toFixed(2)} ${account.baseCurrency}）`
        : `资金出金 ${amount.toFixed(2)} ${entryCurrency}（折算 ${amountInAccountBase.toFixed(2)} ${account.baseCurrency}，余额 ${account.cash.toFixed(2)} ${account.baseCurrency}）`;
      await query(
        "INSERT INTO daa_op_log (id, ts, level, message, context_json) VALUES ($1, NOW(), 'info', $2, $3)",
        [
          randomUUID(),
          opLogMessage,
          JSON.stringify({
            side,
            amount,
            baseCurrency: entryCurrency,
            entryKind,
            amountInAccountBase,
            accountBaseCurrency: account.baseCurrency,
            fxRateToAccount,
            ticketId: input.ticketId ? normalizeText(input.ticketId) || null : null,
            cycleId: input.cycleId ? normalizeText(input.cycleId) || null : null,
            note: note || null,
          }),
        ],
      );

      await query("COMMIT");

      const entryRes = await query(
        "SELECT id, ts, side, amount, base_currency, entry_kind, account_base_currency, amount_in_account_base, fx_rate_to_account, ticket_id, cycle_id, settlement_ts, note, created_at FROM daa_cash_ledger WHERE id = $1 LIMIT 1",
        [entryId],
      );

      return {
        entry: mapCashLedgerRowV1(entryRes.rows[0] as Record<string, unknown>),
        account: {
          ...account,
          totalEquity: valuation.totalEquity,
        },
        equitySnapshot: {
          ts,
          totalEquity: valuation.totalEquity,
          holdingsValue: valuation.holdingsValue,
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
  cycleId?: string;
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
    if (opts.cycleId) {
      params.push(normalizeText(opts.cycleId));
      where.push(`cycle_id = $${params.length}`);
    }

    params.push(limit);
    const sql = [
      "SELECT ticket_id, basket_id, asset_key, cycle_id, source, status, symbol, market, instrument_currency, base_currency, side, qty, price, fee, gross_notional, fx_rate_to_base, notional_in_base, decision_ref_id, reason_tags, reason_text, snapshot_before_json, snapshot_after_json, reject_code, reject_message, pricing_mode, price_source, price_snapshot_at, created_by, created_at, executed_at, canceled_at, updated_at",
      "FROM daa_trade_tickets",
      where.length ? `WHERE ${where.join(" AND ")}` : "",
      `ORDER BY created_at DESC LIMIT $${params.length}`,
    ].filter(Boolean).join(" ");
    const rows = await query(sql, params);
    return rows.rows.map((row) => mapTradeTicketRowV1(row as Record<string, unknown>));
  });
}

const REBALANCE_CYCLE_SELECT_COLUMNS_V1 = [
  "cycle_id",
  "status",
  "trigger_source",
  "trigger_reason",
  "snapshot_at",
  "equity_snapshot",
  "drift_snapshot_json",
  "proposals_json",
  "risk_check_json",
  "executed_at",
  "executed_orders_json",
  "execution_summary_json",
  "cancelled_at",
  "cancel_reason",
  "notes",
  "market_context_json",
  "created_at",
].join(", ");

export async function listDaaRebalanceCyclesV1(limit = 100): Promise<DaaStoreRebalanceCycleV1[]> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const n = Math.max(1, Math.min(500, Math.trunc(toFiniteNumber(limit, 100))));
    const result = await query(
      `SELECT ${REBALANCE_CYCLE_SELECT_COLUMNS_V1} FROM daa_rebalance_cycles ORDER BY created_at DESC LIMIT $1`,
      [n],
    );
    return result.rows.map((row) => mapRebalanceCycleRowV1(row as Record<string, unknown>));
  });
}

export async function getDaaRebalanceCycleV1(cycleIdRaw: string): Promise<DaaStoreRebalanceCycleV1 | null> {
  await ensureDaaStoreSchemaPgV1();
  const cycleId = normalizeText(cycleIdRaw);
  if (!cycleId) return null;
  return withDaaPgClientV0(async ({ query }) => {
    const result = await query(
      `SELECT ${REBALANCE_CYCLE_SELECT_COLUMNS_V1} FROM daa_rebalance_cycles WHERE cycle_id = $1 LIMIT 1`,
      [cycleId],
    );
    if (!result.rows.length) return null;
    return mapRebalanceCycleRowV1(result.rows[0] as Record<string, unknown>);
  });
}

export async function createDaaRebalanceCycleV1(input: DaaStoreCreateRebalanceCycleInputV1): Promise<DaaStoreRebalanceCycleV1> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const cycleId = normalizeText(input.cycleId, "") || randomUUID();
    const status = normalizeRebalanceCycleStatusV1(input.status);
    const triggerSource = normalizeRebalanceTriggerSourceV1(input.triggerSource);
    const triggerReason = normalizeText(input.triggerReason, "");
    const snapshotAt = toIsoString(input.snapshotAt, new Date().toISOString());
    const equitySnapshot = Math.max(0, toFiniteNumber(input.equitySnapshot, 0));
    const driftSnapshot = normalizeDriftSnapshotV1(input.driftSnapshot);
    const proposals = normalizeCycleProposalsV1(input.proposals);
    const riskCheck = normalizePreTradeRiskCheckV1(input.riskCheck);
    const notes = input.notes == null ? null : normalizeText(input.notes) || null;
    const marketContext = input.marketContext == null ? null : normalizeMarketContextJsonV1(input.marketContext);

    const inserted = await query(
      `INSERT INTO daa_rebalance_cycles (
         cycle_id, status, trigger_source, trigger_reason, snapshot_at, equity_snapshot,
         drift_snapshot_json, proposals_json, risk_check_json, notes, market_context_json, created_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11::jsonb,NOW()
       )
       ON CONFLICT (cycle_id) DO UPDATE
       SET
         status = EXCLUDED.status,
         trigger_source = EXCLUDED.trigger_source,
         trigger_reason = EXCLUDED.trigger_reason,
         snapshot_at = EXCLUDED.snapshot_at,
         equity_snapshot = EXCLUDED.equity_snapshot,
         drift_snapshot_json = EXCLUDED.drift_snapshot_json,
         proposals_json = EXCLUDED.proposals_json,
         risk_check_json = EXCLUDED.risk_check_json,
         notes = EXCLUDED.notes,
         market_context_json = EXCLUDED.market_context_json
       RETURNING ${REBALANCE_CYCLE_SELECT_COLUMNS_V1}`,
      [
        cycleId,
        status,
        triggerSource,
        triggerReason,
        snapshotAt,
        equitySnapshot,
        JSON.stringify(driftSnapshot),
        JSON.stringify(proposals),
        JSON.stringify(riskCheck),
        notes,
        marketContext == null ? JSON.stringify({}) : JSON.stringify(marketContext),
      ],
    );
    return mapRebalanceCycleRowV1(inserted.rows[0] as Record<string, unknown>);
  });
}

export async function patchDaaRebalanceCycleV1(input: DaaStorePatchRebalanceCycleInputV1): Promise<DaaStoreRebalanceCycleV1> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const cycleId = normalizeText(input.cycleId);
    if (!cycleId) throw new Error("cycleId is required");

    await query("BEGIN");
    try {
      const currentRes = await query(
        `SELECT ${REBALANCE_CYCLE_SELECT_COLUMNS_V1} FROM daa_rebalance_cycles WHERE cycle_id = $1 LIMIT 1 FOR UPDATE`,
        [cycleId],
      );
      if (!currentRes.rows.length) throw new Error(`cycle not found: ${cycleId}`);
      const current = mapRebalanceCycleRowV1(currentRes.rows[0] as Record<string, unknown>);

      const nextStatus = input.status == null ? current.status : normalizeRebalanceCycleStatusV1(input.status);
      const nextTriggerReason = input.triggerReason == null ? current.triggerReason : normalizeText(input.triggerReason, "");
      const nextRiskCheck = input.riskCheck == null ? current.riskCheck : normalizePreTradeRiskCheckV1(input.riskCheck);
      const nextProposals = input.proposals == null ? current.proposals : normalizeCycleProposalsV1(input.proposals);
      const nextExecutedAt = input.executedAt === undefined
        ? current.executedAt
        : (input.executedAt ? toIsoString(input.executedAt, new Date().toISOString()) : null);
      const nextExecutedOrders = input.executedOrders == null
        ? current.executedOrders
        : input.executedOrders.map((item) => normalizeText(item)).filter(Boolean);
      const nextExecutionSummary = input.executionSummary === undefined
        ? current.executionSummary
        : (input.executionSummary
          ? {
            ordersExecuted: Math.max(0, toFiniteNumber(input.executionSummary.ordersExecuted, 0)),
            ordersFailed: Math.max(0, toFiniteNumber(input.executionSummary.ordersFailed, 0)),
            totalNotional: Math.max(0, toFiniteNumber(input.executionSummary.totalNotional, 0)),
            newMaxDriftPct: Math.max(0, toFiniteNumber(input.executionSummary.newMaxDriftPct, 0)),
          }
          : null);
      const nextCancelledAt = input.cancelledAt === undefined
        ? current.cancelledAt
        : (input.cancelledAt ? toIsoString(input.cancelledAt, new Date().toISOString()) : null);
      const nextCancelReason = input.cancelReason === undefined
        ? current.cancelReason
        : (input.cancelReason == null ? null : normalizeText(input.cancelReason) || null);
      const nextNotes = input.notes === undefined
        ? current.notes
        : (input.notes == null ? null : normalizeText(input.notes) || null);
      const nextMarketContext = input.marketContext === undefined
        ? current.marketContext
        : (input.marketContext == null ? null : normalizeMarketContextJsonV1(input.marketContext));

      const updatedRes = await query(
        `UPDATE daa_rebalance_cycles
         SET
           status = $2,
           trigger_reason = $3,
           proposals_json = $4::jsonb,
           risk_check_json = $5::jsonb,
           executed_at = $6,
           executed_orders_json = $7::jsonb,
           execution_summary_json = $8::jsonb,
           cancelled_at = $9,
           cancel_reason = $10,
           notes = $11,
           market_context_json = $12::jsonb
         WHERE cycle_id = $1
         RETURNING ${REBALANCE_CYCLE_SELECT_COLUMNS_V1}`,
        [
          cycleId,
          nextStatus,
          nextTriggerReason,
          JSON.stringify(nextProposals),
          JSON.stringify(nextRiskCheck),
          nextExecutedAt,
          JSON.stringify(nextExecutedOrders),
          nextExecutionSummary == null ? null : JSON.stringify(nextExecutionSummary),
          nextCancelledAt,
          nextCancelReason,
          nextNotes,
          nextMarketContext == null ? JSON.stringify({}) : JSON.stringify(nextMarketContext),
        ],
      );

      await query("COMMIT");
      return mapRebalanceCycleRowV1(updatedRes.rows[0] as Record<string, unknown>);
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

const CYCLE_REPORT_SELECT_COLUMNS_V1 = [
  "r.cycle_id",
  "r.before_snapshot_json",
  "r.after_snapshot_json",
  "r.execution_stats_json",
  "r.pnl_attribution_json",
  "r.risk_delta_json",
  "r.created_at",
  "c.trigger_source",
  "c.status AS cycle_status",
  "c.created_at AS cycle_created_at",
].join(", ");

export async function upsertDaaCycleReportV1(input: {
  cycleId: string;
  beforeSnapshot: Record<string, unknown>;
  afterSnapshot: Record<string, unknown>;
  executionStats: Record<string, unknown>;
  pnlAttribution: Record<string, unknown>;
  riskDelta: Record<string, unknown>;
}): Promise<DaaStoreCycleReportV1> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const cycleId = normalizeText(input.cycleId);
    if (!cycleId) throw new Error("cycleId is required");
    const inserted = await query(
      `
      INSERT INTO daa_cycle_reports (
        cycle_id, before_snapshot_json, after_snapshot_json, execution_stats_json, pnl_attribution_json, risk_delta_json, created_at
      ) VALUES (
        $1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, NOW()
      )
      ON CONFLICT (cycle_id) DO UPDATE
      SET
        before_snapshot_json = EXCLUDED.before_snapshot_json,
        after_snapshot_json = EXCLUDED.after_snapshot_json,
        execution_stats_json = EXCLUDED.execution_stats_json,
        pnl_attribution_json = EXCLUDED.pnl_attribution_json,
        risk_delta_json = EXCLUDED.risk_delta_json,
        created_at = NOW()
      RETURNING cycle_id
      `,
      [
        cycleId,
        JSON.stringify(input.beforeSnapshot || {}),
        JSON.stringify(input.afterSnapshot || {}),
        JSON.stringify(input.executionStats || {}),
        JSON.stringify(input.pnlAttribution || {}),
        JSON.stringify(input.riskDelta || {}),
      ],
    );
    const hit = await query(
      `SELECT ${CYCLE_REPORT_SELECT_COLUMNS_V1}
       FROM daa_cycle_reports r
       JOIN daa_rebalance_cycles c ON c.cycle_id = r.cycle_id
       WHERE r.cycle_id = $1
       LIMIT 1`,
      [normalizeText((inserted.rows[0] as Record<string, unknown> | undefined)?.cycle_id, cycleId)],
    );
    if (!hit.rows.length) throw new Error("cycle report upsert failed");
    return mapCycleReportRowV1(hit.rows[0] as Record<string, unknown>);
  });
}

export async function getDaaCycleReportV1(cycleIdRaw: string): Promise<DaaStoreCycleReportV1 | null> {
  await ensureDaaStoreSchemaPgV1();
  const cycleId = normalizeText(cycleIdRaw);
  if (!cycleId) return null;
  return withDaaPgClientV0(async ({ query }) => {
    const result = await query(
      `SELECT ${CYCLE_REPORT_SELECT_COLUMNS_V1}
       FROM daa_cycle_reports r
       JOIN daa_rebalance_cycles c ON c.cycle_id = r.cycle_id
       WHERE r.cycle_id = $1
       LIMIT 1`,
      [cycleId],
    );
    if (!result.rows.length) return null;
    return mapCycleReportRowV1(result.rows[0] as Record<string, unknown>);
  });
}

export async function listDaaCycleReportsV1(limit = 50): Promise<DaaStoreCycleReportV1[]> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const n = Math.max(1, Math.min(200, Math.trunc(toFiniteNumber(limit, 50))));
    const result = await query(
      `SELECT ${CYCLE_REPORT_SELECT_COLUMNS_V1}
       FROM daa_cycle_reports r
       JOIN daa_rebalance_cycles c ON c.cycle_id = r.cycle_id
       ORDER BY r.created_at DESC
       LIMIT $1`,
      [n],
    );
    return result.rows.map((row) => mapCycleReportRowV1(row as Record<string, unknown>));
  });
}

export async function appendDaaTriggerEventV1(input: {
  idempotencyKey: string;
  triggerSource: DaaStoreRebalanceTriggerSourceV1;
  triggerReason: string;
  cycleId?: string | null;
  status?: "accepted" | "skipped" | "conflict";
  detailsJson?: Record<string, unknown>;
}): Promise<DaaStoreTriggerEventV1> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const idempotencyKey = normalizeText(input.idempotencyKey);
    if (!idempotencyKey) throw new Error("idempotencyKey is required");
    const triggerSource = normalizeRebalanceTriggerSourceV1(input.triggerSource);
    const triggerReason = normalizeText(input.triggerReason, "");
    const cycleId = input.cycleId == null ? null : normalizeText(input.cycleId) || null;
    const statusRaw = normalizeText(input.status, "accepted").toLowerCase();
    const status = statusRaw === "skipped" || statusRaw === "conflict" ? statusRaw : "accepted";
    const detailsJson = input.detailsJson || {};
    const eventId = randomUUID();

    const result = await query(
      `
      INSERT INTO daa_trigger_events (
        event_id, idempotency_key, trigger_source, trigger_reason, cycle_id, status, details_json, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7::jsonb, NOW()
      )
      ON CONFLICT (idempotency_key) DO UPDATE
      SET
        trigger_source = EXCLUDED.trigger_source,
        trigger_reason = EXCLUDED.trigger_reason,
        cycle_id = EXCLUDED.cycle_id,
        status = EXCLUDED.status,
        details_json = EXCLUDED.details_json
      RETURNING event_id, idempotency_key, trigger_source, trigger_reason, cycle_id, status, details_json, created_at
      `,
      [eventId, idempotencyKey, triggerSource, triggerReason, cycleId, status, JSON.stringify(detailsJson)],
    );
    return mapTriggerEventRowV1(result.rows[0] as Record<string, unknown>);
  });
}

export async function appendDaaLlmFeedbackV1(input: {
  contextId: string;
  type: "insight" | "decision";
  score: "up" | "down";
  comment?: string;
}): Promise<DaaStoreLlmFeedbackV1> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const contextId = normalizeText(input.contextId);
    if (!contextId) throw new Error("contextId is required");
    const type = input.type === "decision" ? "decision" : "insight";
    const score = input.score === "down" ? "down" : "up";
    const comment = normalizeText(input.comment, "") || null;
    const id = randomUUID();
    const inserted = await query(
      `
      INSERT INTO daa_llm_feedback (id, context_id, type, score, comment, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING id, context_id, type, score, comment, created_at
      `,
      [id, contextId, type, score, comment],
    );
    return mapLlmFeedbackRowV1(inserted.rows[0] as Record<string, unknown>);
  });
}

export async function listDaaLlmFeedbackV1(input: {
  type?: "insight" | "decision";
  limit?: number;
} = {}): Promise<DaaStoreLlmFeedbackV1[]> {
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const limit = Math.max(1, Math.min(500, Math.trunc(toFiniteNumber(input.limit, 100))));
    const params: unknown[] = [];
    const where: string[] = [];
    if (input.type) {
      params.push(input.type === "decision" ? "decision" : "insight");
      where.push(`type = $${params.length}`);
    }
    params.push(limit);
    const sql = [
      "SELECT id, context_id, type, score, comment, created_at",
      "FROM daa_llm_feedback",
      where.length ? `WHERE ${where.join(" AND ")}` : "",
      `ORDER BY created_at DESC LIMIT $${params.length}`,
    ].filter(Boolean).join(" ");
    const result = await query(sql, params);
    return result.rows.map((row) => mapLlmFeedbackRowV1(row as Record<string, unknown>));
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
        "SELECT ticket_id, basket_id, asset_key, cycle_id, source, status, symbol, market, instrument_currency, base_currency, side, qty, price, fee, gross_notional, fx_rate_to_base, notional_in_base, decision_ref_id, reason_tags, reason_text, snapshot_before_json, snapshot_after_json, reject_code, reject_message, pricing_mode, price_source, price_snapshot_at, created_by, created_at, executed_at, canceled_at, updated_at FROM daa_trade_tickets WHERE ticket_id = $1 LIMIT 1 FOR UPDATE",
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
        "SELECT ticket_id, basket_id, asset_key, cycle_id, source, status, symbol, market, instrument_currency, base_currency, side, qty, price, fee, gross_notional, fx_rate_to_base, notional_in_base, decision_ref_id, reason_tags, reason_text, snapshot_before_json, snapshot_after_json, reject_code, reject_message, pricing_mode, price_source, price_snapshot_at, created_by, created_at, executed_at, canceled_at, updated_at FROM daa_trade_tickets WHERE ticket_id = $1 LIMIT 1",
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
        "SELECT ticket_id, basket_id, asset_key, cycle_id, source, status, symbol, market, instrument_currency, base_currency, side, qty, price, fee, gross_notional, fx_rate_to_base, notional_in_base, decision_ref_id, reason_tags, reason_text, snapshot_before_json, snapshot_after_json, reject_code, reject_message, pricing_mode, price_source, price_snapshot_at, created_by, created_at, executed_at, canceled_at, updated_at FROM daa_trade_tickets WHERE ticket_id = $1 LIMIT 1 FOR UPDATE",
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
        "SELECT ticket_id, basket_id, asset_key, cycle_id, source, status, symbol, market, instrument_currency, base_currency, side, qty, price, fee, gross_notional, fx_rate_to_base, notional_in_base, decision_ref_id, reason_tags, reason_text, snapshot_before_json, snapshot_after_json, reject_code, reject_message, pricing_mode, price_source, price_snapshot_at, created_by, created_at, executed_at, canceled_at, updated_at FROM daa_trade_tickets WHERE ticket_id = $1 LIMIT 1",
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
    const cycleId = normalizeText(input.cycleId, "") || null;
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
      const accountState = await ensureAccountStateRowInTxV1(query as any);
      const baseCurrency = normalizeCcyCode(accountState.baseCurrency, "USD");
      const cash = Math.max(0, toFiniteNumber(accountState.cash, 0));

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

      if (cycleId) {
        const cycleRes = await query(
          "SELECT cycle_id FROM daa_rebalance_cycles WHERE cycle_id = $1 LIMIT 1 FOR UPDATE",
          [cycleId],
        );
        if (!cycleRes.rows.length) {
          throw new Error(`cycle not found: ${cycleId}`);
        }
      }

      await query(
        "INSERT INTO daa_trade_tickets (ticket_id, basket_id, asset_key, cycle_id, source, status, symbol, market, instrument_currency, base_currency, side, qty, price, fee, gross_notional, fx_rate_to_base, notional_in_base, decision_ref_id, reason_tags, reason_text, snapshot_before_json, pricing_mode, price_source, price_snapshot_at, created_by, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,'ready',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb,$21,$22,$23,$24,NOW(),NOW())",
        [
          ticketId,
          basketId,
          assetKey,
          cycleId,
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
        "SELECT ticket_id, basket_id, asset_key, cycle_id, source, status, symbol, market, instrument_currency, base_currency, side, qty, price, fee, gross_notional, fx_rate_to_base, notional_in_base, decision_ref_id, reason_tags, reason_text, snapshot_before_json, snapshot_after_json, reject_code, reject_message, pricing_mode, price_source, price_snapshot_at, created_by, created_at, executed_at, canceled_at, updated_at FROM daa_trade_tickets WHERE ticket_id = $1 LIMIT 1",
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
        `SELECT ticket_id, basket_id, asset_key, cycle_id, source, status, symbol, market, instrument_currency, base_currency, side, qty, price, fee, gross_notional, fx_rate_to_base, notional_in_base, decision_ref_id, reason_tags, reason_text, snapshot_before_json, snapshot_after_json, reject_code, reject_message, pricing_mode, price_source, price_snapshot_at, created_by, created_at, executed_at, canceled_at, updated_at FROM daa_trade_tickets WHERE ticket_id IN (${placeholders}) FOR UPDATE`,
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

      const accountState = await getAccountStateForUpdateInTxV1(query as any);
      const baseCurrency = normalizeCcyCode(accountState.baseCurrency, "USD");
      let accountCash = Math.max(0, toFiniteNumber(accountState.cash, 0));
      let accountInvestableCash = resolveInvestableCashV1(accountState.cash, accountState.frozenCash, accountState.investableCash);

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
          costBasis: 0,
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
          if (accountInvestableCash + 1e-9 < cashOut) {
            const rejectMessage = `可投资现金不足：需要 ${cashOut.toFixed(2)} ${baseCurrency}，当前 ${accountInvestableCash.toFixed(2)} ${baseCurrency}`;
            await query(
              "UPDATE daa_trade_tickets SET status = 'rejected', reject_code = 'INSUFFICIENT_INVESTABLE_CASH', reject_message = $1, updated_at = NOW() WHERE ticket_id = $2",
              [rejectMessage, ticket.ticketId],
            );
            results.push({
              ticketId: ticket.ticketId,
              status: "rejected",
              rejectCode: "INSUFFICIENT_INVESTABLE_CASH",
              rejectMessage,
            });
            continue;
          }

          accountCash = Math.max(0, accountCash - cashOut);
          accountInvestableCash = Math.max(0, accountInvestableCash - cashOut);
          const prevQty = Math.max(0, existingPosition.qty);
          const nextQty = prevQty + ticket.qty;
          const prevCostBasis = prevQty > 0
            ? Math.max(0, toFiniteNumber(existingPosition.costBasis, prevQty * Math.max(0, existingPosition.price)))
            : 0;
          const nextCostBasis = prevCostBasis + grossNotional;
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
          accountInvestableCash = Math.max(0, accountInvestableCash + notionalInBase - feeInBase);
          const nextQty = Math.max(0, prevQty - ticket.qty);
          if (nextQty <= 0) {
            positionsMap.delete(positionKey);
          } else {
            const prevCostBasis = Math.max(0, toFiniteNumber(existingPosition.costBasis, prevQty * Math.max(0, existingPosition.price)));
            const costPerUnit = prevQty > 0 ? prevCostBasis / prevQty : 0;
            positionsMap.set(positionKey, {
              ...existingPosition,
              qty: nextQty,
              price: ticket.price,
              costBasis: Math.max(0, costPerUnit * nextQty),
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

        const ledgerSide: DaaStoreCashLedgerSideV1 = ticket.side === "BUY" ? "withdraw" : "deposit";
        const ledgerAmountInBase = ticket.side === "BUY"
          ? (notionalInBase + feeInBase)
          : Math.max(0, notionalInBase - feeInBase);
        await query(
          `INSERT INTO daa_cash_ledger (
             id, ts, side, amount, base_currency, entry_kind, account_base_currency, amount_in_account_base, fx_rate_to_account, ticket_id, cycle_id, settlement_ts, note, created_at
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW()
           )
           ON CONFLICT (ticket_id) DO NOTHING`,
          [
            randomUUID(),
            nowIso,
            ledgerSide,
            ledgerAmountInBase,
            baseCurrency,
            "trade_execution",
            baseCurrency,
            ledgerAmountInBase,
            1,
            ticket.ticketId,
            ticket.cycleId,
            nowIso,
            `${ticket.side} ${ticket.symbol} ${ticket.qty.toFixed(6)} @ ${ticket.price.toFixed(4)}`,
          ],
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

      const valuation = await buildPortfolioSnapshotFromAssetUniverseInTxV1(query as DaaTxQueryFnV1, {
        baseCurrency,
        cash: accountCash,
      });
      const account = await syncStrategyAccountCashInTxV1(query as DaaTxQueryFnV1, accountCash, {
        totalEquity: valuation.totalEquity,
      });
      const holdingsValue = valuation.holdingsValue;
      const totalEquity = valuation.totalEquity;
      const accountWithEquity = {
        ...account,
        totalEquity,
      };
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
            account: accountWithEquity,
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
        `SELECT ticket_id, basket_id, asset_key, cycle_id, source, status, symbol, market, instrument_currency, base_currency, side, qty, price, fee, gross_notional, fx_rate_to_base, notional_in_base, decision_ref_id, reason_tags, reason_text, snapshot_before_json, snapshot_after_json, reject_code, reject_message, pricing_mode, price_source, price_snapshot_at, created_by, created_at, executed_at, canceled_at, updated_at FROM daa_trade_tickets WHERE ticket_id IN (${placeholders}) ORDER BY created_at DESC`,
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
        account: accountWithEquity,
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
  const email = system.config.notification.email;
  const telegram = system.config.notification.telegram;
  return {
    id: "default",
    enabled: Boolean(telegram.enabled || email.onSuggestionGenerated || email.dailyReport),
    notifyOnDrift: Boolean(telegram.onDriftTrigger || email.dailyReport),
    notifyOnRebalance: Boolean(email.onSuggestionGenerated || telegram.onTradeExecuted),
    notifyOnPriceAlert: false,
    updatedAt: system.updatedAt,
  };
}

export async function saveDaaNotificationConfigV1(input: Partial<DaaStoreNotificationConfigV1>): Promise<DaaStoreNotificationConfigV1> {
  const current = await getDaaSystemConfigV2();
  const currentEmail = current.config.notification.email;
  const currentTelegram = current.config.notification.telegram;
  const next = normalizeSystemConfigV2({
    ...current.config,
    notification: {
      email: {
        ...currentEmail,
        onSuggestionGenerated: input.notifyOnRebalance ?? currentEmail.onSuggestionGenerated,
        dailyReport: input.notifyOnDrift ?? currentEmail.dailyReport,
      },
      telegram: {
        ...currentTelegram,
        enabled: input.enabled ?? currentTelegram.enabled,
        onDriftTrigger: input.notifyOnDrift ?? currentTelegram.onDriftTrigger,
        onTradeExecuted: input.notifyOnRebalance ?? currentTelegram.onTradeExecuted,
      },
    },
  });
  const saved = await saveDaaSystemConfigV2({ config: next, baseVersion: current.version });
  const email = saved.config.notification.email;
  const telegram = saved.config.notification.telegram;
  return {
    id: "default",
    enabled: Boolean(telegram.enabled || email.onSuggestionGenerated || email.dailyReport),
    notifyOnDrift: Boolean(telegram.onDriftTrigger || email.dailyReport),
    notifyOnRebalance: Boolean(email.onSuggestionGenerated || telegram.onTradeExecuted),
    notifyOnPriceAlert: false,
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

export async function appendAssetPriceHistoryRowsV1(rows: Array<{ assetKey: string; ts?: string; price: number; source?: string }>): Promise<number> {
  if (!rows.length) return 0;
  await ensureDaaStoreSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    let inserted = 0;
    await query("BEGIN");
    try {
      for (const row of rows) {
        const parsedAssetKey = parseDaaAssetKeyV1(row.assetKey);
        if (!parsedAssetKey) {
          throw new Error(`price history assetKey invalid: ${normalizeText(row.assetKey) || "unknown"}`);
        }
        const assetKey = buildDaaAssetKeyV1(parsedAssetKey.symbol, parsedAssetKey.market);
        const price = Math.max(0, toFiniteNumber(row.price));
        if (!assetKey || price <= 0) continue;
        const ts = toIsoString(row.ts, new Date().toISOString());
        const source = normalizeText(row.source, "yfinance");

        await query(
          "INSERT INTO daa_price_history (symbol, ts, price, source) VALUES ($1,$2,$3,$4) ON CONFLICT (symbol, ts) DO UPDATE SET price = EXCLUDED.price, source = EXCLUDED.source",
          [assetKey, ts, price, source],
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

const MARKET_PRICE_SNAPSHOT_SELECT_COLUMNS_V1 = [
  "provider",
  "market",
  "symbol",
  "normalized_symbol",
  "currency",
  "price",
  "status",
  "as_of_ts",
  "fetched_at",
  "source",
  "error_code",
  "error_message",
  "raw_ref_id",
  "updated_at",
].join(", ");

const NEWS_ITEM_SNAPSHOT_SELECT_COLUMNS_V1 = [
  "provider",
  "symbol",
  "item_hash",
  "title",
  "link",
  "published_at",
  "fetched_at",
  "sentiment_score",
  "source_credibility",
  "freshness",
  "raw_ref_id",
].join(", ");

const NEWS_SIGNAL_SNAPSHOT_SELECT_COLUMNS_V1 = [
  "provider",
  "symbol",
  "score_pct",
  "confidence_pct",
  "evidence_count",
  "reasons_json",
  "generated_at",
  "updated_at",
].join(", ");

const MARKET_INDICATOR_SNAPSHOT_SELECT_COLUMNS_V1 = [
  "id",
  "indicator_key",
  "scope",
  "subject_key",
  "stance",
  "risk_off_score_pct",
  "confidence_pct",
  "raw_value",
  "unit",
  "percentile_252",
  "zscore_60",
  "trend_1d_pct",
  "trend_7d_pct",
  "trend_30d_pct",
  "source",
  "reasons_json",
  "components_json",
  "generated_at",
  "expire_at",
  "created_at",
].join(", ");

const HF_HOLDING_SNAPSHOT_SELECT_COLUMNS_V1 = [
  "provider",
  "fund_code",
  "report_date",
  "symbol",
  "market",
  "weight_pct",
  "prev_weight_pct",
  "disclosed_at",
  "confidence_pct",
  "source_ref",
  "fetched_at",
  "raw_ref_id",
].join(", ");

const HF_SIGNAL_SNAPSHOT_SELECT_COLUMNS_V1 = [
  "provider",
  "symbol",
  "aggregated_score_pct",
  "conviction_pct",
  "thesis_drift_pct",
  "fund_count",
  "funds_json",
  "generated_at",
  "updated_at",
].join(", ");

const RAW_PAYLOAD_SELECT_COLUMNS_V1 = [
  "id",
  "provider",
  "resource",
  "subject_key",
  "request_url",
  "request_json",
  "response_status",
  "response_headers_json",
  "payload_json",
  "payload_text",
  "fetched_at",
  "expire_at",
  "created_at",
].join(", ");

const INGEST_JOB_LOG_SELECT_COLUMNS_V1 = [
  "job_id",
  "job_type",
  "trigger_source",
  "status",
  "started_at",
  "finished_at",
  "total_count",
  "success_count",
  "failure_count",
  "diagnostics_json",
].join(", ");

function normalizeUpperV1(value: unknown, fallback = ""): string {
  return normalizeText(value, fallback).toUpperCase();
}

async function withPgTransactionV1<T>(
  query: (sql: string, params?: unknown[]) => Promise<unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  await query("BEGIN");
  try {
    const result = await fn();
    await query("COMMIT");
    return result;
  } catch (error) {
    try {
      await query("ROLLBACK");
    } catch {
      // ignore
    }
    throw error;
  }
}

function normalizeMarketPriceStatusV1(value: unknown, fallback: DaaStoreMarketPriceStatusV1 = "missing"): DaaStoreMarketPriceStatusV1 {
  const status = normalizeText(value, fallback).toLowerCase();
  if (status === "fresh" || status === "stale" || status === "missing" || status === "error" || status === "unsupported") {
    return status;
  }
  return fallback;
}

function normalizeFxHistoryStatusV1(value: unknown, fallback: DaaStoreFxRateHistoryStatusV1 = "fresh"): DaaStoreFxRateHistoryStatusV1 {
  const status = normalizeText(value, fallback).toLowerCase();
  if (status === "fresh" || status === "stale" || status === "missing" || status === "error") return status;
  return fallback;
}

function normalizeIngestJobStatusV1(value: unknown, fallback: DaaStoreIngestJobStatusV1 = "ok"): DaaStoreIngestJobStatusV1 {
  const status = normalizeText(value, fallback).toLowerCase();
  if (status === "ok" || status === "partial" || status === "failed") return status;
  return fallback;
}

function hashTokenV1(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}

function mapMarketPriceSnapshotRowV1(row: Record<string, unknown>): DaaStoreMarketPriceSnapshotV1 {
  const price = Math.max(0, toFiniteNumber(row.price, 0));
  const status = normalizeMarketPriceStatusV1(row.status, "missing");
  const semanticUpdatedAt = row.as_of_ts == null ? null : toIsoString(row.as_of_ts, new Date().toISOString());
  const persistedFetchedAt = row.fetched_at == null ? null : toIsoString(row.fetched_at, new Date().toISOString());
  const priceUpdatedAt = price > 0 && status !== "missing" && status !== "error" && status !== "unsupported"
    ? (semanticUpdatedAt || (status === "fresh" ? persistedFetchedAt : null))
    : null;
  return {
    provider: normalizeText(row.provider, "yfinance"),
    market: normalizeUpperV1(row.market, "US"),
    symbol: normalizeUpperV1(row.symbol),
    normalizedSymbol: normalizeUpperV1(row.normalized_symbol || row.symbol),
    currency: normalizeUpperV1(row.currency, "USD"),
    price,
    status,
    priceUpdatedAt,
    source: normalizeText(row.source, "market_cache"),
    errorCode: row.error_code == null ? null : normalizeText(row.error_code) || null,
    errorMessage: row.error_message == null ? null : normalizeText(row.error_message) || null,
    rawRefId: row.raw_ref_id == null ? null : normalizeText(row.raw_ref_id) || null,
    updatedAt: toIsoString(row.updated_at, new Date().toISOString()),
  };
}

function mapMarketPriceHistoryRowV1(row: Record<string, unknown>): DaaStoreMarketPriceHistoryV1 {
  return {
    provider: normalizeText(row.provider, "yfinance"),
    market: normalizeUpperV1(row.market, "US"),
    symbol: normalizeUpperV1(row.symbol),
    ts: toIsoString(row.as_of_ts, new Date().toISOString()),
    price: Math.max(0, toFiniteNumber(row.price, 0)),
    currency: normalizeUpperV1(row.currency, "USD"),
    source: normalizeText(row.source, "market_cache"),
    rawRefId: row.raw_ref_id == null ? null : normalizeText(row.raw_ref_id) || null,
  };
}

function mapNewsItemSnapshotRowV1(row: Record<string, unknown>): DaaStoreNewsItemSnapshotV1 {
  return {
    provider: normalizeText(row.provider, "yahoo_rss"),
    symbol: normalizeUpperV1(row.symbol),
    itemHash: normalizeText(row.item_hash),
    title: normalizeText(row.title),
    link: row.link == null ? null : normalizeText(row.link) || null,
    publishedAt: row.published_at == null ? null : toIsoString(row.published_at, new Date().toISOString()),
    fetchedAt: toIsoString(row.fetched_at, new Date().toISOString()),
    sentimentScore: toFiniteNumber(row.sentiment_score, 0),
    sourceCredibility: clampNumberV1(toFiniteNumber(row.source_credibility, 0), 0, 1),
    freshness: clampNumberV1(toFiniteNumber(row.freshness, 0), 0, 1),
    rawRefId: row.raw_ref_id == null ? null : normalizeText(row.raw_ref_id) || null,
  };
}

function mapNewsSignalSnapshotRowV1(row: Record<string, unknown>): DaaStoreNewsSignalSnapshotV1 {
  return {
    provider: normalizeText(row.provider, "yahoo_rss"),
    symbol: normalizeUpperV1(row.symbol),
    scorePct: clampNumberV1(toFiniteNumber(row.score_pct, 50), 0, 100),
    confidencePct: clampNumberV1(toFiniteNumber(row.confidence_pct, 0), 0, 100),
    evidenceCount: Math.max(0, Math.trunc(toFiniteNumber(row.evidence_count, 0))),
    reasonsJson: parseJsonb<string[]>(row.reasons_json, []).map((item) => String(item || "").trim()).filter(Boolean),
    generatedAt: toIsoString(row.generated_at, new Date().toISOString()),
    updatedAt: toIsoString(row.updated_at, new Date().toISOString()),
  };
}

function mapMarketIndicatorSnapshotRowV1(row: Record<string, unknown>): DaaStoreMarketIndicatorSnapshotV1 {
  return {
    id: normalizeText(row.id),
    key: normalizeMarketIndicatorKeyV1(row.indicator_key) || "vix",
    scope: normalizeText(row.scope, "us_equity"),
    subjectKey: normalizeText(row.subject_key, "GLOBAL"),
    stance: normalizeMarketRegimeV1Store(row.stance),
    riskOffScorePct: clampNumberV1(toFiniteNumber(row.risk_off_score_pct, 50), 0, 100),
    confidencePct: clampNumberV1(toFiniteNumber(row.confidence_pct, 40), 0, 100),
    rawValue: row.raw_value == null ? null : toFiniteNumber(row.raw_value, 0),
    unit: row.unit == null ? null : normalizeText(row.unit) || null,
    percentile252: row.percentile_252 == null ? null : toFiniteNumber(row.percentile_252, 0),
    zscore60: row.zscore_60 == null ? null : toFiniteNumber(row.zscore_60, 0),
    trend1dPct: row.trend_1d_pct == null ? null : toFiniteNumber(row.trend_1d_pct, 0),
    trend7dPct: row.trend_7d_pct == null ? null : toFiniteNumber(row.trend_7d_pct, 0),
    trend30dPct: row.trend_30d_pct == null ? null : toFiniteNumber(row.trend_30d_pct, 0),
    source: normalizeText(row.source, "market_cache"),
    reasonsJson: normalizeStringArrayV1(parseJsonb<unknown[]>(row.reasons_json, [])),
    componentsJson: parseJsonb<Record<string, unknown>>(row.components_json, {}),
    generatedAt: toIsoString(row.generated_at, new Date().toISOString()),
    expireAt: row.expire_at == null ? null : toIsoString(row.expire_at, new Date().toISOString()),
    createdAt: toIsoString(row.created_at, new Date().toISOString()),
  };
}

function mapHfHoldingSnapshotRowV1(row: Record<string, unknown>): DaaStoreHfHoldingSnapshotV1 {
  const reportDate = String(row.report_date || "").trim();
  return {
    provider: normalizeText(row.provider, "danjuan"),
    fundCode: normalizeText(row.fund_code),
    reportDate: /^\d{4}-\d{2}-\d{2}$/.test(reportDate) ? reportDate : toIsoString(row.report_date, new Date().toISOString()).slice(0, 10),
    symbol: normalizeUpperV1(row.symbol),
    market: normalizeUpperV1(row.market, "UNKNOWN"),
    weightPct: Math.max(0, toFiniteNumber(row.weight_pct, 0)),
    prevWeightPct: Math.max(0, toFiniteNumber(row.prev_weight_pct, 0)),
    disclosedAt: row.disclosed_at == null ? null : toIsoString(row.disclosed_at, new Date().toISOString()),
    confidencePct: clampNumberV1(toFiniteNumber(row.confidence_pct, 0), 0, 100),
    sourceRef: row.source_ref == null ? null : normalizeText(row.source_ref) || null,
    fetchedAt: toIsoString(row.fetched_at, new Date().toISOString()),
    rawRefId: row.raw_ref_id == null ? null : normalizeText(row.raw_ref_id) || null,
  };
}

function mapHfSignalSnapshotRowV1(row: Record<string, unknown>): DaaStoreHfSignalSnapshotV1 {
  return {
    provider: normalizeText(row.provider, "human_signal"),
    symbol: normalizeUpperV1(row.symbol),
    aggregatedScorePct: clampNumberV1(toFiniteNumber(row.aggregated_score_pct, 0), 0, 100),
    convictionPct: clampNumberV1(toFiniteNumber(row.conviction_pct, 0), 0, 100),
    thesisDriftPct: clampNumberV1(toFiniteNumber(row.thesis_drift_pct, 0), 0, 100),
    fundCount: Math.max(0, Math.trunc(toFiniteNumber(row.fund_count, 0))),
    fundsJson: parseJsonb<Array<Record<string, unknown>>>(row.funds_json, []),
    generatedAt: toIsoString(row.generated_at, new Date().toISOString()),
    updatedAt: toIsoString(row.updated_at, new Date().toISOString()),
  };
}

function mapExternalPayloadRawRowV1(row: Record<string, unknown>): DaaStoreExternalPayloadRawV1 {
  return {
    id: normalizeText(row.id),
    provider: normalizeText(row.provider),
    resource: normalizeText(row.resource),
    subjectKey: normalizeText(row.subject_key),
    requestUrl: normalizeText(row.request_url),
    requestJson: parseJsonb<Record<string, unknown>>(row.request_json, {}),
    responseStatus: Math.max(0, Math.trunc(toFiniteNumber(row.response_status, 0))),
    responseHeadersJson: parseJsonb<Record<string, unknown>>(row.response_headers_json, {}),
    payloadJson: row.payload_json == null ? null : parseJsonb<Record<string, unknown>>(row.payload_json, {}),
    payloadText: row.payload_text == null ? null : String(row.payload_text),
    fetchedAt: toIsoString(row.fetched_at, new Date().toISOString()),
    expireAt: toIsoString(row.expire_at, new Date().toISOString()),
    createdAt: toIsoString(row.created_at, new Date().toISOString()),
  };
}

function mapIngestJobLogRowV1(row: Record<string, unknown>): DaaStoreIngestJobLogV1 {
  return {
    jobId: normalizeText(row.job_id),
    jobType: normalizeText(row.job_type),
    triggerSource: normalizeText(row.trigger_source, "manual"),
    status: normalizeIngestJobStatusV1(row.status, "ok"),
    startedAt: toIsoString(row.started_at, new Date().toISOString()),
    finishedAt: toIsoString(row.finished_at, new Date().toISOString()),
    totalCount: Math.max(0, Math.trunc(toFiniteNumber(row.total_count, 0))),
    successCount: Math.max(0, Math.trunc(toFiniteNumber(row.success_count, 0))),
    failureCount: Math.max(0, Math.trunc(toFiniteNumber(row.failure_count, 0))),
    diagnosticsJson: parseJsonb<Record<string, unknown>>(row.diagnostics_json, {}),
  };
}

function clampNumberV1(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value <= min) return min;
  if (value >= max) return max;
  return value;
}

export async function ensureDaaMarketCacheSchemaPgV1(): Promise<void> {
  const st = getStoreStateV1();
  if (st.marketCacheSchemaInit) {
    await st.marketCacheSchemaInit;
    return;
  }
  st.marketCacheSchemaInit = withDaaPgClientV0(async ({ query }) => {
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
          generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (provider, symbol)
        );
        CREATE INDEX IF NOT EXISTS idx_daa_news_signal_snapshot_v1_generated_desc
          ON daa_news_signal_snapshot_v1(generated_at DESC);

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

        CREATE TABLE IF NOT EXISTS daa_ingest_job_log_v1 (
          job_id TEXT PRIMARY KEY,
          job_type TEXT NOT NULL,
          trigger_source TEXT NOT NULL DEFAULT 'manual',
          status TEXT NOT NULL CHECK (status IN ('ok','partial','failed')),
          started_at TIMESTAMPTZ NOT NULL,
          finished_at TIMESTAMPTZ NOT NULL,
          total_count INTEGER NOT NULL DEFAULT 0,
          success_count INTEGER NOT NULL DEFAULT 0,
          failure_count INTEGER NOT NULL DEFAULT 0,
          diagnostics_json JSONB NOT NULL DEFAULT '{}'::jsonb
        );
        CREATE INDEX IF NOT EXISTS idx_daa_ingest_job_log_v1_job_type_started_desc
          ON daa_ingest_job_log_v1(job_type, started_at DESC);
      `);
      await query("COMMIT");
    } catch (error) {
      try {
        await query("ROLLBACK");
      } catch {
        // ignore
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

export async function appendDaaExternalPayloadRawV1(input: {
  provider: string;
  resource: string;
  subjectKey?: string;
  requestUrl?: string;
  requestJson?: Record<string, unknown>;
  responseStatus?: number;
  responseHeadersJson?: Record<string, unknown>;
  payloadJson?: Record<string, unknown> | null;
  payloadText?: string | null;
  fetchedAt?: string;
  expireAt?: string;
}): Promise<DaaStoreExternalPayloadRawV1> {
  await ensureDaaMarketCacheSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const id = randomUUID();
    const provider = normalizeText(input.provider, "unknown");
    const resource = normalizeText(input.resource, "unknown");
    const subjectKey = normalizeText(input.subjectKey, "");
    const requestUrl = normalizeText(input.requestUrl, "");
    const requestJson = input.requestJson && typeof input.requestJson === "object" ? input.requestJson : {};
    const responseStatus = Math.max(0, Math.trunc(toFiniteNumber(input.responseStatus, 0)));
    const responseHeadersJson = input.responseHeadersJson && typeof input.responseHeadersJson === "object" ? input.responseHeadersJson : {};
    const payloadJson = input.payloadJson && typeof input.payloadJson === "object" ? input.payloadJson : null;
    const payloadText = input.payloadText == null ? null : String(input.payloadText);
    const fetchedAt = toIsoString(input.fetchedAt, new Date().toISOString());
    const expireAt = toIsoString(input.expireAt, new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString());

    await query(
      `INSERT INTO daa_external_payload_raw_v1
        (id, provider, resource, subject_key, request_url, request_json, response_status, response_headers_json, payload_json, payload_text, fetched_at, expire_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb,$9::jsonb,$10,$11,$12,NOW())`,
      [id, provider, resource, subjectKey, requestUrl, JSON.stringify(requestJson), responseStatus, JSON.stringify(responseHeadersJson), payloadJson == null ? null : JSON.stringify(payloadJson), payloadText, fetchedAt, expireAt],
    );
    const res = await query(
      `SELECT ${RAW_PAYLOAD_SELECT_COLUMNS_V1} FROM daa_external_payload_raw_v1 WHERE id = $1 LIMIT 1`,
      [id],
    );
    return mapExternalPayloadRawRowV1(res.rows[0] as Record<string, unknown>);
  });
}

export async function deleteExpiredDaaExternalPayloadRawV1(nowIso = new Date().toISOString()): Promise<number> {
  await ensureDaaMarketCacheSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const result = await query(
      "DELETE FROM daa_external_payload_raw_v1 WHERE expire_at <= $1",
      [toIsoString(nowIso, new Date().toISOString())],
    );
    return Math.max(0, Math.trunc(toFiniteNumber(result.rowCount, 0)));
  });
}

export async function upsertDaaMarketPriceSnapshotsV1(rows: Array<Partial<DaaStoreMarketPriceSnapshotV1>>): Promise<DaaStoreMarketPriceSnapshotV1[]> {
  if (!rows.length) return [];
  await ensureDaaMarketCacheSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const out: DaaStoreMarketPriceSnapshotV1[] = [];
    await withPgTransactionV1(query, async () => {
      for (const row of rows) {
        const provider = normalizeText(row.provider, "yfinance");
        const market = normalizeUpperV1(row.market, "US");
        const symbol = normalizeUpperV1(row.symbol);
        if (!symbol) continue;
        const normalizedSymbol = normalizeUpperV1(row.normalizedSymbol, symbol);
        const currency = normalizeUpperV1(row.currency, "USD");
        const price = Math.max(0, toFiniteNumber(row.price, 0));
        const status = normalizeMarketPriceStatusV1(row.status, price > 0 ? "fresh" : "missing");
        const priceUpdatedAt = row.priceUpdatedAt ? toIsoString(row.priceUpdatedAt, new Date().toISOString()) : (price > 0 ? new Date().toISOString() : null);
        const persistedFetchedAt = priceUpdatedAt || new Date().toISOString();
        const source = normalizeText(row.source, "market_cache");
        const errorCode = row.errorCode == null ? null : normalizeText(row.errorCode) || null;
        const errorMessage = row.errorMessage == null ? null : normalizeText(row.errorMessage) || null;
        const rawRefId = row.rawRefId == null ? null : normalizeText(row.rawRefId) || null;

        const result = await query(
          `INSERT INTO daa_market_price_snapshot
            (provider, market, symbol, normalized_symbol, currency, price, status, as_of_ts, fetched_at, source, error_code, error_message, raw_ref_id, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
           ON CONFLICT (provider, market, symbol)
           DO UPDATE SET
             normalized_symbol = EXCLUDED.normalized_symbol,
             currency = EXCLUDED.currency,
             price = EXCLUDED.price,
             status = EXCLUDED.status,
             as_of_ts = EXCLUDED.as_of_ts,
             fetched_at = EXCLUDED.fetched_at,
             source = EXCLUDED.source,
             error_code = EXCLUDED.error_code,
             error_message = EXCLUDED.error_message,
             raw_ref_id = EXCLUDED.raw_ref_id,
             updated_at = NOW()
           RETURNING ${MARKET_PRICE_SNAPSHOT_SELECT_COLUMNS_V1}`,
          [provider, market, symbol, normalizedSymbol, currency, price, status, priceUpdatedAt, persistedFetchedAt, source, errorCode, errorMessage, rawRefId],
        );
        if (result.rows.length > 0) {
          out.push(mapMarketPriceSnapshotRowV1(result.rows[0] as Record<string, unknown>));
        }
      }
    });
    return out;
  });
}

export async function getDaaMarketPriceSnapshotV1(input: {
  provider?: string;
  market: string;
  symbol: string;
}): Promise<DaaStoreMarketPriceSnapshotV1 | null> {
  await ensureDaaMarketCacheSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const provider = normalizeText(input.provider, "yfinance");
    const market = normalizeUpperV1(input.market, "US");
    const symbol = normalizeUpperV1(input.symbol);
    if (!symbol) return null;
    const result = await query(
      `SELECT ${MARKET_PRICE_SNAPSHOT_SELECT_COLUMNS_V1}
       FROM daa_market_price_snapshot
       WHERE provider = $1 AND market = $2 AND symbol = $3
       LIMIT 1`,
      [provider, market, symbol],
    );
    if (!result.rows.length) return null;
    return mapMarketPriceSnapshotRowV1(result.rows[0] as Record<string, unknown>);
  });
}

export async function listDaaMarketPriceSnapshotsV1(input: {
  provider?: string;
  markets?: string[];
  symbols?: string[];
  limit?: number;
} = {}): Promise<DaaStoreMarketPriceSnapshotV1[]> {
  await ensureDaaMarketCacheSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const where: string[] = [];
    const params: unknown[] = [];
    if (input.provider) {
      params.push(normalizeText(input.provider));
      where.push(`provider = $${params.length}`);
    }
    const markets = Array.isArray(input.markets)
      ? [...new Set(input.markets.map((item) => normalizeUpperV1(item)).filter(Boolean))]
      : [];
    if (markets.length > 0) {
      params.push(markets);
      where.push(`market = ANY($${params.length})`);
    }
    const symbols = Array.isArray(input.symbols)
      ? [...new Set(input.symbols.map((item) => normalizeUpperV1(item)).filter(Boolean))]
      : [];
    if (symbols.length > 0) {
      params.push(symbols);
      where.push(`symbol = ANY($${params.length})`);
    }
    const limit = Math.max(1, Math.min(5000, Math.trunc(toFiniteNumber(input.limit, 2000))));
    params.push(limit);
    const result = await query(
      `SELECT ${MARKET_PRICE_SNAPSHOT_SELECT_COLUMNS_V1}
       FROM daa_market_price_snapshot
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY fetched_at DESC
       LIMIT $${params.length}`,
      params,
    );
    return result.rows.map((row) => mapMarketPriceSnapshotRowV1(row as Record<string, unknown>));
  });
}

export async function listLatestDaaMarketPriceHistoryRowsV1(input: {
  provider?: string;
  markets?: string[];
  symbols?: string[];
  limit?: number;
} = {}): Promise<DaaStoreMarketPriceHistoryV1[]> {
  await ensureDaaMarketCacheSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const where: string[] = ["price > 0"];
    const params: unknown[] = [];
    if (input.provider) {
      params.push(normalizeText(input.provider));
      where.push(`provider = $${params.length}`);
    }
    const markets = Array.isArray(input.markets)
      ? [...new Set(input.markets.map((item) => normalizeUpperV1(item)).filter(Boolean))]
      : [];
    if (markets.length > 0) {
      params.push(markets);
      where.push(`market = ANY($${params.length})`);
    }
    const symbols = Array.isArray(input.symbols)
      ? [...new Set(input.symbols.map((item) => normalizeUpperV1(item)).filter(Boolean))]
      : [];
    if (symbols.length > 0) {
      params.push(symbols);
      where.push(`symbol = ANY($${params.length})`);
    }
    const limit = Math.max(1, Math.min(5000, Math.trunc(toFiniteNumber(input.limit, 2000))));
    params.push(limit);
    const result = await query(
      `SELECT provider, market, symbol, as_of_ts, price, currency, source, raw_ref_id
       FROM (
         SELECT DISTINCT ON (provider, market, symbol)
           provider, market, symbol, as_of_ts, price, currency, source, raw_ref_id
         FROM daa_market_price_history_v1
         WHERE ${where.join(" AND ")}
         ORDER BY provider, market, symbol, as_of_ts DESC
       ) latest
       ORDER BY as_of_ts DESC
       LIMIT $${params.length}`,
      params,
    );
    return result.rows.map((row) => mapMarketPriceHistoryRowV1(row as Record<string, unknown>));
  });
}

export async function appendDaaMarketPriceHistoryRowsV1(rows: Array<Partial<DaaStoreMarketPriceHistoryV1>>): Promise<number> {
  if (!rows.length) return 0;
  await ensureDaaMarketCacheSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    let inserted = 0;
    await withPgTransactionV1(query, async () => {
      for (const row of rows) {
        const provider = normalizeText(row.provider, "yfinance");
        const market = normalizeUpperV1(row.market, "US");
        const symbol = normalizeUpperV1(row.symbol);
        const price = Math.max(0, toFiniteNumber(row.price, 0));
        if (!symbol || !(price > 0)) continue;
        const ts = toIsoString(row.ts, new Date().toISOString());
        const currency = normalizeUpperV1(row.currency, "USD");
        const source = normalizeText(row.source, "market_cache");
        const rawRefId = row.rawRefId == null ? null : normalizeText(row.rawRefId) || null;
        await query(
          `INSERT INTO daa_market_price_history_v1
            (provider, market, symbol, as_of_ts, price, currency, source, fetched_at, raw_ref_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (provider, market, symbol, as_of_ts)
           DO UPDATE SET
             price = EXCLUDED.price,
             currency = EXCLUDED.currency,
             source = EXCLUDED.source,
             fetched_at = EXCLUDED.fetched_at,
             raw_ref_id = EXCLUDED.raw_ref_id`,
          [provider, market, symbol, ts, price, currency, source, ts, rawRefId],
        );
        inserted += 1;
      }
    });
    return inserted;
  });
}

export async function appendDaaFxRateHistoryRowsV1(rows: Array<Partial<DaaStoreFxRateHistoryV1>>): Promise<number> {
  if (!rows.length) return 0;
  await ensureDaaMarketCacheSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    let inserted = 0;
    await withPgTransactionV1(query, async () => {
      for (const row of rows) {
        const provider = normalizeText(row.provider, "yfinance");
        const baseCcy = normalizeUpperV1(row.baseCcy, "USD");
        const quoteCcy = normalizeUpperV1(row.quoteCcy, "USD");
        const status = normalizeFxHistoryStatusV1(row.status, "fresh");
        const rate = Math.max(0, toFiniteNumber(row.rate, 0));
        if (!baseCcy || !quoteCcy) continue;
        if (!(rate > 0) && status !== "error" && status !== "missing") continue;
        const asOfTs = toIsoString(row.asOfTs, new Date().toISOString());
        const fetchedAt = toIsoString(row.fetchedAt, new Date().toISOString());
        const errorCode = row.errorCode == null ? null : normalizeText(row.errorCode) || null;
        const errorMessage = row.errorMessage == null ? null : normalizeText(row.errorMessage) || null;
        const rawRefId = row.rawRefId == null ? null : normalizeText(row.rawRefId) || null;

        await query(
          `INSERT INTO daa_fx_rate_history_v1
            (provider, base_ccy, quote_ccy, as_of_ts, rate, status, fetched_at, error_code, error_message, raw_ref_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (provider, base_ccy, quote_ccy, as_of_ts)
           DO UPDATE SET
             rate = EXCLUDED.rate,
             status = EXCLUDED.status,
             fetched_at = EXCLUDED.fetched_at,
             error_code = EXCLUDED.error_code,
             error_message = EXCLUDED.error_message,
             raw_ref_id = EXCLUDED.raw_ref_id`,
          [provider, baseCcy, quoteCcy, asOfTs, rate, status, fetchedAt, errorCode, errorMessage, rawRefId],
        );
        inserted += 1;
      }
    });
    return inserted;
  });
}

export async function upsertDaaNewsItemSnapshotsV1(rows: Array<Partial<DaaStoreNewsItemSnapshotV1>>): Promise<number> {
  if (!rows.length) return 0;
  await ensureDaaMarketCacheSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    let touched = 0;
    await withPgTransactionV1(query, async () => {
      for (const row of rows) {
        const provider = normalizeText(row.provider, "yahoo_rss");
        const symbol = normalizeUpperV1(row.symbol);
        const title = normalizeText(row.title);
        if (!symbol || !title) continue;
        const link = row.link == null ? null : normalizeText(row.link) || null;
        const publishedAt = row.publishedAt ? toIsoString(row.publishedAt, new Date().toISOString()) : null;
        const itemHash = normalizeText(row.itemHash) || hashTokenV1(`${symbol}::${title}::${link || ""}::${publishedAt || ""}`);
        const fetchedAt = toIsoString(row.fetchedAt, new Date().toISOString());
        const sentimentScore = toFiniteNumber(row.sentimentScore, 0);
        const sourceCredibility = clampNumberV1(toFiniteNumber(row.sourceCredibility, 0), 0, 1);
        const freshness = clampNumberV1(toFiniteNumber(row.freshness, 0), 0, 1);
        const rawRefId = row.rawRefId == null ? null : normalizeText(row.rawRefId) || null;
        await query(
          `INSERT INTO daa_news_item_snapshot_v1
            (provider, symbol, item_hash, title, link, published_at, fetched_at, sentiment_score, source_credibility, freshness, raw_ref_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (provider, symbol, item_hash)
           DO UPDATE SET
             title = EXCLUDED.title,
             link = EXCLUDED.link,
             published_at = EXCLUDED.published_at,
             fetched_at = EXCLUDED.fetched_at,
             sentiment_score = EXCLUDED.sentiment_score,
             source_credibility = EXCLUDED.source_credibility,
             freshness = EXCLUDED.freshness,
             raw_ref_id = EXCLUDED.raw_ref_id`,
          [provider, symbol, itemHash, title, link, publishedAt, fetchedAt, sentimentScore, sourceCredibility, freshness, rawRefId],
        );
        touched += 1;
      }
    });
    return touched;
  });
}

export async function listDaaNewsItemsBySymbolV1(input: {
  provider?: string;
  symbol: string;
  limit?: number;
}): Promise<DaaStoreNewsItemSnapshotV1[]> {
  await ensureDaaMarketCacheSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const provider = normalizeText(input.provider, "yahoo_rss");
    const symbol = normalizeUpperV1(input.symbol);
    if (!symbol) return [];
    const limit = Math.max(1, Math.min(200, Math.trunc(toFiniteNumber(input.limit, 20))));
    const result = await query(
      `SELECT ${NEWS_ITEM_SNAPSHOT_SELECT_COLUMNS_V1}
       FROM daa_news_item_snapshot_v1
       WHERE provider = $1 AND symbol = $2
       ORDER BY COALESCE(published_at, fetched_at) DESC
       LIMIT $3`,
      [provider, symbol, limit],
    );
    return result.rows.map((row) => mapNewsItemSnapshotRowV1(row as Record<string, unknown>));
  });
}

export async function upsertDaaNewsSignalSnapshotsV1(rows: Array<Partial<DaaStoreNewsSignalSnapshotV1>>): Promise<number> {
  if (!rows.length) return 0;
  await ensureDaaMarketCacheSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    let touched = 0;
    await withPgTransactionV1(query, async () => {
      for (const row of rows) {
        const provider = normalizeText(row.provider, "yahoo_rss");
        const symbol = normalizeUpperV1(row.symbol);
        if (!symbol) continue;
        const scorePct = clampNumberV1(toFiniteNumber(row.scorePct, 50), 0, 100);
        const confidencePct = clampNumberV1(toFiniteNumber(row.confidencePct, 0), 0, 100);
        const evidenceCount = Math.max(0, Math.trunc(toFiniteNumber(row.evidenceCount, 0)));
        const reasonsJson = Array.isArray(row.reasonsJson) ? row.reasonsJson.map((item) => String(item || "").trim()).filter(Boolean) : [];
        const generatedAt = toIsoString(row.generatedAt, new Date().toISOString());
        const result = await query(
          `INSERT INTO daa_news_signal_snapshot_v1
            (provider, symbol, score_pct, confidence_pct, evidence_count, reasons_json, generated_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,NOW())
           ON CONFLICT (provider, symbol)
           DO UPDATE SET
             score_pct = EXCLUDED.score_pct,
             confidence_pct = EXCLUDED.confidence_pct,
             evidence_count = EXCLUDED.evidence_count,
             reasons_json = EXCLUDED.reasons_json,
             generated_at = EXCLUDED.generated_at,
             updated_at = NOW()
           RETURNING provider`,
          [provider, symbol, scorePct, confidencePct, evidenceCount, JSON.stringify(reasonsJson), generatedAt],
        );
        if (result.rows.length > 0) touched += 1;
      }
    });
    return touched;
  });
}

export async function getDaaNewsSignalSnapshotBySymbolV1(input: {
  provider?: string;
  symbol: string;
}): Promise<DaaStoreNewsSignalSnapshotV1 | null> {
  await ensureDaaMarketCacheSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const provider = normalizeText(input.provider, "yahoo_rss");
    const symbol = normalizeUpperV1(input.symbol);
    if (!symbol) return null;
    const result = await query(
      `SELECT ${NEWS_SIGNAL_SNAPSHOT_SELECT_COLUMNS_V1}
       FROM daa_news_signal_snapshot_v1
       WHERE provider = $1 AND symbol = $2
       LIMIT 1`,
      [provider, symbol],
    );
    if (!result.rows.length) return null;
    return mapNewsSignalSnapshotRowV1(result.rows[0] as Record<string, unknown>);
  });
}

export async function upsertDaaMarketIndicatorSnapshotsV1(rows: Array<Partial<DaaStoreMarketIndicatorSnapshotV1> & Record<string, unknown>>): Promise<number> {
  if (!rows.length) return 0;
  await ensureDaaMarketCacheSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    let touched = 0;
    await withPgTransactionV1(query, async () => {
      for (const row of rows) {
        const indicatorKey = normalizeMarketIndicatorKeyV1(row.indicatorKey ?? row.key);
        if (!indicatorKey) continue;
        const scope = normalizeText(row.scope, "us_equity");
        const subjectKey = normalizeText(row.subjectKey, "GLOBAL").toUpperCase();
        const generatedAt = toIsoString(row.generatedAt, new Date().toISOString());
        const id = normalizeText(row.id, "") || hashTokenV1(`${indicatorKey}::${scope}::${subjectKey}::${generatedAt}`);
        const stance = normalizeMarketRegimeV1Store(row.stance);
        const riskOffScorePct = clampNumberV1(toFiniteNumber(row.riskOffScorePct, 50), 0, 100);
        const confidencePct = clampNumberV1(toFiniteNumber(row.confidencePct, 40), 0, 100);
        const rawValue = row.rawValue == null ? null : toFiniteNumber(row.rawValue, 0);
        const unit = row.unit == null ? null : normalizeText(row.unit) || null;
        const percentile252 = row.percentile252 == null ? null : toFiniteNumber(row.percentile252, 0);
        const zscore60 = row.zscore60 == null ? null : toFiniteNumber(row.zscore60, 0);
        const trend1dPct = row.trend1dPct == null ? null : toFiniteNumber(row.trend1dPct, 0);
        const trend7dPct = row.trend7dPct == null ? null : toFiniteNumber(row.trend7dPct, 0);
        const trend30dPct = row.trend30dPct == null ? null : toFiniteNumber(row.trend30dPct, 0);
        const source = normalizeText(row.source, "market_cache");
        const reasonsJson = normalizeStringArrayV1(Array.isArray(row.reasonsJson) ? row.reasonsJson : []);
        const componentsJson = row.componentsJson && typeof row.componentsJson === "object" ? row.componentsJson as Record<string, unknown> : {};
        const expireAt = row.expireAt == null ? null : toIsoString(row.expireAt, new Date().toISOString());
        const result = await query(
          `INSERT INTO daa_market_indicator_snapshot_v1
            (id, indicator_key, scope, subject_key, stance, risk_off_score_pct, confidence_pct, raw_value, unit, percentile_252, zscore_60, trend_1d_pct, trend_7d_pct, trend_30d_pct, source, reasons_json, components_json, generated_at, expire_at, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb,$18,$19,NOW())
           ON CONFLICT (id)
           DO UPDATE SET
             stance = EXCLUDED.stance,
             risk_off_score_pct = EXCLUDED.risk_off_score_pct,
             confidence_pct = EXCLUDED.confidence_pct,
             raw_value = EXCLUDED.raw_value,
             unit = EXCLUDED.unit,
             percentile_252 = EXCLUDED.percentile_252,
             zscore_60 = EXCLUDED.zscore_60,
             trend_1d_pct = EXCLUDED.trend_1d_pct,
             trend_7d_pct = EXCLUDED.trend_7d_pct,
             trend_30d_pct = EXCLUDED.trend_30d_pct,
             source = EXCLUDED.source,
             reasons_json = EXCLUDED.reasons_json,
             components_json = EXCLUDED.components_json,
             generated_at = EXCLUDED.generated_at,
             expire_at = EXCLUDED.expire_at
           RETURNING id`,
          [
            id,
            indicatorKey,
            scope,
            subjectKey,
            stance,
            riskOffScorePct,
            confidencePct,
            rawValue,
            unit,
            percentile252,
            zscore60,
            trend1dPct,
            trend7dPct,
            trend30dPct,
            source,
            JSON.stringify(reasonsJson),
            JSON.stringify(componentsJson),
            generatedAt,
            expireAt,
          ],
        );
        if (result.rows.length > 0) touched += 1;
      }
    });
    return touched;
  });
}

export async function listLatestDaaMarketIndicatorSnapshotsV1(): Promise<DaaStoreMarketIndicatorSnapshotV1[]> {
  await ensureDaaMarketCacheSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const supportedKeys = ["vix", "qqq_spy_ratio", "fxi_volatility", "kweb_fxi_ratio", "btc_eth_ratio", "btc_volatility", "gold_silver_ratio"];
    const result = await query(
      `SELECT DISTINCT ON (indicator_key) ${MARKET_INDICATOR_SNAPSHOT_SELECT_COLUMNS_V1}
       FROM daa_market_indicator_snapshot_v1
       WHERE indicator_key = ANY($1::text[])
       ORDER BY indicator_key, generated_at DESC`,
      [supportedKeys],
    );
    return result.rows.map((row) => mapMarketIndicatorSnapshotRowV1(row as Record<string, unknown>));
  });
}

export async function listDaaMarketIndicatorHistoryV1(input: {
  keys: DaaMarketIndicatorKeyV1[];
  days: number;
  scope?: string | null;
}): Promise<DaaStoreMarketIndicatorSnapshotV1[]> {
  await ensureDaaMarketCacheSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const keys = [...new Set((input.keys || []).map((item) => normalizeMarketIndicatorKeyV1(item)).filter(Boolean))] as DaaMarketIndicatorKeyV1[];
    if (!keys.length) return [];
    const days = Math.max(1, Math.min(365, Math.trunc(toFiniteNumber(input.days, 90))));
    const since = new Date(Date.now() - (days * 24 * 60 * 60 * 1000)).toISOString();
    const scope = normalizeText(input.scope, "");
    const result = scope
      ? await query(
        `SELECT ${MARKET_INDICATOR_SNAPSHOT_SELECT_COLUMNS_V1}
         FROM daa_market_indicator_snapshot_v1
         WHERE indicator_key = ANY($1::text[])
           AND scope = $2
           AND generated_at >= $3
         ORDER BY indicator_key ASC, generated_at ASC`,
        [keys, scope, since],
      )
      : await query(
        `SELECT ${MARKET_INDICATOR_SNAPSHOT_SELECT_COLUMNS_V1}
         FROM daa_market_indicator_snapshot_v1
         WHERE indicator_key = ANY($1::text[])
           AND generated_at >= $2
         ORDER BY indicator_key ASC, generated_at ASC`,
        [keys, since],
      );
    return result.rows.map((row) => mapMarketIndicatorSnapshotRowV1(row as Record<string, unknown>));
  });
}

export async function replaceDaaHfHoldingSnapshotsV1(rows: Array<Partial<DaaStoreHfHoldingSnapshotV1>>, provider = "danjuan"): Promise<number> {
  await ensureDaaMarketCacheSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    let touched = 0;
    await withPgTransactionV1(query, async () => {
      await query("DELETE FROM daa_hf_holding_snapshot_v1 WHERE provider = $1", [normalizeText(provider, "danjuan")]);
      for (const row of rows) {
        const providerFinal = normalizeText(row.provider, provider);
        const fundCode = normalizeText(row.fundCode);
        const symbol = normalizeUpperV1(row.symbol);
        if (!fundCode || !symbol) continue;
        const reportDate = normalizeText(row.reportDate);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) continue;
        const market = normalizeUpperV1(row.market, "UNKNOWN");
        const weightPct = Math.max(0, toFiniteNumber(row.weightPct, 0));
        const prevWeightPct = Math.max(0, toFiniteNumber(row.prevWeightPct, 0));
        const disclosedAt = row.disclosedAt ? toIsoString(row.disclosedAt, new Date().toISOString()) : null;
        const confidencePct = clampNumberV1(toFiniteNumber(row.confidencePct, 0), 0, 100);
        const sourceRef = row.sourceRef == null ? null : normalizeText(row.sourceRef) || null;
        const fetchedAt = toIsoString(row.fetchedAt, new Date().toISOString());
        const rawRefId = row.rawRefId == null ? null : normalizeText(row.rawRefId) || null;
        await query(
          `INSERT INTO daa_hf_holding_snapshot_v1
            (provider, fund_code, report_date, symbol, market, weight_pct, prev_weight_pct, disclosed_at, confidence_pct, source_ref, fetched_at, raw_ref_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT (provider, fund_code, report_date, symbol)
           DO UPDATE SET
             market = EXCLUDED.market,
             weight_pct = EXCLUDED.weight_pct,
             prev_weight_pct = EXCLUDED.prev_weight_pct,
             disclosed_at = EXCLUDED.disclosed_at,
             confidence_pct = EXCLUDED.confidence_pct,
             source_ref = EXCLUDED.source_ref,
             fetched_at = EXCLUDED.fetched_at,
             raw_ref_id = EXCLUDED.raw_ref_id`,
          [providerFinal, fundCode, reportDate, symbol, market, weightPct, prevWeightPct, disclosedAt, confidencePct, sourceRef, fetchedAt, rawRefId],
        );
        touched += 1;
      }
    });
    return touched;
  });
}

export async function upsertDaaHfSignalSnapshotsV1(rows: Array<Partial<DaaStoreHfSignalSnapshotV1>>): Promise<number> {
  if (!rows.length) return 0;
  await ensureDaaMarketCacheSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    let touched = 0;
    await withPgTransactionV1(query, async () => {
      for (const row of rows) {
        const provider = normalizeText(row.provider, "human_signal");
        const symbol = normalizeUpperV1(row.symbol);
        if (!symbol) continue;
        const aggregatedScorePct = clampNumberV1(toFiniteNumber(row.aggregatedScorePct, 0), 0, 100);
        const convictionPct = clampNumberV1(toFiniteNumber(row.convictionPct, 0), 0, 100);
        const thesisDriftPct = clampNumberV1(toFiniteNumber(row.thesisDriftPct, 0), 0, 100);
        const fundCount = Math.max(0, Math.trunc(toFiniteNumber(row.fundCount, 0)));
        const fundsJson = Array.isArray(row.fundsJson) ? row.fundsJson : [];
        const generatedAt = toIsoString(row.generatedAt, new Date().toISOString());
        await query(
          `INSERT INTO daa_hf_signal_snapshot_v1
            (provider, symbol, aggregated_score_pct, conviction_pct, thesis_drift_pct, fund_count, funds_json, generated_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,NOW())
           ON CONFLICT (provider, symbol)
           DO UPDATE SET
             aggregated_score_pct = EXCLUDED.aggregated_score_pct,
             conviction_pct = EXCLUDED.conviction_pct,
             thesis_drift_pct = EXCLUDED.thesis_drift_pct,
             fund_count = EXCLUDED.fund_count,
             funds_json = EXCLUDED.funds_json,
             generated_at = EXCLUDED.generated_at,
             updated_at = NOW()`,
          [provider, symbol, aggregatedScorePct, convictionPct, thesisDriftPct, fundCount, JSON.stringify(fundsJson), generatedAt],
        );
        touched += 1;
      }
    });
    return touched;
  });
}

export async function appendDaaIngestJobLogV1(input: {
  jobType: string;
  triggerSource?: string;
  status?: DaaStoreIngestJobStatusV1;
  startedAt?: string;
  finishedAt?: string;
  totalCount?: number;
  successCount?: number;
  failureCount?: number;
  diagnosticsJson?: Record<string, unknown>;
}): Promise<DaaStoreIngestJobLogV1> {
  await ensureDaaMarketCacheSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const jobId = randomUUID();
    const jobType = normalizeText(input.jobType, "unknown");
    const triggerSource = normalizeText(input.triggerSource, "manual");
    const status = normalizeIngestJobStatusV1(input.status, "ok");
    const startedAt = toIsoString(input.startedAt, new Date().toISOString());
    const finishedAt = toIsoString(input.finishedAt, new Date().toISOString());
    const totalCount = Math.max(0, Math.trunc(toFiniteNumber(input.totalCount, 0)));
    const successCount = Math.max(0, Math.trunc(toFiniteNumber(input.successCount, 0)));
    const failureCount = Math.max(0, Math.trunc(toFiniteNumber(input.failureCount, 0)));
    const diagnosticsJson = input.diagnosticsJson && typeof input.diagnosticsJson === "object" ? input.diagnosticsJson : {};
    await query(
      `INSERT INTO daa_ingest_job_log_v1
        (job_id, job_type, trigger_source, status, started_at, finished_at, total_count, success_count, failure_count, diagnostics_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
      [jobId, jobType, triggerSource, status, startedAt, finishedAt, totalCount, successCount, failureCount, JSON.stringify(diagnosticsJson)],
    );
    const result = await query(
      `SELECT ${INGEST_JOB_LOG_SELECT_COLUMNS_V1}
       FROM daa_ingest_job_log_v1
       WHERE job_id = $1
       LIMIT 1`,
      [jobId],
    );
    return mapIngestJobLogRowV1(result.rows[0] as Record<string, unknown>);
  });
}

export async function listDaaIngestJobLogsV1(input: {
  jobType?: string;
  limit?: number;
} = {}): Promise<DaaStoreIngestJobLogV1[]> {
  await ensureDaaMarketCacheSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const limit = Math.max(1, Math.min(500, Math.trunc(toFiniteNumber(input.limit, 100))));
    if (input.jobType) {
      const result = await query(
        `SELECT ${INGEST_JOB_LOG_SELECT_COLUMNS_V1}
         FROM daa_ingest_job_log_v1
         WHERE job_type = $1
         ORDER BY started_at DESC
         LIMIT $2`,
        [normalizeText(input.jobType), limit],
      );
      return result.rows.map((row) => mapIngestJobLogRowV1(row as Record<string, unknown>));
    }
    const result = await query(
      `SELECT ${INGEST_JOB_LOG_SELECT_COLUMNS_V1}
       FROM daa_ingest_job_log_v1
       ORDER BY started_at DESC
       LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => mapIngestJobLogRowV1(row as Record<string, unknown>));
  });
}

export async function getDaaMarketCacheHealthStatsV1(provider = "yfinance"): Promise<{
  provider: string;
  totalSnapshots: number;
  freshCount: number;
  staleCount: number;
  missingCount: number;
  errorCount: number;
  unsupportedCount: number;
  recentJobSuccessRatePct: number;
  recentJobFailureRatePct: number;
}> {
  await ensureDaaMarketCacheSchemaPgV1();
  return withDaaPgClientV0(async ({ query }) => {
    const providerNormalized = normalizeText(provider, "yfinance");
    const summaryRes = await query(
      `SELECT
         COUNT(*)::INT AS total_count,
         SUM(CASE WHEN status='fresh' THEN 1 ELSE 0 END)::INT AS fresh_count,
         SUM(CASE WHEN status='stale' THEN 1 ELSE 0 END)::INT AS stale_count,
         SUM(CASE WHEN status='missing' THEN 1 ELSE 0 END)::INT AS missing_count,
         SUM(CASE WHEN status='error' THEN 1 ELSE 0 END)::INT AS error_count,
         SUM(CASE WHEN status='unsupported' THEN 1 ELSE 0 END)::INT AS unsupported_count
       FROM daa_market_price_snapshot
       WHERE provider = $1`,
      [providerNormalized],
    );
    const summary = summaryRes.rows[0] as Record<string, unknown> | undefined;

    const jobsRes = await query(
      `SELECT
         SUM(total_count)::INT AS total_count,
         SUM(success_count)::INT AS success_count,
         SUM(failure_count)::INT AS failure_count
       FROM daa_ingest_job_log_v1
       WHERE job_type IN ('market_cache_refresh', 'cron_price_refresh')
         AND started_at >= NOW() - INTERVAL '24 hours'`,
      [],
    );
    const jobs = jobsRes.rows[0] as Record<string, unknown> | undefined;
    const successCount = Math.max(0, Math.trunc(toFiniteNumber(jobs?.success_count, 0)));
    const failureCount = Math.max(0, Math.trunc(toFiniteNumber(jobs?.failure_count, 0)));
    const totalCount = Math.max(0, Math.trunc(toFiniteNumber(jobs?.total_count, successCount + failureCount)));
    const safeDenominator = totalCount > 0 ? totalCount : Math.max(1, successCount + failureCount);
    const successRate = safeDenominator > 0 ? (successCount / safeDenominator) * 100 : 100;
    const failureRate = safeDenominator > 0 ? (failureCount / safeDenominator) * 100 : 0;

    return {
      provider: providerNormalized,
      totalSnapshots: Math.max(0, Math.trunc(toFiniteNumber(summary?.total_count, 0))),
      freshCount: Math.max(0, Math.trunc(toFiniteNumber(summary?.fresh_count, 0))),
      staleCount: Math.max(0, Math.trunc(toFiniteNumber(summary?.stale_count, 0))),
      missingCount: Math.max(0, Math.trunc(toFiniteNumber(summary?.missing_count, 0))),
      errorCount: Math.max(0, Math.trunc(toFiniteNumber(summary?.error_count, 0))),
      unsupportedCount: Math.max(0, Math.trunc(toFiniteNumber(summary?.unsupported_count, 0))),
      recentJobSuccessRatePct: Number(successRate.toFixed(2)),
      recentJobFailureRatePct: Number(failureRate.toFixed(2)),
    };
  });
}

export async function closeDaaStorePoolV1(): Promise<void> {
  const pool = daaPgPoolV0();
  await pool.end();
}
