export type ExecutionOrderStatusV1 = "pending" | "executed" | "skipped" | "partial";

export type ExecutionOrderV1 = {
  orderId: string;
  symbol: string;
  side: "BUY" | "SELL";
  suggestedNotional: number;
  status: ExecutionOrderStatusV1;
  executedQty: number;
  executedPrice: number;
  fee: number;
  notes: string | null;
};

export type RebalanceDecisionStatusV1 = "pending" | "partial" | "executed" | "skipped";

export type RebalanceDecisionV1 = {
  id: string;
  status: RebalanceDecisionStatusV1;
  shouldRebalance: boolean;
  createdAt: string;
  orders: ExecutionOrderV1[];
};

export type ConfirmExecutionOrderInputV1 = {
  orderId: string;
  status: ExecutionOrderStatusV1;
  executedQty?: number;
  executedPrice?: number;
  fee?: number;
  notes?: string;
};

export type ConfirmExecutionInputV1 = {
  decisionId: string;
  cash?: number;
  orders: ConfirmExecutionOrderInputV1[];
};

export type ConfirmExecutionResultV1 = {
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
    liquidityNotional24h: number;
  }>;
  equitySnapshot: {
    ts: string;
    totalEquity: number;
    holdingsValue: number;
    cash: number;
    source: string;
  };
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
