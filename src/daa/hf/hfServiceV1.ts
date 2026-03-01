import {
  fetchDanjuanFundAssetPercentV1,
  isDanjuanSourceEnabledV1,
  resolveDanjuanFundRegistryV1,
  resolveDanjuanReportDatesV1,
  type DanjuanFundRegistryItemV1,
  type DanjuanHoldingRowV1,
} from "@/src/daa/hf/danjuanFundSourceV1";
import { HF_DEFAULT_MARKET_SCOPE_V1, HF_SEED_ACTORS_V1, HF_SEED_HOLDINGS_V1 } from "@/src/daa/hf/hfSeedDataV1";
import type {
  DaaActorHoldingSnapshotV1,
  DaaHumanActorV1,
  DaaHumanIngestSummaryV1,
  DaaHumanSignalBatchV1,
  DaaHumanSignalSourceSummaryV1,
  DaaHumanSignalV1,
} from "@/src/daa/hf/humanSignalsV1";

function clampPct(v: number, fallback = 0): number {
  if (!Number.isFinite(v)) return fallback;
  if (v <= 0) return 0;
  if (v >= 100) return 100;
  return v;
}

function normalizeSymbol(v: string): string {
  return String(v || "").trim().toUpperCase();
}

function normalizeMarketScope(scope?: string[]): string[] {
  const input = Array.isArray(scope) ? scope : [...HF_DEFAULT_MARKET_SCOPE_V1];
  const out = new Set<string>();
  for (const market of input) {
    const key = String(market || "").trim().toUpperCase();
    if (!key) continue;
    out.add(key);
  }
  if (out.size === 0) {
    return [...HF_DEFAULT_MARKET_SCOPE_V1];
  }
  return [...out];
}

function normalizeFundCodes(codes?: string[]): string[] {
  if (!Array.isArray(codes)) return [];
  const dedup = new Set<string>();
  for (const code of codes) {
    const value = String(code || "").trim();
    if (!value) continue;
    dedup.add(value);
  }
  return [...dedup];
}

function actorQualityScorePct(actor: DaaHumanActorV1): number {
  const q = actor.quality;
  const base = q.accuracyPct * 0.35 + q.riskControlPct * 0.25 + q.disciplinePct * 0.2 + q.transparencyPct * 0.2;
  return clampPct(base - q.maxDrawdownPenaltyPct * 0.4, 50);
}

function stanceByActorWeight(
  items: DaaActorHoldingSnapshotV1[],
  actorsById: Map<string, DaaHumanActorV1>,
): "offensive" | "neutral" | "defensive" {
  let offensiveWeight = 0;
  let defensiveWeight = 0;
  let totalWeight = 0;

  for (const row of items) {
    const actor = actorsById.get(row.actorId);
    if (!actor) continue;
    const weight = Math.max(0.1, row.weightPct);
    totalWeight += weight;
    if (actor.stance === "offensive") offensiveWeight += weight;
    if (actor.stance === "defensive") defensiveWeight += weight;
  }

  if (totalWeight <= 0) return "neutral";
  if (defensiveWeight / totalWeight >= 0.55) return "defensive";
  if (offensiveWeight / totalWeight >= 0.55) return "offensive";
  return "neutral";
}

