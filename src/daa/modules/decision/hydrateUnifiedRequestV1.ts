import { buildOpportunityPanelV1, type DaaOpportunityPanelV1 } from "@/src/daa/signals/opportunityServiceV1";
import type { DaaTechnicalSignalV1 } from "@/src/daa/signals/technicalSignalV1";
import { listDaaFxRatesV1, listDaaWatchlistCandidatesV1 } from "@/src/daa/store/daaStorePgV1";
import type {
  DaaUnifiedPositionV1,
  DaaUnifiedFxRateV1,
  DaaUnifiedHumanSignalV1,
  DaaUnifiedRequestV1,
  DaaUnifiedWatchlistCandidateV1,
} from "@/src/daa/unifiedRebalanceV1";

export type HydrateUnifiedRequestResultV1 = {
  request: DaaUnifiedRequestV1;
  opportunityPanel: DaaOpportunityPanelV1;
  diagnostics: {
    addedTargets: string[];
    candidateCount: number;
    fxRateCount: number;
  };
};

function normalizeSymbol(value: unknown): string {
  return String(value || "").trim().toUpperCase();
}

function normalizeCurrency(value: unknown, fallback = "USD"): string {
  const code = String(value || "").trim().toUpperCase();
  return code || fallback;
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

function normalizeWatchlistCandidate(candidate: Partial<DaaUnifiedWatchlistCandidateV1>): DaaUnifiedWatchlistCandidateV1 | null {
  const symbol = normalizeSymbol(candidate.symbol);
  if (!symbol) return null;
  return {
    symbol,
    market: String(candidate.market || "US").trim().toUpperCase() || "US",
    currency: normalizeCurrency(candidate.currency, "USD"),
    targetWeightHint: clamp(Number(candidate.targetWeightHint ?? 0) || 0, 0, 1),
    enabled: candidate.enabled !== false,
    tags: Array.isArray(candidate.tags) ? candidate.tags.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean) : [],
    notes: String(candidate.notes || "").trim() || undefined,
  };
}

function mergeWatchlistCandidates(
  requestCandidates: DaaUnifiedWatchlistCandidateV1[] | undefined,
  persistedCandidates: Array<Partial<DaaUnifiedWatchlistCandidateV1>>,
): DaaUnifiedWatchlistCandidateV1[] {
  const map = new Map<string, DaaUnifiedWatchlistCandidateV1>();

  for (const raw of persistedCandidates) {
    const normalized = normalizeWatchlistCandidate(raw);
    if (!normalized || normalized.enabled === false) continue;
    map.set(`${normalized.symbol}::${normalized.market}`, normalized);
  }

  for (const raw of requestCandidates ?? []) {
    const normalized = normalizeWatchlistCandidate(raw);
    if (!normalized) continue;
    map.set(`${normalized.symbol}::${normalized.market}`, normalized);
  }

  return [...map.values()].filter((item) => item.enabled !== false);
}

function normalizePosition(position: Partial<DaaUnifiedPositionV1>): DaaUnifiedPositionV1 | null {
  const symbol = normalizeSymbol(position.symbol);
  if (!symbol) return null;
  return {
    symbol,
    market: String(position.market || "US").trim().toUpperCase() || "US",
    currency: normalizeCurrency(position.currency, "USD"),
    qty: Math.max(0, Number(position.qty) || 0),
    price: Math.max(0, Number(position.price) || 0),
    costBasis: Math.max(0, Number(position.costBasis) || 0),
    tags: Array.isArray(position.tags) ? position.tags.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean) : [],
    liquidityNotional24h: Math.max(0, Number(position.liquidityNotional24h) || 0),
  };
}

function inferMarketBySymbol(symbol: string): string {
  const normalized = normalizeSymbol(symbol);
  if (normalized.endsWith(".HK")) return "HK";
  if (normalized.endsWith(".SS") || normalized.endsWith(".SZ")) return "CN";
  if (normalized.includes("-USD")) return "CRYPTO";
  return "US";
}

