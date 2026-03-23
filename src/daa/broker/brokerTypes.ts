import type { TradeTicket, TradeTicketSide } from "@/src/daa/modules/trade/tradeTypes";

export type DaaBrokerKind = "sim" | "crypto_paper";
export type DaaExecutionVenue = DaaBrokerKind;
export type DaaBrokerOrderType = "MKT" | "LMT";

export type DaaBrokerAccountSummary = {
  broker: DaaBrokerKind;
  accountId: string;
  accountAlias: string | null;
  baseCurrency: string;
  cash: number;
  investableCash: number;
  frozenCash: number;
  totalEquity: number | null;
  buyingPower: number | null;
  netLiquidation: number | null;
  updatedAt: string;
};

export type DaaBrokerPosition = {
  broker: DaaBrokerKind;
  accountId: string;
  assetKey: string;
  symbol: string;
  market: string;
  currency: string;
  qty: number;
  price: number;
  costBasis: number | null;
  lastPrice: number | null;
  marketValue: number | null;
  brokerConid: string | null;
  updatedAt: string;
};

export type DaaBrokerOrder = {
  broker: DaaBrokerKind;
  accountId: string;
  orderId: string;
  symbol: string;
  market: string;
  currency: string;
  side: TradeTicketSide;
  qty: number;
  filledQty: number | null;
  orderType: DaaBrokerOrderType;
  referencePrice: number | null;
  limitPrice: number | null;
  avgFillPrice: number | null;
  status: string;
  submittedAt: string | null;
  updatedAt: string;
  raw: Record<string, unknown> | null;
};

export type DaaBrokerPreviewOrderInput = {
  accountId?: string | null;
  assetKey: string;
  symbol: string;
  market: string;
  currency: string;
  side: TradeTicketSide;
  qty: number;
  orderType: DaaBrokerOrderType;
  referencePrice: number;
  limitPrice?: number | null;
};

export type DaaBrokerPreviewOrderResult = {
  broker: DaaBrokerKind;
  accountId: string;
  canPlace: boolean;
  orderType: DaaBrokerOrderType;
  estimatedNotional: number;
  warnings: string[];
};

export type DaaBrokerPlaceOrderInput = DaaBrokerPreviewOrderInput & {
  reasonText?: string | null;
  timeInForce?: "DAY" | "GTC";
  tags?: string[];
  createdBy?: string;
};

export type DaaBrokerPlaceOrderResult = {
  accepted: boolean;
  order: DaaBrokerOrder;
  messages: string[];
  warnings: string[];
};

export type DaaBrokerExecutionMeta = {
  kind: DaaBrokerKind;
  accountId: string;
  accepted: boolean;
  remoteStatus: string;
  remoteOrderId: string;
  routeReason?: string;
  messages: string[];
  warnings: string[];
};

export type DaaBrokerBackedExecutionResult = {
  item: TradeTicket;
  result: {
    ticketId: string;
    status: TradeTicket["status"];
    rejectCode?: string;
    rejectMessage?: string;
  };
  summary: {
    executed: number;
    rejected: number;
    total: number;
  };
  logs: TradeTicket[];
  baseCurrency: string;
  notionalInBase: number;
  feeInBase: number;
  source: "manual" | "decision";
  side: TradeTicketSide;
  symbol: string;
  broker: DaaBrokerExecutionMeta | null;
};

export interface BrokerAdapter {
  readonly kind: DaaBrokerKind;
  readonly remote?: boolean;
  getAccountSummary(accountId?: string | null): Promise<DaaBrokerAccountSummary>;
  getPositions(accountId?: string | null): Promise<DaaBrokerPosition[]>;
  previewOrder(input: DaaBrokerPreviewOrderInput): Promise<DaaBrokerPreviewOrderResult>;
  placeOrder(input: DaaBrokerPlaceOrderInput): Promise<DaaBrokerPlaceOrderResult>;
  getOrder(orderId: string, accountId?: string | null): Promise<DaaBrokerOrder | null>;
  listOrders(input?: { accountId?: string | null; limit?: number }): Promise<DaaBrokerOrder[]>;
}