function computeSignalForSymbol(
  symbol: string,
  market: string,
  items: DaaActorHoldingSnapshotV1[],
  actorsById: Map<string, DaaHumanActorV1>,
): DaaHumanSignalV1 {
  let weightedScore = 0;
  let weightedConfidence = 0;
  let weightedDrift = 0;
  let totalWeight = 0;

  const actorIds = new Set<string>();
  const sourceRefs = new Set<string>();

  for (const item of items) {
    const actor = actorsById.get(item.actorId);
    if (!actor) continue;

    const portfolioWeight = Math.max(0.1, clampPct(item.weightPct));
    const scorePct = actorQualityScorePct(actor);
    const confidencePct = clampPct(item.confidencePct) * 0.7 + clampPct(actor.quality.transparencyPct) * 0.3;
    const driftPct = Math.abs(clampPct(item.weightPct) - clampPct(item.prevWeightPct));

    weightedScore += scorePct * portfolioWeight;
    weightedConfidence += confidencePct * portfolioWeight;
    weightedDrift += driftPct * portfolioWeight;
    totalWeight += portfolioWeight;

    actorIds.add(actor.actorId);
    sourceRefs.add(item.sourceRef);
  }

  const avgScore = totalWeight > 0 ? weightedScore / totalWeight : 50;
  const avgConfidence = totalWeight > 0 ? weightedConfidence / totalWeight : 50;
  const avgDrift = totalWeight > 0 ? weightedDrift / totalWeight : 8;

  const convictionPct = clampPct(35 + Math.min(65, totalWeight * 2.2));

  let momentumRegime: "strong" | "neutral" | "weak" = "neutral";
  if (avgScore >= 72 && convictionPct >= 65 && avgDrift <= 6) momentumRegime = "strong";
  if (avgScore < 48 || avgDrift >= 14) momentumRegime = "weak";

  const riskTags: string[] = [];
  if (avgConfidence < 55) riskTags.push("low_confidence");
  if (avgDrift >= 12) riskTags.push("thesis_drift");
  if (avgScore < 45) riskTags.push("weak_actor_quality");
  if (convictionPct >= 80 && avgScore >= 75) riskTags.push("opportunity_cluster");

  return {
    symbol,
    market,
    aggregatedScorePct: Number(avgScore.toFixed(2)),
    convictionPct: Number(convictionPct.toFixed(2)),
    thesisDriftPct: Number(avgDrift.toFixed(2)),
    momentumRegime,
    stance: stanceByActorWeight(items, actorsById),
    confidencePct: Number(avgConfidence.toFixed(2)),
    evidenceCount: items.length,
    actorIds: [...actorIds].sort(),
    sourceRefs: [...sourceRefs].sort(),
    riskTags,
  };
}

function buildSourceSummary(holdings: DaaActorHoldingSnapshotV1[]): DaaHumanSignalSourceSummaryV1[] {
  const counter = new Map<string, DaaHumanSignalSourceSummaryV1>();

  for (const row of holdings) {
    const key = `${row.sourceChannel}::${row.sourceName}`;
    const current = counter.get(key);
    if (current) {
      current.itemCount += 1;
      continue;
    }
    counter.set(key, {
      channel: row.sourceChannel,
      sourceName: row.sourceName,
      itemCount: 1,
    });
  }

  return [...counter.values()].sort((a, b) => b.itemCount - a.itemCount || a.sourceName.localeCompare(b.sourceName));
}

function latestAsOfDate(holdings: DaaActorHoldingSnapshotV1[]): string {
  if (holdings.length === 0) return new Date().toISOString().slice(0, 10);
  return holdings.map((x) => x.asOfDate).sort().at(-1) ?? new Date().toISOString().slice(0, 10);
}

function matchesScope(value: string, scope: Set<string>): boolean {
  return scope.has(String(value || "").trim().toUpperCase());
}

function matchesSymbolFilter(symbol: string, symbols?: Set<string>): boolean {
  if (!symbols || symbols.size === 0) return true;
  return symbols.has(normalizeSymbol(symbol));
}

function deriveActorProfile(item: DanjuanFundRegistryItemV1): DaaHumanActorV1 {
  if (item.kind === "balanced") {
    return {
      actorId: `danjuan_${item.fundCode}`,
      displayName: item.label,
      kind: "fund",
      markets: ["CN", "HK", "US"],
      styleCluster: "balanced",
      stance: "defensive",
      sourcePolicy: "hybrid",
      quality: {
        accuracyPct: 70,
        riskControlPct: 85,
        disciplinePct: 80,
        transparencyPct: 78,
        maxDrawdownPenaltyPct: 12,
      },
    };
  }

  if (item.kind === "qdii") {
    return {
      actorId: `danjuan_${item.fundCode}`,
      displayName: item.label,
      kind: "fund",
      markets: ["US", "HK", "CN"],
      styleCluster: "global",
      stance: "neutral",
      sourcePolicy: "hybrid",
      quality: {
        accuracyPct: 72,
        riskControlPct: 76,
        disciplinePct: 76,
        transparencyPct: 82,
        maxDrawdownPenaltyPct: 17,
      },
    };
  }

  return {
    actorId: `danjuan_${item.fundCode}`,
    displayName: item.label,
    kind: "fund",
    markets: ["CN", "HK"],
    styleCluster: "equity",
    stance: "offensive",
    sourcePolicy: "hybrid",
    quality: {
      accuracyPct: 75,
      riskControlPct: 72,
      disciplinePct: 74,
      transparencyPct: 80,
      maxDrawdownPenaltyPct: 18,
    },
  };
}

