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
  // Optional NAV-based cap. Higher-level simulators can derive maxIn/maxOut from this value per day.
  maxOrderPctOfNav?: number;
  // Ignore tiny computed orders below this threshold.
  minNotional?: number;

  // Optional allowlist-style exclusion: ignore these symbols from holdings/prices/targetWeights.
  // Used by Funds hub rebalance E2E to skip unsupported or non-investable assets.
  assetBlacklist?: string[];
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

  // Optional UX override: emit extra BUY orders (in lot-size steps) to sweep excess cash down
  // toward the implicit cash buffer target (1 - sum(targetWeights)).
  //
  // This is intentionally opt-in so existing callers keep the strict "buy toward desired values" behavior.
  cashSweepToTarget?: boolean;
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
  assetKey?: string;
  symbol: string;
  market?: string;
  instrumentCurrency?: string;
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

function normalizeSymbolKey(x: unknown): string {
  return String(x ?? "").trim().toUpperCase();
}

function parseIsoMs(x: unknown): number {
  if (typeof x !== "string" || !x) return Number.NaN;
  const ms = Date.parse(x);
  return Number.isFinite(ms) ? ms : Number.NaN;
}

function normalizeHoldings(
  holdings: RebalanceCoreRequest["holdings"],
  warnings: string[],
  notes: string[],
  blacklist: Set<string>
): Record<string, number> {
  const excluded: string[] = [];

  if (Array.isArray(holdings)) {
    const out: Record<string, number> = {};
    for (const h of holdings) {
      const symbol = String((h as any)?.symbol ?? "").trim();
      const qty = toFiniteNumber((h as any)?.qty, 0);
      if (!symbol) continue;

      if (blacklist.has(normalizeSymbolKey(symbol))) {
        excluded.push(symbol);
        continue;
      }

      if (!Number.isFinite(qty)) {
        warnings.push(`warning: holding qty for ${symbol} is non-finite; treated as 0`);
        continue;
      }
      out[symbol] = (out[symbol] ?? 0) + qty;
    }

    if (excluded.length) {
      notes.push(`assetBlacklist: excluded holdings: ${excluded.map((s) => normalizeSymbolKey(s)).sort().join(", ")}`);
    }

    return out;
  }

  const out: Record<string, number> = {};
  for (const [symbolRaw, qtyRaw] of Object.entries(holdings ?? {})) {
    const symbol = String(symbolRaw ?? "").trim();
    if (!symbol) continue;

    if (blacklist.has(normalizeSymbolKey(symbol))) {
      excluded.push(symbol);
      continue;
    }

    const qty = toFiniteNumber(qtyRaw, 0);
    if (!Number.isFinite(qty)) {
      warnings.push(`warning: holding qty for ${symbol} is non-finite; treated as 0`);
      continue;
    }
    out[symbol] = qty;
  }

  if (excluded.length) {
    notes.push(`assetBlacklist: excluded holdings: ${excluded.map((s) => normalizeSymbolKey(s)).sort().join(", ")}`);
  }

  return out;
}

function normalizePrices(
  prices: RebalanceCoreRequest["prices"],
  warnings: string[],
  notes: string[],
  blacklist: Set<string>
): Record<string, number> {
  const excluded: string[] = [];

  if (Array.isArray(prices)) {
    const out: Record<string, number> = {};
    for (const p of prices) {
      const symbol = String((p as any)?.symbol ?? "").trim();
      const price = toFiniteNumber((p as any)?.price, Number.NaN);
      if (!symbol) continue;

      if (blacklist.has(normalizeSymbolKey(symbol))) {
        excluded.push(symbol);
        continue;
      }

      if (!Number.isFinite(price) || price <= 0) {
        warnings.push(`warning: price for ${symbol} must be > 0; got ${String((p as any)?.price)}`);
        continue;
      }
      out[symbol] = price;
    }

    if (excluded.length) {
      notes.push(`assetBlacklist: excluded prices: ${excluded.map((s) => normalizeSymbolKey(s)).sort().join(", ")}`);
    }

    return out;
  }

  const out: Record<string, number> = {};
  for (const [symbolRaw, priceRaw] of Object.entries(prices ?? {})) {
    const symbol = String(symbolRaw ?? "").trim();
    if (!symbol) continue;

    if (blacklist.has(normalizeSymbolKey(symbol))) {
      excluded.push(symbol);
      continue;
    }

    const price = toFiniteNumber(priceRaw, Number.NaN);
    if (!Number.isFinite(price) || price <= 0) {
      warnings.push(`warning: price for ${symbol} must be > 0; got ${String(priceRaw)}`);
      continue;
    }
    out[symbol] = price;
  }

  if (excluded.length) {
    notes.push(`assetBlacklist: excluded prices: ${excluded.map((s) => normalizeSymbolKey(s)).sort().join(", ")}`);
  }

  return out;
}

