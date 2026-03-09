import { buildOpportunityPanelV1, type DaaOpportunityPanelV1 } from "@/src/daa/signals/opportunityServiceV1";
import type { DaaTechnicalSignalV1 } from "@/src/daa/signals/technicalSignalV1";
import { buildDaaAssetKeyV1, normalizeDaaMarketV1, parseDaaAssetKeyV1 } from "@/src/daa/assetKeyV1";
import { listDaaCandidateAssetsV1, listDaaFxRatesV1 } from "@/src/daa/store/daaStorePgV1";
import type {
  DaaUnifiedCandidateAssetV1,
  DaaUnifiedPositionV1,
  DaaUnifiedFxRateV1,
  DaaUnifiedHumanSignalV1,
  DaaUnifiedRequestV1,
} from "@/src/daa/unifiedRebalanceV1";

export type HydrateUnifiedRequestResultV1 = {
  request: DaaUnifiedRequestV1;
  opportunityPanel: DaaOpportunityPanelV1;
  diagnostics: {
    addedTargets: string[];
    candidateCount: number;
    fxRateCount: number;
    humanSourceStatus: "live" | "fallback_seed" | "unknown";
    humanDiagnostics: string[];
  };
};

function normalizeSymbol(value: unknown): string {
  return String(value || "").trim().toUpperCase();
}

function normalizeCurrency(value: unknown, fallback = "USD"): string {
  const code = String(value || "").trim().toUpperCase();
  return code || fallback;
}

function normalizeMarket(value: unknown, fallback = "US"): string {
  return normalizeDaaMarketV1(value, fallback);
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

function sumWeights(weights: Record<string, number>): number {
  return Object.values(weights).reduce((acc, value) => acc + (Number(value) || 0), 0);
}

function normalizeWeightMap(weights: Record<string, number>): Record<string, number> {
  const cleaned: Record<string, number> = {};
  let sum = 0;
  for (const [keyRaw, valueRaw] of Object.entries(weights || {})) {
    const key = String(keyRaw || "").trim().toUpperCase();
    const value = Number(valueRaw);
    if (!key || !Number.isFinite(value) || value <= 0) continue;
    cleaned[key] = (cleaned[key] ?? 0) + value;
    sum += value;
  }

  if (sum <= 1.000001) return cleaned;

  const scaled: Record<string, number> = {};
  for (const [key, value] of Object.entries(cleaned)) {
    scaled[key] = value / sum;
  }
  return scaled;
}

type CandidateAssetLikeV1 = {
  symbol?: unknown;
  market?: unknown;
  currency?: unknown;
  targetWeightHint?: unknown;
  enabled?: unknown;
  tags?: unknown;
  notes?: unknown;
};

function normalizeCandidateAsset(candidate: CandidateAssetLikeV1): DaaUnifiedCandidateAssetV1 | null {
  const symbol = normalizeSymbol(candidate.symbol);
  if (!symbol) return null;
  return {
    symbol,
    market: normalizeMarket(candidate.market, "US"),
    currency: normalizeCurrency(candidate.currency, "USD"),
    targetWeightHint: clamp(Number(candidate.targetWeightHint ?? 0) || 0, 0, 1),
    enabled: candidate.enabled !== false,
    tags: Array.isArray(candidate.tags) ? candidate.tags.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean) : [],
    notes: String(candidate.notes || "").trim() || undefined,
  };
}

function mergeCandidateAssets(
  requestCandidates: DaaUnifiedCandidateAssetV1[] | undefined,
  persistedCandidates: CandidateAssetLikeV1[],
): DaaUnifiedCandidateAssetV1[] {
  const map = new Map<string, DaaUnifiedCandidateAssetV1>();

  for (const raw of persistedCandidates) {
    const normalized = normalizeCandidateAsset(raw);
    if (!normalized || normalized.enabled === false) continue;
    const assetKey = buildDaaAssetKeyV1(normalized.symbol, normalized.market || "US");
    if (!assetKey) continue;
    map.set(assetKey, normalized);
  }

  for (const raw of requestCandidates ?? []) {
    const normalized = normalizeCandidateAsset(raw);
    if (!normalized) continue;
    const assetKey = buildDaaAssetKeyV1(normalized.symbol, normalized.market || "US");
    if (!assetKey) continue;
    map.set(assetKey, normalized);
  }

  return [...map.values()].filter((item) => item.enabled !== false);
}