function reportDateToTs(reportDate: string): number {
  const t = Date.parse(`${reportDate}T00:00:00.000Z`);
  return Number.isFinite(t) ? t : 0;
}

function toHoldingSnapshots(rows: DanjuanHoldingRowV1[], registry: DanjuanFundRegistryItemV1[]): {
  actors: DaaHumanActorV1[];
  holdings: DaaActorHoldingSnapshotV1[];
} {
  const registryByCode = new Map(registry.map((item) => [item.fundCode, item]));
  const actorById = new Map<string, DaaHumanActorV1>();

  for (const row of rows) {
    const config = registryByCode.get(row.fundCode);
    if (!config) continue;
    const actor = deriveActorProfile(config);
    actorById.set(actor.actorId, actor);
  }

  const sorted = [...rows].sort((a, b) => reportDateToTs(b.reportDate) - reportDateToTs(a.reportDate));
  const prevWeightMap = new Map<string, number>();
  const holdings: DaaActorHoldingSnapshotV1[] = [];

  for (const row of sorted) {
    const actorId = `danjuan_${row.fundCode}`;
    const prevKey = `${actorId}::${row.symbol}`;
    const prevWeight = prevWeightMap.get(prevKey) ?? row.weightPct;

    holdings.push({
      snapshotId: `${actorId}-${row.reportDate}-${row.symbol}`,
      actorId,
      symbol: row.symbol,
      market: row.market,
      asOfDate: row.reportDate,
      disclosedAt: `${row.reportDate}T00:00:00.000Z`,
      weightPct: row.weightPct,
      prevWeightPct: prevWeight,
      shares: 0,
      marketValueUsd: 0,
      sourceChannel: "third_party",
      sourceName: "Danjuan Funds",
      sourceRef: row.sourceRef,
      confidencePct: 78,
    });

    prevWeightMap.set(prevKey, row.weightPct);
  }

  return {
    actors: [...actorById.values()],
    holdings,
  };
}

async function fetchDanjuanRows(opts: {
  reportDates?: string[];
  fundCodes?: string[];
}): Promise<{ rows: DanjuanHoldingRowV1[]; registry: DanjuanFundRegistryItemV1[] }> {
  const resolvedRegistry = resolveDanjuanFundRegistryV1().filter((item) => item.enabled);
  const requestedCodes = normalizeFundCodes(opts.fundCodes);
  const registry =
    requestedCodes.length > 0
      ? requestedCodes.map((fundCode) => {
          const found = resolvedRegistry.find((item) => item.fundCode === fundCode);
          if (found) return found;
          return {
            fundCode,
            label: `基金 ${fundCode}`,
            kind: "equity" as const,
            enabled: true,
          };
        })
      : resolvedRegistry;
  if (!registry.length) return { rows: [], registry: [] };

  const reportDates = (opts.reportDates && opts.reportDates.length > 0 ? opts.reportDates : resolveDanjuanReportDatesV1(2))
    .map((d) => String(d || "").trim())
    .filter(Boolean);

  const results: DanjuanHoldingRowV1[] = [];
  for (const item of registry) {
    for (const reportDate of reportDates) {
      const rows = await fetchDanjuanFundAssetPercentV1({
        fundCode: item.fundCode,
        reportDate,
      });
      if (rows.length > 0) {
        results.push(...rows);
      }
    }
  }

  const dedup = new Map<string, DanjuanHoldingRowV1>();
  for (const row of results) {
    const key = `${row.fundCode}::${row.reportDate}::${row.symbol}`;
    dedup.set(key, row);
  }

  return {
    rows: [...dedup.values()],
    registry,
  };
}