function inferCurrencyByMarket(market: string): string {
  const normalized = String(market || "").trim().toUpperCase();
  if (normalized === "HK") return "HKD";
  if (normalized === "CN") return "CNY";
  return "USD";
}

function buildTechPriceMap(signals: DaaTechnicalSignalV1[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const signal of signals) {
    const symbol = normalizeSymbol(signal.symbol);
    const close = Math.max(0, Number(signal.metrics?.close) || 0);
    if (!symbol || close <= 0) continue;
    map.set(symbol, close);
  }
  return map;
}

function enrichPositionsWithSignals(
  positions: DaaUnifiedPositionV1[] | undefined,
  targetWeights: Record<string, number>,
  candidates: DaaUnifiedWatchlistCandidateV1[],
  technicalSignals: DaaTechnicalSignalV1[],
): DaaUnifiedPositionV1[] {
  const out = new Map<string, DaaUnifiedPositionV1>();
  const candidateMap = new Map(candidates.map((item) => [normalizeSymbol(item.symbol), item]));
  const techPriceMap = buildTechPriceMap(technicalSignals);

  for (const raw of positions ?? []) {
    const normalized = normalizePosition(raw);
    if (!normalized) continue;
    out.set(normalized.symbol, normalized);
  }

  for (const symbolRaw of Object.keys(targetWeights ?? {})) {
    const symbol = normalizeSymbol(symbolRaw);
    if (!symbol) continue;
    const existing = out.get(symbol);
    const candidate = candidateMap.get(symbol);
    const signalPrice = techPriceMap.get(symbol);

    if (existing) {
      if (existing.price > 0) continue;
      if (!(signalPrice && signalPrice > 0)) continue;
      out.set(symbol, {
        ...existing,
        price: signalPrice,
        market: existing.market || candidate?.market || inferMarketBySymbol(symbol),
        currency: existing.currency || candidate?.currency || inferCurrencyByMarket(existing.market || candidate?.market || inferMarketBySymbol(symbol)),
      });
      continue;
    }

    if (!(signalPrice && signalPrice > 0)) continue;
    const market = candidate?.market || inferMarketBySymbol(symbol);
    const currency = candidate?.currency || inferCurrencyByMarket(market);
    out.set(symbol, {
      symbol,
      market,
      currency,
      qty: 0,
      price: signalPrice,
      costBasis: 0,
      tags: [...(candidate?.tags ?? [])],
      liquidityNotional24h: 0,
    });
  }

  return [...out.values()];
}

function mergeHumanSignals(
  provided: DaaUnifiedHumanSignalV1[] | undefined,
  fused: DaaUnifiedHumanSignalV1[],
): DaaUnifiedHumanSignalV1[] {
  if (!Array.isArray(provided) || provided.length === 0) return fused;

  const map = new Map<string, DaaUnifiedHumanSignalV1>();
  for (const item of fused) {
    const symbol = normalizeSymbol(item.symbol);
    if (!symbol) continue;
    map.set(symbol, { ...item, symbol });
  }

  const ordered: DaaUnifiedHumanSignalV1[] = [];
  const seen = new Set<string>();
  for (const item of provided) {
    const symbol = normalizeSymbol(item.symbol);
    if (!symbol) continue;
    const merged: DaaUnifiedHumanSignalV1 = {
      ...item,
      symbol,
      riskTags: Array.isArray(item.riskTags) ? item.riskTags.map((x) => String(x || "").trim()).filter(Boolean) : [],
      sourceRefs: Array.isArray(item.sourceRefs) ? item.sourceRefs.map((x) => String(x || "").trim()).filter(Boolean) : [],
    };
    map.set(symbol, merged);
    if (!seen.has(symbol)) {
      ordered.push(merged);
      seen.add(symbol);
    }
  }

  for (const item of fused) {
    const symbol = normalizeSymbol(item.symbol);
    if (!symbol || seen.has(symbol)) continue;
    const merged = map.get(symbol) ?? item;
    ordered.push(merged);
    seen.add(symbol);
  }

  return ordered;
}

