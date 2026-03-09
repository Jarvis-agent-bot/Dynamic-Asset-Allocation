import type { TradeTicketSideV1, TradeTicketSourceV1, TradeTicketStatusV1, TradeTicketV1 } from "@/src/daa/modules/trade/tradeTypesV1";
import type {
  DaaMarketContextAttributionV1,
  DaaMarketContextV1,
  DaaMarketIndicatorScopeV1,
  DaaMarketRegimeV1,
} from "@/src/daa/modules/marketContext/marketContextTypesV1";

export type WorkbenchPriceStatusV1 = "fresh" | "stale" | "missing" | "unsupported";

export type HfSignalLevelV1 = "bullish" | "neutral" | "bearish" | "none";

export type HfSignalFundDetailV1 = {
  fundCode: string;
  fundName: string;
  weightPct: number;
  changePct: number;
};

export type HfSignalSummaryV1 = {
  level: HfSignalLevelV1;
  icon: "🟢" | "🟡" | "🔴" | "⚪";
  label: string;
  aggregatedScorePct: number;
  convictionPct: number;
  thesisDriftPct: number;
  fundCount: number;
  trend: "adding" | "trimming" | "neutral" | "none";
  funds: HfSignalFundDetailV1[];
};

export type AssetUniverseViewV1 = {
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
  priceStatus: WorkbenchPriceStatusV1;
  priceSource: string;
  priceAgeSec: number | null;
  valuationBase: number | null;
  fxRateToBase: number | null;
  fxMissing: boolean;
  actualWeightPct: number;
  targetWeightPct: number;
  gapPct: number | null;
  hfSignal: HfSignalSummaryV1 | null;
};

export type WorkbenchOverviewAlertKindV1 = "risk" | "hf" | "schedule" | "market";

export type WorkbenchOverviewAlertV1 = {
  id: string;
  kind: WorkbenchOverviewAlertKindV1;
  level: "info" | "warn" | "success";
  text: string;
  createdAt: string;
};

export type RebalanceTriggerSourceV1 = "calendar" | "drift" | "manual" | "risk" | "cash_idle";

export type RebalanceCycleStatusV1 = "generated" | "reviewing" | "executing" | "completed" | "cancelled";

/**
 * 每个 proposal 上的决策上下文（由 decisionFusionV2 注入）。
 * 记录完整的决策链路，供 UI 展示和审计追踪。
 *
 * P0-4: 使用精确的字面量联合类型（而非 string），确保与 decisionFusionV2 的
 * ProposalDecisionContextV2 结构完全兼容，无需 as unknown as 类型转换。
 */
export type ProposalDecisionContextV1 = {
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
  /** 兼容旧版展示的市场环境字段，等同于最终生效环境 */
  marketRegime?: DaaMarketRegimeV1 | null;
  /** 规则层市场环境 */
  ruleBasedMarketRegime?: DaaMarketRegimeV1 | null;
  /** AI 市场环境 */
  llmMarketRegime?: DaaMarketRegimeV1 | null;
  /** 最终生效市场环境 */
  effectiveMarketRegime?: DaaMarketRegimeV1 | null;
  /** 对应的市场维度 */
  marketScope?: DaaMarketIndicatorScopeV1 | null;
  /** 市场维度中文标签 */
  marketScopeLabel?: string | null;
  /** 市场指标标记 */
  marketIndicatorFlags?: string[];
  /** 所有冲突/降权标记 */
  conflictFlags: string[];
  /** 最终建议量倍数（0-1）*/
  finalQtyMultiplier: number;
};

export type RebalanceProposalV1 = {
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
   * 由 decisionFusionV2 注入，旧数据此字段为 null。
   */
  decisionContext?: ProposalDecisionContextV1 | null;
};

export type PreTradeRiskRuleV1 =
  | "max_position"
  | "max_order_pct"
  | "concentration"
  | "stop_loss_breach"
  | "total_weight";

export type PreTradeRiskCheckItemV1 = {
  rule: PreTradeRiskRuleV1;
  status: "pass" | "warn" | "block";
  current: number;
  limit: number;
  message: string;
};

export type PreTradeRiskCheckV1 = {
  overallStatus: "pass" | "warn" | "block";
  items: PreTradeRiskCheckItemV1[];
};

