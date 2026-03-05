export type TradeTicketSourceV1 = "manual" | "decision";
export type TradeTicketStatusV1 = "ready" | "executed" | "canceled" | "rejected";
export type TradeTicketSideV1 = "BUY" | "SELL";

export type TradeTicketV1 = {
  ticketId: string;
  basketId: string;
  assetKey: string;
  source: TradeTicketSourceV1;
  status: TradeTicketStatusV1;
  symbol: string;
  market: string;
  instrumentCurrency: string;
  baseCurrency: string;
  side: TradeTicketSideV1;
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
  createdBy: string;
  createdAt: string;
  executedAt: string | null;
  canceledAt: string | null;
  updatedAt: string;
};

export type CreateTradeTicketInputV1 = {
  basketId?: string;
  assetKey?: string;
  source?: TradeTicketSourceV1;
  side: TradeTicketSideV1;
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
  createdBy?: string;
};

export type ExecuteTradeTicketsResultV1 = {
  results: Array<{
    ticketId: string;
    status: TradeTicketStatusV1;
    rejectCode?: string;
    rejectMessage?: string;
  }>;
  tickets: TradeTicketV1[];
  positions: Array<{
    symbol: string;
    market: string;
    currency: string;
    qty: number;
    price: number;
    costBasis?: number | null;
    tags: string[];
  }>;
  account: {
    baseCurrency: string;
    cash: number;
    investableCash: number;
    frozenCash: number;
    totalEquity: number | null;
  };
  equitySnapshot: {
    ts: string;
    totalEquity: number;
    holdingsValue: number;
    cash: number;
    source: string;
  };
};
