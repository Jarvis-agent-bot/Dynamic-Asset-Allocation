/**
 * Trade-ticket and trade-basket store functions.
 */

import { randomUUID } from "node:crypto";
import { normalizeText, toFinite as toFiniteNumber } from "@/src/daa/utils/normalize";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { getDaaAccountScopeId } from "@/src/daa/account/accountScope";
import { parseDaaAssetKey } from "@/src/daa/assetKey";
import {
  withDaaPgClient, parseJsonb, toIsoString, isPgUniqueViolation, isRecord, toBoolean, clampNumber, normalizeStringArray, type DaaTxQueryFn,
} from "./storeShared";
import type { ProposalDecisionContext } from "@/src/daa/modules/workbench/workbenchTypes";
import type {
  DaaStoreTradeTicket, DaaStoreTradeTicketSource, DaaStoreTradeTicketStatus,
  DaaStoreTradeTicketSide, DaaStoreCreateTradeTicketInput,
  DaaStoreExecuteTradeTicketsInput, DaaStoreExecuteTradeTicketsResult,
  DaaStorePosition, DaaStoreCashLedgerSide,
  DaaStoreBrokerKind,
  DaaStoreRebalanceCycle, DaaStoreCreateRebalanceCycleInput,
  DaaStorePatchRebalanceCycleInput, DaaStoreCycleReport,
  DaaStoreTriggerEvent,
  DaaStoreRebalanceTriggerSource,
  DaaStorePreTradeRiskCheck, DaaStorePreTradeRiskCheckItem,
} from "./storeTypes";
import type { DaaMarketContext, DaaMarketRegime, DaaMarketIndicatorSnapshot, DaaMarketIndicatorScope } from "@/src/daa/modules/marketContext/marketContextTypes";
import type { DaaStoreRebalanceCycleStatus, DaaStoreRiskRule } from "@/src/daa/store/storeTypes";
import { ensureDaaStoreSchemaPg } from "./storeSchema";
import { buildFxLookupMap, resolveFxRateToBase, normalizeCcyCode } from "./fxStore";
import { mapBrokerOrderStatusToTradeTicketStatus } from "@/src/daa/modules/workbench/executionVenue";
import { buildPortfolioSnapshotFromAssetUniverseInTx } from "./portfolioStore";
import {
  syncStrategyAccountCashInTx, ensureAccountStateRowInTx, getAccountStateForUpdateInTx,
  resolveInvestableCash,
} from "./accountStore";
import {
  buildPositionKey, buildPositionId, mapPositionRow, replacePositionsV2SnapshotInTx,
} from "./positionStore";
import { normalizeMarketIndicatorKey, normalizeMarketRegimeStore } from "./marketIndicatorNormalizers";

function normalizeTradeTicketSource(value: unknown): DaaStoreTradeTicketSource {
  const text = normalizeText(value, "manual").toLowerCase();
  return text === "decision" ? "decision" : "manual";
}

function normalizeTradeTicketStatus(value: unknown): DaaStoreTradeTicketStatus {
  const text = normalizeText(value, "ready").toLowerCase();
  if (text === "submitted") return "submitted";
  if (text === "partially_filled") return "partially_filled";
  if (text === "executed") return "executed";
  if (text === "canceled") return "canceled";
  if (text === "rejected") return "rejected";
  return "ready";
}

function normalizeBrokerKind(value: unknown): DaaStoreBrokerKind | null {
  const text = normalizeText(value).toLowerCase();
  if (!text) return null;
  if (text === "sim") return "sim";
  if (text === "crypto" || text === "crypto_paper") return "crypto_paper";
  return "sim";
}

type DaaTradeBasketStatus = "draft" | "executing" | "executed" | "partial" | "canceled";

type RebalanceDecisionStatus = "pending" | "partial" | "executed" | "canceled";

function normalizeTradeBasketStatus(value: unknown): DaaTradeBasketStatus {
  const text = normalizeText(value, "draft").toLowerCase();
  if (text === "executing") return "executing";
  if (text === "executed") return "executed";
  if (text === "partial") return "partial";
  if (text === "canceled") return "canceled";
  return "draft";
}

function deriveDecisionStatusFromTradeTickets(
  statuses: DaaStoreTradeTicketStatus[],
): RebalanceDecisionStatus {
  if (!statuses.length) return "pending";
  if (statuses.every((status) => status === "ready")) return "pending";
  if (statuses.every((status) => status === "executed")) return "executed";
  if (statuses.every((status) => status === "canceled" || status === "rejected")) return "canceled";
  if (statuses.every((status) => status === "submitted" || status === "partially_filled")) return "partial";
  return "partial";
}

function deriveBasketStatusFromTickets(statuses: DaaStoreTradeTicketStatus[]): DaaTradeBasketStatus {
  if (!statuses.length) return "canceled";
  if (statuses.every((status) => status === "ready")) return "draft";
  if (statuses.every((status) => status === "executed")) return "executed";
  if (statuses.every((status) => status === "canceled" || status === "rejected")) return "canceled";
  if (statuses.every((status) => status === "ready" || status === "submitted" || status === "partially_filled")) return "executing";
  return "partial";
}

function isTradeTicketOpenStatus(status: DaaStoreTradeTicketStatus): boolean {
  return status === "ready" || status === "submitted" || status === "partially_filled";
}

function normalizeTradeTicketSide(value: unknown): DaaStoreTradeTicketSide {
  const text = normalizeText(value, "BUY").toUpperCase();
  return text === "SELL" ? "SELL" : "BUY";
}

function normalizeTradePricingMode(value: unknown): "manual" | "market" {
  const mode = normalizeText(value, "manual").toLowerCase();
  return mode === "market" ? "market" : "manual";
}

const TRADE_TICKET_SELECT_COLUMNS_ = [
  "ticket_id",
  "basket_id",
  "asset_key",
  "cycle_id",
  "source",
  "status",
  "symbol",
  "market",
  "instrument_currency",
  "base_currency",
  "side",
  "qty",
  "price",
  "fee",
  "gross_notional",
  "fx_rate_to_base",
  "notional_in_base",
  "decision_ref_id",
  "reason_tags",
  "reason_text",
  "snapshot_before_json",
  "snapshot_after_json",
  "reject_code",
  "reject_message",
  "pricing_mode",
  "price_source",
  "price_snapshot_at",
  "broker_kind",
  "broker_account_id",
  "broker_order_id",
  "broker_status",
  "filled_qty",
  "avg_fill_price",
  "last_broker_sync_at",
  "last_applied_fill_qty",
  "broker_reject_reason",
  "broker_raw_json",
  "created_by",
  "created_at",
  "executed_at",
  "canceled_at",
  "updated_at",
].join(", ");

