/**
 * All exported types for the DAA store layer.
 * Extracted from daaStorePg.ts for clean modular imports.
 */

import type {
  DaaMarketContext,
  DaaMarketIndicatorKey,
  DaaMarketRegime,
} from "@/src/daa/modules/marketContext/marketContextTypes";
import type {
  ProposalDecisionContext,
  ProposalType,
  RebalanceCycleStatus,
  RebalanceTriggerSource,
} from "@/src/daa/modules/rebalance/rebalanceTypes";
import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";
import type { PolicyDecisionSnapshot } from "@/src/daa/modules/policy-engine/policyTypes";

export type DaaStorePosition = {
  id: string;
  assetKey: string;
  symbol: string;
  market: string;
  currency: string;
  qty: number;
  price: number;
  costBasis: number | null;
  /** 基准货币的总成本（交易时 FX 汇率锁定） */
  costBasisInBase: number | null;
  tags: string[];
  updatedAt: string;
};

export type DaaStoreEquitySnapshot = {
  ts: string;
  totalEquity: number;
  holdingsValue: number;
  cash: number;
  source: string;
};

export type DaaStoreRunHistoryEntry = {
  id: string;
  ts: string;
  triggerSource: string;
  requestJson: Record<string, unknown>;
  responseJson: Record<string, unknown>;
  summaryJson: Record<string, unknown>;
};

export type DaaStoreOpLogEntry = {
  id: string;
  ts: string;
  level: "info" | "warn" | "error";
  message: string;
  contextJson: Record<string, unknown>;
};

export type DaaStoreExternalRequestLog = {
  id: string;
  provider: string;
  resource: string;
  subjectKey: string;
  endpointHost: string;
  httpStatus: number;
  errorCode: string;
  errorMessage: string;
  latencyMs: number;
  retryCount: number;
  cacheStatus: string;
  caller: string;
  rawRefId: string | null;
  createdAt: string;
};

export type DaaExternalRequestLogSummaryItem = {
  provider: string;
  resource: string;
  endpointHost: string;
  totalCount: number;
  successCount: number;
  errorCount: number;
  rateLimitedCount: number;
  unauthorizedCount: number;
  latestAt: string | null;
  latestStatus: number;
  latestErrorCode: string;
};

