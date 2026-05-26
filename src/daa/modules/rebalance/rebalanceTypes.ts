import type {
  DaaAssetBudgetOverlayKey,
  DaaAssetBudgetStance,
  DaaMarketIndicatorScope,
  DaaMarketRegime,
} from "@/src/daa/modules/marketContext/marketContextTypes";

export const REBALANCE_TRIGGER_SOURCES = [
  "scheduled_review",
  "drift",
  "manual",
  "risk",
  "cash_idle",
  "agent_trigger",
  "watchlist_entry",
] as const;

export const REBALANCE_CYCLE_STATUSES = [
  "generated",
  "reviewing",
  "executing",
  "completed",
  "cancelled",
] as const;

export type RebalanceTriggerSource = typeof REBALANCE_TRIGGER_SOURCES[number];

export type RebalanceCycleStatus = typeof REBALANCE_CYCLE_STATUSES[number];

export function normalizeRebalanceCycleStatus(value: unknown, fallback: RebalanceCycleStatus = "generated"): RebalanceCycleStatus {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "canceled") return "cancelled";
  return (REBALANCE_CYCLE_STATUSES as readonly string[]).includes(text)
    ? text as RebalanceCycleStatus
    : fallback;
}

export function normalizeRebalanceTriggerSource(value: unknown, fallback: RebalanceTriggerSource = "manual"): RebalanceTriggerSource {
  const text = String(value ?? "").trim().toLowerCase();
  return (REBALANCE_TRIGGER_SOURCES as readonly string[]).includes(text)
    ? text as RebalanceTriggerSource
    : fallback;
}

export type ProposalDecisionContext = {
  driftReason: string;
  signalAction: "open_or_add" | "watch" | "reduce_or_avoid" | null;
  signalScore: number | null;
  signalConfidence: number | null;
  signalConflict: boolean;
  llmAdjustment: "execute" | "reduce_size" | "skip" | "increase_priority" | null;
  llmConfidence: number | null;
  llmRationale: string | null;
  ruleBasedMarketRegime?: DaaMarketRegime | null;
  llmMarketRegime?: DaaMarketRegime | null;
  effectiveMarketRegime?: DaaMarketRegime | null;
  marketScope?: DaaMarketIndicatorScope | null;
  marketScopeLabel?: string | null;
  marketIndicatorFlags?: string[];
  conflictFlags: string[];
  finalQtyMultiplier: number;
  assetBudgetKey?: DaaAssetBudgetOverlayKey | null;
  assetBudgetLabel?: string | null;
  assetBudgetStance?: DaaAssetBudgetStance | null;
  assetBudgetScale?: number | null;
  macroShadowNotional?: number | null;
  macroShadowQty?: number | null;
  macroShadowDeltaNotional?: number | null;
  macroShadowReason?: string | null;
};

export type ProposalType = "drift" | "watchlist_entry" | "tax_loss_harvest";

export type RebalanceProposal = {
  assetKey: string;
  symbol: string;
  currency: string;
  fxRateToBase: number | null;
  side: "BUY" | "SELL";
  suggestedQty: number;
  suggestedNotional: number;
  price: number;
  sellAll?: boolean;
  reason: string;
  selected: boolean;
  hfContribution: string | null;
  targetWeightPct?: number | null;
  proposalType?: ProposalType;
  decisionContext?: ProposalDecisionContext | null;
  thesisIds?: string[];
};

export type PreTradeRiskRule =
  | "max_position"
  | "max_order_pct"
  | "concentration"
  | "correlation"
  | "stop_loss_breach"
  | "total_weight"
  | "cash_sufficiency";

export type PreTradeRiskCheckItem = {
  rule: PreTradeRiskRule;
  status: "pass" | "warn" | "block";
  current: number;
  limit: number;
  message: string;
};

export type PreTradeRiskCheck = {
  overallStatus: "pass" | "warn" | "block";
  items: PreTradeRiskCheckItem[];
};
