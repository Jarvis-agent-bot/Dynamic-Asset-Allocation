/**
 * All exported types for the DAA store layer.
 * Extracted from daaStorePg.ts for clean modular imports.
 */

import type {
  DaaMarketContext,
  DaaMarketIndicatorKey,
  DaaMarketRegime,
} from "@/src/daa/modules/marketContext/marketContextTypes";
import type { ProposalDecisionContext } from "@/src/daa/modules/workbench/workbenchTypes";
import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";

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

export type DaaStoreRebalanceDecision = {
  id: string;
  shouldRebalance: boolean;
  triggerSource: "manual" | "cron_drift" | "cron_scheduled";
  status: "pending" | "partial" | "executed" | "canceled" | "skipped";
  requestJson: Record<string, unknown>;
  responseJson: Record<string, unknown>;
  createdAt: string;
};

export type DaaStoreExecutionOrder = {
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

export type DaaStoreIngestJobStatus = "ok" | "partial" | "failed";

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
  rawRefId: string | null;
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

export type DaaStoreNewsSignalSnapshot = {
  provider: string;
  symbol: string;
  scorePct: number;
  confidencePct: number;
  evidenceCount: number;
  reasonsJson: string[];
  generatedAt: string;
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

export type DaaStoreIngestJobLog = {
  jobId: string;
  jobType: string;
  triggerSource: string;
  status: DaaStoreIngestJobStatus;
  startedAt: string;
  finishedAt: string;
  totalCount: number;
  successCount: number;
  failureCount: number;
  diagnosticsJson: Record<string, unknown>;
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

export type DaaStoreTradeBasketStatus = "draft" | "executing" | "executed" | "partial" | "canceled";

export type DaaStoreTradeBasketSource = "manual" | "decision" | "mixed" | "migration";

export type DaaStoreBrokerOrderSnapshot = {
  ticketId: string;
  brokerKind: DaaStoreBrokerKind;
  brokerAccountId: string | null;
  brokerOrderId: string;
  status: string;
  filledQty: number | null;
  avgFillPrice: number | null;
  raw: Record<string, unknown> | null;
  syncedAt: string;
  updatedAt: string;
};

export type DaaStoreTradeBasket = {
  basketId: string;
  source: DaaStoreTradeBasketSource;
  status: DaaStoreTradeBasketStatus;
  decisionRefId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  executedAt: string | null;
};

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

export type DaaStoreRebalanceCycleStatus = "generated" | "reviewing" | "executing" | "completed" | "cancelled";

export type DaaStoreRebalanceTriggerSource = "calendar" | "drift" | "manual" | "risk" | "cash_idle";

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
    reason: string;
    selected: boolean;
    hfContribution: string | null;
    decisionContext?: ProposalDecisionContext | null;
  }>;
  riskCheck: DaaStorePreTradeRiskCheck;
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
  llmDecisionSnapshot?: Record<string, unknown> | null;
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

export type DaaStoreLlmFeedback = {
  id: string;
  contextId: string;
  type: "insight" | "decision";
  score: "up" | "down";
  comment: string | null;
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
  llmDecisionSnapshot?: Record<string, unknown> | null;
};

export type DaaStorePatchRebalanceCycleInput = {
  cycleId: string;
  status?: DaaStoreRebalanceCycleStatus;
  triggerReason?: string;
  riskCheck?: DaaStorePreTradeRiskCheck;
  proposals?: DaaStoreRebalanceCycle["proposals"];
  executedAt?: string | null;
  executedOrders?: string[];
  executionSummary?: DaaStoreRebalanceCycle["executionSummary"];
  cancelledAt?: string | null;
  cancelReason?: string | null;
  notes?: string | null;
  marketContext?: DaaMarketContext | null;
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
  id: "default";
  baseCurrency: string;
  cash: number;
  investableCash: number;
  frozenCash: number;
  totalEquity: number | null;
  updatedAt: string;
};
