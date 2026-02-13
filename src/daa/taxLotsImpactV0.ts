export type TaxLotV0 = { qty: number; cost: number; acquiredAt?: string };

export type PositionWithLotsV0 = {
  qty: number;
  cost?: number;
  lots?: TaxLotV0[];
};

export type TaxImpactRowV0 = {
  symbol: string;
  side: "SELL";
  notional: number;
  price: number;
  qtyEst: number;
  proceedsNet: number;

  // How much of the sell quantity has a known cost basis.
  qtyKnown: number;
  costBasisKnown: number;
  realizedGainKnown: number;

  qtyUnknown: number;
};

export type TaxImpactSummaryV0 = {
  ok: boolean;
  rows: TaxImpactRowV0[];
  totals: {
    sellNotional: number;
    proceedsNet: number;
    qtyKnown: number;
    costBasisKnown: number;
    realizedGainKnown: number;
    qtyUnknown: number;
  };
  warnings: string[];
};

function toFiniteNumber(x: unknown): number | null {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

function sortLotsFifo(lots: TaxLotV0[]): TaxLotV0[] {
  // FIFO: if acquiredAt is present and parseable, sort ascending; otherwise keep original order.
  const withTime = lots.map((l, idx) => {
    const t = l.acquiredAt ? Date.parse(l.acquiredAt) : NaN;
    return { l, idx, t };
  });

  const hasAnyTime = withTime.some((x) => Number.isFinite(x.t));
  if (!hasAnyTime) return lots;

  withTime.sort((a, b) => {
    const at = Number.isFinite(a.t) ? a.t : Infinity;
    const bt = Number.isFinite(b.t) ? b.t : Infinity;
    if (at !== bt) return at - bt;
    return a.idx - b.idx;
  });

  return withTime.map((x) => x.l);
}

function estimateCostBasisForSell(args: {
  qtyToSell: number;
  position: PositionWithLotsV0 | null;
}): { qtyKnown: number; costBasisKnown: number; qtyUnknown: number } {
  const qtyToSell = args.qtyToSell;
  if (!(Number.isFinite(qtyToSell) && qtyToSell > 0)) return { qtyKnown: 0, costBasisKnown: 0, qtyUnknown: 0 };

  const p = args.position;
  if (!p) return { qtyKnown: 0, costBasisKnown: 0, qtyUnknown: qtyToSell };

  let remaining = qtyToSell;
  let qtyKnown = 0;
  let costBasisKnown = 0;

  const lots = Array.isArray(p.lots) ? sortLotsFifo(p.lots) : [];
  for (const lot of lots) {
    if (!(remaining > 0)) break;

    const lotQty = toFiniteNumber((lot as any)?.qty);
    const lotCost = toFiniteNumber((lot as any)?.cost);
    if (!(lotQty !== null && lotQty > 0 && lotCost !== null && lotCost >= 0)) continue;

    const take = Math.min(remaining, lotQty);
    qtyKnown += take;
    costBasisKnown += take * lotCost;
    remaining -= take;
  }

  if (remaining > 0) {
    const avgCost = p.cost === undefined ? null : toFiniteNumber(p.cost);
    if (avgCost !== null && avgCost >= 0) {
      qtyKnown += remaining;
      costBasisKnown += remaining * avgCost;
      remaining = 0;
    }
  }

  const qtyUnknown = Math.max(0, remaining);
  return { qtyKnown, costBasisKnown, qtyUnknown };
}

export function estimateTaxLotsImpactV0(args: {
  // Orders are notional-based.
  orders: Array<{ symbol: string; side: "BUY" | "SELL"; notional: number }>;
  pricesBySymbol: Record<string, number>;
  positionsBySymbol: Record<string, PositionWithLotsV0>;
  costBps?: number; // feeBps + effective slippageBps
}): TaxImpactSummaryV0 {
  const warnings: string[] = [];

  const costBps = Math.max(0, toFiniteNumber(args.costBps) ?? 0);
  const costPct01 = costBps / 10000;

  const rows: TaxImpactRowV0[] = [];

  for (const o of args.orders ?? []) {
    if (!o || o.side !== "SELL") continue;

    const symbol = String(o.symbol ?? "").trim();
    if (!symbol) continue;

    const notional = toFiniteNumber(o.notional);
    if (!(notional !== null && notional > 0)) continue;

    const px = toFiniteNumber(args.pricesBySymbol?.[symbol]);
    if (!(px !== null && px > 0)) {
      warnings.push(`Missing price for ${symbol}; cannot estimate realized gain.`);
      continue;
    }

    const qtyEst = notional / px;
    if (!(Number.isFinite(qtyEst) && qtyEst > 0)) continue;

    const proceedsNet = notional * (1 - costPct01);

    const position = (args.positionsBySymbol || {})[symbol] ?? null;
    const basis = estimateCostBasisForSell({ qtyToSell: qtyEst, position });

    // Allocate proceeds proportionally between known and unknown cost basis quantities.
    const knownFrac = qtyEst > 0 ? Math.max(0, Math.min(1, basis.qtyKnown / qtyEst)) : 0;
    const proceedsKnown = proceedsNet * knownFrac;
    const realizedGainKnown = proceedsKnown - basis.costBasisKnown;

    rows.push({
      symbol,
      side: "SELL",
      notional,
      price: px,
      qtyEst,
      proceedsNet,
      qtyKnown: basis.qtyKnown,
      costBasisKnown: basis.costBasisKnown,
      realizedGainKnown,
      qtyUnknown: basis.qtyUnknown,
    });

    if (basis.qtyUnknown > 1e-12) {
      warnings.push(`Missing cost basis for ${symbol} qty≈${basis.qtyUnknown.toFixed(4)} (of sold≈${qtyEst.toFixed(4)}).`);
    }
  }

  rows.sort((a, b) => Math.abs(b.realizedGainKnown) - Math.abs(a.realizedGainKnown));

  const totals = rows.reduce(
    (acc, r) => {
      acc.sellNotional += r.notional;
      acc.proceedsNet += r.proceedsNet;
      acc.qtyKnown += r.qtyKnown;
      acc.costBasisKnown += r.costBasisKnown;
      acc.realizedGainKnown += r.realizedGainKnown;
      acc.qtyUnknown += r.qtyUnknown;
      return acc;
    },
    {
      sellNotional: 0,
      proceedsNet: 0,
      qtyKnown: 0,
      costBasisKnown: 0,
      realizedGainKnown: 0,
      qtyUnknown: 0,
    }
  );

  return { ok: true, rows, totals, warnings };
}