function buildSignalBatchFromActorsAndHoldings(opts: {
  actors: DaaHumanActorV1[];
  holdings: DaaActorHoldingSnapshotV1[];
  marketScope?: string[];
  symbols?: string[];
  mode: DaaHumanSignalBatchV1["mode"];
}): DaaHumanSignalBatchV1 {
  const scopeValues = normalizeMarketScope(opts.marketScope);
  const scope = new Set(scopeValues);
  const symbolFilter = new Set((opts.symbols ?? []).map((s) => normalizeSymbol(s)).filter(Boolean));

  const actors = opts.actors.filter((actor) => actor.markets.some((m) => matchesScope(m, scope)));
  const actorIds = new Set(actors.map((actor) => actor.actorId));
  const actorsById = new Map(actors.map((actor) => [actor.actorId, actor]));

  const holdings = opts.holdings.filter(
    (row) => actorIds.has(row.actorId) && matchesScope(row.market, scope) && matchesSymbolFilter(row.symbol, symbolFilter),
  );

  const grouped = new Map<string, DaaActorHoldingSnapshotV1[]>();
  for (const row of holdings) {
    const symbol = normalizeSymbol(row.symbol);
    if (!grouped.has(symbol)) grouped.set(symbol, []);
    grouped.get(symbol)!.push(row);
  }

  const signals = [...grouped.entries()]
    .map(([symbol, rows]) => computeSignalForSymbol(symbol, rows[0]?.market ?? "UNKNOWN", rows, actorsById))
    .sort((a, b) => {
      const scoreA = a.aggregatedScorePct * (a.convictionPct / 100);
      const scoreB = b.aggregatedScorePct * (b.convictionPct / 100);
      return scoreB - scoreA;
    });

  return {
    generatedAt: new Date().toISOString(),
    asOfDate: latestAsOfDate(holdings),
    marketScope: scopeValues,
    mode: opts.mode,
    actorCount: actors.length,
    holdingCount: holdings.length,
    signals,
    sources: buildSourceSummary(holdings),
  };
}

function buildSeedSignalBatch(opts: { marketScope?: string[]; symbols?: string[] }): DaaHumanSignalBatchV1 {
  return buildSignalBatchFromActorsAndHoldings({
    actors: HF_SEED_ACTORS_V1.map((x) => ({ ...x })),
    holdings: HF_SEED_HOLDINGS_V1.map((x) => ({ ...x })),
    marketScope: opts.marketScope,
    symbols: opts.symbols,
    mode: "official_first",
  });
}

type RuntimeHumanFactorStateV1 = {
  lastIngestAt: string | null;
  ingestCount: number;
  latestBatch: DaaHumanSignalBatchV1 | null;
  latestActors: DaaHumanActorV1[];
  latestHoldings: DaaActorHoldingSnapshotV1[];
};

const runtimeStateV1: RuntimeHumanFactorStateV1 = {
  lastIngestAt: null,
  ingestCount: 0,
  latestBatch: null,
  latestActors: [],
  latestHoldings: [],
};

function shouldUseCache(maxAgeMs = 6 * 60 * 60 * 1000): boolean {
  if (!runtimeStateV1.lastIngestAt || !runtimeStateV1.latestBatch) return false;
  const ts = Date.parse(runtimeStateV1.lastIngestAt);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < maxAgeMs;
}

async function buildDanjuanSignalBatch(opts: {
  marketScope?: string[];
  symbols?: string[];
  reportDates?: string[];
  fundCodes?: string[];
}): Promise<{
  batch: DaaHumanSignalBatchV1;
  actors: DaaHumanActorV1[];
  holdings: DaaActorHoldingSnapshotV1[];
} | null> {
  if (!isDanjuanSourceEnabledV1()) return null;

  const { rows, registry } = await fetchDanjuanRows({
    reportDates: opts.reportDates,
    fundCodes: opts.fundCodes,
  });
  if (rows.length === 0) return null;

  const { actors, holdings } = toHoldingSnapshots(rows, registry);
  if (actors.length === 0 || holdings.length === 0) return null;

  const batch = buildSignalBatchFromActorsAndHoldings({
    actors,
    holdings,
    marketScope: opts.marketScope,
    symbols: opts.symbols,
    mode: "danjuan_primary_with_official_fallback",
  });

  return {
    batch,
    actors,
    holdings,
  };
}

