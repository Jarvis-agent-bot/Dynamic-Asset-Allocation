export type TradeTicketSource = "manual" | "decision";
export type TradeTicketStatus = "ready" | "executed" | "canceled" | "rejected";
export type TradeTicketSide = "BUY" | "SELL";

export type TradeTicket = {
  ticketId: string;
  basketId: string;
  assetKey: string;
  cycleId: string | null;
  source: TradeTicketSource;
  status: TradeTicketStatus;
  symbol: string;
  market: string;
  instrumentCurrency: string;
  baseCurrency: string;
  side: TradeTicketSide;
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

export type CreateTradeTicketInput = {
  basketId?: string;
  assetKey?: string;
  source?: TradeTicketSource;
  side: TradeTicketSide;
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

export type ExecuteTradeTicketsResult = {
  results: Array<{
    ticketId: string;
    status: TradeTicketStatus;
    rejectCode?: string;
    rejectMessage?: string;
  }>;
  tickets: TradeTicket[];
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
