import type { DaaBrokerKind } from "./executionVenue";
import type { TradeTicketSide, TradeTicketSource, TradeTicketStatus, TradeTicket } from "@/src/daa/modules/trade/tradeTypes";
import { normalizeText, toFinite, toPositive } from "@/src/daa/utils/normalize";
import type {
  DaaMarketContextAttribution,
  DaaMarketContext,
  DaaMarketIndicatorScope,
  DaaMarketRegime,
} from "@/src/daa/modules/marketContext/marketContextTypes";

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
  holdingTags: string[];
  watchEnabled: boolean;
  targetWeightHint: number;
  watchTags: string[];
  notes: string | null;
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

export type RebalanceTriggerSource = "calendar" | "drift" | "manual" | "risk" | "cash_idle";

type RebalanceCycleStatus = "generated" | "reviewing" | "executing" | "completed" | "cancelled";

/**
 * 每个 proposal 上的决策上下文（由 decisionFusion 注入）。
 * 记录完整的决策链路，供 UI 展示和审计追踪。
 *
 * P0-4: 使用精确的字面量联合类型（而非 string），确保与 decisionFusion 的
 * ProposalDecisionContext 结构完全兼容，无需 as unknown as 类型转换。
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
  /** 兼容历史快照的市场环境字段，等同于最终生效环境 */
  marketRegime?: DaaMarketRegime | null;
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
  /**
   * 三层决策上下文（drift × signal × LLM）。
   * 由 decisionFusion 注入，旧数据此字段为 null。
   */
  decisionContext?: ProposalDecisionContext | null;
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
  llmDecisionSnapshot?: {
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

/**
 * P1-2: 现金分类配置（对应 classifyCash 中的 config 参数）。
 * 放入 RebalanceStrategyConfig.cash，避免 (strategy as any).cash 不安全访问。
 */
type RebalanceCashConfig = {
  /** 运营储备占比（0-1），默认 0 */
  operationalReservePct?: number;
  /** 闲置触发阈值占比（0-1），默认 0.1 */
  idleThresholdPct?: number;
  /** 闲置冷静期天数，默认 7 */
  idleCooldownDays?: number;
  /** 最近入金时间（ISO 字符串），用于冷静期计算 */
  lastDepositAt?: string | null;
};

export type RebalanceStrategyConfig = {
  calendar: {
    enabled: boolean;
    frequency: "monthly" | "quarterly" | "semi_annual" | "annual";
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
  analysisFocus: string;
  autoGenerateEnabled: boolean;
  /** P1-2: 现金分类配置，可选（未配置时使用 classifyCash 默认值）*/
  cash?: RebalanceCashConfig;
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
  analysisFocus?: string;
  manual?: boolean;
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
  selectedSymbols?: string[];
  /** 精确匹配格式：`${assetKey}::${side}`，优先于 selectedSymbols */
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
    cashMutationsAllowed?: boolean;
    readOnlyReason?: string | null;
    accountBreakdown?: WorkbenchAccountBreakdownItem[];
  };
  assetUniverse: AssetUniverseView[];
  execution: {
    logs: TradeTicket[];
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
  analysisFocus: string;
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

export function parseExecuteTradeBody(
  raw: unknown,
): { ok: true; value: ParsedExecuteTradeInput } | { ok: false; field: string; message: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, field: "body", message: "request body must be a JSON object" };
  }
  const b = raw as Record<string, unknown>;

  const side = normalizeSide(b.side);
  if (!side) return { ok: false, field: "side", message: "side must be BUY or SELL" };

  const symbol = normalizeText(b.symbol).toUpperCase();
  if (!symbol) return { ok: false, field: "symbol", message: "symbol is required" };

  const qty = toPositive(b.qty);
  if (qty <= 0) return { ok: false, field: "qty", message: "qty must be > 0" };

  const price = toPositive(b.price);
  if (price <= 0) return { ok: false, field: "price", message: "price must be > 0" };

  const fee = toFinite(b.fee, 0);
  if (fee < 0) return { ok: false, field: "fee", message: "fee must be >= 0" };

  const market = normalizeText(b.market, "US").toUpperCase();

  return {
    ok: true,
    value: {
      source: normalizeTradeSource(b.source ?? b.origin),
      side,
      assetKey: normalizeText(b.assetKey) || `${market}::${symbol}`,
      cycleId: normalizeText(b.cycleId) || undefined,
      symbol,
      market,
      currency: normalizeText(b.currency, "USD").toUpperCase(),
      qty,
      price,
      fee,
      pricingMode: normalizePricingMode(b.pricingMode),
      priceSource: normalizeText(b.priceSource) || undefined,
      priceSnapshotAt: normalizeText(b.priceSnapshotAt) || undefined,
      decisionRefId: normalizeText(b.decisionRefId) || null,
      reasonTags: pickStringArray(b.reasonTags).map((t) => t.toLowerCase()),
      reasonText: normalizeText(b.reasonText) || undefined,
      createdBy: normalizeText(b.createdBy, "admin"),
    },
  };
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

type WorkbenchAssetInsightMetricItem = {
  key: string;
  label: string;
  value: number | string;
  unit?: string;
  status?: "bullish" | "bearish" | "neutral" | "unavailable";
  description?: string;
};

type WorkbenchAssetPriceSnapshot = {
  price: number;
  currency: string;
  priceStatus: WorkbenchPriceStatus;
  priceSource: string;
  priceUpdatedAt: string | null;
  priceAgeSec: number | null;
};

type WorkbenchLlmAnalysisView = {
  status: "skipped" | "ok" | "error";
  provider: string;
  model: string;
  generatedAt: string;
  summary: string;
  opportunityNotes: string[];
  riskNotes: string[];
  latencyMs: number;
  reasonCode?: string;
  reasonMessage?: string;
  failedAt?: string;
  marketRegime?: DaaMarketRegime | null;
  marketFacts?: string[];
};

export type WorkbenchAssetInsightResponse = {
  assetKey: string;
  symbol: string;
  generatedAt: string;
  priceSnapshot: WorkbenchAssetPriceSnapshot | null;
  opportunity: {
    action: string;
    actionLabelZh: string;
    finalScorePct: number;
    confidencePct: number;
    riskScorePct: number;
    reasons: string[];
    reasonZh: string;
    riskZh: string;
    scores?: {
      human: number;
      news: number;
      technical: number;
      valuation: number;
      penalty: number;
    };
  } | null;
  technical: {
    scorePct: number;
    confidencePct: number;
    momentumRegime: string;
    reasons: string[];
    common: WorkbenchAssetInsightMetricItem[];
    specific: WorkbenchAssetInsightMetricItem[];
  } | null;
  news: {
    scorePct: number;
    confidencePct: number;
    evidenceCount: number;
    reasons: string[];
    items: Array<{
      title: string;
      link: string;
      ts: string;
      sourceCredibility: number;
      sentimentScore: number;
    }>;
    aiSummary: {
      summary: string;
      drivers: string[];
      bullish: string[];
      bearish: string[];
      uncertainties: string[];
      actions: string[];
    } | null;
  } | null;
  valuation: {
    scorePct: number;
    confidencePct: number;
    temperature: "cheap" | "neutral" | "expensive";
    reasons: string[];
    common: WorkbenchAssetInsightMetricItem[];
    specific: WorkbenchAssetInsightMetricItem[];
    relative: {
      key: string;
      label: string;
      value: number | null;
      percentile: number | null;
      trendPct: number | null;
      status: "bullish" | "bearish" | "neutral" | "unavailable";
      description?: string;
    } | null;
  } | null;
  marketContext: DaaMarketContext | null;
  marketAttribution: DaaMarketContextAttribution | null;
  llmAnalysis: WorkbenchLlmAnalysisView | null;
  riskHints: string[];
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

export type WorkbenchLlmFeedbackType = "insight" | "decision";

export type WorkbenchLlmFeedbackScore = "up" | "down";

export type WorkbenchLlmFeedbackRow = {
  id: string;
  contextId: string;
  type: WorkbenchLlmFeedbackType;
  score: WorkbenchLlmFeedbackScore;
  comment: string | null;
  createdAt: string;
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
  unrealizedLoss: number;
  unrealizedLossPct: number;
  lastPrice: number;
  fxRateToBase: number;
  lossInBase: number;
  washSaleBlocked: boolean;
  washSaleBlockedUntil: string | null;
  harvestable: boolean;
};

export type TlhScanResult = {
  candidates: TlhCandidate[];
  totalHarvestableBase: number;
  totalBlockedBase: number;
  proposals: RebalanceProposal[];
  scannedAt: string;
};
