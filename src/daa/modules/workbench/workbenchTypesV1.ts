import type { TradeTicketSideV1, TradeTicketSourceV1, TradeTicketStatusV1, TradeTicketV1 } from "@/src/daa/modules/trade/tradeTypesV1";
import type { DaaStoreTradeBasketStatusV1, DaaStoreTradeBasketSourceV1 } from "@/src/daa/store/daaStorePgV1";

export type WorkbenchPriceStatusV1 = "fresh" | "stale" | "missing" | "unsupported";

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
};

export type TradeBasketV1 = {
  basketId: string;
  source: DaaStoreTradeBasketSourceV1;
  status: DaaStoreTradeBasketStatusV1;
  decisionRefId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  executedAt: string | null;
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
    queueId: string | null;
    queueStatus: DaaStoreTradeBasketStatusV1 | null;
    queueSource: DaaStoreTradeBasketSourceV1 | null;
    queueItems: TradeTicketV1[];
    logs: TradeTicketV1[];
  };
  warnings: string[];
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

export type WorkbenchExecutionAddItemInputV1 = {
  source?: TradeTicketSourceV1;
  origin?: "manual" | "recommendation";
  side: TradeTicketSideV1;
  assetKey: string;
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

export type WorkbenchExecutionAddItemResultV1 = {
  queueId: string;
  queueStatus: DaaStoreTradeBasketStatusV1;
  item: TradeTicketV1;
  queueItems: TradeTicketV1[];
};

export type WorkbenchExecutionCommitResultV1 = {
  queueId: string | null;
  queueStatus: DaaStoreTradeBasketStatusV1 | null;
  results: Array<{
    ticketId: string;
    status: TradeTicketStatusV1;
    rejectCode?: string;
    rejectMessage?: string;
  }>;
  summary: {
    executed: number;
    rejected: number;
    total: number;
  };
  logs: TradeTicketV1[];
};

export type WorkbenchExecutionLogFiltersV1 = {
  limit?: number;
  status?: "ready" | "executed" | "canceled" | "rejected";
  source?: "manual" | "decision";
};

export type WorkbenchSearchAssetResultV1 = {
  symbol: string;
  market: string;
  currency: string;
  price: number;
  name: string;
  exchange: string;
  assetClass: string;
  region: string;
  instrumentType: string;
  marketGroup: string;
  yfinanceSymbol: string;
};

export type WorkbenchAssetInsightMetricItemV1 = {
  key: string;
  label: string;
  value: number | string;
  unit?: string;
  status?: "bullish" | "bearish" | "neutral" | "unavailable";
  description?: string;
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
  llmAnalysis: Record<string, unknown> | null;
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
