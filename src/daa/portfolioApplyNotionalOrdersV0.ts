export type NotionalOrderV0 = {
  symbol: string;
  side: "BUY" | "SELL";
  notional: number;
  reason?: string;
};

export type ApplyNotionalOrdersResultV0 = {
  schemaVersion: 1;
  cashBefore: number;
  cashAfter: number;
  positionsBefore: Record<string, number>;
  positionsAfter: Record<string, number>;
  appliedOrders: NotionalOrderV0[];
  issues: string[];
};

function toFiniteNumber(x: unknown): number | null {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

function normalizeSymbol(sym: unknown): string {
  return String(sym ?? "").trim();
}

export function normalizeNotionalOrdersV0(orders: unknown): { orders: NotionalOrderV0[]; issues: string[] } {
  const issues: string[] = [];
  if (!Array.isArray(orders)) return { orders: [], issues: ["orders is not an array"] };

  const out: NotionalOrderV0[] = [];

  for (const row of orders) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      issues.push("invalid order row (not an object)");
      continue;
    }
    const r: any = row as any;

    const symbol = normalizeSymbol(r.symbol ?? r.id ?? r.code);
    const sideRaw = String(r.side ?? "").trim().toUpperCase();
    const side = sideRaw === "BUY" || sideRaw === "SELL" ? (sideRaw as "BUY" | "SELL") : null;
    const notional = toFiniteNumber(r.notional);
    const reason = r.reason === undefined ? undefined : String(r.reason);

    if (!symbol) {
      issues.push("order missing symbol");
      continue;
    }
    if (!side) {
      issues.push(`order ${symbol}: invalid side`);
      continue;
    }
    if (notional === null || notional <= 0) {
      issues.push(`order ${symbol}: invalid notional`);
      continue;
    }

    out.push({ symbol, side, notional, reason });
  }

  return { orders: out, issues };
}

export function applyNotionalOrdersToPositionsV0(args: {
  cash: unknown;
  positions: Record<string, unknown>;
  orders: unknown;
  pricesBySymbol: Record<string, unknown>;
}): ApplyNotionalOrdersResultV0 {
  const issues: string[] = [];

  const cashBefore = Math.max(0, toFiniteNumber(args.cash) ?? 0);

  const positionsBefore: Record<string, number> = {};
  for (const [symRaw, qtyRaw] of Object.entries(args.positions ?? {})) {
    const sym = normalizeSymbol(symRaw);
    const qty = toFiniteNumber(qtyRaw);
    if (!sym || qty === null || qty <= 0) continue;
    positionsBefore[sym] = qty;
  }

  const prices: Record<string, number> = {};
  for (const [symRaw, pRaw] of Object.entries(args.pricesBySymbol ?? {})) {
    const sym = normalizeSymbol(symRaw);
    if (!sym) continue;
    const price = toFiniteNumber(pRaw);
    if (price === null || price <= 0) continue;
    prices[sym] = price;
  }

  const normalized = normalizeNotionalOrdersV0(args.orders);
  issues.push(...normalized.issues);

  let cashAfter = cashBefore;
  const positionsAfter: Record<string, number> = { ...positionsBefore };

  for (const o of normalized.orders) {
    const price = prices[o.symbol];
    if (!Number.isFinite(price) || price <= 0) {
      issues.push(`missing price for ${o.symbol}; skipped order`);
      continue;
    }

    const qtyDelta = o.notional / price;

    if (o.side === "BUY") {
      cashAfter -= o.notional;
      const nextQty = (positionsAfter[o.symbol] ?? 0) + qtyDelta;
      positionsAfter[o.symbol] = nextQty;
    } else {
      cashAfter += o.notional;
      const prev = positionsAfter[o.symbol] ?? 0;
      const nextQty = prev - qtyDelta;
      if (nextQty < -1e-9) {
        issues.push(`SELL exceeds position for ${o.symbol}; clamped to 0`);
      }
      const clamped = Math.max(0, nextQty);
      if (clamped <= 0) {
        delete positionsAfter[o.symbol];
      } else {
        positionsAfter[o.symbol] = clamped;
      }
    }
  }

  if (cashAfter < -1e-6) issues.push("cashAfter < 0 (insufficient cash for BUY orders)");

  return {
    schemaVersion: 1,
    cashBefore,
    cashAfter,
    positionsBefore,
    positionsAfter,
    appliedOrders: normalized.orders,
    issues,
  };
}