function normalizePosition(position: Partial<DaaUnifiedPositionV1>): DaaUnifiedPositionV1 | null {
  const symbol = normalizeSymbol(position.symbol);
  if (!symbol) return null;
  const costBasisPerUnit = Math.max(0, Number(position.costBasisPerUnit ?? position.costBasis) || 0);
  return {
    symbol,
    market: normalizeMarket(position.market, "US"),
    currency: normalizeCurrency(position.currency, "USD"),
    qty: Math.max(0, Number(position.qty) || 0),
    price: Math.max(0, Number(position.price) || 0),
    costBasis: costBasisPerUnit,
    costBasisPerUnit,
    tags: Array.isArray(position.tags) ? position.tags.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean) : [],
  };
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

type CandidateAssetMetaV1 = {
  assetKey: string;
  symbol: string;
  market: string;
  currency: string;
  targetWeightHint: number;
  tags: string[];
};

function buildCandidateAssetIndex(candidates: DaaUnifiedCandidateAssetV1[]): {
  byAssetKey: Map<string, CandidateAssetMetaV1>;
  assetKeysBySymbol: Map<string, string[]>;
} {
  const byAssetKey = new Map<string, CandidateAssetMetaV1>();
  const assetKeysBySymbol = new Map<string, string[]>();

  for (const raw of candidates) {
    const symbol = normalizeSymbol(raw.symbol);
    if (!symbol) continue;
    const market = normalizeMarket(raw.market, "US");
    const assetKey = buildDaaAssetKeyV1(symbol, market);
    if (!assetKey) continue;

    const meta: CandidateAssetMetaV1 = {
      assetKey,
      symbol,
      market,
      currency: normalizeCurrency(raw.currency, "USD"),
      targetWeightHint: clamp(Number(raw.targetWeightHint ?? 0) || 0, 0, 1),
      tags: Array.isArray(raw.tags) ? raw.tags.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean) : [],
    };
    byAssetKey.set(assetKey, meta);

    const list = assetKeysBySymbol.get(symbol) ?? [];
    if (!list.includes(assetKey)) list.push(assetKey);
    assetKeysBySymbol.set(symbol, list);
  }

  return { byAssetKey, assetKeysBySymbol };
}

function normalizeTargetWeightsToAssetKeys(input: {
  targetWeights: Record<string, number>;
}): Record<string, number> {
  const out: Record<string, number> = {};

  for (const [rawKey, rawWeight] of Object.entries(input.targetWeights || {})) {
    const weight = Number(rawWeight);
    const keyText = String(rawKey || "").trim().toUpperCase();
    if (!keyText) {
      throw new Error("targetWeights key must not be empty");
    }
    if (!Number.isFinite(weight)) {
      throw new Error(`targetWeights[${keyText}] must be a finite number`);
    }
    if (weight < 0) {
      throw new Error(`targetWeights[${keyText}] must be non-negative`);
    }
    if (weight === 0) continue;

    const parsed = parseDaaAssetKeyV1(keyText);
    if (!parsed) {
      throw new Error(`targetWeights key ${keyText} is invalid, expected MARKET::SYMBOL`);
    }
    const assetKey = buildDaaAssetKeyV1(parsed.symbol, parsed.market);
    if (!assetKey) {
      throw new Error(`targetWeights key ${keyText} cannot be normalized`);
    }
    out[assetKey] = (out[assetKey] ?? 0) + weight;
  }

  return normalizeWeightMap(out);
}