function normalizeTargetWeights(
  targetWeights: RebalanceCoreRequest["targetWeights"],
  warnings: string[],
  constraints: Required<RebalanceCoreConstraints>,
  blacklist: Set<string>
): {
  inputSum: number;
  finalSum: number;
  weights: { id: string; label: string; targetPct: number }[];
  notes: string[];
} {
  const notes: string[] = [];
  const excluded: string[] = [];

  const raw: { id: string; label: string; targetPct: number }[] = [];

  if (Array.isArray(targetWeights)) {
    for (const w of targetWeights) {
      const id = String((w as any)?.id ?? (w as any)?.symbol ?? "").trim();
      if (!id) continue;

      if (blacklist.has(normalizeSymbolKey(id))) {
        excluded.push(id);
        continue;
      }

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

      if (blacklist.has(normalizeSymbolKey(id))) {
        excluded.push(id);
        continue;
      }
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

  if (excluded.length) {
    notes.push(`assetBlacklist: excluded targetWeights: ${excluded.map((s) => normalizeSymbolKey(s)).sort().join(", ")}`);
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
  const notes: string[] = [];

  // Funds hub rebalance E2E: allow excluding symbols from holdings/prices/targets.
  const assetBlacklistSet = new Set<string>();
  const rawAssetBlacklist = (req?.constraints as any)?.assetBlacklist;
  if (Array.isArray(rawAssetBlacklist)) {
    for (const s of rawAssetBlacklist) {
      const key = normalizeSymbolKey(s);
      if (key) assetBlacklistSet.add(key);
    }
  }
  const assetBlacklist = Array.from(assetBlacklistSet).sort();
  const blacklist = new Set(assetBlacklist);

  if (assetBlacklist.length) notes.push(`assetBlacklist: ${assetBlacklist.join(", ")}`);

  const constraints: Required<RebalanceCoreConstraints> = {
    maxPositionPct: clamp01(toFiniteNumber(req?.constraints?.maxPositionPct, 1)),
    maxIn: Math.max(0, toFiniteNumber(req?.constraints?.maxIn, Number.POSITIVE_INFINITY)),
    maxOut: Math.max(0, toFiniteNumber(req?.constraints?.maxOut, Number.POSITIVE_INFINITY)),
    maxOrderPctOfNav: Math.max(0, toFiniteNumber(req?.constraints?.maxOrderPctOfNav, 1)),
    minNotional: Math.max(0, toFiniteNumber(req?.constraints?.minNotional, 1e-6)),
    assetBlacklist,
  };

  const policy: RebalanceTriggerPolicy = req?.policy && typeof req.policy === "object" && !Array.isArray(req.policy) ? req.policy : {};
  const thresholdPct = clamp01(toFiniteNumber(policy.thresholdPct, 0));
  const minTradeNotional = Math.max(0, toFiniteNumber(policy.minTradeNotional, 0));
  const cooldownSeconds = Math.max(0, toFiniteNumber(policy.cooldownSeconds, 0));
  const lastRebalanceAt = typeof policy.lastRebalanceAt === "string" ? policy.lastRebalanceAt : "";
  const now = typeof policy.now === "string" ? policy.now : "";

  const effectiveMinNotional = Math.max(constraints.minNotional, minTradeNotional);

  const holdings = normalizeHoldings(req.holdings, warnings, notes, blacklist);
  const prices = normalizePrices(req.prices, warnings, notes, blacklist);

  const tw = normalizeTargetWeights(req.targetWeights, warnings, constraints, blacklist);
  notes.push(...tw.notes);

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

  // notes accumulated above (blacklist + targetWeights normalization)

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

  // v0 UX realism: model notional lot sizes by rounding down to a step.
  // We reuse the effective minimum trade notional as the step, which matches
  // common "min order" + "increment" behavior for retail products.
  const lotStep = Number.isFinite(minN) && minN > 0 ? minN : 0;
  const roundDownToLot = (x: number) => {
    if (!(Number.isFinite(x) && x > 0) || !(lotStep > 0)) return x;
    const q = Math.floor(x / lotStep + 1e-12);
    return q * lotStep;
  };
  let roundedAny = false;

  // Exchange min-order-size behavior (v0): when we apply lot rounding (minTradeNotional as a lot step),
  // we can end up skipping a remainder that is smaller than the minimum. Capture those so the UI can
  // surface clear warnings instead of silently drifting.
  const minOrderRemainders: Array<{
    symbol: string;
    side: "BUY" | "SELL";
    rawNotional: number;
    roundedNotional: number;
    skippedNotional: number;
  }> = [];

  const minOrderSuppressed: Array<{
    symbol: string;
    side: "BUY" | "SELL";
    desiredNotional: number;
    cappedNotional: number;
    reason: string;
  }> = [];

  // Sells first to fund buys.
  const sellCandidates = Object.entries(deltas)
    .filter(([, d]) => d <= -minN)
    .map(([symbol, delta]) => ({ symbol, delta }))
    .sort((a, b) => a.delta - b.delta); // most negative first

  const orders: SuggestedOrder[] = [];
  let cashAvail = cashStart;

  for (const s of sellCandidates) {
    const cur = currentValues[s.symbol] ?? 0;
    if (cur <= 0) continue;

    const wantSell = Math.min(cur, -s.delta);
    const notionalRaw = Math.min(wantSell, constraints.maxOut);

    const notional = roundDownToLot(notionalRaw);
    const skippedNotional = notionalRaw - notional;

    if (notional !== notionalRaw) roundedAny = true;

    if (Number.isFinite(skippedNotional) && skippedNotional > 1e-9) {
      minOrderRemainders.push({
        symbol: s.symbol,
        side: "SELL",
        rawNotional: notionalRaw,
        roundedNotional: notional,
        skippedNotional,
      });
    }

    if (!(Number.isFinite(notional) && notional >= minN)) {
      if (Number.isFinite(wantSell) && wantSell >= minN) {
        minOrderSuppressed.push({
          symbol: s.symbol,
          side: "SELL",
          desiredNotional: wantSell,
          cappedNotional: notionalRaw,
          reason: notionalRaw < minN ? "capped-below-min" : "rounded-below-min",
        });
      }
      continue;
    }

    const remainderHint =
      Number.isFinite(skippedNotional) && skippedNotional > 1e-9
        ? `; skippedRemainder≈${skippedNotional.toFixed(2)} (<minTradeNotional=${minN.toFixed(2)})`
        : "";

    orders.push({
      symbol: s.symbol,
      side: "SELL",
      notional,
      reason: `rebalance: overweight by ${(-s.delta).toFixed(2)} notional; sell=${notional.toFixed(2)} (cap maxOut=${String(constraints.maxOut)})${remainderHint}`,
    });

    cashAvail += notional;
  }

  const cashAfterSells = cashAvail;

  const buyCandidates = Object.entries(deltas)
    .filter(([, d]) => d >= minN)
    .map(([symbol, delta]) => ({ symbol, delta }))
    .sort((a, b) => b.delta - a.delta);

  for (const b of buyCandidates) {
    if (cashAvail < minN) break;

    const px = prices[b.symbol];
    if (!Number.isFinite(px) || px <= 0) {
      warnings.push(`warning: missing price for target ${b.symbol}; cannot compute buy order`);
      continue;
    }

    const wantBuy = b.delta;
    const cappedRaw = Math.min(wantBuy, constraints.maxIn, cashAvail);

    const capped = roundDownToLot(cappedRaw);
    const skippedNotional = cappedRaw - capped;

    if (capped !== cappedRaw) roundedAny = true;

    if (Number.isFinite(skippedNotional) && skippedNotional > 1e-9) {
      minOrderRemainders.push({
        symbol: b.symbol,
        side: "BUY",
        rawNotional: cappedRaw,
        roundedNotional: capped,
        skippedNotional,
      });
    }

    if (!(Number.isFinite(capped) && capped >= minN)) {
      if (Number.isFinite(wantBuy) && wantBuy >= minN) {
        minOrderSuppressed.push({
          symbol: b.symbol,
          side: "BUY",
          desiredNotional: wantBuy,
          cappedNotional: cappedRaw,
          reason: cappedRaw < minN ? "capped-below-min" : "rounded-below-min",
        });
      }
      continue;
    }

    const remainderHint =
      Number.isFinite(skippedNotional) && skippedNotional > 1e-9
        ? `; skippedRemainder≈${skippedNotional.toFixed(2)} (<minTradeNotional=${minN.toFixed(2)})`
        : "";

    orders.push({
      symbol: b.symbol,
      side: "BUY",
      notional: capped,
      reason: `rebalance: underweight by ${b.delta.toFixed(2)} notional; buy=${capped.toFixed(2)} (cap maxIn=${String(constraints.maxIn)})${remainderHint}`,
    });

    cashAvail -= capped;
  }

  // Surface min-order-size effects (split/skip) as warnings so the funds hub UI can show them.
  if (minOrderRemainders.length || minOrderSuppressed.length) {
    if (minOrderRemainders.length && lotStep > 0) {
      notes.push(
        `min order size: ${minOrderRemainders.length} order(s) rounded down to lot step=${lotStep}; small remainders may be skipped`
      );

      const top = [...minOrderRemainders]
        .filter((x) => Number.isFinite(x.skippedNotional) && x.skippedNotional > 1e-9)
        .sort((a, b) => b.skippedNotional - a.skippedNotional)
        .slice(0, 6);

      for (const x of top) {
        warnings.push(
          `warning: min order size: ${x.side} ${x.symbol} rounded ${x.rawNotional.toFixed(2)} -> ${x.roundedNotional.toFixed(2)}; skipped ${x.skippedNotional.toFixed(2)} (<minTradeNotional=${minN.toFixed(2)})`
        );
      }

      if (minOrderRemainders.length > top.length) {
        warnings.push(`warning: min order size: ${minOrderRemainders.length - top.length} more rounded remainder(s) omitted`);
      }
    }

    if (minOrderSuppressed.length) {
      notes.push(`min order size: suppressed ${minOrderSuppressed.length} candidate order(s) that could not meet minTradeNotional=${minN.toFixed(2)}`);

      const top = [...minOrderSuppressed]
        .filter((x) => Number.isFinite(x.desiredNotional) && x.desiredNotional > 0)
        .sort((a, b) => b.desiredNotional - a.desiredNotional)
        .slice(0, 6);

      for (const x of top) {
        warnings.push(
          `warning: min order size: suppressed ${x.side} ${x.symbol}; desired≈${x.desiredNotional.toFixed(2)}, capped≈${x.cappedNotional.toFixed(2)} (<minTradeNotional=${minN.toFixed(2)}; reason=${x.reason})`
        );
      }

      if (minOrderSuppressed.length > top.length) {
        warnings.push(`warning: min order size: ${minOrderSuppressed.length - top.length} more suppressed candidate(s) omitted`);
      }
    }
  }

  let cashEnd = cashAvail;

  // Optional: if the caller wants to enforce a target cash buffer (implicit cash), emit extra
  // BUY orders (in lot-size steps) to reduce excess cash.
  const cashSweepToTarget = !!(policy as any).cashSweepToTarget;
  if (cashSweepToTarget) {
    const desiredCashAbs = equity * Math.max(0, 1 - tw.finalSum);
    const step = lotStep > 0 ? lotStep : minN;

    if (Number.isFinite(desiredCashAbs) && Number.isFinite(step) && step > 0) {
      const maxSweepOrders = 25;
      let sweptNotional = 0;

      // Track post-order valuations in notional space (no price conversion needed).
      const postValues: Record<string, number> = { ...currentValues };
      for (const o of orders) {
        const sym = String((o as any)?.symbol ?? "").trim();
        if (!sym) continue;
        const n = toFiniteNumber((o as any)?.notional, 0);
        if (!Number.isFinite(n) || n <= 0) continue;
        if ((o as any)?.side === "SELL") postValues[sym] = Math.max(0, (postValues[sym] ?? 0) - n);
        if ((o as any)?.side === "BUY") postValues[sym] = (postValues[sym] ?? 0) + n;
      }

      // Prefer buying the most underweight symbol; if everything is already at/above target,
      // buy the highest target-weight symbol.
      const candidates = tw.weights.filter((w) => Number.isFinite(w.targetPct) && w.targetPct > 0);

      while (orders.length < maxSweepOrders && cashEnd - desiredCashAbs >= step - 1e-9) {
        let bestSym = "";
        let bestLabel = "";
        let bestTargetPct = -1;
        let bestDelta = Number.NEGATIVE_INFINITY;
        let anyUnder = false;

        for (const w of candidates) {
          const sym = w.id;
          if (!sym) continue;

          const px = prices[sym];
          if (!(Number.isFinite(px) && px > 0)) continue;

          const want = desiredValues[sym] ?? 0;
          const cur = postValues[sym] ?? 0;
          const d = want - cur;

          if (d > 0) anyUnder = true;

          if (anyUnder) {
            if (d > bestDelta || (d === bestDelta && sym.localeCompare(bestSym) < 0)) {
              bestSym = sym;
              bestLabel = w.label ?? sym;
              bestDelta = d;
              bestTargetPct = w.targetPct;
            }
          } else {
            if (w.targetPct > bestTargetPct || (w.targetPct === bestTargetPct && sym.localeCompare(bestSym) < 0)) {
              bestSym = sym;
              bestLabel = w.label ?? sym;
              bestTargetPct = w.targetPct;
              bestDelta = d;
            }
          }
        }

        if (!bestSym) break;

        const cashExcess = cashEnd - desiredCashAbs;
        const raw = Math.min(cashExcess, constraints.maxIn);
        if (!(Number.isFinite(raw) && raw >= step)) break;

        const target = Math.min(raw, Math.max(step, bestDelta));
        const notional = roundDownToLot(target);
        if (!(Number.isFinite(notional) && notional >= step)) break;

        orders.push({
          symbol: bestSym,
          side: "BUY",
          notional,
          reason: `cash sweep: invest excess cash toward target buffer; desiredCash≈${desiredCashAbs.toFixed(2)}; buy=${notional.toFixed(2)} (${bestLabel})`,
        });

        postValues[bestSym] = (postValues[bestSym] ?? 0) + notional;
        cashEnd -= notional;
        sweptNotional += notional;
      }

      if (sweptNotional > 0) {
        notes.push(
          `cash sweep: enabled; desiredCash≈${desiredCashAbs.toFixed(2)}; swept≈${sweptNotional.toFixed(2)}; cashEnd≈${cashEnd.toFixed(2)}`
        );
      }

      if (orders.length >= maxSweepOrders) {
        warnings.push(`warning: cash sweep stopped at maxSweepOrders=${maxSweepOrders}`);
      }
    }
  }

  if (roundedAny && lotStep > 0) {
    notes.push(`applied lot rounding step=${lotStep}; orders rounded down to multiples of step`);
  }

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

  const eligibleOrders = orders.filter((o) => Number.isFinite(o.notional) && o.notional >= minN);
  const eligibleNotionalSum = eligibleOrders.reduce((acc, o) => acc + o.notional, 0);
  if (!eligibleOrders.length) reasons.push(`minTradeNotional: no orders >= ${minN}`);

  // UX hint: if the drift threshold is met but the engine produces no eligible orders,
  // it's usually because minTradeNotional/lot sizing (or caps/cash) suppresses them.
  if (!eligibleOrders.length && Number.isFinite(minN) && minN > 0 && maxAbsDriftSymbol) {
    const maxAbsDeltaNotional = Math.abs(toFiniteNumber(deltas[maxAbsDriftSymbol], 0));

    // If even the largest delta is smaller than the min trade size, nothing can be emitted.
    if (Number.isFinite(maxAbsDeltaNotional) && maxAbsDeltaNotional > 0 && maxAbsDeltaNotional < minN) {
      warnings.push(
        `warning: minTradeNotional=${minN.toFixed(2)} blocks all trades; maxAbsDeltaNotional=${maxAbsDeltaNotional.toFixed(2)} (symbol=${maxAbsDriftSymbol}). Consider lowering minTradeNotional or increasing equity/adjusting targets.`
      );
    } else {
      // Otherwise, highlight common blockers.
      if (buyCandidates.length && cashAfterSells < minN) {
        warnings.push(
          `warning: insufficient cash for minTradeNotional=${minN.toFixed(2)}; cashAvail=${cashAfterSells.toFixed(2)}. Consider lowering minTradeNotional or selling overweight assets first.`
        );
      }
      if (buyCandidates.length && Number.isFinite(constraints.maxIn) && constraints.maxIn < minN) {
        warnings.push(
          `warning: constraints.maxIn=${constraints.maxIn.toFixed(2)} < minTradeNotional=${minN.toFixed(2)}; BUY orders may be suppressed. Consider raising maxIn or lowering minTradeNotional.`
        );
      }
      if (sellCandidates.length && Number.isFinite(constraints.maxOut) && constraints.maxOut < minN) {
        warnings.push(
          `warning: constraints.maxOut=${constraints.maxOut.toFixed(2)} < minTradeNotional=${minN.toFixed(2)}; SELL orders may be suppressed. Consider raising maxOut or lowering minTradeNotional.`
        );
      }
    }
  }

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
