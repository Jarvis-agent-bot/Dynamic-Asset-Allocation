export type SellProceedsRoutingV0 = "CASH" | "TARGET_CASH_BUCKET";

// v0 default is conservative: many mutual funds settle at T+1/T+2, so sell proceeds
// may not be available to fund BUY orders in the same-day rebalance.
export function defaultSellProceedsRoutingV0(): SellProceedsRoutingV0 {
  return "TARGET_CASH_BUCKET";
}

export function normalizeSellProceedsRoutingV0(x: unknown): SellProceedsRoutingV0 {
  return x === "CASH" ? "CASH" : "TARGET_CASH_BUCKET";
}