function buildSymbolWeightMap(weights: Record<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  for (const [rawKey, rawWeight] of Object.entries(weights || {})) {
    const weight = Number(rawWeight);
    if (!Number.isFinite(weight) || weight <= 0) continue;
    const parsed = parseDaaAssetKeyV1(rawKey);
    if (!parsed) {
      throw new Error(`targetWeights key ${String(rawKey)} is invalid, expected MARKET::SYMBOL`);
    }
    const symbol = parsed.symbol;
    out.set(symbol, (out.get(symbol) ?? 0) + weight);
  }
  return out;
}

function allocateWeightToAssetKeys(input: {
  nextWeights: Record<string, number>;
  totalWeight: number;
  assetKeys: string[];
  candidateByAssetKey: Map<string, CandidateAssetMetaV1>;
  addedTargets: string[];
}) {
  const totalWeight = Number(input.totalWeight);
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) return;

  const keys = [...new Set(input.assetKeys.map((item) => String(item || "").trim().toUpperCase()).filter(Boolean))];
  if (keys.length <= 0) return;

  if (keys.length === 1) {
    const key = keys[0];
    input.nextWeights[key] = (input.nextWeights[key] ?? 0) + totalWeight;
    input.addedTargets.push(key);
    return;
  }

  const hinted = keys
    .map((assetKey) => ({ assetKey, hint: input.candidateByAssetKey.get(assetKey)?.targetWeightHint ?? 0 }))
    .filter((item) => item.hint > 0);
  const hintedSum = hinted.reduce((acc, item) => acc + item.hint, 0);

  if (hintedSum > 0) {
    for (const item of hinted) {
      input.nextWeights[item.assetKey] = (input.nextWeights[item.assetKey] ?? 0) + (totalWeight * (item.hint / hintedSum));
      input.addedTargets.push(item.assetKey);
    }
    return;
  }

  const each = totalWeight / keys.length;
  for (const assetKey of keys) {
    input.nextWeights[assetKey] = (input.nextWeights[assetKey] ?? 0) + each;
    input.addedTargets.push(assetKey);
  }
}