function mapTradeTicketRow(row: Record<string, unknown>): DaaStoreTradeTicket {
  const symbol = normalizeText(row.symbol).toUpperCase();
  const market = normalizeText(row.market, "US").toUpperCase();
  const derivedAssetKey = buildPositionKey(symbol, market);
  return {
    ticketId: normalizeText(row.ticket_id),
    basketId: normalizeText(row.basket_id, "basket_migrated"),
    assetKey: normalizeText(row.asset_key, derivedAssetKey).toUpperCase(),
    cycleId: row.cycle_id == null ? null : normalizeText(row.cycle_id) || null,
    source: normalizeTradeTicketSource(row.source),
    status: normalizeTradeTicketStatus(row.status),
    symbol,
    market,
    instrumentCurrency: normalizeCcyCode(row.instrument_currency, "USD"),
    baseCurrency: normalizeCcyCode(row.base_currency, "USD"),
    side: normalizeTradeTicketSide(row.side),
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
    pricingMode: normalizeTradePricingMode(row.pricing_mode),
    priceSource: row.price_source == null ? null : normalizeText(row.price_source) || null,
    priceSnapshotAt: row.price_snapshot_at == null ? null : toIsoString(row.price_snapshot_at),
    brokerKind: normalizeBrokerKind(row.broker_kind),
    brokerAccountId: row.broker_account_id == null ? null : normalizeText(row.broker_account_id) || null,
    brokerOrderId: row.broker_order_id == null ? null : normalizeText(row.broker_order_id) || null,
    brokerStatus: row.broker_status == null ? null : normalizeText(row.broker_status) || null,
    filledQty: row.filled_qty == null ? null : Math.max(0, toFiniteNumber(row.filled_qty)),
    avgFillPrice: row.avg_fill_price == null ? null : Math.max(0, toFiniteNumber(row.avg_fill_price)),
    lastBrokerSyncAt: row.last_broker_sync_at == null ? null : toIsoString(row.last_broker_sync_at),
    lastAppliedFillQty: Math.max(0, toFiniteNumber(row.last_applied_fill_qty, 0)),
    brokerRejectReason: row.broker_reject_reason == null ? null : normalizeText(row.broker_reject_reason) || null,
    brokerRaw: row.broker_raw_json == null ? null : parseJsonb<Record<string, unknown>>(row.broker_raw_json, {}),
    createdBy: normalizeText(row.created_by, "admin"),
    createdAt: toIsoString(row.created_at),
    executedAt: row.executed_at == null ? null : toIsoString(row.executed_at),
    canceledAt: row.canceled_at == null ? null : toIsoString(row.canceled_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

async function upsertBrokerOrderSnapshotInTx(
  query: DaaTxQueryFn,
  input: {
    ticketId: string;
    brokerKind: DaaStoreBrokerKind;
    brokerAccountId?: string | null;
    brokerOrderId: string;
    status: string;
    filledQty?: number | null;
    avgFillPrice?: number | null;
    raw?: Record<string, unknown> | null;
    syncedAt?: string | null;
  },
): Promise<void> {
  const syncedAt = input.syncedAt ? toIsoString(input.syncedAt, new Date().toISOString()) : new Date().toISOString();
  const ownerAccountId = getDaaAccountScopeId();
  await query(
    `INSERT INTO daa_broker_order_snapshots (
       owner_account_id, ticket_id, broker_kind, broker_account_id, broker_order_id, status, filled_qty, avg_fill_price, raw_json, synced_at, updated_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,NOW()
     )
     ON CONFLICT (ticket_id) DO UPDATE
     SET
       owner_account_id = EXCLUDED.owner_account_id,
       broker_kind = EXCLUDED.broker_kind,
       broker_account_id = EXCLUDED.broker_account_id,
       broker_order_id = EXCLUDED.broker_order_id,
       status = EXCLUDED.status,
       filled_qty = EXCLUDED.filled_qty,
       avg_fill_price = EXCLUDED.avg_fill_price,
       raw_json = EXCLUDED.raw_json,
       synced_at = EXCLUDED.synced_at,
       updated_at = NOW()
     RETURNING ticket_id, broker_kind, broker_account_id, broker_order_id, status, filled_qty, avg_fill_price, raw_json, synced_at, updated_at`,
    [
      ownerAccountId,
      normalizeText(input.ticketId),
      input.brokerKind,
      input.brokerAccountId ?? null,
      normalizeText(input.brokerOrderId),
      normalizeText(input.status) || "unknown",
      input.filledQty == null ? null : Math.max(0, toFiniteNumber(input.filledQty)),
      input.avgFillPrice == null ? null : Math.max(0, toFiniteNumber(input.avgFillPrice)),
      JSON.stringify(input.raw ?? null),
      syncedAt,
    ],
  );
}

async function selectTradeTicketsByIdsInTx(
  query: DaaTxQueryFn,
  ticketIds: string[],
  opts: {
    forUpdate?: boolean;
    orderByCreatedDesc?: boolean;
  } = {},
): Promise<DaaStoreTradeTicket[]> {
  const ids = [...new Set(ticketIds.map((item) => normalizeText(item)).filter(Boolean))];
  if (!ids.length) return [];
  const ownerAccountId = getDaaAccountScopeId();
  const placeholders = ids.map((_, idx) => `$${idx + 2}`).join(", ");
  const result = await query(
    `SELECT ${TRADE_TICKET_SELECT_COLUMNS_}
     FROM daa_trade_tickets
     WHERE owner_account_id = $1 AND ticket_id IN (${placeholders})
     ${opts.forUpdate ? "FOR UPDATE" : ""}
     ${opts.orderByCreatedDesc ? "ORDER BY created_at DESC" : ""}`,
    [ownerAccountId, ...ids],
  );
  return result.rows.map((row) => mapTradeTicketRow(row as Record<string, unknown>));
}

async function refreshTradeTicketAggregatesInTx(query: DaaTxQueryFn, ticketIds: string[]): Promise<void> {
  const ownerAccountId = getDaaAccountScopeId();
  const touchedTickets = await selectTradeTicketsByIdsInTx(query, ticketIds);
  const touchedDecisionIds = [...new Set(
    touchedTickets
      .map((ticket) => ticket.decisionRefId)
      .filter((decisionId): decisionId is string => Boolean(decisionId)),
  )];
  if (touchedDecisionIds.length > 0) {
    const decisionPlaceholders = touchedDecisionIds.map((_, idx) => `$${idx + 2}`).join(", ");
    const decisionTicketRows = await query(
      `SELECT decision_ref_id, status FROM daa_trade_tickets WHERE owner_account_id = $1 AND decision_ref_id IN (${decisionPlaceholders})`,
      [ownerAccountId, ...touchedDecisionIds],
    );
    const statusByDecision = new Map<string, DaaStoreTradeTicketStatus[]>();
    for (const row of decisionTicketRows.rows as Array<Record<string, unknown>>) {
      const decisionRefId = normalizeText(row.decision_ref_id);
      if (!decisionRefId) continue;
      const status = normalizeTradeTicketStatus(row.status);
      if (!statusByDecision.has(decisionRefId)) statusByDecision.set(decisionRefId, []);
      statusByDecision.get(decisionRefId)!.push(status);
    }
    for (const decisionId of touchedDecisionIds) {
      const statuses = statusByDecision.get(decisionId) ?? [];
      const nextStatus = deriveDecisionStatusFromTradeTickets(statuses);
      await query(
        "UPDATE daa_rebalance_decisions SET status = $1 WHERE id = $2 AND owner_account_id = $3",
        [nextStatus, decisionId, ownerAccountId],
      );
    }
  }

  const touchedBasketIds = [...new Set(
    touchedTickets
      .map((ticket) => ticket.basketId)
      .filter((id): id is string => Boolean(id)),
  )];
  if (touchedBasketIds.length > 0) {
    const basketPlaceholders = touchedBasketIds.map((_, idx) => `$${idx + 2}`).join(", ");
    const basketTicketRows = await query(
      `SELECT basket_id, status FROM daa_trade_tickets WHERE owner_account_id = $1 AND basket_id IN (${basketPlaceholders})`,
      [ownerAccountId, ...touchedBasketIds],
    );
    const statusByBasket = new Map<string, DaaStoreTradeTicketStatus[]>();
    for (const row of basketTicketRows.rows as Array<Record<string, unknown>>) {
      const id = normalizeText(row.basket_id);
      if (!id) continue;
      const status = normalizeTradeTicketStatus(row.status);
      if (!statusByBasket.has(id)) statusByBasket.set(id, []);
      statusByBasket.get(id)!.push(status);
    }
    for (const id of touchedBasketIds) {
      const statuses = statusByBasket.get(id) ?? [];
      const nextStatus = deriveBasketStatusFromTickets(statuses);
      await query(
        "UPDATE daa_trade_baskets SET status = $1, updated_at = NOW(), executed_at = CASE WHEN $1 IN ('executed','partial','canceled') THEN COALESCE(executed_at, NOW()) ELSE executed_at END WHERE basket_id = $2 AND owner_account_id = $3",
        [nextStatus, id, ownerAccountId],
      );
    }
  }

  const touchedCycleIds = [...new Set(
    touchedTickets
      .map((ticket) => ticket.cycleId)
      .filter((id): id is string => Boolean(id)),
  )];
  if (touchedCycleIds.length > 0) {
    const cyclePlaceholders = touchedCycleIds.map((_, idx) => `$${idx + 2}`).join(", ");
    const cycleTicketRows = await query(
      `SELECT cycle_id, ticket_id, status, qty, price
       FROM daa_trade_tickets
       WHERE owner_account_id = $1 AND cycle_id IN (${cyclePlaceholders})`,
      [ownerAccountId, ...touchedCycleIds],
    );
    const cycleStateRows = await query(
      `SELECT cycle_id, executed_at, execution_summary_json
       FROM daa_rebalance_cycles
       WHERE owner_account_id = $1 AND cycle_id IN (${cyclePlaceholders})
       FOR UPDATE`,
      [ownerAccountId, ...touchedCycleIds],
    );

    const currentCycleStateById = new Map<string, {
      executedAt: string | null;
      executionSummary: Record<string, unknown> | null;
    }>();
    for (const row of cycleStateRows.rows as Array<Record<string, unknown>>) {
      currentCycleStateById.set(normalizeText(row.cycle_id), {
        executedAt: row.executed_at == null ? null : toIsoString(row.executed_at),
        executionSummary: row.execution_summary_json == null ? null : parseJsonb<Record<string, unknown>>(row.execution_summary_json, {}),
      });
    }

    const cycleTicketStateById = new Map<string, {
      ticketIds: string[];
      statuses: DaaStoreTradeTicketStatus[];
      totalNotional: number;
    }>();
    for (const row of cycleTicketRows.rows as Array<Record<string, unknown>>) {
      const cycleId = normalizeText(row.cycle_id);
      if (!cycleId) continue;
      if (!cycleTicketStateById.has(cycleId)) {
        cycleTicketStateById.set(cycleId, {
          ticketIds: [],
          statuses: [],
          totalNotional: 0,
        });
      }
      const current = cycleTicketStateById.get(cycleId)!;
      current.ticketIds.push(normalizeText(row.ticket_id));
      current.statuses.push(normalizeTradeTicketStatus(row.status));
      current.totalNotional += Math.max(0, toFiniteNumber(row.qty, 0)) * Math.max(0, toFiniteNumber(row.price, 0));
    }

    for (const cycleId of touchedCycleIds) {
      const current = currentCycleStateById.get(cycleId) || {
        executedAt: null,
        executionSummary: null,
      };
      const cycleState = cycleTicketStateById.get(cycleId) || {
        ticketIds: [],
        statuses: [],
        totalNotional: 0,
      };
      const ordersExecuted = cycleState.statuses.filter((status) => status === "executed").length;
      const ordersSubmitted = cycleState.statuses.filter((status) => status === "submitted" || status === "partially_filled").length;
      const ordersFailed = cycleState.statuses.filter((status) => status === "rejected" || status === "canceled").length;
      const hasOpenOrders = cycleState.statuses.some((status) => isTradeTicketOpenStatus(status));
      const currentSummary = current.executionSummary || {};
      const totalNotional = cycleState.totalNotional > 0
        ? cycleState.totalNotional
        : Math.max(0, toFiniteNumber(currentSummary.totalNotional, 0));
      const newMaxDriftPct = Math.max(0, toFiniteNumber(currentSummary.newMaxDriftPct, 0));
      const nextStatus: DaaStoreRebalanceCycleStatus = hasOpenOrders ? "executing" : "completed";
      const nextExecutedAt = hasOpenOrders
        ? current.executedAt
        : (current.executedAt || new Date().toISOString());

      await query(
        `UPDATE daa_rebalance_cycles
         SET
           status = $2,
           executed_at = $3,
           executed_orders_json = $4::jsonb,
           execution_summary_json = $5::jsonb
         WHERE cycle_id = $1 AND owner_account_id = $6`,
        [
          cycleId,
          nextStatus,
          nextExecutedAt,
          JSON.stringify(cycleState.ticketIds.filter(Boolean)),
          JSON.stringify({
            ordersExecuted,
            ordersSubmitted,
            ordersFailed,
            totalNotional,
            newMaxDriftPct,
          }),
          ownerAccountId,
        ],
      );
    }
  }
}

function normalizeRebalanceCycleStatus(value: unknown): DaaStoreRebalanceCycleStatus {
  const text = normalizeText(value, "generated").toLowerCase();
  if (text === "reviewing") return "reviewing";
  if (text === "executing") return "executing";
  if (text === "completed") return "completed";
  if (text === "cancelled" || text === "canceled") return "cancelled";
  return "generated";
}

function normalizeRebalanceTriggerSource(value: unknown): DaaStoreRebalanceTriggerSource {
  const text = normalizeText(value, "manual").toLowerCase();
  if (text === "scheduled_review") return "scheduled_review";
  if (text === "drift") return "drift";
  if (text === "risk") return "risk";
  if (text === "cash_idle") return "cash_idle";
  if (text === "agent_trigger") return "agent_trigger";
  if (text === "watchlist_entry") return "watchlist_entry";
  return "manual";
}

function normalizePolicyEvaluationSource(value: unknown): NonNullable<DaaStoreRebalanceCycle["policySnapshot"]>["decision"]["source"] {
  const text = normalizeText(value, "manual_review").toLowerCase();
  if (text === "scheduled_review") return "scheduled_review";
  if (text === "drift_monitor") return "drift_monitor";
  if (text === "agent_event") return "agent_event";
  if (text === "risk_event") return "risk_event";
  if (text === "cash_event") return "cash_event";
  return "manual_review";
}

function normalizePolicyDecisionAction(value: unknown): NonNullable<DaaStoreRebalanceCycle["policySnapshot"]>["decision"]["action"] {
  const text = normalizeText(value, "observe").toLowerCase();
  if (text === "ignore") return "ignore";
  if (text === "propose") return "propose";
  if (text === "require_review") return "require_review";
  if (text === "authorize_auto_execute") return "authorize_auto_execute";
  return "observe";
}

function normalizeNoTradeBandState(value: unknown): NonNullable<DaaStoreRebalanceCycle["policySnapshot"]>["decision"]["noTradeBandState"] {
  const text = normalizeText(value, "inside").toLowerCase();
  if (text === "entered_outer") return "entered_outer";
  if (text === "cooling") return "cooling";
  if (text === "exited_inner") return "exited_inner";
  return "inside";
}

function normalizeRiskRule(value: unknown): DaaStoreRiskRule {
  const text = normalizeText(value).toLowerCase();
  if (text === "max_order_pct") return "max_order_pct";
  if (text === "concentration") return "concentration";
  if (text === "correlation") return "correlation";
  if (text === "stop_loss_breach") return "stop_loss_breach";
  if (text === "total_weight") return "total_weight";
  return "max_position";
}

function normalizeRiskStatus(value: unknown): "pass" | "warn" | "block" {
  const text = normalizeText(value, "pass").toLowerCase();
  if (text === "warn") return "warn";
  if (text === "block") return "block";
  return "pass";
}

function normalizeProposalDecisionContext(value: unknown): ProposalDecisionContext | null {
  if (!isRecord(value)) return null;
  return {
    driftReason: normalizeText(value.driftReason, ""),
    signalAction: value.signalAction === "open_or_add" || value.signalAction === "watch" || value.signalAction === "reduce_or_avoid"
      ? value.signalAction
      : null,
    signalScore: value.signalScore == null ? null : clampNumber(toFiniteNumber(value.signalScore, 0), 0, 100),
    signalConfidence: value.signalConfidence == null ? null : clampNumber(toFiniteNumber(value.signalConfidence, 0), 0, 100),
    signalConflict: toBoolean(value.signalConflict, false),
    llmAdjustment: value.llmAdjustment === "execute" || value.llmAdjustment === "reduce_size" || value.llmAdjustment === "skip" || value.llmAdjustment === "increase_priority"
      ? value.llmAdjustment
      : null,
    llmConfidence: value.llmConfidence == null ? null : clampNumber(toFiniteNumber(value.llmConfidence, 0), 0, 100),
    llmRationale: value.llmRationale == null ? null : normalizeText(value.llmRationale) || null,
    ruleBasedMarketRegime: normalizeMarketRegimeStore(value.ruleBasedMarketRegime) === "neutral"
      ? null
      : (normalizeMarketRegimeStore(value.ruleBasedMarketRegime) as DaaMarketRegime),
    llmMarketRegime: normalizeMarketRegimeStore(value.llmMarketRegime) === "neutral"
      ? null
      : (normalizeMarketRegimeStore(value.llmMarketRegime) as DaaMarketRegime),
    effectiveMarketRegime: normalizeMarketRegimeStore(value.effectiveMarketRegime) === "neutral"
      ? null
      : (normalizeMarketRegimeStore(value.effectiveMarketRegime) as DaaMarketRegime),
    marketIndicatorFlags: normalizeStringArray(value.marketIndicatorFlags),
    conflictFlags: normalizeStringArray(value.conflictFlags),
    finalQtyMultiplier: clampNumber(toFiniteNumber(value.finalQtyMultiplier, 1), 0, 1),
  };
}

function normalizeMarketIndicatorScopeStore(value: unknown): DaaMarketIndicatorScope {
  const text = normalizeText(value, "us_equity").toLowerCase();
  if (text === "hk_cn_equity") return "hk_cn_equity";
  if (text === "crypto") return "crypto";
  if (text === "macro_defensive") return "macro_defensive";
  return "us_equity";
}

function normalizeMarketIndicatorSnapshotJson(value: unknown): DaaMarketIndicatorSnapshot | null {
  if (!isRecord(value)) return null;
  const key = normalizeMarketIndicatorKey(value.key);
  if (!key) return null;
  return {
    key,
    label: normalizeText(value.label, "市场指标"),
    category: value.category === "relative_value" || value.category === "sentiment" ? value.category : "volatility",
    scope: normalizeMarketIndicatorScopeStore(value.scope),
    stance: normalizeMarketRegimeStore(value.stance),
    riskOffScorePct: clampNumber(toFiniteNumber(value.riskOffScorePct, 50), 0, 100),
    confidencePct: clampNumber(toFiniteNumber(value.confidencePct, 40), 0, 100),
    rawValue: value.rawValue == null ? null : toFiniteNumber(value.rawValue, 0),
    unit: value.unit == null ? undefined : (normalizeText(value.unit) || undefined),
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

function normalizeMarketScopeContextJson(value: unknown): DaaMarketContext["scopes"][number] | null {
  if (!isRecord(value)) return null;
  const indicators = (Array.isArray(value.indicators) ? value.indicators : [])
    .map((item) => normalizeMarketIndicatorSnapshotJson(item))
    .filter((item): item is DaaMarketIndicatorSnapshot => Boolean(item));
  const scope = normalizeMarketIndicatorScopeStore(value.scope);
  if (!indicators.length && value.regime == null && value.generatedAt == null) return null;
  return {
    scope,
    label: normalizeText(value.label, scope),
    generatedAt: toIsoString(value.generatedAt, new Date().toISOString()),
    regime: normalizeMarketRegimeStore(value.regime) === "neutral" ? "transitional" : (normalizeMarketRegimeStore(value.regime) as DaaMarketRegime),
    riskOffScorePct: clampNumber(toFiniteNumber(value.riskOffScorePct, 50), 0, 100),
    confidencePct: clampNumber(toFiniteNumber(value.confidencePct, 40), 0, 100),
    buyScale: clampNumber(toFiniteNumber(value.buyScale, 1), 0, 1),
    highRiskBuyScale: clampNumber(toFiniteNumber(value.highRiskBuyScale, 0.95), 0, 1),
    reasons: normalizeStringArray(value.reasons),
    indicators,
  };
}

function normalizeMarketContextJson(value: unknown): DaaMarketContext | null {
  if (!isRecord(value)) return null;
  const indicatorsRaw = Array.isArray(value.indicators) ? value.indicators : [];
  const indicators = indicatorsRaw
    .map((item) => normalizeMarketIndicatorSnapshotJson(item))
    .filter((item): item is DaaMarketIndicatorSnapshot => Boolean(item));
  const scopesRaw = Array.isArray(value.scopes) ? value.scopes : [];
  const scopes = scopesRaw
    .map((item) => normalizeMarketScopeContextJson(item))
    .filter((item): item is DaaMarketContext["scopes"][number] => Boolean(item));
  const reasons = normalizeStringArray(value.reasons);
  const hasPayload = indicators.length > 0
    || scopes.length > 0
    || reasons.length > 0
    || value.regime != null
    || value.generatedAt != null;
  if (!hasPayload) return null;
  return {
    generatedAt: toIsoString(value.generatedAt, new Date().toISOString()),
    regime: normalizeMarketRegimeStore(value.regime) === "neutral" ? "transitional" : (normalizeMarketRegimeStore(value.regime) as DaaMarketRegime),
    riskOffScorePct: clampNumber(toFiniteNumber(value.riskOffScorePct, 50), 0, 100),
    confidencePct: clampNumber(toFiniteNumber(value.confidencePct, 40), 0, 100),
    buyScale: clampNumber(toFiniteNumber(value.buyScale, 1), 0, 1),
    highRiskBuyScale: clampNumber(toFiniteNumber(value.highRiskBuyScale, 0.95), 0, 1),
    reasons,
    indicators,
    scopes,
  };
}

function normalizePreTradeRiskCheck(value: unknown): DaaStorePreTradeRiskCheck {
  const raw = parseJsonb<Record<string, unknown>>(value, {});
  const itemsRaw = Array.isArray(raw.items) ? raw.items : [];
  const items: DaaStorePreTradeRiskCheckItem[] = [];
  for (const itemRaw of itemsRaw) {
    const item = isRecord(itemRaw) ? itemRaw : {};
    items.push({
      rule: normalizeRiskRule(item.rule),
      status: normalizeRiskStatus(item.status),
      current: toFiniteNumber(item.current, 0),
      limit: toFiniteNumber(item.limit, 0),
      message: normalizeText(item.message, ""),
    });
  }
  const overallStatus = normalizeRiskStatus(raw.overallStatus);
  return {
    overallStatus,
    items,
  };
}

function normalizeDriftSnapshot(value: unknown): DaaStoreRebalanceCycle["driftSnapshot"] {
  if (!Array.isArray(value)) return [];
  const out: DaaStoreRebalanceCycle["driftSnapshot"] = [];
  for (const rowRaw of value) {
    const row = isRecord(rowRaw) ? rowRaw : {};
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

function normalizeCycleProposals(value: unknown): DaaStoreRebalanceCycle["proposals"] {
  if (!Array.isArray(value)) return [];
  const out: DaaStoreRebalanceCycle["proposals"] = [];
  for (const rowRaw of value) {
    const row = isRecord(rowRaw) ? rowRaw : {};
    const symbol = normalizeText(row.symbol).toUpperCase();
    const assetKey = normalizeText(row.assetKey, symbol ? `US::${symbol}` : "").toUpperCase();
    if (!symbol || !assetKey) continue;
    const side = normalizeText(row.side, "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY";
    const proposalTypeRaw = normalizeText(row.proposalType).toLowerCase();
    const proposalType = proposalTypeRaw === "watchlist_entry" || proposalTypeRaw === "tax_loss_harvest" || proposalTypeRaw === "drift"
      ? proposalTypeRaw
      : undefined;
    const targetWeightPct = row.targetWeightPct == null ? null : Math.max(0, toFiniteNumber(row.targetWeightPct, 0));
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
      targetWeightPct,
      proposalType,
      decisionContext: normalizeProposalDecisionContext(row.decisionContext),
    });
  }
  return out;
}

function normalizePolicySnapshot(value: unknown): DaaStoreRebalanceCycle["policySnapshot"] {
  if (!isRecord(value) || !isRecord(value.decision)) return null;
  const decisionRaw = value.decision;
  const decisionId = normalizeText(decisionRaw.decisionId);
  if (!decisionId) return null;
  const costBenefit = isRecord(decisionRaw.costBenefit) ? decisionRaw.costBenefit : {};
  return {
    decision: {
      decisionId,
      source: normalizePolicyEvaluationSource(decisionRaw.source),
      triggerSource: normalizeRebalanceTriggerSource(decisionRaw.triggerSource),
      action: normalizePolicyDecisionAction(decisionRaw.action),
      score: clampNumber(toFiniteNumber(decisionRaw.score, 0), 0, 100),
      threshold: clampNumber(toFiniteNumber(decisionRaw.threshold, 0), 0, 100),
      reasons: normalizeStringArray(decisionRaw.reasons),
      blockers: normalizeStringArray(decisionRaw.blockers),
      noTradeBandState: normalizeNoTradeBandState(decisionRaw.noTradeBandState),
      costBenefit: {
        expectedRiskImprovement: Math.max(0, toFiniteNumber(costBenefit.expectedRiskImprovement, 0)),
        expectedTrackingImprovement: Math.max(0, toFiniteNumber(costBenefit.expectedTrackingImprovement, 0)),
        estimatedCostBase: Math.max(0, toFiniteNumber(costBenefit.estimatedCostBase, 0)),
        turnoverPenalty: Math.max(0, toFiniteNumber(costBenefit.turnoverPenalty, 0)),
        uncertaintyPenalty: Math.max(0, toFiniteNumber(costBenefit.uncertaintyPenalty, 0)),
      },
      audit: isRecord(decisionRaw.audit) ? decisionRaw.audit : {},
      createdAt: toIsoString(decisionRaw.createdAt, new Date().toISOString()),
    },
    intentIds: normalizeStringArray(value.intentIds),
    signalIds: normalizeStringArray(value.signalIds),
  };
}

function mapRebalanceCycleRow(row: Record<string, unknown>): DaaStoreRebalanceCycle {
  const executionSummaryRaw = row.execution_summary_json == null ? null : parseJsonb<Record<string, unknown>>(row.execution_summary_json, {});
  const executionSummary = executionSummaryRaw
    ? {
      ordersExecuted: Math.max(0, toFiniteNumber(executionSummaryRaw.ordersExecuted, 0)),
      ordersSubmitted: Math.max(0, toFiniteNumber(executionSummaryRaw.ordersSubmitted, 0)),
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
    status: normalizeRebalanceCycleStatus(row.status),
    triggerSource: normalizeRebalanceTriggerSource(row.trigger_source),
    triggerReason: normalizeText(row.trigger_reason),
    snapshotAt: toIsoString(row.snapshot_at),
    equitySnapshot: Math.max(0, toFiniteNumber(row.equity_snapshot, 0)),
    driftSnapshot: normalizeDriftSnapshot(parseJsonb<unknown[]>(row.drift_snapshot_json, [])),
    proposals: normalizeCycleProposals(parseJsonb<unknown[]>(row.proposals_json, [])),
    riskCheck: normalizePreTradeRiskCheck(row.risk_check_json),
    executionStartedAt: row.execution_started_at == null ? null : toIsoString(row.execution_started_at),
    executedAt: row.executed_at == null ? null : toIsoString(row.executed_at),
    executedOrders,
    executionSummary,
    cancelledAt: row.cancelled_at == null ? null : toIsoString(row.cancelled_at),
    cancelReason: row.cancel_reason == null ? null : normalizeText(row.cancel_reason) || null,
    notes: row.notes == null ? null : normalizeText(row.notes) || null,
    marketContext: row.market_context_json == null ? null : normalizeMarketContextJson(parseJsonb<Record<string, unknown>>(row.market_context_json, {})),
    agentDecisionSnapshot: (() => {
      const mcRaw = parseJsonb<Record<string, unknown>>(row.market_context_json, {});
      const snap = mcRaw?.__agentDecisionSnapshot;
      return snap && typeof snap === "object" && !Array.isArray(snap) ? (snap as Record<string, unknown>) : null;
    })(),
    policyDecisionId: row.policy_decision_id == null ? null : normalizeText(row.policy_decision_id) || null,
    intentIds: normalizeStringArray(parseJsonb<unknown[]>(row.intent_ids_json, [])),
    signalIds: normalizeStringArray(parseJsonb<unknown[]>(row.signal_ids_json, [])),
    policySnapshot: normalizePolicySnapshot(parseJsonb<Record<string, unknown>>(row.policy_snapshot_json, {})),
    proposalPlanId: row.proposal_plan_id == null ? null : normalizeText(row.proposal_plan_id) || null,
    createdAt: toIsoString(row.created_at),
  };
}

function mapCycleReportRow(row: Record<string, unknown>): DaaStoreCycleReport {
  const before = parseJsonb<Record<string, unknown>>(row.before_snapshot_json, {});
  const after = parseJsonb<Record<string, unknown>>(row.after_snapshot_json, {});
  const executionStats = parseJsonb<Record<string, unknown>>(row.execution_stats_json, {});
  const pnl = parseJsonb<Record<string, unknown>>(row.pnl_attribution_json, {});
  const riskDelta = parseJsonb<Record<string, unknown>>(row.risk_delta_json, {});
  const topContributorsRaw = Array.isArray(pnl.topContributors) ? pnl.topContributors : [];

  const topContributors = topContributorsRaw.map((itemRaw) => {
    const item = isRecord(itemRaw) ? itemRaw : {};
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
    triggerSource: normalizeRebalanceTriggerSource(row.trigger_source),
    cycleStatus: normalizeRebalanceCycleStatus(row.cycle_status),
    cycleCreatedAt: toIsoString(row.cycle_created_at),
    reportCreatedAt: toIsoString(row.created_at),
    executionSummary: {
      ordersExecuted: Math.max(0, toFiniteNumber(executionStats.ordersExecuted, 0)),
      ordersSubmitted: Math.max(0, toFiniteNumber(executionStats.ordersSubmitted, 0)),
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
      ordersSubmitted: Math.max(0, toFiniteNumber(executionStats.ordersSubmitted, 0)),
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

function mapTriggerEventRow(row: Record<string, unknown>): DaaStoreTriggerEvent {
  const statusRaw = normalizeText(row.status, "accepted").toLowerCase();
  const status = statusRaw === "skipped" || statusRaw === "conflict" ? statusRaw : "accepted";
  return {
    eventId: normalizeText(row.event_id),
    idempotencyKey: normalizeText(row.idempotency_key),
    triggerSource: normalizeRebalanceTriggerSource(row.trigger_source),
    triggerReason: normalizeText(row.trigger_reason),
    cycleId: row.cycle_id == null ? null : normalizeText(row.cycle_id) || null,
    status: status as "accepted" | "skipped" | "conflict",
    detailsJson: parseJsonb<Record<string, unknown>>(row.details_json, {}),
    createdAt: toIsoString(row.created_at),
  };
}

export async function listDaaTradeTickets(opts: {
  basketId?: string;
  cycleId?: string;
  limit?: number;
  status?: DaaStoreTradeTicketStatus;
  source?: DaaStoreTradeTicketSource;
} = {}): Promise<DaaStoreTradeTicket[]> {
  await ensureDaaStoreSchemaPg();
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const limit = Math.max(1, Math.min(500, Math.trunc(toFiniteNumber(opts.limit, 100))));
    const where: string[] = ["owner_account_id = $1"];
    const params: unknown[] = [ownerAccountId];

    if (opts.status) {
      params.push(normalizeTradeTicketStatus(opts.status));
      where.push(`status = $${params.length}`);
    }
    if (opts.source) {
      params.push(normalizeTradeTicketSource(opts.source));
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
      `SELECT ${TRADE_TICKET_SELECT_COLUMNS_}`,
      "FROM daa_trade_tickets",
      where.length ? `WHERE ${where.join(" AND ")}` : "",
      `ORDER BY created_at DESC LIMIT $${params.length}`,
    ].filter(Boolean).join(" ");
    const rows = await query(sql, params);
    return rows.rows.map((row) => mapTradeTicketRow(row as Record<string, unknown>));
  });
}

export async function getDaaTradeTicket(ticketIdRaw: string): Promise<DaaStoreTradeTicket | null> {
  await ensureDaaStoreSchemaPg();
  const ownerAccountId = getDaaAccountScopeId();
  const ticketId = normalizeText(ticketIdRaw);
  if (!ticketId) return null;
  return withDaaPgClient(async ({ query }) => {
    const result = await query(
      `SELECT ${TRADE_TICKET_SELECT_COLUMNS_} FROM daa_trade_tickets WHERE owner_account_id = $1 AND ticket_id = $2 LIMIT 1`,
      [ownerAccountId, ticketId],
    );
    if (!result.rows.length) return null;
    return mapTradeTicketRow(result.rows[0] as Record<string, unknown>);
  });
}

const REBALANCE_CYCLE_SELECT_COLUMNS_ = [
  "cycle_id",
  "status",
  "trigger_source",
  "trigger_reason",
  "snapshot_at",
  "equity_snapshot",
  "drift_snapshot_json",
  "proposals_json",
  "risk_check_json",
  "execution_started_at",
  "executed_at",
  "executed_orders_json",
  "execution_summary_json",
  "cancelled_at",
  "cancel_reason",
  "notes",
  "market_context_json",
  "policy_decision_id",
  "intent_ids_json",
  "signal_ids_json",
  "policy_snapshot_json",
  "proposal_plan_id",
  "created_at",
].join(", ");

export async function listDaaRebalanceCycles(limit = 100): Promise<DaaStoreRebalanceCycle[]> {
  await ensureDaaStoreSchemaPg();
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const n = Math.max(1, Math.min(500, Math.trunc(toFiniteNumber(limit, 100))));
    const result = await query(
      `SELECT ${REBALANCE_CYCLE_SELECT_COLUMNS_} FROM daa_rebalance_cycles WHERE owner_account_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [ownerAccountId, n],
    );
    return result.rows.map((row) => mapRebalanceCycleRow(row as Record<string, unknown>));
  });
}

export async function getDaaRebalanceCycle(cycleIdRaw: string): Promise<DaaStoreRebalanceCycle | null> {
  await ensureDaaStoreSchemaPg();
  const ownerAccountId = getDaaAccountScopeId();
  const cycleId = normalizeText(cycleIdRaw);
  if (!cycleId) return null;
  return withDaaPgClient(async ({ query }) => {
    const result = await query(
      `SELECT ${REBALANCE_CYCLE_SELECT_COLUMNS_} FROM daa_rebalance_cycles WHERE owner_account_id = $1 AND cycle_id = $2 LIMIT 1`,
      [ownerAccountId, cycleId],
    );
    if (!result.rows.length) return null;
    return mapRebalanceCycleRow(result.rows[0] as Record<string, unknown>);
  });
}

export async function createDaaRebalanceCycle(input: DaaStoreCreateRebalanceCycleInput): Promise<DaaStoreRebalanceCycle> {
  await ensureDaaStoreSchemaPg();
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const cycleId = normalizeText(input.cycleId, "") || randomUUID();
    const status = normalizeRebalanceCycleStatus(input.status);
    const triggerSource = normalizeRebalanceTriggerSource(input.triggerSource);
    const triggerReason = normalizeText(input.triggerReason, "");
    const snapshotAt = toIsoString(input.snapshotAt, new Date().toISOString());
    const executionStartedAt = status === "executing" ? new Date().toISOString() : null;
    const equitySnapshot = Math.max(0, toFiniteNumber(input.equitySnapshot, 0));
    const driftSnapshot = normalizeDriftSnapshot(input.driftSnapshot);
    const proposals = normalizeCycleProposals(input.proposals);
    const riskCheck = normalizePreTradeRiskCheck(input.riskCheck);
    const notes = input.notes == null ? null : normalizeText(input.notes) || null;
    const marketContext = input.marketContext == null ? null : normalizeMarketContextJson(input.marketContext);
    const policyDecisionId = input.policyDecisionId == null ? null : normalizeText(input.policyDecisionId) || null;
    const intentIds = normalizeStringArray(input.intentIds ?? []);
    const signalIds = normalizeStringArray(input.signalIds ?? []);
    const policySnapshot = normalizePolicySnapshot(input.policySnapshot);
    const proposalPlanId = input.proposalPlanId == null ? null : normalizeText(input.proposalPlanId) || null;

    // Embed agentDecisionSnapshot inside market_context_json to avoid schema change
    const marketContextWithSnapshot = {
      ...(marketContext ?? {}),
      ...(input.agentDecisionSnapshot ? { __agentDecisionSnapshot: input.agentDecisionSnapshot } : {}),
    };

    const inserted = await query(
      `INSERT INTO daa_rebalance_cycles (
         owner_account_id, cycle_id, status, trigger_source, trigger_reason, snapshot_at, equity_snapshot,
         drift_snapshot_json, proposals_json, risk_check_json, execution_started_at, notes, market_context_json,
         policy_decision_id, intent_ids_json, signal_ids_json, policy_snapshot_json, proposal_plan_id, created_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12,$13::jsonb,$14,$15::jsonb,$16::jsonb,$17::jsonb,$18,NOW()
       )
       ON CONFLICT (cycle_id) DO UPDATE
       SET
         owner_account_id = EXCLUDED.owner_account_id,
         status = EXCLUDED.status,
         trigger_source = EXCLUDED.trigger_source,
         trigger_reason = EXCLUDED.trigger_reason,
         snapshot_at = EXCLUDED.snapshot_at,
         equity_snapshot = EXCLUDED.equity_snapshot,
         drift_snapshot_json = EXCLUDED.drift_snapshot_json,
         proposals_json = EXCLUDED.proposals_json,
         risk_check_json = EXCLUDED.risk_check_json,
         execution_started_at = EXCLUDED.execution_started_at,
         notes = EXCLUDED.notes,
         market_context_json = EXCLUDED.market_context_json,
         policy_decision_id = EXCLUDED.policy_decision_id,
         intent_ids_json = EXCLUDED.intent_ids_json,
         signal_ids_json = EXCLUDED.signal_ids_json,
         policy_snapshot_json = EXCLUDED.policy_snapshot_json,
         proposal_plan_id = EXCLUDED.proposal_plan_id
       RETURNING ${REBALANCE_CYCLE_SELECT_COLUMNS_}`,
      [
        ownerAccountId,
        cycleId,
        status,
        triggerSource,
        triggerReason,
        snapshotAt,
        equitySnapshot,
        JSON.stringify(driftSnapshot),
        JSON.stringify(proposals),
        JSON.stringify(riskCheck),
        executionStartedAt,
        notes,
        JSON.stringify(marketContextWithSnapshot),
        policyDecisionId,
        JSON.stringify(intentIds),
        JSON.stringify(signalIds),
        JSON.stringify(policySnapshot ?? {}),
        proposalPlanId,
      ],
    );
    return mapRebalanceCycleRow(inserted.rows[0] as Record<string, unknown>);
  });
}

export async function patchDaaRebalanceCycle(input: DaaStorePatchRebalanceCycleInput): Promise<DaaStoreRebalanceCycle> {
  await ensureDaaStoreSchemaPg();
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const cycleId = normalizeText(input.cycleId);
    if (!cycleId) throw new Error("cycleId is required");

    await query("BEGIN");
    try {
      const currentRes = await query(
        `SELECT ${REBALANCE_CYCLE_SELECT_COLUMNS_} FROM daa_rebalance_cycles WHERE owner_account_id = $1 AND cycle_id = $2 LIMIT 1 FOR UPDATE`,
        [ownerAccountId, cycleId],
      );
      if (!currentRes.rows.length) throw new Error(`cycle not found: ${cycleId}`);
      const current = mapRebalanceCycleRow(currentRes.rows[0] as Record<string, unknown>);

      const nextStatus = input.status == null ? current.status : normalizeRebalanceCycleStatus(input.status);
      const nextTriggerReason = input.triggerReason == null ? current.triggerReason : normalizeText(input.triggerReason, "");
      const nextRiskCheck = input.riskCheck == null ? current.riskCheck : normalizePreTradeRiskCheck(input.riskCheck);
      const nextProposals = input.proposals == null ? current.proposals : normalizeCycleProposals(input.proposals);
      const nextExecutionStartedAt = input.executionStartedAt === undefined
        ? (nextStatus === "executing"
          ? (current.status === "executing" ? current.executionStartedAt || new Date().toISOString() : new Date().toISOString())
          : null)
        : (input.executionStartedAt ? toIsoString(input.executionStartedAt, new Date().toISOString()) : null);
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
            ordersSubmitted: Math.max(0, toFiniteNumber(input.executionSummary.ordersSubmitted, 0)),
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
        : (input.marketContext == null ? null : normalizeMarketContextJson(input.marketContext));
      const nextPolicyDecisionId = input.policyDecisionId === undefined
        ? (current.policyDecisionId ?? null)
        : (input.policyDecisionId == null ? null : normalizeText(input.policyDecisionId) || null);
      const nextIntentIds = input.intentIds === undefined
        ? current.intentIds
        : normalizeStringArray(input.intentIds);
      const nextSignalIds = input.signalIds === undefined
        ? current.signalIds
        : normalizeStringArray(input.signalIds);
      const nextPolicySnapshot = input.policySnapshot === undefined
        ? (current.policySnapshot ?? null)
        : normalizePolicySnapshot(input.policySnapshot);
      const nextProposalPlanId = input.proposalPlanId === undefined
        ? (current.proposalPlanId ?? null)
        : (input.proposalPlanId == null ? null : normalizeText(input.proposalPlanId) || null);

      const updatedRes = await query(
        `UPDATE daa_rebalance_cycles
         SET
           status = $2,
           trigger_reason = $3,
           proposals_json = $4::jsonb,
           risk_check_json = $5::jsonb,
           execution_started_at = $6,
           executed_at = $7,
           executed_orders_json = $8::jsonb,
           execution_summary_json = $9::jsonb,
           cancelled_at = $10,
           cancel_reason = $11,
           notes = $12,
           market_context_json = $13::jsonb,
           policy_decision_id = $14,
           intent_ids_json = $15::jsonb,
           signal_ids_json = $16::jsonb,
           policy_snapshot_json = $17::jsonb,
           proposal_plan_id = $18
         WHERE owner_account_id = $19 AND cycle_id = $1
         RETURNING ${REBALANCE_CYCLE_SELECT_COLUMNS_}`,
        [
          cycleId,
          nextStatus,
          nextTriggerReason,
          JSON.stringify(nextProposals),
          JSON.stringify(nextRiskCheck),
          nextExecutionStartedAt,
          nextExecutedAt,
          JSON.stringify(nextExecutedOrders),
          nextExecutionSummary == null ? null : JSON.stringify(nextExecutionSummary),
          nextCancelledAt,
          nextCancelReason,
          nextNotes,
          nextMarketContext == null ? JSON.stringify({}) : JSON.stringify(nextMarketContext),
          nextPolicyDecisionId,
          JSON.stringify(nextIntentIds),
          JSON.stringify(nextSignalIds),
          JSON.stringify(nextPolicySnapshot ?? {}),
          nextProposalPlanId,
          ownerAccountId,
        ],
      );

      await query("COMMIT");
      return mapRebalanceCycleRow(updatedRes.rows[0] as Record<string, unknown>);
    } catch (error) {
      try {
        await query("ROLLBACK");
      } catch (err) {
        logSwallowed("tradeTicketStore.rollback", err);
      }
      throw error;
    }
  });
}

const CYCLE_REPORT_SELECT_COLUMNS_ = [
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

export async function upsertDaaCycleReport(input: {
  cycleId: string;
  beforeSnapshot: Record<string, unknown>;
  afterSnapshot: Record<string, unknown>;
  executionStats: Record<string, unknown>;
  pnlAttribution: Record<string, unknown>;
  riskDelta: Record<string, unknown>;
}): Promise<DaaStoreCycleReport> {
  await ensureDaaStoreSchemaPg();
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const cycleId = normalizeText(input.cycleId);
    if (!cycleId) throw new Error("cycleId is required");
    const inserted = await query(
      `
      INSERT INTO daa_cycle_reports (
        owner_account_id, cycle_id, before_snapshot_json, after_snapshot_json, execution_stats_json, pnl_attribution_json, risk_delta_json, created_at
      ) VALUES (
        $1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, NOW()
      )
      ON CONFLICT (cycle_id) DO UPDATE
      SET
        owner_account_id = EXCLUDED.owner_account_id,
        before_snapshot_json = EXCLUDED.before_snapshot_json,
        after_snapshot_json = EXCLUDED.after_snapshot_json,
        execution_stats_json = EXCLUDED.execution_stats_json,
        pnl_attribution_json = EXCLUDED.pnl_attribution_json,
        risk_delta_json = EXCLUDED.risk_delta_json,
        created_at = NOW()
      RETURNING cycle_id
      `,
      [
        ownerAccountId,
        cycleId,
        JSON.stringify(input.beforeSnapshot || {}),
        JSON.stringify(input.afterSnapshot || {}),
        JSON.stringify(input.executionStats || {}),
        JSON.stringify(input.pnlAttribution || {}),
        JSON.stringify(input.riskDelta || {}),
      ],
    );
    const hit = await query(
      `SELECT ${CYCLE_REPORT_SELECT_COLUMNS_}
       FROM daa_cycle_reports r
       JOIN daa_rebalance_cycles c ON c.cycle_id = r.cycle_id
       WHERE r.owner_account_id = $1 AND c.owner_account_id = $1 AND r.cycle_id = $2
       LIMIT 1`,
      [ownerAccountId, normalizeText((inserted.rows[0] as Record<string, unknown> | undefined)?.cycle_id, cycleId)],
    );
    if (!hit.rows.length) throw new Error("cycle report upsert failed");
    return mapCycleReportRow(hit.rows[0] as Record<string, unknown>);
  });
}

export async function getDaaCycleReport(cycleIdRaw: string): Promise<DaaStoreCycleReport | null> {
  await ensureDaaStoreSchemaPg();
  const ownerAccountId = getDaaAccountScopeId();
  const cycleId = normalizeText(cycleIdRaw);
  if (!cycleId) return null;
  return withDaaPgClient(async ({ query }) => {
    const result = await query(
      `SELECT ${CYCLE_REPORT_SELECT_COLUMNS_}
       FROM daa_cycle_reports r
       JOIN daa_rebalance_cycles c ON c.cycle_id = r.cycle_id
       WHERE r.owner_account_id = $1 AND c.owner_account_id = $1 AND r.cycle_id = $2
       LIMIT 1`,
      [ownerAccountId, cycleId],
    );
    if (!result.rows.length) return null;
    return mapCycleReportRow(result.rows[0] as Record<string, unknown>);
  });
}

export async function listDaaCycleReports(limit = 50): Promise<DaaStoreCycleReport[]> {
  await ensureDaaStoreSchemaPg();
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const n = Math.max(1, Math.min(200, Math.trunc(toFiniteNumber(limit, 50))));
    const result = await query(
      `SELECT ${CYCLE_REPORT_SELECT_COLUMNS_}
       FROM daa_cycle_reports r
       JOIN daa_rebalance_cycles c ON c.cycle_id = r.cycle_id
       WHERE r.owner_account_id = $1 AND c.owner_account_id = $1
       ORDER BY r.created_at DESC
       LIMIT $2`,
      [ownerAccountId, n],
    );
    return result.rows.map((row) => mapCycleReportRow(row as Record<string, unknown>));
  });
}

export async function appendDaaTriggerEvent(input: {
  idempotencyKey: string;
  triggerSource: DaaStoreRebalanceTriggerSource;
  triggerReason: string;
  cycleId?: string | null;
  status?: "accepted" | "skipped" | "conflict";
  detailsJson?: Record<string, unknown>;
}): Promise<DaaStoreTriggerEvent> {
  await ensureDaaStoreSchemaPg();
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const idempotencyKey = normalizeText(input.idempotencyKey);
    if (!idempotencyKey) throw new Error("idempotencyKey is required");
    const triggerSource = normalizeRebalanceTriggerSource(input.triggerSource);
    const triggerReason = normalizeText(input.triggerReason, "");
    const cycleId = input.cycleId == null ? null : normalizeText(input.cycleId) || null;
    const statusRaw = normalizeText(input.status, "accepted").toLowerCase();
    const status = statusRaw === "skipped" || statusRaw === "conflict" ? statusRaw : "accepted";
    const detailsJson = input.detailsJson || {};
    const eventId = randomUUID();

    const result = await query(
      `
      INSERT INTO daa_trigger_events (
        owner_account_id, event_id, idempotency_key, trigger_source, trigger_reason, cycle_id, status, details_json, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW()
      )
      ON CONFLICT (owner_account_id, idempotency_key) DO UPDATE
      SET
        trigger_source = EXCLUDED.trigger_source,
        trigger_reason = EXCLUDED.trigger_reason,
        cycle_id = EXCLUDED.cycle_id,
        status = EXCLUDED.status,
        details_json = EXCLUDED.details_json
      RETURNING event_id, idempotency_key, trigger_source, trigger_reason, cycle_id, status, details_json, created_at
      `,
      [ownerAccountId, eventId, idempotencyKey, triggerSource, triggerReason, cycleId, status, JSON.stringify(detailsJson)],
    );
    return mapTriggerEventRow(result.rows[0] as Record<string, unknown>);
  });
}

export async function applyDaaBrokerOrderSync(input: {
  ticketId?: string | null;
  order: {
    broker: DaaStoreBrokerKind;
    accountId: string;
    orderId: string;
    status: string;
    filledQty: number | null;
    avgFillPrice: number | null;
    updatedAt?: string | null;
    raw?: Record<string, unknown> | null;
  };
}): Promise<DaaStoreTradeTicket | null> {
  await ensureDaaStoreSchemaPg();
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const ticketId = normalizeText(input.ticketId);
    const orderId = normalizeText(input.order.orderId);
    if (!ticketId && !orderId) return null;

    await query("BEGIN");
    try {
      const whereSql = ticketId ? "ticket_id = $2" : "broker_order_id = $2";
      const currentRes = await query(
        `SELECT ${TRADE_TICKET_SELECT_COLUMNS_}
         FROM daa_trade_tickets
         WHERE owner_account_id = $1 AND ${whereSql}
         LIMIT 1
         FOR UPDATE`,
        [ownerAccountId, ticketId || orderId],
      );
      if (!currentRes.rows.length) {
        await query("ROLLBACK");
        return null;
      }

      const current = mapTradeTicketRow(currentRes.rows[0] as Record<string, unknown>);
      const nowIso = input.order.updatedAt ? toIsoString(input.order.updatedAt, new Date().toISOString()) : new Date().toISOString();
      const nextStatus = normalizeTradeTicketStatus(mapBrokerOrderStatusToTradeTicketStatus(input.order.status));
      const filledQty = input.order.filledQty == null ? (current.filledQty ?? 0) : Math.max(0, toFiniteNumber(input.order.filledQty));
      const avgFillPrice = input.order.avgFillPrice == null
        ? (current.avgFillPrice ?? null)
        : Math.max(0, toFiniteNumber(input.order.avgFillPrice));
      const lastAppliedFillQty = Math.max(0, current.lastAppliedFillQty);
      const nextAppliedFillQty = Math.max(lastAppliedFillQty, Math.min(current.qty, filledQty));
      const deltaFilledQty = Math.max(0, nextAppliedFillQty - lastAppliedFillQty);
      const brokerRejectReason = nextStatus === "rejected"
        ? normalizeText(
          (input.order.raw as Record<string, unknown> | null)?.message
          || (input.order.raw as Record<string, unknown> | null)?.text
          || current.brokerRejectReason
          || current.rejectMessage,
        ) || null
        : null;

      if (deltaFilledQty > 0) {
        const fxRes = await query("SELECT base_ccy, quote_ccy, rate FROM daa_fx_rates");
        const fxMap = buildFxLookupMap(fxRes.rows as Array<Record<string, unknown>>);
        const fxRateToBase = current.fxRateToBase && current.fxRateToBase > 0
          ? current.fxRateToBase
          : resolveFxRateToBase(current.baseCurrency, current.instrumentCurrency, fxMap);
        if (!(fxRateToBase && fxRateToBase > 0)) {
          throw new Error(`missing fx rate for trade-ticket execution: ${current.instrumentCurrency}/${current.baseCurrency}`);
        }
        const effectivePrice = avgFillPrice && avgFillPrice > 0 ? avgFillPrice : current.price;
        const grossNotionalDelta = deltaFilledQty * effectivePrice;
        const notionalInBaseDelta = grossNotionalDelta * fxRateToBase;
        const ledgerSide: DaaStoreCashLedgerSide = current.side === "BUY" ? "withdraw" : "deposit";
        const ledgerAmount = current.side === "BUY"
          ? notionalInBaseDelta
          : Math.max(0, notionalInBaseDelta);

        await query(
          "INSERT INTO daa_trade_journal (owner_account_id, id, symbol, side, qty, price, notional, fee, executed_at, source, notes, execution_order_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())",
          [
            ownerAccountId,
            randomUUID(),
            current.symbol,
            current.side,
            deltaFilledQty,
            effectivePrice,
            grossNotionalDelta,
            0,
            nowIso,
            current.source,
            `broker_sync ${orderId} ${nextAppliedFillQty.toFixed(6)}`,
            `${orderId}:${nextAppliedFillQty.toFixed(6)}`,
          ],
        );
        try {
          await query(
            `INSERT INTO daa_portfolio_ledger_events (
               owner_account_id, event_id, ts, event_kind, side, amount, base_currency, account_base_currency,
               amount_in_account_base, fx_rate_to_account, ticket_id, cycle_id, settlement_ts, note, event_payload_json, created_at
             ) VALUES (
               $1,$2,$3,'trade_execution',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,NOW()
             )`,
            [
              ownerAccountId,
              randomUUID(),
              nowIso,
              ledgerSide,
              ledgerAmount,
              current.baseCurrency,
              current.baseCurrency,
              ledgerAmount,
              1,
              current.ticketId,
              current.cycleId,
              nowIso,
              `${current.side} ${current.symbol} 增量成交 ${deltaFilledQty.toFixed(6)} @ ${effectivePrice.toFixed(4)}`,
              JSON.stringify({
                entryKind: "trade_execution",
                side: current.side,
                brokerKind: input.order.broker,
                brokerOrderId: orderId,
                deltaFilledQty,
              }),
            ],
          );
        } catch (error) {
          if (!isPgUniqueViolation(error)) throw error;
        }
      }

      await query(
        `UPDATE daa_trade_tickets
         SET
           status = $2,
           broker_kind = $3,
           broker_account_id = $4,
           broker_order_id = $5,
           broker_status = $6,
           filled_qty = $7,
           avg_fill_price = $8,
           last_broker_sync_at = $9,
           last_applied_fill_qty = $10,
           broker_reject_reason = $11,
           broker_raw_json = $12::jsonb,
           reject_code = CASE WHEN $2 = 'rejected' THEN 'BROKER_REJECTED' ELSE NULL END,
           reject_message = CASE WHEN $2 = 'rejected' THEN $11 ELSE NULL END,
           gross_notional = CASE
             WHEN COALESCE(CAST($7 AS DOUBLE PRECISION), 0) > 0
               THEN COALESCE(CAST($7 AS DOUBLE PRECISION), 0)
                 * CASE WHEN COALESCE(CAST($8 AS DOUBLE PRECISION), 0) > 0 THEN CAST($8 AS DOUBLE PRECISION) ELSE price END
             ELSE gross_notional
           END,
           notional_in_base = CASE
             WHEN COALESCE(CAST($7 AS DOUBLE PRECISION), 0) > 0
               THEN (
                 COALESCE(CAST($7 AS DOUBLE PRECISION), 0)
                 * CASE WHEN COALESCE(CAST($8 AS DOUBLE PRECISION), 0) > 0 THEN CAST($8 AS DOUBLE PRECISION) ELSE price END
               ) * CASE WHEN COALESCE(fx_rate_to_base, 0) > 0 THEN fx_rate_to_base ELSE 1 END
             ELSE notional_in_base
           END,
           executed_at = CASE WHEN $2 = 'executed' THEN COALESCE(executed_at, $9) ELSE executed_at END,
           canceled_at = CASE WHEN $2 = 'canceled' THEN COALESCE(canceled_at, $9) ELSE canceled_at END,
           updated_at = NOW()
         WHERE owner_account_id = $13 AND ticket_id = $1`,
        [
          current.ticketId,
          nextStatus,
          input.order.broker,
          normalizeText(input.order.accountId) || current.brokerAccountId,
          orderId || current.brokerOrderId,
          normalizeText(input.order.status) || current.brokerStatus,
          filledQty > 0 ? filledQty : null,
          avgFillPrice && avgFillPrice > 0 ? avgFillPrice : null,
          nowIso,
          nextAppliedFillQty,
          brokerRejectReason,
          JSON.stringify(input.order.raw ?? null),
          ownerAccountId,
        ],
      );

      if (orderId || current.brokerOrderId) {
        await upsertBrokerOrderSnapshotInTx(query as DaaTxQueryFn, {
          ticketId: current.ticketId,
          brokerKind: input.order.broker,
          brokerAccountId: normalizeText(input.order.accountId) || current.brokerAccountId,
          brokerOrderId: orderId || current.brokerOrderId || current.ticketId,
          status: normalizeText(input.order.status) || "unknown",
          filledQty: filledQty > 0 ? filledQty : null,
          avgFillPrice: avgFillPrice && avgFillPrice > 0 ? avgFillPrice : null,
          raw: input.order.raw ?? null,
          syncedAt: nowIso,
        });
      }

      await refreshTradeTicketAggregatesInTx(query as DaaTxQueryFn, [current.ticketId]);
      const latestRows = await selectTradeTicketsByIdsInTx(query as DaaTxQueryFn, [current.ticketId], { orderByCreatedDesc: true });
      await query("COMMIT");
      return latestRows[0] ?? null;
    } catch (error) {
      try {
        await query("ROLLBACK");
      } catch (err) {
        logSwallowed("tradeTicketStore.rollback", err);
      }
      throw error;
    }
  });
}

export async function createDaaTradeTicket(input: DaaStoreCreateTradeTicketInput): Promise<DaaStoreTradeTicket> {
  await ensureDaaStoreSchemaPg();
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const symbol = normalizeText(input.symbol).toUpperCase();
    const market = normalizeText(input.market, "US").toUpperCase();
    const assetKey = buildPositionKey(symbol, market);
    const instrumentCurrency = normalizeCcyCode(input.instrumentCurrency, "USD");
    const side = normalizeTradeTicketSide(input.side);
    const source = normalizeTradeTicketSource(input.source);
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
    const pricingMode = normalizeTradePricingMode(input.pricingMode);
    const priceSource = normalizeText(input.priceSource, "") || null;
    const priceSnapshotAt = input.priceSnapshotAt ? toIsoString(input.priceSnapshotAt, new Date().toISOString()) : null;
    const status = normalizeTradeTicketStatus(input.status);
    const brokerKind = input.brokerKind ?? null;
    const brokerAccountId = normalizeText(input.brokerAccountId, "") || null;
    const brokerOrderId = normalizeText(input.brokerOrderId, "") || null;
    const brokerStatus = normalizeText(input.brokerStatus, "") || null;
    const filledQty = input.filledQty == null ? null : Math.max(0, toFiniteNumber(input.filledQty));
    const avgFillPrice = input.avgFillPrice == null ? null : Math.max(0, toFiniteNumber(input.avgFillPrice));
    const lastBrokerSyncAt = input.lastBrokerSyncAt ? toIsoString(input.lastBrokerSyncAt, new Date().toISOString()) : null;
    const lastAppliedFillQty = input.lastAppliedFillQty == null ? 0 : Math.max(0, toFiniteNumber(input.lastAppliedFillQty));
    const brokerRejectReason = normalizeText(input.brokerRejectReason, "") || null;
    const brokerRaw = input.brokerRaw ?? null;
    const createdBy = normalizeText(input.createdBy, "admin");

    if (!symbol) throw new Error("symbol is required");
    if (normalizeText(input.assetKey)) {
      const parsedAssetKey = parseDaaAssetKey(input.assetKey);
      const expectedAssetKey = buildPositionKey(symbol, market);
      if (!parsedAssetKey || buildPositionKey(parsedAssetKey.symbol, parsedAssetKey.market) !== expectedAssetKey) {
        throw new Error(`assetKey 与 symbol/market 不一致: ${input.assetKey}`);
      }
    }
    if (qty <= 0) throw new Error("qty must be greater than 0");
    if (price <= 0) throw new Error("price must be greater than 0");

    const ticketId = randomUUID();
    const grossNotional = qty * price;

    await query("BEGIN");
    try {
      const accountState = await ensureAccountStateRowInTx(query as any);
      const baseCurrency = normalizeCcyCode(accountState.baseCurrency, "USD");
      const cash = Math.max(0, toFiniteNumber(accountState.cash, 0));

      let basketId = basketIdInput;
      if (!basketId) {
        const draftRes = await query(
          "SELECT basket_id FROM daa_trade_baskets WHERE owner_account_id = $1 AND status = 'draft' AND source = $2 ORDER BY updated_at DESC LIMIT 1",
          [ownerAccountId, sourceForBasket],
        );
        basketId = normalizeText((draftRes.rows[0] as Record<string, unknown> | undefined)?.basket_id);
      }
      if (!basketId) {
        basketId = randomUUID();
        await query(
          "INSERT INTO daa_trade_baskets (owner_account_id, basket_id, source, status, decision_ref_id, created_by, created_at, updated_at) VALUES ($1,$2,$3,'draft',$4,$5,NOW(),NOW())",
          [ownerAccountId, basketId, sourceForBasket, decisionRefId, createdBy],
        );
      } else {
        const basketRes = await query(
          "SELECT basket_id, status, source FROM daa_trade_baskets WHERE owner_account_id = $1 AND basket_id = $2 LIMIT 1 FOR UPDATE",
          [ownerAccountId, basketId],
        );
        const basketRow = basketRes.rows[0] as Record<string, unknown> | undefined;
        if (!basketRow) {
          throw new Error(`basket not found: ${basketId}`);
        }
        const basketStatus = normalizeTradeBasketStatus(basketRow.status);
        if (basketStatus !== "draft") {
          throw new Error(`basket is not editable: ${basketStatus}`);
        }
      }

      const posRes = await query(
        "SELECT qty FROM daa_positions_v2 WHERE owner_account_id = $1 AND asset_key = $2 LIMIT 1 FOR UPDATE",
        [ownerAccountId, assetKey],
      );
      const positionQty = Math.max(0, toFiniteNumber((posRes.rows[0] as Record<string, unknown> | undefined)?.qty, 0));

      const fxRes = await query("SELECT base_ccy, quote_ccy, rate FROM daa_fx_rates");
      const fxMap = buildFxLookupMap(fxRes.rows as Array<Record<string, unknown>>);
      const fxRateToBase = resolveFxRateToBase(baseCurrency, instrumentCurrency, fxMap);
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
          "SELECT cycle_id FROM daa_rebalance_cycles WHERE owner_account_id = $1 AND cycle_id = $2 LIMIT 1 FOR UPDATE",
          [ownerAccountId, cycleId],
        );
        if (!cycleRes.rows.length) {
          throw new Error(`cycle not found: ${cycleId}`);
        }
      }

      await query(
        `INSERT INTO daa_trade_tickets (
           owner_account_id, ticket_id, basket_id, asset_key, cycle_id, source, status, symbol, market, instrument_currency, base_currency,
           side, qty, price, fee, gross_notional, fx_rate_to_base, notional_in_base, decision_ref_id, reason_tags, reason_text,
           snapshot_before_json, pricing_mode, price_source, price_snapshot_at, broker_kind, broker_account_id, broker_order_id,
           broker_status, filled_qty, avg_fill_price, last_broker_sync_at, last_applied_fill_qty, broker_reject_reason, broker_raw_json,
           created_by, created_at, updated_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
           $12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
           $22::jsonb,$23,$24,$25,$26,$27,$28,
           $29,$30,$31,$32,$33,$34,$35::jsonb,
           $36,NOW(),NOW()
         )`,
        [
          ownerAccountId,
          ticketId,
          basketId,
          assetKey,
          cycleId,
          source,
          status,
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
          brokerKind,
          brokerAccountId,
          brokerOrderId,
          brokerStatus,
          filledQty,
          avgFillPrice,
          lastBrokerSyncAt,
          lastAppliedFillQty,
          brokerRejectReason,
          JSON.stringify(brokerRaw),
          createdBy,
        ],
      );
      await query(
        "UPDATE daa_trade_baskets SET updated_at = NOW(), source = CASE WHEN source <> $1 THEN 'mixed' ELSE source END WHERE owner_account_id = $2 AND basket_id = $3",
        [sourceForBasket, ownerAccountId, basketId],
      );
      if (status !== "ready") {
        await refreshTradeTicketAggregatesInTx(query as DaaTxQueryFn, [ticketId]);
      }

      const inserted = await query(
        `SELECT ${TRADE_TICKET_SELECT_COLUMNS_} FROM daa_trade_tickets WHERE owner_account_id = $1 AND ticket_id = $2 LIMIT 1`,
        [ownerAccountId, ticketId],
      );
      await query("COMMIT");
      return mapTradeTicketRow(inserted.rows[0] as Record<string, unknown>);
    } catch (error) {
      try {
        await query("ROLLBACK");
      } catch (err) {
        logSwallowed("tradeTicketStore.rollback", err);
      }
      throw error;
    }
  });
}

export async function executeDaaTradeTickets(input: DaaStoreExecuteTradeTicketsInput): Promise<DaaStoreExecuteTradeTicketsResult> {
  await ensureDaaStoreSchemaPg();
  const ownerAccountId = getDaaAccountScopeId();
  return withDaaPgClient(async ({ query }) => {
    const basketId = normalizeText(input.basketId);
    let ticketIds = [...new Set((Array.isArray(input.ticketIds) ? input.ticketIds : []).map((item) => normalizeText(item)).filter(Boolean))];
    if (!ticketIds.length && basketId) {
      const rows = await query(
        "SELECT ticket_id FROM daa_trade_tickets WHERE owner_account_id = $1 AND basket_id = $2 AND status = 'ready' ORDER BY created_at ASC",
        [ownerAccountId, basketId],
      );
      ticketIds = rows.rows.map((row) => normalizeText((row as Record<string, unknown>).ticket_id)).filter(Boolean);
    }
    if (!ticketIds.length) throw new Error("ticketIds is required");
    if (ticketIds.length > 200) throw new Error("ticketIds exceeds limit(200)");

    await query("BEGIN");
    try {
      const placeholders = ticketIds.map((_, idx) => `$${idx + 2}`).join(", ");
      const ticketRows = await query(
        `SELECT ${TRADE_TICKET_SELECT_COLUMNS_} FROM daa_trade_tickets WHERE owner_account_id = $1 AND ticket_id IN (${placeholders}) FOR UPDATE`,
        [ownerAccountId, ...ticketIds],
      );
      const ticketMap = new Map<string, DaaStoreTradeTicket>();
      for (const row of ticketRows.rows as Array<Record<string, unknown>>) {
        const ticket = mapTradeTicketRow(row);
        ticketMap.set(ticket.ticketId, ticket);
      }

      const positionsRes = await query(
        "SELECT asset_key, symbol, market, currency, qty, price, cost_basis, cost_basis_in_base, tags, updated_at FROM daa_positions_v2 WHERE owner_account_id = $1 FOR UPDATE",
        [ownerAccountId],
      );
      const positionsMap = new Map<string, DaaStorePosition>();
      for (const row of positionsRes.rows as Array<Record<string, unknown>>) {
        const pos = mapPositionRow(row);
        positionsMap.set(buildPositionKey(pos.symbol, pos.market), pos);
      }

      const accountState = await getAccountStateForUpdateInTx(query as any);
      const baseCurrency = normalizeCcyCode(accountState.baseCurrency, "USD");
      let accountCash = Math.max(0, toFiniteNumber(accountState.cash, 0));
      let accountInvestableCash = resolveInvestableCash(accountState.cash, accountState.frozenCash, accountState.investableCash);

      const fxRes = await query("SELECT base_ccy, quote_ccy, rate FROM daa_fx_rates");
      const fxMap = buildFxLookupMap(fxRes.rows as Array<Record<string, unknown>>);

      const results: DaaStoreExecuteTradeTicketsResult["results"] = [];
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

        const positionKey = normalizeText(ticket.assetKey, buildPositionKey(ticket.symbol, ticket.market)).toUpperCase();
        const existingPosition = positionsMap.get(positionKey) ?? {
          id: buildPositionId(ticket.symbol, ticket.market),
          assetKey: positionKey,
          symbol: ticket.symbol,
          market: ticket.market,
          currency: ticket.instrumentCurrency,
          qty: 0,
          price: ticket.price,
          costBasis: 0,
          costBasisInBase: 0,
          tags: [],
          updatedAt: nowIso,
        };

        const fxRate = ticket.fxRateToBase && ticket.fxRateToBase > 0
          ? ticket.fxRateToBase
          : resolveFxRateToBase(baseCurrency, ticket.instrumentCurrency, fxMap);
        if (!fxRate || fxRate <= 0) {
          const rejectMessage = `缺少汇率：${ticket.instrumentCurrency}/${baseCurrency}`;
          await query(
            "UPDATE daa_trade_tickets SET status = 'rejected', reject_code = 'FX_RATE_MISSING', reject_message = $1, updated_at = NOW() WHERE owner_account_id = $2 AND ticket_id = $3",
            [rejectMessage, ownerAccountId, ticket.ticketId],
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
              "UPDATE daa_trade_tickets SET status = 'rejected', reject_code = 'INSUFFICIENT_INVESTABLE_CASH', reject_message = $1, updated_at = NOW() WHERE owner_account_id = $2 AND ticket_id = $3",
              [rejectMessage, ownerAccountId, ticket.ticketId],
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
          const prevCostBasisInBase = existingPosition.costBasisInBase ?? (prevCostBasis * fxRate);
          const nextCostBasisInBase = prevCostBasisInBase + notionalInBase;
          positionsMap.set(positionKey, {
            ...existingPosition,
            qty: nextQty,
            price: ticket.price,
            costBasis: nextCostBasis,
            costBasisInBase: nextCostBasisInBase,
            currency: ticket.instrumentCurrency,
            updatedAt: nowIso,
          });
        } else {
          const prevQty = Math.max(0, existingPosition.qty);
          if (ticket.qty > prevQty + 1e-9) {
            const rejectMessage = `持仓不足：卖出 ${ticket.qty.toFixed(6)}，当前持仓 ${prevQty.toFixed(6)}`;
            await query(
              "UPDATE daa_trade_tickets SET status = 'rejected', reject_code = 'INSUFFICIENT_POSITION', reject_message = $1, updated_at = NOW() WHERE owner_account_id = $2 AND ticket_id = $3",
              [rejectMessage, ownerAccountId, ticket.ticketId],
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
            const prevCostBasisInBase = existingPosition.costBasisInBase ?? (prevCostBasis * fxRate);
            const costPerUnitInBase = prevQty > 0 ? prevCostBasisInBase / prevQty : 0;
            const nextCostBasisInBase = costPerUnitInBase * nextQty;
            positionsMap.set(positionKey, {
              ...existingPosition,
              qty: nextQty,
              price: ticket.price,
              costBasis: Math.max(0, costPerUnit * nextQty),
              costBasisInBase: Math.max(0, nextCostBasisInBase),
              updatedAt: nowIso,
            });
          }
        }

        await query(
          "INSERT INTO daa_trade_journal (owner_account_id, id, symbol, side, qty, price, notional, fee, executed_at, source, notes, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())",
          [
            ownerAccountId,
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
          "UPDATE daa_trade_tickets SET status = 'executed', reject_code = NULL, reject_message = NULL, fx_rate_to_base = $1, gross_notional = $2, notional_in_base = $3, snapshot_after_json = $4::jsonb, executed_at = $5, updated_at = NOW() WHERE owner_account_id = $6 AND ticket_id = $7",
          [fxRate, grossNotional, notionalInBase, JSON.stringify(snapshotAfter), nowIso, ownerAccountId, ticket.ticketId],
        );

        const ledgerSide: DaaStoreCashLedgerSide = ticket.side === "BUY" ? "withdraw" : "deposit";
        const ledgerAmountInBase = ticket.side === "BUY"
          ? (notionalInBase + feeInBase)
          : Math.max(0, notionalInBase - feeInBase);
        try {
          await query(
            `INSERT INTO daa_portfolio_ledger_events (
               owner_account_id, event_id, ts, event_kind, side, amount, base_currency, account_base_currency,
               amount_in_account_base, fx_rate_to_account, ticket_id, cycle_id, settlement_ts, note, event_payload_json, created_at
             ) VALUES (
               $1,$2,$3,'trade_execution',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,NOW()
             )`,
            [
              ownerAccountId,
              randomUUID(),
              nowIso,
              ledgerSide,
              ledgerAmountInBase,
              baseCurrency,
              baseCurrency,
              ledgerAmountInBase,
              1,
              ticket.ticketId,
              ticket.cycleId,
              nowIso,
              `${ticket.side} ${ticket.symbol} ${ticket.qty.toFixed(6)} @ ${ticket.price.toFixed(4)}`,
              JSON.stringify({ entryKind: "trade_execution", side: ticket.side }),
            ],
          );
        } catch (error) {
          if (!isPgUniqueViolation(error)) throw error;
        }

        results.push({
          ticketId: ticket.ticketId,
          status: "executed",
        });
      }

      // 确保每个持仓资产在 asset_master 中存在
      for (const position of positionsMap.values()) {
        if (position.qty <= 0) continue;
        const assetKey = buildPositionKey(position.symbol, position.market);
        await (query as DaaTxQueryFn)(
          `INSERT INTO daa_asset_master (asset_key, symbol, market, currency, created_at, updated_at)
           VALUES ($1,$2,$3,$4,NOW(),NOW())
           ON CONFLICT (asset_key) DO NOTHING`,
          [assetKey, position.symbol, position.market, position.currency],
        );
      }
      await replacePositionsV2SnapshotInTx(
        query as DaaTxQueryFn,
        [...positionsMap.values()].map((position) => ({
          assetKey: buildPositionKey(position.symbol, position.market),
          symbol: position.symbol,
          market: position.market,
          currency: position.currency,
          qty: position.qty,
          price: position.price,
          costBasis: position.costBasis,
          costBasisInBase: position.costBasisInBase,
          tags: position.tags,
          updatedAt: position.updatedAt,
        })),
      );

      const valuation = await buildPortfolioSnapshotFromAssetUniverseInTx(query as DaaTxQueryFn, {
        baseCurrency,
        cash: accountCash,
      });
      const account = await syncStrategyAccountCashInTx(query as DaaTxQueryFn, accountCash, {
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
        "INSERT INTO daa_equity_snapshots_v2 (owner_account_id, ts, total_equity, holdings_value, cash, source) VALUES ($1,$2,$3,$4,$5,$6)",
        [ownerAccountId, snapshotTs, totalEquity, holdingsValue, account.cash, "trade_ticket"],
      );

      await query(
        "INSERT INTO daa_op_log (owner_account_id, id, ts, level, message, context_json) VALUES ($1, $2, NOW(), 'info', $3, $4)",
        [
          ownerAccountId,
          randomUUID(),
          `Trade ticket 执行完成：成功 ${results.filter((r) => r.status === "executed").length}，失败 ${results.filter((r) => r.status === "rejected").length}`,
          JSON.stringify({
            ticketIds,
            results,
            account: accountWithEquity,
          }),
        ],
      );

      await refreshTradeTicketAggregatesInTx(query as DaaTxQueryFn, ticketIds);

      const latestTicketRows = await query(
        `SELECT ${TRADE_TICKET_SELECT_COLUMNS_} FROM daa_trade_tickets WHERE owner_account_id = $1 AND ticket_id IN (${placeholders}) ORDER BY created_at DESC`,
        [ownerAccountId, ...ticketIds],
      );
      const latestPositionsRows = await query(
        "SELECT asset_key, symbol, market, currency, qty, price, cost_basis, cost_basis_in_base, tags, updated_at FROM daa_positions_v2 WHERE owner_account_id = $1 AND qty > 0 ORDER BY symbol ASC, market ASC",
        [ownerAccountId],
      );

      await query("COMMIT");

      return {
        results,
        tickets: latestTicketRows.rows.map((row) => mapTradeTicketRow(row as Record<string, unknown>)),
        positions: latestPositionsRows.rows.map((row) => {
          const item = row as Record<string, unknown>;
          const symbol = normalizeText(item.symbol).toUpperCase();
          const market = normalizeText(item.market, "US").toUpperCase();
          return {
            id: buildPositionId(symbol, market),
            assetKey: buildPositionKey(symbol, market),
            symbol,
            market,
            currency: normalizeText(item.currency, "USD").toUpperCase(),
            qty: Math.max(0, toFiniteNumber(item.qty)),
            price: Math.max(0, toFiniteNumber(item.price)),
            costBasis: item.cost_basis == null ? null : Math.max(0, toFiniteNumber(item.cost_basis)),
            costBasisInBase: item.cost_basis_in_base == null ? null : toFiniteNumber(item.cost_basis_in_base),
            tags: Array.isArray(item.tags) ? item.tags.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean) : [],
            updatedAt: toIsoString(item.updated_at),
          } satisfies DaaStorePosition;
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
      } catch (err) {
        logSwallowed("tradeTicketStore.rollback", err);
      }
      throw error;
    }
  });
}
