export type RebalanceCoreAccount = {
  baseCcy?: string;
  cash?: number;
  // When omitted, totalEquity defaults to market value of holdings + cash.
  totalEquity?: number;
};

export type RebalanceCoreConstraints = {
  // Per-symbol cap for the desired target weight. Any leftover becomes implicit cash.
  maxPositionPct?: number;
  // Per-order notional caps (v0 heuristic, aligned with existing engine simulate behavior).
  maxIn?: number;
  maxOut?: number;
  // Ignore tiny computed orders below this threshold.
  minNotional?: number;
};

export type RebalanceTriggerPolicy = {
  // Minimum max-per-symbol drift (|desired-current| / equity) required to trigger a rebalance.
  thresholdPct?: number;
  // Minimum per-order notional. If larger than constraints.minNotional, it overrides it.
  minTradeNotional?: number;
  // Cooldown window after a prior rebalance; during cooldown, shouldRebalance=false.
  cooldownSeconds?: number;
  // ISO timestamp for last rebalance; used only when cooldownSeconds > 0.
  lastRebalanceAt?: string;
  // Optional ISO timestamp to make the decision deterministic in tests/UI.
  now?: string;
};

export type RebalanceTriggerDecision = {
  shouldRebalance: boolean;
  reasons: string[];
  stats: {
    equity: number;
    thresholdPct: number;
    minTradeNotional: number;
    cooldownSeconds: number;
    maxAbsDriftPct: number;
    maxAbsDriftSymbol: string | null;
    orderCount: number;
    eligibleOrderCount: number;
    eligibleNotionalSum: number;
  };
};

export type RebalanceCoreHolding = {
  symbol: string;
  qty: number;
};

export type RebalanceCorePrice = {
  symbol: string;
  price: number;
};

export type RebalanceCoreTargetWeight = {
  id: string;
  label?: string;
  targetPct: number;
};

export type SuggestedOrder = {
  symbol: string;
  side: "BUY" | "SELL";
  notional: number;
  reason: string;
};

export type RebalanceCoreRequest = {
  account?: RebalanceCoreAccount;
  constraints?: RebalanceCoreConstraints;
  // Policy layer to decide whether the computed orders should actually trigger a rebalance.
  policy?: RebalanceTriggerPolicy;
  // Accept either an array or a map for convenience in copy/paste JSON.
  holdings: RebalanceCoreHolding[] | Record<string, number>;
  prices: RebalanceCorePrice[] | Record<string, number>;
  targetWeights: RebalanceCoreTargetWeight[] | Record<string, number>;
};

export type RebalanceCoreExplain = {
  equity: number;
  cashStart: number;
  cashAfterSells: number;
  cashEnd: number;
  targetSumInput: number;
  targetSumFinal: number;
  notes: string[];
  currentValues: Record<string, number>;
  desiredValues: Record<string, number>;
  deltas: Record<string, number>;
};