function enrichPositionsWithSignals(
  positions: DaaUnifiedPositionV1[] | undefined,
  targetWeights: Record<string, number>,
  candidates: DaaUnifiedCandidateAssetV1[],
  technicalSignals: DaaTechnicalSignalV1[],
): DaaUnifiedPositionV1[] {
  const out = new Map<string, DaaUnifiedPositionV1>();
  const candidateIndex = buildCandidateAssetIndex(candidates);
  const techPriceMap = buildTechPriceMap(technicalSignals);

  for (const raw of positions ?? []) {
    const normalized = normalizePosition(raw);
    if (!normalized) continue;
    const assetKey = buildDaaAssetKeyV1(normalized.symbol, normalized.market || "US");
    if (!assetKey) continue;
    out.set(assetKey, normalized);
  }

  for (const rawKey of Object.keys(targetWeights ?? {})) {
    const parsed = parseDaaAssetKeyV1(rawKey);
    if (!parsed) {
      throw new Error(`targetWeights key ${rawKey} is invalid, expected MARKET::SYMBOL`);
    }
    const symbol = parsed.symbol;

    const signalPrice = techPriceMap.get(symbol);
    if (!(signalPrice && signalPrice > 0)) continue;

    const explicitAssetKey = buildDaaAssetKeyV1(parsed.symbol, parsed.market);
    if (!explicitAssetKey) continue;
    const targetAssetKeys = [explicitAssetKey];

    for (const assetKey of targetAssetKeys) {
      const existing = out.get(assetKey);
      const candidate = candidateIndex.byAssetKey.get(assetKey);
      const market = parsed.market || existing?.market || candidate?.market || "US";
      const currency = existing?.currency || candidate?.currency || "USD";

      if (existing) {
        if (existing.price > 0) continue;
        out.set(assetKey, {
          ...existing,
          market: existing.market || market,
          currency,
          price: signalPrice,
        });
        continue;
      }

      out.set(assetKey, {
        symbol,
        market,
        currency,
        qty: 0,
        price: signalPrice,
        costBasis: 0,
        tags: [...(candidate?.tags ?? [])],
      });
    }
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
  candidates: DaaUnifiedCandidateAssetV1[],
): { weights: Record<string, number>; addedTargets: string[] } {
  const next = normalizeWeightMap(baseWeights);
  const addedTargets: string[] = [];
  const candidateIndex = buildCandidateAssetIndex(candidates);
  const symbolWeightMap = buildSymbolWeightMap(next);
  const opportunities = panel.opportunities.filter((item) => item.action === "open_or_add");
  if (!opportunities.length) return { weights: next, addedTargets };

  let headroom = Math.max(0, 1 - sumWeights(next));

  for (const opportunity of opportunities) {
    if (headroom <= 1e-9) break;
    const symbol = normalizeSymbol(opportunity.symbol);
    if (!symbol || (symbolWeightMap.get(symbol) ?? 0) > 0) continue;

    const candidateKeys = candidateIndex.assetKeysBySymbol.get(symbol) ?? [];
    const firstCandidate = candidateKeys.length > 0 ? candidateIndex.byAssetKey.get(candidateKeys[0]) : null;
    const hint = deriveTargetHint(firstCandidate?.targetWeightHint, opportunity.finalScorePct);
    const allocation = Math.min(headroom, hint);
    if (allocation <= 1e-9) continue;
    if (candidateKeys.length <= 0) continue;

    allocateWeightToAssetKeys({
      nextWeights: next,
      totalWeight: allocation,
      assetKeys: candidateKeys,
      candidateByAssetKey: candidateIndex.byAssetKey,
      addedTargets,
    });

    symbolWeightMap.set(symbol, (symbolWeightMap.get(symbol) ?? 0) + allocation);
    headroom -= allocation;
  }

  if (sumWeights(next) <= 1e-9) {
    const fallback = opportunities.slice(0, 3);
    if (fallback.length) {
      const each = clamp(0.45 / fallback.length, 0.05, 0.2);
      for (const item of fallback) {
        const symbol = normalizeSymbol(item.symbol);
        if (!symbol) continue;
        const candidateKeys = candidateIndex.assetKeysBySymbol.get(symbol) ?? [];
        if (candidateKeys.length <= 0) continue;
        allocateWeightToAssetKeys({
          nextWeights: next,
          totalWeight: each,
          assetKeys: candidateKeys,
          candidateByAssetKey: candidateIndex.byAssetKey,
          addedTargets,
        });
      }
    }
  }

  return { weights: normalizeWeightMap(next), addedTargets };
}

export async function hydrateUnifiedRequestWithSignalsV1(request: DaaUnifiedRequestV1): Promise<HydrateUnifiedRequestResultV1> {
  const [persistedCandidates, persistedFxRates] = await Promise.all([
    listDaaCandidateAssetsV1(),
    listDaaFxRatesV1(),
  ]);

  const mergedCandidates = mergeCandidateAssets(request.candidateAssets, persistedCandidates);
  const normalizedTargetWeights = normalizeTargetWeightsToAssetKeys({
    targetWeights: request.targetWeights ?? {},
  });

  const symbols = new Set<string>();
  for (const rawKey of Object.keys(normalizedTargetWeights ?? {})) {
    const parsed = parseDaaAssetKeyV1(rawKey);
    if (!parsed) {
      throw new Error(`targetWeights key ${rawKey} is invalid, expected MARKET::SYMBOL`);
    }
    symbols.add(parsed.symbol);
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

  const { weights, addedTargets } = withCandidateTargetWeights(normalizedTargetWeights, panel, mergedCandidates);
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
    candidateAssets: mergedCandidates,
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
      humanSourceStatus: panel.diagnostics.humanSourceStatus,
      humanDiagnostics: panel.diagnostics.humanDiagnostics,
    },
  };
}
