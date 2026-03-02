export type ExecutionOrderStatusV1 = "pending" | "submitted" | "partial" | "executed" | "canceled" | "skipped";

export type ExecutionOrderV1 = {
  orderId: string;
  symbol: string;
  side: "BUY" | "SELL";
  suggestedNotional: number;
  status: ExecutionOrderStatusV1;
  executedQty: number;
  executedPrice: number;
  fee: number;
  bookedQty?: number;
  bookedNotional?: number;
  bookedFee?: number;
  bookedAt?: string | null;
  notes: string | null;
};

export type RebalanceDecisionStatusV1 = "pending" | "partial" | "executed" | "canceled" | "skipped";

export type RebalanceDecisionV1 = {
  id: string;
  status: RebalanceDecisionStatusV1;
  shouldRebalance: boolean;
  createdAt: string;
  orders: ExecutionOrderV1[];
  requestJson?: Record<string, unknown>;
  responseJson?: Record<string, unknown>;
};

export type ExecutionEventTypeV1 = "submit" | "cancel" | "skip" | "fill";

export type ExecutionEventInputV1 = {
  orderId: string;
  type: ExecutionEventTypeV1;
  fillQty?: number;
  fillPrice?: number;
  fee?: number;
  note?: string;
  final?: boolean;
  ts?: string;
};

export type ExecutionEventAppliedV1 = {
  orderId: string;
  type: ExecutionEventTypeV1;
  fromStatus: ExecutionOrderStatusV1;
  toStatus: ExecutionOrderStatusV1;
  fillQty: number;
  fillNotional: number;
};

export type ApplyExecutionEventsInputV1 = {
  decisionId: string;
  events: ExecutionEventInputV1[];
};

export type ApplyExecutionEventsResultV1 = {
  decision: RebalanceDecisionV1;
  orders: ExecutionOrderV1[];
  positions: Array<{
    symbol: string;
    market: string;
    currency: string;
    qty: number;
    price: number;
    costBasis: number | null;
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
  applied: ExecutionEventAppliedV1[];
};

export type ReconcileResultV1 = {
  decisionId: string;
  expected: Array<{ symbol: string; qty: number }>;
  actual: Array<{ symbol: string; qty: number }>;
  drift: Array<{ symbol: string; expectedQty: number; actualQty: number; diffQty: number }>;
};

export type UnifiedPlanEnvelopeV1<TPlan = Record<string, unknown>> = {
  plan: TPlan;
  decisionId?: string;
  decisionStatus?: RebalanceDecisionStatusV1;
};
