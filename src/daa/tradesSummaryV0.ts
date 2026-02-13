export type TradeSideV0 = "BUY" | "SELL";

export type TradeOrderLikeV0 = {
  symbol: string;
  side: TradeSideV0 | string;
  notional: number;
};

export type TradesSummaryV0 = {
  // Raw number of items passed in.
  orderCount: number;
  // Number of usable BUY/SELL trades with positive notional.
  tradeCount: number;
  buyCount: number;
  sellCount: number;
  buyNotional: number;
  sellNotional: number;
  turnoverNotional: number;
  // buyNotional - sellNotional. Positive => net buys (cash outflow).
  netNotional: number;
  // Largest trades by notional (desc).
  topTrades: Array<{ symbol: string; side: TradeSideV0; notional: number }>;
};

function isFinitePositive(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

export function summarizeTradesForConfirmationV0(
  orders: TradeOrderLikeV0[],
  opts?: { topN?: number }
): TradesSummaryV0 {
  const topN = Math.max(0, Math.floor(opts?.topN ?? 8));

  const normalized = (Array.isArray(orders) ? orders : [])
    .map((o) => ({
      symbol: String((o as any)?.symbol ?? "").trim(),
      side: String((o as any)?.side ?? "").toUpperCase(),
      notional: (o as any)?.notional,
    }))
    .filter((o) => o.symbol && (o.side === "BUY" || o.side === "SELL") && isFinitePositive(o.notional)) as Array<{
    symbol: string;
    side: TradeSideV0;
    notional: number;
  }>;

  let buyNotional = 0;
  let sellNotional = 0;
  let buyCount = 0;
  let sellCount = 0;

  for (const o of normalized) {
    if (o.side === "BUY") {
      buyCount += 1;
      buyNotional += o.notional;
    } else {
      sellCount += 1;
      sellNotional += o.notional;
    }
  }

  const topTrades = normalized
    .slice()
    .sort((a, b) => b.notional - a.notional)
    .slice(0, topN)
    .map((t) => ({ symbol: t.symbol, side: t.side, notional: t.notional }));

  return {
    orderCount: Array.isArray(orders) ? orders.length : 0,
    tradeCount: normalized.length,
    buyCount,
    sellCount,
    buyNotional,
    sellNotional,
    turnoverNotional: buyNotional + sellNotional,
    netNotional: buyNotional - sellNotional,
    topTrades,
  };
}
