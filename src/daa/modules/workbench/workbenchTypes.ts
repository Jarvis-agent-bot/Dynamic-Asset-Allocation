import type { DaaBrokerKind } from "./executionVenue";
import type { RebalanceExecuteMode } from "./rebalanceExecuteMode";
import type { TradeTicketSide, TradeTicketSource, TradeTicketStatus, TradeTicket } from "@/src/daa/modules/trade/tradeTypes";
import type {
  DaaMarketContext,
  DaaMarketRegime,
} from "@/src/daa/modules/marketContext/marketContextTypes";
import type { DaaPolicyConfig, PolicyDecisionSnapshot } from "@/src/daa/modules/policy-engine/policyTypes";
import type {
  PreTradeRiskCheck,
  RebalanceCycleStatus,
  RebalanceProposal,
  RebalanceTriggerSource,
} from "@/src/daa/modules/rebalance/rebalanceTypes";
import type {
  WorkbenchFeaturedAssetClass,
  WorkbenchFeaturedMarket,
  WorkbenchFeaturedRole,
  WorkbenchFeaturedTheme,
} from "./featuredAssetsCatalog";

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
  name: string | null;
  displayNameZh: string | null;
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
  executionStartedAt?: string | null;
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
  policyDecisionId?: string | null;
  intentIds?: string[];
  signalIds?: string[];
  policySnapshot?: PolicyDecisionSnapshot | null;
  proposalPlanId?: string | null;
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
   * Agent 目标权重覆盖（0-1），用于全权调仓。
   * 只影响本次周期生成，不直接写入系统配置。
   */
  targetWeightOverrides?: Record<string, number>;
  /**
   * Agent 生成目标前的目标权重基线（0-1）。
   * 用于交易稳定器判断目标变化幅度，避免目标池先写入后丢失旧基线。
   */
  targetWeightBaseline?: Record<string, number>;
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
  executeMode: RebalanceExecuteMode;
};

export type ExecuteRebalanceSummary = {
  cycleId: string;
  executeMode: RebalanceExecuteMode;
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

type WorkbenchMarketDataHealth = {
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
  policy: DaaPolicyConfig;
  latestCycle: RebalanceCycle | null;
  marketContext: DaaMarketContext | null;
  warnings: string[];
  marketDataHealth?: WorkbenchMarketDataHealth;
};

type WorkbenchRebalanceMode = "manual" | "auto";

type WorkbenchRebalanceConfig = {
  mode: WorkbenchRebalanceMode;
  autoAnalysisEnabled: boolean;
  scheduledTimeUtc: string;
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
  displayNameZh: string | null;
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

export type WorkbenchFeaturedAssetItem = Omit<WorkbenchSearchAssetResult, "assetClass" | "market"> & {
  market: WorkbenchFeaturedMarket;
  assetClass: WorkbenchFeaturedAssetClass;
  thesisTagZh: string;
  themeKey: WorkbenchFeaturedTheme;
  themeLabelZh: string;
  displayNameZh: string;
  allocationRoleKey: WorkbenchFeaturedRole;
  allocationRoleLabelZh: string;
  allocationRoleDescriptionZh: string;
  allocationNoteZh: string;
  suggestedWeightBandZh: string;
};

export type WorkbenchFeaturedAssetGroup = {
  groupKey: WorkbenchFeaturedRole;
  groupLabelZh: string;
  groupDescriptionZh: string;
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
