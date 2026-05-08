import type { DaaBrokerKind } from "./executionVenue";
import type { TradeTicketSide, TradeTicketSource, TradeTicketStatus, TradeTicket } from "@/src/daa/modules/trade/tradeTypes";
import { normalizeText, toFinite, toPositive } from "@/src/daa/utils/normalize";
import type {
  DaaMarketContextAttribution,
  DaaMarketContext,
  DaaMarketIndicatorScope,
  DaaMarketRegime,
} from "@/src/daa/modules/marketContext/marketContextTypes";
import type { DaaStoreRebalanceCycleStatus } from "@/src/daa/store/storeTypes";

export type WorkbenchPriceStatus = "fresh" | "stale" | "missing" | "unsupported";

type HfSignalLevel = "bullish" | "neutral" | "bearish" | "none";

type HfSignalFundDetail = {
  fundCode: string;
  fundName: string;
  weightPct: number;
  changePct: number;
};

export type HfSignalSummary = {
  level: HfSignalLevel;
  icon: "🟢" | "🟡" | "🔴" | "⚪";
  label: string;
  aggregatedScorePct: number;
  convictionPct: number;
  thesisDriftPct: number;
  fundCount: number;
  trend: "adding" | "trimming" | "neutral" | "none";
  funds: HfSignalFundDetail[];
};

export type AssetUniverseView = {
  assetKey: string;
  symbol: string;
  market: string;
  currency: string;
  assetClass: string;
  region: string;
  exchange: string;
  instrumentType: string;
  marketGroup: string;
  yfinanceSymbol: string;
  holdingQty: number;
  holdingPrice: number;
  costBasis: number | null;
  costBasisInBase: number | null;
  unrealizedPnlBase: number | null;
  unrealizedPnlPct: number | null;
  holdingTags: string[];
  watchEnabled: boolean;
  autoEntryEnabled: boolean;
  entryTargetWeightPct: number | null;
  entryCooldownDays: number;
  lastEntryTriggeredAt: string | null;
  targetWeightHint: number;
  watchTags: string[];
  notes: string | null;
  /** 价格上穿报警阈值（null 表示未设置） */
  priceAlertAbove: number | null;
  /** 价格下穿报警阈值（null 表示未设置） */
  priceAlertBelow: number | null;
  lastPrice: number;
  priceUpdatedAt: string | null;
  priceStatus: WorkbenchPriceStatus;
  priceSource: string;
  priceAgeSec: number | null;
  valuationBase: number | null;
  fxRateToBase: number | null;
  fxMissing: boolean;
  actualWeightPct: number;
  targetWeightPct: number;
  gapPct: number | null;
  hfSignal: HfSignalSummary | null;
};

export type RebalanceTriggerSource = "calendar" | "drift" | "manual" | "risk" | "cash_idle" | "agent_trigger" | "watchlist_entry";

type RebalanceCycleStatus = DaaStoreRebalanceCycleStatus;

/**
 * 每个 proposal 上的决策上下文（由 agentRebalanceAdapter 注入）。
 * 记录完整的决策链路，供 UI 展示和审计追踪。
 */
export type ProposalDecisionContext = {
  /** 原始 drift 触发原因 */
  driftReason: string;
  /** 信号融合的行动建议 */
  signalAction: "open_or_add" | "watch" | "reduce_or_avoid" | null;
  /** 信号综合评分（0-100）*/
  signalScore: number | null;
  /** 信号置信度（0-100）*/
  signalConfidence: number | null;
  /** 是否存在信号与漂移方向冲突 */
  signalConflict: boolean;
  /** LLM 建议的调整指令 */
  llmAdjustment: "execute" | "reduce_size" | "skip" | "increase_priority" | null;
  /** LLM 置信度（0-100）*/
  llmConfidence: number | null;
  /** LLM 调整原因 */
  llmRationale: string | null;
  /** 规则层市场环境 */
  ruleBasedMarketRegime?: DaaMarketRegime | null;
  /** AI 市场环境 */
  llmMarketRegime?: DaaMarketRegime | null;
  /** 最终生效市场环境 */
  effectiveMarketRegime?: DaaMarketRegime | null;
  /** 对应的市场维度 */
  marketScope?: DaaMarketIndicatorScope | null;
  /** 市场维度中文标签 */
  marketScopeLabel?: string | null;
  /** 市场指标标记 */
  marketIndicatorFlags?: string[];
  /** 所有冲突/降权标记 */
  conflictFlags: string[];
  /** 最终建议量倍数（0-1）*/
  finalQtyMultiplier: number;
};

