import type { TradeTicketSideV1, TradeTicketSourceV1, TradeTicketStatusV1, TradeTicketV1 } from "@/src/daa/modules/trade/tradeTypesV1";

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
  priceAsOf: string | null;
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

export type WorkbenchOverviewAlertKindV1 = "risk" | "hf" | "schedule";

export type WorkbenchOverviewAlertV1 = {
  id: string;
  kind: WorkbenchOverviewAlertKindV1;
  level: "info" | "warn" | "success";
  text: string;
  createdAt: string;
};

export type RebalanceTriggerSourceV1 = "calendar" | "drift" | "manual";

export type RebalanceCycleStatusV1 = "generated" | "reviewing" | "executing" | "completed" | "cancelled";

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
  createdAt: string;
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
};

export type WorkbenchTradeOrderViewV1 = TradeTicketV1 & {
  cycleId: string | null;
};

export type WorkbenchTradeRecordsV1 = {
  cycles: RebalanceCycleV1[];
  orders: WorkbenchTradeOrderViewV1[];
};

export type GenerateRebalanceCycleInputV1 = {
  triggerSource?: RebalanceTriggerSourceV1;
  triggerReason?: string;
  analysisFocus?: string;
  manual?: boolean;
};

export type GenerateRebalanceCycleResultV1 = {
  cycle: RebalanceCycleV1 | null;
  created: boolean;
  skippedByCooldown: boolean;
  cooldownUntil: string | null;
  message: string;
};

export type ExecuteRebalanceCycleInputV1 = {
  cycleId: string;
  executeMode: "selected" | "all";
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
  warnings: string[];
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
};

export type WorkbenchAssetInsightResponseV1 = {
  assetKey: string;
  symbol: string;
  generatedAt: string;
  opportunity: {
    action: string;
    actionLabelZh: string;
    finalScorePct: number;
    confidencePct: number;
    riskScorePct: number;
    reasons: string[];
    reasonZh: string;
    riskZh: string;
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
  notionalInBase: number;
  baseCurrency: string;
  accountCash: number;
  holdingQty: number;
  canSubmit: boolean;
  priceSource: string;
  priceSnapshotAt: string;
  warnings: string[];
};
