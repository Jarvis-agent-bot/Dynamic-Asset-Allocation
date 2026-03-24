/**
 * Rebalance-cycle, cycle-report, trigger-event, LLM-feedback, and decision store functions.
 */

import { randomUUID } from "node:crypto";
import { normalizeText, toFinite, toFinite as toFiniteNumber } from "@/src/daa/utils/normalize";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { normalizeCurrencyAlias } from "@/src/daa/config/currency";
import type {
  DaaMarketContext, DaaMarketIndicatorKey, DaaMarketIndicatorSnapshot, DaaMarketRegime,
} from "@/src/daa/modules/marketContext/marketContextTypes";
import type { ProposalDecisionContext } from "@/src/daa/modules/workbench/workbenchTypes";
import {
  withDaaPgClient, parseJsonb, toIsoString, toBoolean, isRecord, clampNumber, normalizeStringArray,
  type DaaTxQueryFn,
} from "./storeShared";
import type {
  DaaStoreRebalanceCycle, DaaStoreRebalanceCycleStatus, DaaStoreRebalanceTriggerSource,
  DaaStoreCreateRebalanceCycleInput, DaaStorePatchRebalanceCycleInput,
  DaaStoreCycleReport, DaaStoreTriggerEvent, DaaStoreLlmFeedback,
  DaaStorePreTradeRiskCheck, DaaStorePreTradeRiskCheckItem, DaaStoreRiskRule,
  DaaStoreRebalanceDecision, DaaStoreExecutionOrder,
} from "./storeTypes";
import { ensureDaaStoreSchemaPg } from "./storeSchema";
import { normalizeCcyCode } from "./fxStore";

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
  "executed_at",
  "executed_orders_json",
  "execution_summary_json",
  "cancelled_at",
  "cancel_reason",
  "notes",
  "market_context_json",
  "created_at",
].join(", ");

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

export function normalizeRebalanceCycleStatus(value: unknown): DaaStoreRebalanceCycleStatus {
  const text = normalizeText(value, "generated").toLowerCase();
  if (text === "reviewing") return "reviewing";
  if (text === "executing") return "executing";
  if (text === "completed") return "completed";
  if (text === "cancelled" || text === "canceled") return "cancelled";
  return "generated";
}

