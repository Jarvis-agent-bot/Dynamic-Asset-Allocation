export type OrderFeeEstimateInputV0 = {
  notional: unknown;
};

function toFiniteNumber(x: unknown): number | null {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

export function estimateTotalBrokerageFeesV0(args: {
  orders: OrderFeeEstimateInputV0[];
  feeBps: unknown;
}): number | null {
  const feeBpsN = toFiniteNumber(args.feeBps);
  if (feeBpsN === null || feeBpsN <= 0) return null;

  let turnover = 0;
  for (const o of args.orders) {
    const n = toFiniteNumber(o?.notional);
    if (n === null) continue;
    if (n <= 0) continue;
    turnover += n;
  }

  if (!(turnover > 0)) return null;

  return (turnover * feeBpsN) / 10000;
}