function resolveInvestableCash(input: {
  cash: number;
  frozenCash: number;
  investableCash: number | undefined;
}): number {
  const cash = Math.max(0, Number(input.cash) || 0);
  const frozenCash = Math.max(0, Number(input.frozenCash) || 0);
  const fallback = Math.max(0, cash - frozenCash);
  const raw = Number(input.investableCash);
  if (!Number.isFinite(raw)) return fallback;
  if (raw <= 0 && cash > 0 && frozenCash < cash) return fallback;
  return Math.max(0, Math.min(cash, raw));
}

function normalizeFxRates(fxRates: DaaUnifiedFxRateV1[] | undefined): DaaUnifiedFxRateV1[] {
  return (fxRates ?? [])
    .map((row) => ({
      baseCcy: normalizeCurrency(row.baseCcy, "USD"),
      quoteCcy: normalizeCurrency(row.quoteCcy, "USD"),
      rate: Math.max(0, Number(row.rate) || 0),
      source: String(row.source || "manual").trim() || "manual",
      asOfTs: String(row.asOfTs || "").trim() || undefined,
    }))
    .filter((row) => row.baseCcy && row.quoteCcy && row.rate > 0);
}

function deriveTargetHint(weightHint: number | undefined, finalScore: number): number {
  if (Number.isFinite(weightHint) && (weightHint as number) > 0) {
    return clamp(Number(weightHint), 0.005, 0.25);
  }
  const derived = 0.02 + Math.max(0, finalScore - 65) * 0.0015;
  return clamp(derived, 0.01, 0.1);
}

function sumWeights(weights: Record<string, number>): number {
  return Object.values(weights).reduce((acc, value) => acc + (Number(value) || 0), 0);
}

function buildFusedHumanSignals(panel: DaaOpportunityPanelV1): DaaUnifiedHumanSignalV1[] {
  return panel.opportunities.map((item) => {
    const riskTags = new Set<string>(item.human?.riskTags ?? []);
    if (item.scores.penalty > 0) riskTags.add("signal_conflict");
    if (item.confidencePct < 45) riskTags.add("low_confidence");

    const thesisDriftPct = item.human
      ? Number(item.human.thesisDriftPct || 0)
      : item.action === "reduce_or_avoid"
        ? 16
        : 6;

    const stance = item.human?.stance
      ?? (item.action === "reduce_or_avoid" ? "defensive" : item.action === "open_or_add" ? "offensive" : "neutral");

    return {
      symbol: item.symbol,
      aggregatedScorePct: Number(item.finalScorePct.toFixed(2)),
      convictionPct: Number(item.confidencePct.toFixed(2)),
      thesisDriftPct: Number(clamp(thesisDriftPct, 0, 100).toFixed(2)),
      confidencePct: Number(item.confidencePct.toFixed(2)),
      momentumRegime: item.technical?.momentumRegime ?? item.human?.momentumRegime ?? "neutral",
      stance,
      riskTags: [...riskTags],
      sourceRefs: item.sourceRefs,
    };
  });
}