export type DaaStoreCandidateAsset = {
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

export type DaaStoreAssetUniverseRow = {
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
  holdingQty: number;
  holdingPrice: number;
  costBasis: number | null;
  costBasisInBase: number | null;
  holdingTags: string[];
  watchEnabled: boolean;
  targetWeightHint: number;
  watchTags: string[];
  notes: string | null;
  priceAlertAbove: number | null;
  priceAlertBelow: number | null;
  lastPrice: number;
  priceUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DaaStoreFxRate = {
  id: string;
  baseCcy: string;
  quoteCcy: string;
  rate: number;
  source: string;
  asOfTs: string;
  updatedAt: string;
};

export type DaaStoreMarketPriceStatus = "fresh" | "stale" | "missing" | "error" | "unsupported";

export type DaaStoreFxRateHistoryStatus = "fresh" | "stale" | "missing" | "error";

export type DaaStoreMarketPriceSnapshot = {
  provider: string;
  market: string;
  symbol: string;
  normalizedSymbol: string;
  currency: string;
  price: number;
  status: DaaStoreMarketPriceStatus;
  priceUpdatedAt: string | null;
  source: string;
  errorCode: string | null;
  errorMessage: string | null;
  rawRefId: string | null;
  updatedAt: string;
};

export type DaaStoreMarketPriceHistory = {
  provider: string;
  market: string;
  symbol: string;
  ts: string;
  price: number;
  currency: string;
  source: string;
  fetchedAt: string;
  rawRefId: string | null;
};

export type DaaStoreMarketCandleInterval = "1d" | "1h";

export type DaaStoreMarketCandle = {
  provider: string;
  market: string;
  symbol: string;
  interval: DaaStoreMarketCandleInterval;
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  adjClose: number | null;
  currency: string;
  source: string;
  rawRefId: string | null;
  fetchedAt: string;
};

export type DaaStoreFxRateHistory = {
  provider: string;
  baseCcy: string;
  quoteCcy: string;
  asOfTs: string;
  rate: number;
  status: DaaStoreFxRateHistoryStatus;
  fetchedAt: string;
  errorCode: string | null;
  errorMessage: string | null;
  rawRefId: string | null;
};

export type DaaStoreNewsItemSnapshot = {
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

export type DaaStoreNewsDrivers = {
  bullish: string[];
  bearish: string[];
};

export type DaaStoreNewsMajorEvent = {
  type: string;
  impact: string;
  description: string;
};

export type DaaStoreNewsEventSnapshot = {
  provider: string;
  symbol: string;
  eventHash: string;
  itemHash: string;
  title: string;
  link: string | null;
  source: string | null;
  publishedAt: string | null;
  scorePct: number;
  confidencePct: number;
  llmSummary: string | null;
  llmDrivers: DaaStoreNewsDrivers | null;
  llmMajorEvent: DaaStoreNewsMajorEvent | null;
  llmActionHint: string | null;
  analyzedAt: string;
  updatedAt: string;
};

export type DaaStoreNewsRelatedAsset = {
  assetKey: string;
  symbol: string;
  market: string;
  name: string | null;
  displayNameZh: string | null;
  relation: string;
  confidencePct: number;
  reasonZh: string;
};

export type DaaStoreNewsEventGraph = {
  provider: string;
  symbol: string;
  eventHash: string;
  itemHash: string;
  themeKey: string;
  themeLabelZh: string;
  relatedAssets: DaaStoreNewsRelatedAsset[];
  eventScorePct: number;
  reasons: string[];
  generatedAt: string;
  updatedAt: string;
};

export type DaaStoreNewsEventRelatedAssetEdge = {
  provider: string;
  symbol: string;
  eventHash: string;
  themeKey: string;
  relatedAssetKey: string;
  relatedSymbol: string;
  relatedMarket: string;
  relation: string;
  confidencePct: number;
  reasonZh: string;
  generatedAt: string;
  updatedAt: string;
};

export type DaaStoreNewsImpactScope = "holding" | "watchlist" | "target" | "related_candidate";
export type DaaStoreNewsImpactLevel = "none" | "watch" | "review" | "risk";
export type DaaStoreNewsRecommendedAction = "record" | "investigate" | "review_thesis" | "candidate_watchlist";

export type DaaStoreNewsPortfolioImpact = {
  id: string;
  ownerAccountId: string;
  provider: string;
  symbol: string;
  eventHash: string;
  assetKey: string;
  impactScope: DaaStoreNewsImpactScope;
  impactLevel: DaaStoreNewsImpactLevel;
  impactScorePct: number;
  recommendedAction: DaaStoreNewsRecommendedAction;
  reasonZh: string;
  generatedAt: string;
  updatedAt: string;
};

export type DaaStoreDiscoveryCandidateStatus = "new" | "watching" | "dismissed" | "archived";
export type DaaStoreDiscoveryCandidateConfidence = "low" | "medium" | "high";

export type DaaStoreDiscoveryCandidate = {
  id: string;
  ownerAccountId: string;
  topicKey: string;
  topicLabelZh: string;
  assetKey: string;
  symbol: string;
  market: string;
  name: string | null;
  displayNameZh: string | null;
  scorePct: number;
  confidence: DaaStoreDiscoveryCandidateConfidence;
  status: DaaStoreDiscoveryCandidateStatus;
  reasonZh: string;
  riskNotesZh: string[];
  evidenceRefs: string[];
  discoveredAt: string;
  lastSeenAt: string;
  seenCount: number;
  reviewedAt: string | null;
  promotedAt: string | null;
  dismissedAt: string | null;
  archivedAt: string | null;
  statusUpdatedAt: string;
  updatedAt: string;
};

export type DaaStoreMarketIndicatorSnapshot = {
  id: string;
  key: DaaMarketIndicatorKey;
  scope: string;
  subjectKey: string;
  stance: DaaMarketRegime | "neutral";
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

export type DaaStoreFundamentalSnapshot = {
  provider: string;
  normalizedSymbol: string;
  symbol: string;
  market: string;
  currency: string;
  marketCap: number | null;
  trailingPE: number | null;
  pbRatio: number | null;
  debtToEquity: number | null;
  freeCashflow: number | null;
  totalRevenue: number | null;
  netIncome: number | null;
  trailingEps: number | null;
  snapshotJson: Record<string, unknown>;
  fetchedAt: string;
  expireAt: string | null;
  rawRefId: string | null;
  updatedAt: string;
};

export type DaaStoreHfHoldingSnapshot = {
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

export type DaaStoreHfSignalSnapshot = {
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

export type DaaStoreExternalPayloadRaw = {
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

export type DaaStoreCashLedgerSide = "deposit" | "withdraw";

export type DaaStoreCashLedgerEntryKind = "manual" | "trade_execution" | "dividend" | "opening_balance";

export type DaaStoreCashLedgerEntry = {
  id: string;
  ts: string;
  side: DaaStoreCashLedgerSide;
  amount: number;
  baseCurrency: string;
  entryKind: DaaStoreCashLedgerEntryKind | null;
  accountBaseCurrency: string | null;
  amountInAccountBase: number | null;
  fxRateToAccount: number | null;
  ticketId: string | null;
  cycleId: string | null;
  settlementTs: string | null;
  note: string | null;
  createdAt: string;
};

export type DaaCurrentLedgerMeta = {
  ledgerStartTs: string | null;
  openingBalance: number;
  archivedCycleCount: number;
  archivedTradeCount: number;
  archivedReportCount: number;
};

export type DaaStoreCashLedgerApplyInput = {
  side: DaaStoreCashLedgerSide;
  amount: number;
  baseCurrency?: string;
  note?: string;
  entryKind?: DaaStoreCashLedgerEntryKind;
  accountBaseCurrency?: string;
  amountInAccountBase?: number;
  fxRateToAccount?: number;
  ticketId?: string | null;
  cycleId?: string | null;
  settlementTs?: string | null;
};

export type DaaStoreBrokerKind = "sim" | "crypto_paper";

export type DaaStoreTradeTicketSource = "manual" | "decision";

export type DaaStoreTradeTicketStatus = "ready" | "submitted" | "partially_filled" | "executed" | "canceled" | "rejected";

export type DaaStoreTradeTicketSide = "BUY" | "SELL";

export type DaaStoreTradeTicket = {
  ticketId: string;
  basketId: string;
  assetKey: string;
  cycleId: string | null;
  source: DaaStoreTradeTicketSource;
  status: DaaStoreTradeTicketStatus;
  symbol: string;
  market: string;
  instrumentCurrency: string;
  baseCurrency: string;
  side: DaaStoreTradeTicketSide;
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
  brokerKind: DaaStoreBrokerKind | null;
  brokerAccountId: string | null;
  brokerOrderId: string | null;
  brokerStatus: string | null;
  filledQty: number | null;
  avgFillPrice: number | null;
  lastBrokerSyncAt: string | null;
  lastAppliedFillQty: number;
  brokerRejectReason: string | null;
  brokerRaw: Record<string, unknown> | null;
  createdBy: string;
  createdAt: string;
  executedAt: string | null;
  canceledAt: string | null;
  updatedAt: string;
};

export type DaaStoreCreateTradeTicketInput = {
  basketId?: string;
  assetKey?: string;
  cycleId?: string | null;
  source?: DaaStoreTradeTicketSource;
  side: DaaStoreTradeTicketSide;
  symbol: string;
  market?: string;
  instrumentCurrency?: string;
  qty: number;
  price: number;
  sellAll?: boolean;
  fee?: number;
  decisionRefId?: string | null;
  reasonTags?: string[];
  reasonText?: string;
  pricingMode?: "manual" | "market";
  priceSource?: string;
  priceSnapshotAt?: string;
  status?: DaaStoreTradeTicketStatus;
  brokerKind?: DaaStoreBrokerKind | null;
  brokerAccountId?: string | null;
  brokerOrderId?: string | null;
  brokerStatus?: string | null;
  filledQty?: number | null;
  avgFillPrice?: number | null;
  lastBrokerSyncAt?: string | null;
  lastAppliedFillQty?: number | null;
  brokerRejectReason?: string | null;
  brokerRaw?: Record<string, unknown> | null;
  createdBy?: string;
};

export type DaaStoreExecuteTradeTicketsInput = {
  basketId?: string;
  ticketIds?: string[];
};

export type DaaStoreExecuteTradeTicketsResult = {
  results: Array<{
    ticketId: string;
    status: DaaStoreTradeTicketStatus;
    rejectCode?: string;
    rejectMessage?: string;
  }>;
  tickets: DaaStoreTradeTicket[];
  positions: DaaStorePosition[];
  account: {
    baseCurrency: string;
    cash: number;
    investableCash: number;
    frozenCash: number;
    totalEquity: number | null;
  };
  equitySnapshot: DaaStoreEquitySnapshot;
};

export type DaaStoreRiskRule =
  | "max_position"
  | "max_order_pct"
  | "concentration"
  | "correlation"
  | "stop_loss_breach"
  | "total_weight"
  | "cash_sufficiency"

export type DaaStorePreTradeRiskCheckItem = {
  rule: DaaStoreRiskRule;
  status: "pass" | "warn" | "block";
  current: number;
  limit: number;
  message: string;
};

export type DaaStorePreTradeRiskCheck = {
  overallStatus: "pass" | "warn" | "block";
  items: DaaStorePreTradeRiskCheckItem[];
};

export type DaaStoreRebalanceCycleStatus = RebalanceCycleStatus;

export type DaaStoreRebalanceTriggerSource = RebalanceTriggerSource;

export type DaaStoreRebalanceCycle = {
  cycleId: string;
  status: DaaStoreRebalanceCycleStatus;
  triggerSource: DaaStoreRebalanceTriggerSource;
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
    sellAll?: boolean;
    reason: string;
    selected: boolean;
    hfContribution: string | null;
    targetWeightPct?: number | null;
    proposalType?: ProposalType;
    decisionContext?: ProposalDecisionContext | null;
  }>;
  riskCheck: DaaStorePreTradeRiskCheck;
  executionStartedAt: string | null;
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
  agentDecisionSnapshot?: Record<string, unknown> | null;
  policyDecisionId?: string | null;
  intentIds: string[];
  signalIds: string[];
  policySnapshot?: PolicyDecisionSnapshot | null;
  proposalPlanId?: string | null;
  createdAt: string;
};

export type DaaStoreCycleReport = {
  cycleId: string;
  triggerSource: DaaStoreRebalanceTriggerSource;
  cycleStatus: DaaStoreRebalanceCycleStatus;
  cycleCreatedAt: string;
  reportCreatedAt: string;
  executionSummary: DaaStoreRebalanceCycle["executionSummary"];
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
    ordersSubmitted?: number;
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

export type DaaStoreTriggerEvent = {
  eventId: string;
  idempotencyKey: string;
  triggerSource: DaaStoreRebalanceTriggerSource;
  triggerReason: string;
  cycleId: string | null;
  status: "accepted" | "skipped" | "conflict";
  detailsJson: Record<string, unknown>;
  createdAt: string;
};

export type DaaStoreCreateRebalanceCycleInput = {
  cycleId?: string;
  status?: DaaStoreRebalanceCycleStatus;
  triggerSource: DaaStoreRebalanceTriggerSource;
  triggerReason: string;
  snapshotAt?: string;
  equitySnapshot: number;
  driftSnapshot: DaaStoreRebalanceCycle["driftSnapshot"];
  proposals: DaaStoreRebalanceCycle["proposals"];
  riskCheck: DaaStorePreTradeRiskCheck;
  notes?: string | null;
  marketContext?: DaaMarketContext | null;
  agentDecisionSnapshot?: Record<string, unknown> | null;
  policyDecisionId?: string | null;
  intentIds?: string[];
  signalIds?: string[];
  policySnapshot?: PolicyDecisionSnapshot | null;
  proposalPlanId?: string | null;
};

export type DaaStorePatchRebalanceCycleInput = {
  cycleId: string;
  status?: DaaStoreRebalanceCycleStatus;
  triggerReason?: string;
  riskCheck?: DaaStorePreTradeRiskCheck;
  proposals?: DaaStoreRebalanceCycle["proposals"];
  executionStartedAt?: string | null;
  executedAt?: string | null;
  executedOrders?: string[];
  executionSummary?: DaaStoreRebalanceCycle["executionSummary"];
  cancelledAt?: string | null;
  cancelReason?: string | null;
  notes?: string | null;
  marketContext?: DaaMarketContext | null;
  policyDecisionId?: string | null;
  intentIds?: string[];
  signalIds?: string[];
  policySnapshot?: PolicyDecisionSnapshot | null;
  proposalPlanId?: string | null;
};

export type DaaStoreHumanIngestState = {
  id: "default";
  lastIngestAt: string | null;
  ingestCount: number;
  latestBatch: Record<string, unknown> | null;
  latestActors: Array<Record<string, unknown>>;
  latestHoldings: Array<Record<string, unknown>>;
  updatedAt: string;
};

export type DaaStoreSystemConfigRow = {
  id: "default";
  version: number;
  config: DaaSystemConfig;
  updatedAt: string;
};

export type DaaStoreAccountState = {
  id: string;
  baseCurrency: string;
  cash: number;
  investableCash: number;
  frozenCash: number;
  totalEquity: number | null;
  updatedAt: string;
};