/** 提案来源类型：区分漂移纠偏、观察列表建仓、税务收割等 */
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
  reason: string;
  selected: boolean;
  hfContribution: string | null;
  /** 此提案希望成交后保留的目标权重百分比，例如 5 表示 5%。 */
  targetWeightPct?: number | null;
  /** 提案来源类型（默认 "drift"，观察列表信号建仓为 "watchlist_entry"） */
  proposalType?: ProposalType;
  /**
   * 三层决策上下文（drift × signal × LLM）。
   * 由 agentRebalanceAdapter 注入，用于审计每条建议的生成路径。
   */
  decisionContext?: ProposalDecisionContext | null;
  /** 影响此提案的 thesis ID 列表（由 agentRebalanceAdapter 注入） */
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

export type RebalanceCycle = {
  cycleId: string;
  status: RebalanceCycleStatus;
  triggerSource: RebalanceTriggerSource;
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
  proposals: RebalanceProposal[];
  riskCheck: PreTradeRiskCheck;
  executedAt: string | null;
  executedOrders: string[];
  executionSummary: {
    ordersExecuted: number;
    ordersSubmitted?: number;
    ordersFailed: number;
    totalNotional: number;
    newMaxDriftPct: number;
  } | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  notes: string | null;
  marketContext?: DaaMarketContext | null;
  agentDecisionSnapshot?: {
    status: string;
    marketRegime: string;
    overallConfidence: number;
    summary: string;
    keyRisks: string[];
    keyOpportunities: string[];
    cashAdvice: string;
    cashRationale: string;
    provider: string;
    model: string;
    latencyMs: number;
    generatedAt: string;
    reasoning?: string;
  } | null;
  createdAt: string;
};

export type RebalanceStrategyConfig = {
  calendar: {
    enabled: boolean;
    frequency: "every_3_days" | "weekly" | "monthly" | "quarterly" | "semi_annual" | "annual";
    dayOfMonth: number;
  };
  drift: {
    enabled: boolean;
    thresholdPct: number;
    checkFrequency: "daily" | "weekly";
  };
  cooldownHours: number;
  analysisTimeUtc: string;
  timezone: string;
  autoGenerateEnabled: boolean;
};

type WorkbenchTradeOrderView = TradeTicket & {
  cycleId: string | null;
};

export type WorkbenchTradeRecords = {
  cycles: RebalanceCycle[];
  orders: WorkbenchTradeOrderView[];
};