export function normalizeRebalanceTriggerSource(value: unknown): DaaStoreRebalanceTriggerSource {
  const text = normalizeText(value, "manual").toLowerCase();
  if (text === "calendar") return "calendar";
  if (text === "drift") return "drift";
  if (text === "risk") return "risk";
  if (text === "cash_idle") return "cash_idle";
  return "manual";
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

export function normalizeMarketIndicatorKey(value: unknown): DaaMarketIndicatorKey | null {
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

export function normalizeMarketRegimeStore(value: unknown): DaaMarketRegime | "neutral" {
  const text = normalizeText(value, "neutral").toLowerCase();
  if (text === "risk_on") return "risk_on";
  if (text === "risk_off") return "risk_off";
  if (text === "transitional") return "transitional";
  return "neutral";
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
    marketRegime: normalizeMarketRegimeStore(value.marketRegime || value.effectiveMarketRegime) === "neutral"
      ? null
      : (normalizeMarketRegimeStore(value.marketRegime || value.effectiveMarketRegime) as DaaMarketRegime),
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

function normalizeMarketIndicatorScopeStore(value: unknown): DaaMarketIndicatorSnapshot["scope"] {
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

export function normalizeMarketContextJson(value: unknown): DaaMarketContext | null {
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

export function normalizePreTradeRiskCheck(value: unknown): DaaStorePreTradeRiskCheck {
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
      decisionContext: normalizeProposalDecisionContext(row.decisionContext),
    });
  }
  return out;
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
    executedAt: row.executed_at == null ? null : toIsoString(row.executed_at),
    executedOrders,
    executionSummary,
    cancelledAt: row.cancelled_at == null ? null : toIsoString(row.cancelled_at),
    cancelReason: row.cancel_reason == null ? null : normalizeText(row.cancel_reason) || null,
    notes: row.notes == null ? null : normalizeText(row.notes) || null,
    marketContext: row.market_context_json == null ? null : normalizeMarketContextJson(parseJsonb<Record<string, unknown>>(row.market_context_json, {})),
    llmDecisionSnapshot: (() => {
      const mcRaw = parseJsonb<Record<string, unknown>>(row.market_context_json, {});
      const snap = mcRaw?.__llmDecisionSnapshot;
      return snap && typeof snap === "object" && !Array.isArray(snap) ? (snap as Record<string, unknown>) : null;
    })(),
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

function mapLlmFeedbackRow(row: Record<string, unknown>): DaaStoreLlmFeedback {
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

const DECISION_STATUSES_ = ["pending", "partial", "executed", "canceled", "skipped"] as const;


function normalizeDecisionStatus(
  value: unknown,
  fallback: DaaStoreRebalanceDecision["status"],
): DaaStoreRebalanceDecision["status"] {
  const normalized = normalizeText(value, fallback).toLowerCase();
  return (DECISION_STATUSES_ as readonly string[]).includes(normalized)
    ? (normalized as DaaStoreRebalanceDecision["status"])
    : fallback;
}

function mapDecisionRow(row: Record<string, unknown>): DaaStoreRebalanceDecision {
  return {
    id: normalizeText(row.id),
    shouldRebalance: Boolean(row.should_rebalance),
    triggerSource: normalizeText(row.trigger_source, "manual") as DaaStoreRebalanceDecision["triggerSource"],
    status: normalizeDecisionStatus(row.status, "pending"),
    requestJson: parseJsonb<Record<string, unknown>>(row.request_json, {}),
    responseJson: parseJsonb<Record<string, unknown>>(row.response_json, {}),
    createdAt: toIsoString(row.created_at),
  };
}

export async function createDaaRebalanceDecision(input: {
  requestJson: Record<string, unknown>;
  responseJson: Record<string, unknown>;
  shouldRebalance: boolean;
  triggerSource?: DaaStoreRebalanceDecision["triggerSource"];
}): Promise<{ decision: DaaStoreRebalanceDecision; orders: DaaStoreExecutionOrder[] }> {
  await ensureDaaStoreSchemaPg();
  return withDaaPgClient(async ({ query }) => {
    const decisionId = randomUUID();
    const triggerSource = normalizeText(input.triggerSource, "manual") as DaaStoreRebalanceDecision["triggerSource"];

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
        throw new Error("responseJson must be UnifiedDecisionResult");
      }

      await query("COMMIT");
    } catch (error) {
      try {
        await query("ROLLBACK");
      } catch (err) {
        logSwallowed("rebalanceCycleStore.rollback", err);
      }
      throw error;
    }

    const dRes = await query(
      "SELECT id, request_json, response_json, should_rebalance, trigger_source, status, created_at FROM daa_rebalance_decisions WHERE id = $1 LIMIT 1",
      [decisionId],
    );

    return {
      decision: mapDecisionRow(dRes.rows[0] as Record<string, unknown>),
      orders: [],
    };
  });
}

export async function listDaaRebalanceDecisions(opts?: {
  limit?: number;
  status?: DaaStoreRebalanceDecision["status"];
}): Promise<Array<DaaStoreRebalanceDecision & { orders: DaaStoreExecutionOrder[] }>> {
  await ensureDaaStoreSchemaPg();
  const limit = Math.max(1, Math.min(500, Math.trunc(toFiniteNumber(opts?.limit, 50))));
  const status = normalizeText(opts?.status);

  return withDaaPgClient(async ({ query }) => {
    const dRes = status
      ? await query(
        "SELECT id, request_json, response_json, should_rebalance, trigger_source, status, created_at FROM daa_rebalance_decisions WHERE status = $1 ORDER BY created_at DESC LIMIT $2",
        [status, limit],
      )
      : await query(
        "SELECT id, request_json, response_json, should_rebalance, trigger_source, status, created_at FROM daa_rebalance_decisions ORDER BY created_at DESC LIMIT $1",
        [limit],
      );

    const decisions = dRes.rows.map((row) => mapDecisionRow(row as Record<string, unknown>));
    if (!decisions.length) return [];

    return decisions.map((decision) => ({
      ...decision,
      orders: [],
    }));
  });
}