export function listHumanActorsV1(opts: { marketScope?: string[] } = {}): DaaHumanActorV1[] {
  const scope = new Set(normalizeMarketScope(opts.marketScope));
  const source = runtimeStateV1.latestActors.length > 0 ? runtimeStateV1.latestActors : HF_SEED_ACTORS_V1;
  return source.filter((actor) => actor.markets.some((m) => matchesScope(m, scope))).map((actor) => ({ ...actor }));
}

export function listActorHoldingsV1(actorId: string, opts: { marketScope?: string[] } = {}): DaaActorHoldingSnapshotV1[] {
  const normalizedActorId = String(actorId || "").trim();
  if (!normalizedActorId) return [];

  const scope = new Set(normalizeMarketScope(opts.marketScope));
  const source = runtimeStateV1.latestHoldings.length > 0 ? runtimeStateV1.latestHoldings : HF_SEED_HOLDINGS_V1;

  return source
    .filter((row) => row.actorId === normalizedActorId && matchesScope(row.market, scope))
    .map((row) => ({ ...row }));
}

export function computeHumanSignalBatchV1(opts: { marketScope?: string[]; symbols?: string[] } = {}): DaaHumanSignalBatchV1 {
  return buildSeedSignalBatch(opts);
}

export async function runHumanIngestV1(opts: {
  marketScope?: string[];
  symbols?: string[];
  reportDates?: string[];
  fundCodes?: string[];
} = {}): Promise<{ summary: DaaHumanIngestSummaryV1; batch: DaaHumanSignalBatchV1 }> {
  const danjuan = await buildDanjuanSignalBatch(opts);

  const batch = danjuan?.batch ?? buildSeedSignalBatch({ marketScope: opts.marketScope, symbols: opts.symbols });
  const actors = danjuan?.actors ?? HF_SEED_ACTORS_V1;
  const holdings = danjuan?.holdings ?? HF_SEED_HOLDINGS_V1;

  runtimeStateV1.latestBatch = batch;
  runtimeStateV1.latestActors = actors.map((x) => ({ ...x }));
  runtimeStateV1.latestHoldings = holdings.map((x) => ({ ...x }));
  runtimeStateV1.lastIngestAt = new Date().toISOString();
  runtimeStateV1.ingestCount += 1;

  return {
    summary: {
      ingestedAt: runtimeStateV1.lastIngestAt,
      marketScope: batch.marketScope,
      actorCount: batch.actorCount,
      holdingCount: batch.holdingCount,
      signalCount: batch.signals.length,
      mode: batch.mode,
    },
    batch,
  };
}

export async function getLatestHumanSignalBatchV1(opts: {
  marketScope?: string[];
  symbols?: string[];
  reportDates?: string[];
  fundCodes?: string[];
  forceRefresh?: boolean;
} = {}): Promise<DaaHumanSignalBatchV1> {
  const hasDynamicOptions =
    (Array.isArray(opts.marketScope) && opts.marketScope.length > 0)
    || (Array.isArray(opts.symbols) && opts.symbols.length > 0)
    || (Array.isArray(opts.reportDates) && opts.reportDates.length > 0)
    || (Array.isArray(opts.fundCodes) && opts.fundCodes.length > 0)
    || Boolean(opts.forceRefresh);

  if (hasDynamicOptions || !shouldUseCache()) {
    const ingest = await runHumanIngestV1({
      marketScope: opts.marketScope,
      symbols: opts.symbols,
      reportDates: opts.reportDates,
      fundCodes: opts.fundCodes,
    });
    return ingest.batch;
  }

  return runtimeStateV1.latestBatch as DaaHumanSignalBatchV1;
}

export function getHumanIngestRuntimeStateV1(): RuntimeHumanFactorStateV1 {
  return {
    lastIngestAt: runtimeStateV1.lastIngestAt,
    ingestCount: runtimeStateV1.ingestCount,
    latestBatch: runtimeStateV1.latestBatch,
    latestActors: runtimeStateV1.latestActors.map((x) => ({ ...x })),
    latestHoldings: runtimeStateV1.latestHoldings.map((x) => ({ ...x })),
  };
}