export type WorkbenchRebalanceCycleReport = {
  cycleId: string;
  triggerSource: RebalanceTriggerSource;
  status: RebalanceCycleStatus;
  createdAt: string;
  reportCreatedAt: string;
  executionSummary: {
    ordersExecuted: number;
    ordersSubmitted?: number;
    ordersFailed: number;
    totalNotional: number;
    newMaxDriftPct: number;
  } | null;
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

export type GenerateRebalanceCycleInput = {
  triggerSource?: RebalanceTriggerSource;
  triggerReason?: string;
  manual?: boolean;
  /**
   * 临时目标权重覆盖（0-1），用于 Agent 全权调仓。
   * 只影响本次周期生成，不直接写入系统配置。
   */
  targetWeightOverrides?: Record<string, number>;
};

/**
 * 组合"健康"时（无需调仓）返回的洞察快照。
 * 让用户即使不需要调仓，也能看到信号摘要和 AI 观点。
 */
export type PortfolioHealthyInsight = {
  maxDriftPct: number;
  topOpportunities: Array<{
    symbol: string;
    action: string;
    finalScorePct: number;
    confidencePct: number;
  }>;
  llmSummary: string | null;
  cashIdleWarning: boolean;
  cashIdlePct: number;
  generatedAt: string;
};

export type GenerateRebalanceCycleResult = {
  cycle: RebalanceCycle | null;
  created: boolean;
  skippedByCooldown: boolean;
  cooldownUntil: string | null;
  message: string;
  /**
   * 组合状态（P1-9: 必填字段，所有代码路径均已赋值）：
   * - "needs_rebalance"：已创建再平衡周期
   * - "healthy"：组合接近目标，无需调仓（仅手动触发时返回此状态）
   * - "skipped"：被守卫条件跳过（冷静期 / 窗口未到等）
   */
  portfolioStatus: "needs_rebalance" | "healthy" | "skipped";
  /**
   * 组合健康时返回的洞察快照（portfolioStatus="healthy" 时存在）
   */
  healthyInsight?: PortfolioHealthyInsight | null;
  /**
   * 融合决策后的市场环境（portfolioStatus="needs_rebalance" 时存在）
   */
  marketRegime?: DaaMarketRegime | null;
  /** LLM 一句话总结 */
  llmSummary?: string | null;
};

export type ExecuteRebalanceCycleInput = {
  cycleId: string;
  executeMode: "selected" | "all";
};

export type ExecuteRebalanceSummary = {
  cycleId: string;
  executeMode: "selected" | "all";
  orderCount: number;
  buyNotional: number;
  sellNotional: number;
  estimatedFees: number;
  netCashImpact: number;
  topWeightChanges: Array<{
    symbol: string;
    currentWeightPct: number;
    projectedWeightPct: number;
    changePct: number;
  }>;
  riskWarnings: string[];
  riskOverallStatus: "pass" | "warn" | "block";
};

export type ExecuteRebalanceCycleResult = {
  cycle: RebalanceCycle;
  logs: WorkbenchTradeOrderView[];
};

export type UpdateRebalanceCycleInput = {
  status?: "reviewing";
  notes?: string;
  cancel?: {
    reason?: string;
  };
  /** 精确匹配格式：`${assetKey}::${side}`，BUY/SELL 互不干扰 */
  selectedAssetSideKeys?: string[];
};

export type WorkbenchMarketDataHealth = {
  status: "ok" | "degraded" | "down";
  freshCount: number;
  staleCount: number;
  missingCount: number;
  recentJobFailureRatePct: number;
  message: string;
};

export type WorkbenchAccountBreakdownItem = {
  venueKind: DaaBrokerKind;
  accountId: string | null;
  label: string;
  baseCurrency: string;
  cash: number;
  investableCash: number;
  frozenCash: number;
  totalEquity: number | null;
  cashMutationsAllowed: boolean;
  readOnlyReason: string | null;
};

export type WorkbenchBootstrap = {
  baseCurrency: string;
  account: {
    cash: number;
    investableCash: number;
    frozenCash: number;
    totalEquity: number | null;
    valuation?: {
      holdingsValue: number;
      derivedTotalEquity: number;
      totalEquity: number;
      equitySource: "derived_mark_to_market" | "account_state_override";
      fxMissingAssetKeys: string[];
    };
    cashMutationsAllowed?: boolean;
    readOnlyReason?: string | null;
    accountBreakdown?: WorkbenchAccountBreakdownItem[];
  };
  assetUniverse: AssetUniverseView[];
  execution: {
    logs: TradeTicket[];
    feeRateBps?: number;
    slippageBps?: number;
    minNotional?: number;
  };
  rebalance: WorkbenchRebalanceConfig;
  rebalanceStrategy: RebalanceStrategyConfig;
  latestCycle: RebalanceCycle | null;
  marketContext: DaaMarketContext | null;
  warnings: string[];
  marketDataHealth?: WorkbenchMarketDataHealth;
};

type WorkbenchRebalanceMode = "manual" | "auto";

type WorkbenchRebalanceConfig = {
  mode: WorkbenchRebalanceMode;
  autoAnalysisEnabled: boolean;
  analysisTimeUtc: string;
  timezone: string;
};

export type WorkbenchExecutionExecuteInput = {
  source?: TradeTicketSource;
  origin?: "manual" | "recommendation";
  side: TradeTicketSide;
  assetKey: string;
  cycleId?: string | null;
  symbol: string;
  market: string;
  currency: string;
  qty: number;
  price: number;
  notionalInBase?: number | null;
  fee?: number;
  pricingMode?: "manual" | "market";
  priceSource?: string;
  priceSnapshotAt?: string;
  decisionRefId?: string | null;
  reasonTags?: string[];
  reasonText?: string;
};

// ---------------------------------------------------------------------------
// Runtime parser — validates unknown request body into typed input
// ---------------------------------------------------------------------------

type ParsedExecuteTradeInput = {
  source: "manual" | "decision";
  side: TradeTicketSide;
  assetKey: string;
  cycleId: string | undefined;
  symbol: string;
  market: string;
  currency: string;
  qty: number;
  price: number;
  fee: number;
  pricingMode: "manual" | "market";
  priceSource: string | undefined;
  priceSnapshotAt: string | undefined;
  decisionRefId: string | null;
  reasonTags: string[];
  reasonText: string | undefined;
  createdBy: string;
};

function normalizeTradeSource(v: unknown): "manual" | "decision" {
  const s = normalizeText(v).toLowerCase();
  if (s === "decision" || s === "recommendation") return "decision";
  return "manual";
}

function normalizePricingMode(v: unknown): "manual" | "market" {
  return normalizeText(v).toLowerCase() === "market" ? "market" : "manual";
}

function normalizeSide(v: unknown): TradeTicketSide | null {
  const s = normalizeText(v).toUpperCase();
  if (s === "BUY" || s === "SELL") return s;
  return null;
}

function pickStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return [];
}