function withCandidateTargetWeights(
  baseWeights: Record<string, number>,
  panel: DaaOpportunityPanelV1,
  candidates: DaaUnifiedWatchlistCandidateV1[],
): { weights: Record<string, number>; addedTargets: string[] } {
  const next = { ...baseWeights };
  const addedTargets: string[] = [];

  const candidateMap = new Map(candidates.map((item) => [item.symbol, item]));
  const opportunities = panel.opportunities.filter((item) => item.action === "open_or_add");
  if (!opportunities.length) return { weights: next, addedTargets };

  let headroom = Math.max(0, 1 - sumWeights(next));

  for (const opportunity of opportunities) {
    if (headroom <= 1e-9) break;
    const symbol = opportunity.symbol;
    if (!symbol || next[symbol] > 0) continue;

    const candidate = candidateMap.get(symbol);
    const hint = deriveTargetHint(candidate?.targetWeightHint, opportunity.finalScorePct);
    const allocation = Math.min(headroom, hint);
    if (allocation <= 1e-9) continue;

    next[symbol] = Number(allocation.toFixed(6));
    headroom -= allocation;
    addedTargets.push(symbol);
  }

  if (sumWeights(next) <= 1e-9) {
    const fallback = opportunities.slice(0, 3);
    if (fallback.length) {
      const each = clamp(0.45 / fallback.length, 0.05, 0.2);
      for (const item of fallback) {
        next[item.symbol] = Number(each.toFixed(6));
        addedTargets.push(item.symbol);
      }
    }
  }

  return { weights: next, addedTargets };
}

export async function hydrateUnifiedRequestWithSignalsV1(request: DaaUnifiedRequestV1): Promise<HydrateUnifiedRequestResultV1> {
  const [persistedCandidates, persistedFxRates] = await Promise.all([
    listDaaWatchlistCandidatesV1(),
    listDaaFxRatesV1(),
  ]);

  const mergedCandidates = mergeWatchlistCandidates(request.watchlistCandidates, persistedCandidates);

  const symbols = new Set<string>();
  for (const symbol of Object.keys(request.targetWeights ?? {})) {
    const key = normalizeSymbol(symbol);
    if (key) symbols.add(key);
  }
  for (const position of request.positions ?? []) {
    const key = normalizeSymbol(position.symbol);
    if (key) symbols.add(key);
  }
  for (const candidate of mergedCandidates) {
    const key = normalizeSymbol(candidate.symbol);
    if (key) symbols.add(key);
  }

  const panel = await buildOpportunityPanelV1({ symbols: [...symbols] });
  const fusedHumanSignals = buildFusedHumanSignals(panel);

  const { weights, addedTargets } = withCandidateTargetWeights(request.targetWeights ?? {}, panel, mergedCandidates);
  const mergedHumanSignals = mergeHumanSignals(request.humanSignals, fusedHumanSignals);
  const enrichedPositions = enrichPositionsWithSignals(request.positions, weights, mergedCandidates, panel.raw.technicalSignals);

  const mergedFxRates = normalizeFxRates([
    ...(request.fxRates ?? []),
    ...persistedFxRates.map((row) => ({
      baseCcy: row.baseCcy,
      quoteCcy: row.quoteCcy,
      rate: row.rate,
      source: row.source,
      asOfTs: row.asOfTs,
    })),
  ]);

  const dedupFx = new Map<string, DaaUnifiedFxRateV1>();
  for (const row of mergedFxRates) {
    dedupFx.set(`${row.baseCcy}/${row.quoteCcy}`, row);
  }

  const accountCash = Math.max(0, Number(request.account?.cash ?? 0) || 0);
  const frozenCash = Math.max(0, Number(request.account?.frozenCash ?? 0) || 0);
  const investableCash = resolveInvestableCash({
    cash: accountCash,
    frozenCash,
    investableCash: request.account?.investableCash,
  });

  const nextRequest: DaaUnifiedRequestV1 = {
    ...request,
    account: {
      baseCurrency: normalizeCurrency(request.account?.baseCurrency, "USD"),
      cash: accountCash,
      investableCash,
      frozenCash,
      totalEquity: request.account?.totalEquity,
      equityPeak: request.account?.equityPeak,
    },
    targetWeights: weights,
    positions: enrichedPositions,
    watchlistCandidates: mergedCandidates,
    fxRates: [...dedupFx.values()],
    humanSignals: mergedHumanSignals,
  };

  return {
    request: nextRequest,
    opportunityPanel: panel,
    diagnostics: {
      addedTargets,
      candidateCount: mergedCandidates.length,
      fxRateCount: dedupFx.size,
    },
  };
}