export type RebalanceCoreResponse = {
  orders: SuggestedOrder[];
  targetWeights: { id: string; label: string; targetPct: number }[];
  warnings: string[];
  explain: RebalanceCoreExplain;
  trigger: RebalanceTriggerDecision;
};

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function toFiniteNumber(x: unknown, fallback: number): number {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function parseIsoMs(x: unknown): number {
  if (typeof x !== "string" || !x) return Number.NaN;
  const ms = Date.parse(x);
  return Number.isFinite(ms) ? ms : Number.NaN;
}

function normalizeHoldings(holdings: RebalanceCoreRequest["holdings"], warnings: string[]): Record<string, number> {
  if (Array.isArray(holdings)) {
    const out: Record<string, number> = {};
    for (const h of holdings) {
      const symbol = String((h as any)?.symbol ?? "").trim();
      const qty = toFiniteNumber((h as any)?.qty, 0);
      if (!symbol) continue;
      if (!Number.isFinite(qty)) {
        warnings.push(`warning: holding qty for ${symbol} is non-finite; treated as 0`);
        continue;
      }
      out[symbol] = (out[symbol] ?? 0) + qty;
    }
    return out;
  }

  const out: Record<string, number> = {};
  for (const [symbolRaw, qtyRaw] of Object.entries(holdings ?? {})) {
    const symbol = String(symbolRaw ?? "").trim();
    if (!symbol) continue;
    const qty = toFiniteNumber(qtyRaw, 0);
    if (!Number.isFinite(qty)) {
      warnings.push(`warning: holding qty for ${symbol} is non-finite; treated as 0`);
      continue;
    }
    out[symbol] = qty;
  }
  return out;
}

function normalizePrices(prices: RebalanceCoreRequest["prices"], warnings: string[]): Record<string, number> {
  if (Array.isArray(prices)) {
    const out: Record<string, number> = {};
    for (const p of prices) {
      const symbol = String((p as any)?.symbol ?? "").trim();
      const price = toFiniteNumber((p as any)?.price, Number.NaN);
      if (!symbol) continue;
      if (!Number.isFinite(price) || price <= 0) {
        warnings.push(`warning: price for ${symbol} must be > 0; got ${String((p as any)?.price)}`);
        continue;
      }
      out[symbol] = price;
    }
    return out;
  }

  const out: Record<string, number> = {};
  for (const [symbolRaw, priceRaw] of Object.entries(prices ?? {})) {
    const symbol = String(symbolRaw ?? "").trim();
    if (!symbol) continue;
    const price = toFiniteNumber(priceRaw, Number.NaN);
    if (!Number.isFinite(price) || price <= 0) {
      warnings.push(`warning: price for ${symbol} must be > 0; got ${String(priceRaw)}`);
      continue;
    }
    out[symbol] = price;
  }
  return out;
}

function normalizeTargetWeights(
  targetWeights: RebalanceCoreRequest["targetWeights"],
  warnings: string[],
  constraints: Required<RebalanceCoreConstraints>
): {
  inputSum: number;
  finalSum: number;
  weights: { id: string; label: string; targetPct: number }[];
  notes: string[];
} {
  const notes: string[] = [];

  const raw: { id: string; label: string; targetPct: number }[] = [];

  if (Array.isArray(targetWeights)) {
    for (const w of targetWeights) {
      const id = String((w as any)?.id ?? (w as any)?.symbol ?? "").trim();
      if (!id) continue;

      const label = String((w as any)?.label ?? id).trim() || id;
      const targetPctRaw = (w as any)?.targetPct ?? (w as any)?.target_pct ?? (w as any)?.weight;
      const targetPctNum = toFiniteNumber(targetPctRaw, 0);

      if (!Number.isFinite(targetPctNum)) {
        warnings.push(`warning: targetPct for ${id} is non-finite; treated as 0`);
        raw.push({ id, label, targetPct: 0 });
        continue;
      }

      const clamped = clamp01(targetPctNum);
      if (clamped !== targetPctNum) warnings.push(`warning: targetPct for ${id} out of range; clamped from ${targetPctNum} to ${clamped}`);
      raw.push({ id, label, targetPct: clamped });
    }
  } else {
    for (const [idRaw, targetPctRaw] of Object.entries(targetWeights ?? {})) {
      const id = String(idRaw ?? "").trim();
      if (!id) continue;
      const targetPctNum = toFiniteNumber(targetPctRaw, 0);
      if (!Number.isFinite(targetPctNum)) {
        warnings.push(`warning: targetPct for ${id} is non-finite; treated as 0`);
        raw.push({ id, label: id, targetPct: 0 });
        continue;
      }

      const clamped = clamp01(targetPctNum);
      if (clamped !== targetPctNum) warnings.push(`warning: targetPct for ${id} out of range; clamped from ${targetPctNum} to ${clamped}`);
      raw.push({ id, label: id, targetPct: clamped });
    }
  }

  const inputSum = raw.reduce((acc, w) => acc + (Number.isFinite(w.targetPct) ? w.targetPct : 0), 0);

  // Normalize only when sum > 1; when sum < 1, remainder is implicit cash.
  let weights = raw;
  if (inputSum > 1.000001) {
    notes.push(`input target weights sum to ${(inputSum * 100).toFixed(2)}%; normalized down to 100%`);
    weights = raw.map((w) => ({ ...w, targetPct: inputSum > 0 ? w.targetPct / inputSum : 0 }));
  }

  // Apply per-symbol cap.
  if (Number.isFinite(constraints.maxPositionPct) && constraints.maxPositionPct < 1) {
    let cappedAny = false;
    weights = weights.map((w) => {
      const capped = Math.min(w.targetPct, constraints.maxPositionPct);
      if (capped !== w.targetPct) cappedAny = true;
      return { ...w, targetPct: capped };
    });
    if (cappedAny) notes.push(`applied maxPositionPct=${constraints.maxPositionPct}; remainder becomes implicit cash`);
  }

  // If capping caused sum > 1 (possible with many symbols + maxPositionPct), normalize again.
  const sumAfterCap = weights.reduce((acc, w) => acc + w.targetPct, 0);
  if (sumAfterCap > 1.000001) {
    notes.push(`capped weights sum to ${(sumAfterCap * 100).toFixed(2)}%; normalized down to 100%`);
    weights = weights.map((w) => ({ ...w, targetPct: sumAfterCap > 0 ? w.targetPct / sumAfterCap : 0 }));
  }

  const finalSum = weights.reduce((acc, w) => acc + w.targetPct, 0);

  // Sort for stable UI.
  weights.sort((a, b) => b.targetPct - a.targetPct || a.id.localeCompare(b.id));

  return { inputSum, finalSum, weights, notes };
}

export function rebalanceCore(req: RebalanceCoreRequest): RebalanceCoreResponse {
  const warnings: string[] = [];

  const cashStart = Math.max(0, toFiniteNumber(req?.account?.cash, 0));

  const constraints: Required<RebalanceCoreConstraints> = {
    maxPositionPct: clamp01(toFiniteNumber(req?.constraints?.maxPositionPct, 1)),
    maxIn: Math.max(0, toFiniteNumber(req?.constraints?.maxIn, Number.POSITIVE_INFINITY)),
    maxOut: Math.max(0, toFiniteNumber(req?.constraints?.maxOut, Number.POSITIVE_INFINITY)),
    minNotional: Math.max(0, toFiniteNumber(req?.constraints?.minNotional, 1e-6)),
  };

  const policy: RebalanceTriggerPolicy = req?.policy && typeof req.policy === "object" && !Array.isArray(req.policy) ? req.policy : {};
  const thresholdPct = clamp01(toFiniteNumber(policy.thresholdPct, 0));
  const minTradeNotional = Math.max(0, toFiniteNumber(policy.minTradeNotional, 0));
  const cooldownSeconds = Math.max(0, toFiniteNumber(policy.cooldownSeconds, 0));
  const lastRebalanceAt = typeof policy.lastRebalanceAt === "string" ? policy.lastRebalanceAt : "";
  const now = typeof policy.now === "string" ? policy.now : "";

  const effectiveMinNotional = Math.max(constraints.minNotional, minTradeNotional);

  const holdings = normalizeHoldings(req.holdings, warnings);
  const prices = normalizePrices(req.prices, warnings);

  const tw = normalizeTargetWeights(req.targetWeights, warnings, constraints);

  const currentValues: Record<string, number> = {};
  for (const [sym, qty] of Object.entries(holdings)) {
    const px = prices[sym];
    if (!Number.isFinite(px) || px <= 0) {
      warnings.push(`warning: missing price for holding ${sym}; excluded from valuation`);
      continue;
    }
    const v = qty * px;
    if (!Number.isFinite(v)) {
      warnings.push(`warning: non-finite valuation for holding ${sym}; excluded from valuation`);
      continue;
    }
    currentValues[sym] = v;
  }

  const holdingsValue = Object.values(currentValues).reduce((acc, v) => acc + v, 0);

  const equityInput = toFiniteNumber(req?.account?.totalEquity, Number.NaN);
  const equity = Number.isFinite(equityInput) && equityInput > 0 ? equityInput : holdingsValue + cashStart;

  const notes: string[] = [...tw.notes];

  if (!(Number.isFinite(equity) && equity > 0)) {
    warnings.push("warning: total equity is not positive; no rebalance possible");
    return {
      orders: [],
      targetWeights: tw.weights,
      warnings,
      explain: {
        equity: 0,
        cashStart,
        cashAfterSells: cashStart,
        cashEnd: cashStart,
        targetSumInput: tw.inputSum,
        targetSumFinal: tw.finalSum,
        notes,
        currentValues,
        desiredValues: {},
        deltas: {},
      },
      trigger: {
        shouldRebalance: false,
        reasons: ["equity: non-positive"],
        stats: {
          equity: 0,
          thresholdPct,
          minTradeNotional: effectiveMinNotional,
          cooldownSeconds,
          maxAbsDriftPct: 0,
          maxAbsDriftSymbol: null,
          orderCount: 0,
          eligibleOrderCount: 0,
          eligibleNotionalSum: 0,
        },
      },
    };
  }

  if (Number.isFinite(equityInput) && equityInput > 0) {
    const impliedEquity = holdingsValue + cashStart;
    if (Number.isFinite(impliedEquity) && impliedEquity > 0) {
      const gap = Math.abs(impliedEquity - equityInput) / equityInput;
      if (gap > 0.05) warnings.push(`warning: account.totalEquity differs from holdings value + cash by ${(gap * 100).toFixed(1)}%`);
    }
  }

  const desiredValues: Record<string, number> = {};
  for (const w of tw.weights) {
    desiredValues[w.id] = equity * w.targetPct;
  }

  // Include symbols that are held but not in targetWeights; their desired value is 0 (sell down).
  for (const sym of Object.keys(currentValues)) {
    if (!(sym in desiredValues)) desiredValues[sym] = 0;
  }

  const deltas: Record<string, number> = {};
  for (const sym of Object.keys(desiredValues)) {
    const cur = currentValues[sym] ?? 0;
    const want = desiredValues[sym] ?? 0;
    deltas[sym] = want - cur;
  }

  const minN = effectiveMinNotional;

  // Sells first to fund buys.
  const sellCandidates = Object.entries(deltas)
    .filter(([, d]) => d < -minN)
    .map(([symbol, delta]) => ({ symbol, delta }))
    .sort((a, b) => a.delta - b.delta); // most negative first

  const orders: SuggestedOrder[] = [];
  let cashAvail = cashStart;

  for (const s of sellCandidates) {
    const cur = currentValues[s.symbol] ?? 0;
    if (cur <= 0) continue;

    const wantSell = Math.min(cur, -s.delta);
    const notional = Math.min(wantSell, constraints.maxOut);
    if (!(Number.isFinite(notional) && notional > minN)) continue;

    orders.push({
      symbol: s.symbol,
      side: "SELL",
      notional,
      reason: `rebalance: overweight by ${(-s.delta).toFixed(2)} notional; sell=${notional.toFixed(2)} (cap maxOut=${String(constraints.maxOut)})`,
    });

    cashAvail += notional;
  }

  const cashAfterSells = cashAvail;

  const buyCandidates = Object.entries(deltas)
    .filter(([, d]) => d > minN)
    .map(([symbol, delta]) => ({ symbol, delta }))
    .sort((a, b) => b.delta - a.delta);

  for (const b of buyCandidates) {
    if (cashAvail <= minN) break;

    const px = prices[b.symbol];
    if (!Number.isFinite(px) || px <= 0) {
      warnings.push(`warning: missing price for target ${b.symbol}; cannot compute buy order`);
      continue;
    }

    const wantBuy = b.delta;
    const capped = Math.min(wantBuy, constraints.maxIn, cashAvail);
    if (!(Number.isFinite(capped) && capped > minN)) continue;

    orders.push({
      symbol: b.symbol,
      side: "BUY",
      notional: capped,
      reason: `rebalance: underweight by ${b.delta.toFixed(2)} notional; buy=${capped.toFixed(2)} (cap maxIn=${String(constraints.maxIn)})`,
    });

    cashAvail -= capped;
  }

  const cashEnd = cashAvail;

  if (tw.finalSum < 0.999) {
    notes.push(`target weights sum to ${(tw.finalSum * 100).toFixed(2)}%; remaining ${(100 - tw.finalSum * 100).toFixed(2)}% is implicit cash`);
  }

  // Trigger policy (v0): decide whether we should actually rebalance based on
  // drift threshold, minimum trade size, and a cooldown window.
  let maxAbsDriftPct = 0;
  let maxAbsDriftSymbol: string | null = null;
  for (const [sym, delta] of Object.entries(deltas)) {
    if (!Number.isFinite(delta)) continue;
    const pct = Math.abs(delta) / equity;
    if (pct > maxAbsDriftPct) {
      maxAbsDriftPct = pct;
      maxAbsDriftSymbol = sym;
    }
  }

  const reasons: string[] = [];

  const driftOk = thresholdPct <= 0 || maxAbsDriftPct >= thresholdPct;
  if (!driftOk) {
    reasons.push(
      `threshold: maxAbsDriftPct ${(maxAbsDriftPct * 100).toFixed(2)}% < thresholdPct ${(thresholdPct * 100).toFixed(2)}%`
    );
  }

  const eligibleOrders = orders.filter((o) => Number.isFinite(o.notional) && o.notional > minN);
  const eligibleNotionalSum = eligibleOrders.reduce((acc, o) => acc + o.notional, 0);
  if (!eligibleOrders.length) reasons.push(`minTradeNotional: no orders > ${minN}`);

  let cooldownOk = true;
  if (cooldownSeconds > 0) {
    const nowMs = parseIsoMs(now || new Date().toISOString());
    const lastMs = parseIsoMs(lastRebalanceAt);

    if (Number.isFinite(nowMs) && Number.isFinite(lastMs)) {
      const elapsed = (nowMs - lastMs) / 1000;
      if (elapsed < cooldownSeconds) {
        cooldownOk = false;
        const remain = cooldownSeconds - Math.max(0, elapsed);
        reasons.push(`cooldown: last rebalance ${elapsed.toFixed(0)}s ago; wait ${remain.toFixed(0)}s`);
      }
    } else {
      reasons.push(`cooldown: configured (${cooldownSeconds}s) but missing/invalid timestamps; ignored`);
    }
  }

  const shouldRebalance = driftOk && cooldownOk && eligibleOrders.length > 0;
  if (shouldRebalance) reasons.push("trigger: ok");

  const trigger: RebalanceTriggerDecision = {
    shouldRebalance,
    reasons,
    stats: {
      equity,
      thresholdPct,
      minTradeNotional: minN,
      cooldownSeconds,
      maxAbsDriftPct,
      maxAbsDriftSymbol,
      orderCount: orders.length,
      eligibleOrderCount: eligibleOrders.length,
      eligibleNotionalSum,
    },
  };

  return {
    orders,
    targetWeights: tw.weights,
    warnings,
    explain: {
      equity,
      cashStart,
      cashAfterSells,
      cashEnd,
      targetSumInput: tw.inputSum,
      targetSumFinal: tw.finalSum,
      notes,
      currentValues,
      desiredValues,
      deltas,
    },
    trigger,
  };
}