export type WorkbenchExecutionExecuteResult = {
  item: TradeTicket;
  result: {
    ticketId: string;
    status: TradeTicketStatus;
    rejectCode?: string;
    rejectMessage?: string;
  };
  summary: {
    executed: number;
    rejected: number;
    total: number;
  };
  logs: TradeTicket[];
  broker?: {
    kind: DaaBrokerKind;
    accountId: string;
    accepted: boolean;
    remoteStatus: string;
    remoteOrderId: string;
    messages: string[];
    warnings: string[];
  } | null;
};

export type WorkbenchSearchAssetResult = {
  symbol: string;
  market: string;
  currency: string;
  price: number;
  priceStatus?: "fresh" | "stale" | "missing";
  priceUpdatedAt?: string | null;
  priceSource?: string;
  priceAgeSec?: number | null;
  name: string;
  shortName: string;
  longName: string;
  exchange: string;
  exchangeDisp: string;
  quoteType: string;
  typeDisp: string;
  assetClass: string;
  region: string;
  instrumentType: string;
  marketGroup: string;
  yfinanceSymbol: string;
};

export type WorkbenchFeaturedAssetItem = WorkbenchSearchAssetResult & {
  thesisTagZh: string;
  themeKey: string;
  themeLabelZh: string;
};

export type WorkbenchFeaturedAssetGroup = {
  market: string;
  marketLabelZh: string;
  items: WorkbenchFeaturedAssetItem[];
};

export type WorkbenchFeaturedAssetsResult = {
  groups: WorkbenchFeaturedAssetGroup[];
  generatedAt: string;
};

export type WorkbenchMarketOrderPreviewResult = {
  assetKey: string;
  symbol: string;
  market: string;
  currency: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  grossNotional: number;
  feeRateBps?: number;
  fee: number;
  feeInBase: number | null;
  fxRateToBase: number | null;
  notionalInBase: number | null;
  baseCurrency: string;
  accountCash: number;
  holdingQty: number;
  canSubmit: boolean;
  riskCheck: PreTradeRiskCheck;
  priceSource: string;
  priceSnapshotAt: string | null;
  warnings: string[];
};

// ── Tax-Loss Harvesting Types ──────────────────────────────────────────

export type TlhCandidate = {
  assetKey: string;
  symbol: string;
  market: string;
  currency: string;
  holdingQty: number;
  costBasis: number;
  currentValue: number;
  unrealizedLoss: number;        // negative number = loss
  unrealizedLossPct: number;     // as percentage of cost basis
  lastPrice: number;
  fxRateToBase: number;
  lossInBase: number;            // loss converted to base currency
  washSaleBlocked: boolean;      // true if within 30-day wash sale window
  washSaleBlockedUntil: string | null;
  harvestable: boolean;          // true if loss is meaningful and not blocked
};

export type TlhScanResult = {
  candidates: TlhCandidate[];
  totalHarvestableBase: number;
  totalBlockedBase: number;
  proposals: RebalanceProposal[];
  scannedAt: string;
};