export type RebalanceCycleV1 = {
  cycleId: string;
  status: RebalanceCycleStatusV1;
  triggerSource: RebalanceTriggerSourceV1;
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
  proposals: RebalanceProposalV1[];
  riskCheck: PreTradeRiskCheckV1;
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

/**
 * P1-2: 现金分类配置（对应 classifyCashV2 中的 config 参数）。
 * 放入 RebalanceStrategyConfigV1.cash，避免 (strategy as any).cash 不安全访问。
 */
export type RebalanceCashConfigV1 = {
  /** 运营储备占比（0-1），默认 0 */
  operationalReservePct?: number;
  /** 闲置触发阈值占比（0-1），默认 0.1 */
  idleThresholdPct?: number;
  /** 闲置冷静期天数，默认 7 */
  idleCooldownDays?: number;
  /** 最近入金时间（ISO 字符串），用于冷静期计算 */
  lastDepositAt?: string | null;
};

export type RebalanceStrategyConfigV1 = {
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
  notifyEmailTo: string;
  /** P1-2: 现金分类配置，可选（未配置时使用 classifyCashV2 默认值）*/
  cash?: RebalanceCashConfigV1;
};

export type WorkbenchTradeOrderViewV1 = TradeTicketV1 & {
  cycleId: string | null;
};

export type WorkbenchTradeRecordsV1 = {
  cycles: RebalanceCycleV1[];
  orders: WorkbenchTradeOrderViewV1[];
};

export type WorkbenchRebalanceCycleReportV1 = {
  cycleId: string;
  triggerSource: RebalanceTriggerSourceV1;
  status: RebalanceCycleStatusV1;
  createdAt: string;
  reportCreatedAt: string;
  executionSummary: {
    ordersExecuted: number;
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

export type GenerateRebalanceCycleInputV1 = {
  triggerSource?: RebalanceTriggerSourceV1;
  triggerReason?: string;
  analysisFocus?: string;
  manual?: boolean;
};

/**
 * 组合"健康"时（无需调仓）返回的洞察快照。
 * 让用户即使不需要调仓，也能看到信号摘要和 AI 观点。
 */
export type PortfolioHealthyInsightV1 = {
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

export type GenerateRebalanceCycleResultV1 = {
  cycle: RebalanceCycleV1 | null;
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
  healthyInsight?: PortfolioHealthyInsightV1 | null;
  /**
   * 融合决策后的市场环境（portfolioStatus="needs_rebalance" 时存在）
   */
  marketRegime?: DaaMarketRegimeV1 | null;
  /** LLM 一句话总结 */
  llmSummary?: string | null;
};

export type ExecuteRebalanceCycleInputV1 = {
  cycleId: string;
  executeMode: "selected" | "all";
};

export type ExecuteRebalanceSummaryV1 = {
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

export type ExecuteRebalanceCycleResultV1 = {
  cycle: RebalanceCycleV1;
  logs: WorkbenchTradeOrderViewV1[];
};

export type UpdateRebalanceCycleInputV1 = {
  status?: "reviewing";
  notes?: string;
  cancel?: {
    reason?: string;
  };
  selectedSymbols?: string[];
};

export type WorkbenchMarketDataHealthV1 = {
  status: "ok" | "degraded" | "down";
  freshCount: number;
  staleCount: number;
  missingCount: number;
  recentJobFailureRatePct: number;
  message: string;
};

export type WorkbenchBootstrapV1 = {
  baseCurrency: string;
  account: {
    cash: number;
    investableCash: number;
    frozenCash: number;
    totalEquity: number | null;
  };
  assetUniverse: AssetUniverseViewV1[];
  execution: {
    logs: TradeTicketV1[];
  };
  rebalance: WorkbenchRebalanceConfigV1;
  rebalanceStrategy: RebalanceStrategyConfigV1;
  overviewAlerts: WorkbenchOverviewAlertV1[];
  latestCycle: RebalanceCycleV1 | null;
  marketContext: DaaMarketContextV1 | null;
  warnings: string[];
  marketDataHealth?: WorkbenchMarketDataHealthV1;
};

export type WorkbenchRebalanceModeV1 = "manual" | "auto";

export type WorkbenchRebalanceConfigV1 = {
  mode: WorkbenchRebalanceModeV1;
  autoAnalysisEnabled: boolean;
  analysisTimeUtc: string;
  timezone: string;
  emailTo: string;
  analysisFocus: string;
};

export type WorkbenchRecommendationV1 = {
  id: string;
  assetKey: string;
  symbol: string;
  market: string;
  currency: string;
  side: TradeTicketSideV1;
  suggestedNotional: number;
  suggestedQty: number;
  price: number;
  reasons: string[];
  decisionRefId: string | null;
  action: string;
  actionLabelZh: string;
  reasonZh: string;
  riskZh: string;
};

export type WorkbenchRecommendationsResultV1 = {
  decisionId: string | null;
  decisionStatus: string | null;
  summary: {
    shouldRebalance: boolean;
    executableOrderCount: number;
    blockedOrderCount: number;
    totalEquity: number;
    baseCurrency: string;
  };
  recommendations: WorkbenchRecommendationV1[];
  blockedReasons: string[];
  warnings: string[];
  insightDigest: {
    topOpportunities: Array<{
      symbol: string;
      action: string;
      actionLabelZh: string;
      finalScorePct: number;
      confidencePct: number;
      reasons: string[];
      reasonZh: string;
    }>;
  };
  riskDigest: {
    warnings: string[];
    blockedReasons: string[];
  };
  marketContext: DaaMarketContextV1 | null;
};

export type WorkbenchExecutionExecuteInputV1 = {
  source?: TradeTicketSourceV1;
  origin?: "manual" | "recommendation";
  side: TradeTicketSideV1;
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

export type WorkbenchExecutionExecuteResultV1 = {
  item: TradeTicketV1;
  result: {
    ticketId: string;
    status: TradeTicketStatusV1;
    rejectCode?: string;
    rejectMessage?: string;
  };
  summary: {
    executed: number;
    rejected: number;
    total: number;
  };
  logs: TradeTicketV1[];
};

export type WorkbenchSearchAssetResultV1 = {
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

export type WorkbenchFeaturedAssetItemV1 = WorkbenchSearchAssetResultV1 & {
  thesisTagZh: string;
};

export type WorkbenchFeaturedAssetGroupV1 = {
  market: string;
  marketLabelZh: string;
  items: WorkbenchFeaturedAssetItemV1[];
};

export type WorkbenchFeaturedAssetsResultV1 = {
  groups: WorkbenchFeaturedAssetGroupV1[];
  generatedAt: string;
};

export type WorkbenchAssetInsightMetricItemV1 = {
  key: string;
  label: string;
  value: number | string;
  unit?: string;
  status?: "bullish" | "bearish" | "neutral" | "unavailable";
  description?: string;
};

export type WorkbenchAssetPriceSnapshotV1 = {
  price: number;
  currency: string;
  priceStatus: WorkbenchPriceStatusV1;
  priceSource: string;
  priceUpdatedAt: string | null;
  priceAgeSec: number | null;
};

export type WorkbenchLlmAnalysisViewV1 = {
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
  marketRegime?: DaaMarketRegimeV1 | null;
  marketFacts?: string[];
};

export type WorkbenchAssetInsightResponseV1 = {
  assetKey: string;
  symbol: string;
  generatedAt: string;
  priceSnapshot: WorkbenchAssetPriceSnapshotV1 | null;
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
    common: WorkbenchAssetInsightMetricItemV1[];
    specific: WorkbenchAssetInsightMetricItemV1[];
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
    common: WorkbenchAssetInsightMetricItemV1[];
    specific: WorkbenchAssetInsightMetricItemV1[];
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
  marketContext: DaaMarketContextV1 | null;
  marketAttribution: DaaMarketContextAttributionV1 | null;
  llmAnalysis: WorkbenchLlmAnalysisViewV1 | null;
  riskHints: string[];
};

export type WorkbenchMarketOrderPreviewResultV1 = {
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
  riskCheck: PreTradeRiskCheckV1;
  priceSource: string;
  priceSnapshotAt: string | null;
  warnings: string[];
};

export type WorkbenchLlmFeedbackTypeV1 = "insight" | "decision";

export type WorkbenchLlmFeedbackScoreV1 = "up" | "down";

export type WorkbenchLlmFeedbackRowV1 = {
  id: string;
  contextId: string;
  type: WorkbenchLlmFeedbackTypeV1;
  score: WorkbenchLlmFeedbackScoreV1;
  comment: string | null;
  createdAt: string;
};
