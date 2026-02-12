export type WhatIfOrderV0 = {
  symbol: string;
  side: "BUY" | "SELL";
  notional: number;
};

export type WhatIfRowV0 = {
  id: string;
  label: string;
  // Portfolio values in base currency.
  valueBefore: number;
  valueAfter: number;
  // Weights are computed vs totalBefore/totalAfter (including cash).
  currentPct: number;
  targetPct: number;
  postPct: number;
  // Signed drift after applying costs.
  driftPct: number;
};

export type RebalanceWhatIfV0 = {
  schemaVersion: 1;
  feeBps: number;
  slippageBps: number;
  costPct: number;
  costTotal: number;
  totalBefore: number;
  totalAfter: number;
  cashBefore: number;
  cashAfter: number;
  warnings: string[];
  rows: WhatIfRowV0[];
};

function toFiniteNumber(x: unknown): number | null {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

function clamp01(x: number) {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function safeDiv(a: number, b: number) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return 0;
  return a / b;
}

/**
 * A lightweight what-if simulator for v0 notional-based rebalance orders.
 *
 * Model assumptions (v0):
 * - Orders are notional amounts in base currency.
 * - Fees + slippage are modeled as a percent of notional (bps). For BUY, costs reduce acquired asset value.
 *   For SELL, costs reduce the cash received.
 * - No taxes, no lot sizes, no partial fills.
 */
export function simulateRebalanceWhatIfV0(args: {
  cashStart: number;
  valuesBySymbol: Record<string, number>;
  targetWeightsBySymbol: Record<string, number>;
  orders: WhatIfOrderV0[];
  feeBps: number;
  slippageBps: number;
  // Optional labels for nicer UI tables.
  labelsBySymbol?: Record<string, string>;
}): RebalanceWhatIfV0 {
  const warnings: string[] = [];

  const cashStartN = toFiniteNumber(args.cashStart) ?? 0;
  const feeBps = toFiniteNumber(args.feeBps) ?? 0;
  const slippageBps = toFiniteNumber(args.slippageBps) ?? 0;

  const feePct = clamp01(feeBps / 10_000);
  const slippagePct = clamp01(slippageBps / 10_000);
  const costPct = clamp01(feePct + slippagePct);

  if (feeBps < 0 || slippageBps < 0) warnings.push("feeBps/slippageBps < 0; clamped to 0");
  if (feePct + slippagePct > 1) warnings.push("fee+slippage exceeds 100%; clamped to 100%");

  const valueBeforeById = new Map<string, number>();
  for (const [idRaw, vRaw] of Object.entries(args.valuesBySymbol ?? {})) {
    const id = String(idRaw ?? "").trim();
    if (!id) continue;
    const v = toFiniteNumber(vRaw);
    if (v === null || v <= 0) continue;
    valueBeforeById.set(id, v);
  }

  const targetById = new Map<string, number>();
  for (const [idRaw, wRaw] of Object.entries(args.targetWeightsBySymbol ?? {})) {
    const id = String(idRaw ?? "").trim();
    if (!id) continue;
    const w = toFiniteNumber(wRaw);
    if (w === null) continue;
    if (w < 0) warnings.push(`target weight < 0 for ${id}`);
    targetById.set(id, w);
  }

  // Apply orders as value deltas.
  const deltaById = new Map<string, number>();
  let cashDelta = 0;
  let costTotal = 0;

  for (const o of args.orders ?? []) {
    const id = String(o?.symbol ?? "").trim();
    const side = String((o as any)?.side ?? "").toUpperCase();
    const notional = toFiniteNumber((o as any)?.notional);

    if (!id || (side !== "BUY" && side !== "SELL") || notional === null) continue;
    if (notional <= 0) continue;

    const cost = notional * costPct;
    costTotal += cost;

    if (side === "BUY") {
      // Spend `notional` cash; acquire `notional - cost` of asset value.
      cashDelta -= notional;
      deltaById.set(id, (deltaById.get(id) ?? 0) + (notional - cost));
    } else {
      // Sell `notional` of asset value; receive `notional - cost` in cash.
      cashDelta += notional - cost;
      deltaById.set(id, (deltaById.get(id) ?? 0) - notional);
    }
  }

  const cashAfter = cashStartN + cashDelta;

  const ids = new Set<string>([
    ...Array.from(valueBeforeById.keys()),
    ...Array.from(targetById.keys()),
    ...Array.from(deltaById.keys()),
  ]);

  const valueAfterById = new Map<string, number>();
  for (const id of ids) {
    const before = valueBeforeById.get(id) ?? 0;
    const after = before + (deltaById.get(id) ?? 0);
    if (after < -1e-6) warnings.push(`post-trade value < 0 for ${id} (check SELL notional)`);
    valueAfterById.set(id, Math.max(0, after));
  }

  const assetsBefore = Array.from(valueBeforeById.values()).reduce((a, b) => a + b, 0);
  const assetsAfter = Array.from(valueAfterById.values()).reduce((a, b) => a + b, 0);

  const totalBefore = cashStartN + assetsBefore;
  const totalAfter = cashAfter + assetsAfter;

  if (cashAfter < -1e-6) warnings.push("cashAfter < 0 (insufficient cash under fees/slippage)");

  // Build rows (excluding cash; UI can append cash separately).
  const labels = args.labelsBySymbol ?? {};
  const rows: WhatIfRowV0[] = [];

  for (const id of ids) {
    const valueBefore = valueBeforeById.get(id) ?? 0;
    const valueAfter = valueAfterById.get(id) ?? 0;

    const currentPct = safeDiv(valueBefore, totalBefore);
    const targetPct = targetById.get(id) ?? 0;
    const postPct = safeDiv(valueAfter, totalAfter);
    const driftPct = postPct - targetPct;

    // Only show meaningful rows.
    if (valueBefore <= 0 && valueAfter <= 0 && Math.abs(targetPct) < 1e-12) continue;

    rows.push({
      id,
      label: String(labels[id] ?? id),
      valueBefore,
      valueAfter,
      currentPct,
      targetPct,
      postPct,
      driftPct,
    });
  }

  rows.sort((a, b) => Math.abs(b.driftPct) - Math.abs(a.driftPct));

  return {
    schemaVersion: 1,
    feeBps,
    slippageBps,
    costPct,
    costTotal,
    totalBefore,
    totalAfter,
    cashBefore: cashStartN,
    cashAfter,
    warnings,
    rows,
  };
}
