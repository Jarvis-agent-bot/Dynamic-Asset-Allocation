import {
  fetchDanjuanFundAssetPercentWithRaw,
  isDanjuanSourceEnabled,
  resolveDanjuanFundRegistry,
  resolveDanjuanReportDates,
  type DanjuanFundRegistryItem,
  type DanjuanFundFetchRaw,
  type DanjuanHoldingRow,
} from "@/src/daa/hf/danjuanFundSource";
import {
  appendDaaExternalPayloadRaw,
  getDaaHumanIngestState,
  getDaaSystemConfig,
  replaceDaaHfHoldingSnapshots,
  saveDaaHumanIngestState,
  upsertDaaHfSignalSnapshots,
} from "@/src/daa/store/daaStorePg";
import { HF_DEFAULT_MARKET_SCOPE_, HF_SEED_ACTORS_, HF_SEED_HOLDINGS_ } from "@/src/daa/hf/hfSeedData";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import type {
  DaaActorHoldingSnapshot,
  DaaHumanActor,
  DaaHumanIngestSummary,
  DaaHumanSignalBatch,
  DaaHumanSignalSourceSummary,
  DaaHumanSignal,
} from "@/src/daa/hf/humanSignals";

const HF_RAW_RETENTION_DAYS_ = 90;

function clampPct(v: number, fallback = 0): number {
  if (!Number.isFinite(v)) return fallback;
  if (v <= 0) return 0;
  if (v >= 100) return 100;
  return v;
}

function clampRange(v: number, min: number, max: number, fallback = min): number {
  if (!Number.isFinite(v)) return fallback;
  if (v <= min) return min;
  if (v >= max) return max;
  return v;
}

function normalizeSymbol(v: string): string {
  return String(v || "").trim().toUpperCase();
}

function normalizeMarketScope(scope?: string[]): string[] {
  const input = Array.isArray(scope) ? scope : [...HF_DEFAULT_MARKET_SCOPE_];
  const out = new Set<string>();
  for (const market of input) {
    const key = String(market || "").trim().toUpperCase();
    if (!key) continue;
    out.add(key);
  }
  if (out.size === 0) {
    return [...HF_DEFAULT_MARKET_SCOPE_];
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

function extractDanjuanFundCode(actorId: string): string | null {
  const value = String(actorId || "").trim();
  if (!value.startsWith("danjuan_")) return null;
  const code = value.slice("danjuan_".length).trim();
  return code || null;
}

function filterActorsAndHoldingsByFundCodes(
  actors: DaaHumanActor[],
  holdings: DaaActorHoldingSnapshot[],
  fundCodes?: string[],
): { actors: DaaHumanActor[]; holdings: DaaActorHoldingSnapshot[] } {
  const wanted = new Set(normalizeFundCodes(fundCodes));
  if (!wanted.size) return { actors, holdings };

  const sourceHasDanjuanActors = actors.some((actor) => extractDanjuanFundCode(actor.actorId));
  if (!sourceHasDanjuanActors) return { actors, holdings };

  const allowedActorIds = new Set<string>();
  for (const actor of actors) {
    const fundCode = extractDanjuanFundCode(actor.actorId);
    if (!fundCode) continue;
    if (wanted.has(fundCode)) allowedActorIds.add(actor.actorId);
  }

  if (!allowedActorIds.size) return { actors: [], holdings: [] };

  return {
    actors: actors.filter((actor) => allowedActorIds.has(actor.actorId)),
    holdings: holdings.filter((row) => allowedActorIds.has(row.actorId)),
  };
}

function actorQualityScorePct(actor: DaaHumanActor): number {
  const q = actor.quality;
  const base = q.accuracyPct * 0.35 + q.riskControlPct * 0.25 + q.disciplinePct * 0.2 + q.transparencyPct * 0.2;
  return clampPct(base - q.maxDrawdownPenaltyPct * 0.4, 50);
}

function stanceByActorWeight(
  items: DaaActorHoldingSnapshot[],
  actorsById: Map<string, DaaHumanActor>,
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
  items: DaaActorHoldingSnapshot[],
  actorsById: Map<string, DaaHumanActor>,
): DaaHumanSignal {
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

function buildSourceSummary(holdings: DaaActorHoldingSnapshot[]): DaaHumanSignalSourceSummary[] {
  const counter = new Map<string, DaaHumanSignalSourceSummary>();

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

function latestAsOfDate(holdings: DaaActorHoldingSnapshot[]): string {
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

type DanjuanFundStats = {
  reportDateCount: number;
  avgHoldingCount: number;
  avgTopWeightPct: number;
  avgCashPct: number;
  avgStockPct: number;
  avgTurnoverPct: number;
};

function avg(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function computeFundStatsByCode(rows: DanjuanHoldingRow[]): Map<string, DanjuanFundStats> {
  const byFundDate = new Map<string, Map<string, DanjuanHoldingRow[]>>();

  for (const row of rows) {
    const fundCode = String(row.fundCode || "").trim();
    const reportDate = String(row.reportDate || "").trim();
    if (!fundCode || !reportDate) continue;
    if (!byFundDate.has(fundCode)) byFundDate.set(fundCode, new Map());
    const byDate = byFundDate.get(fundCode)!;
    if (!byDate.has(reportDate)) byDate.set(reportDate, []);
    byDate.get(reportDate)!.push(row);
  }

  const out = new Map<string, DanjuanFundStats>();
  for (const [fundCode, byDate] of byFundDate.entries()) {
    const dates = [...byDate.keys()].sort();
    if (!dates.length) continue;

    const holdingCounts: number[] = [];
    const topWeights: number[] = [];
    const cashPercents: number[] = [];
    const stockPercents: number[] = [];
    const turnoverPercents: number[] = [];

    for (const date of dates) {
      const rowsOnDate = byDate.get(date) ?? [];
      const weights = rowsOnDate.map((x) => clampPct(Number(x.weightPct) || 0, 0));
      holdingCounts.push(rowsOnDate.length);
      topWeights.push(weights.length ? Math.max(...weights) : 0);
      const first = rowsOnDate[0];
      cashPercents.push(clampPct(Number(first?.cashPercent) || 0, 0));
      stockPercents.push(clampPct(Number(first?.stockPercent) || 0, 0));
    }

    for (let i = 1; i < dates.length; i += 1) {
      const prevRows = byDate.get(dates[i - 1]) ?? [];
      const curRows = byDate.get(dates[i]) ?? [];
      const prevMap = new Map(prevRows.map((x) => [normalizeSymbol(x.symbol), clampPct(Number(x.weightPct) || 0, 0)]));
      const curMap = new Map(curRows.map((x) => [normalizeSymbol(x.symbol), clampPct(Number(x.weightPct) || 0, 0)]));
      const allSymbols = new Set<string>([...prevMap.keys(), ...curMap.keys()]);
      let turnover = 0;
      for (const symbol of allSymbols) {
        const prev = prevMap.get(symbol) ?? 0;
        const cur = curMap.get(symbol) ?? 0;
        turnover += Math.abs(cur - prev);
      }
      turnoverPercents.push(turnover);
    }

    out.set(fundCode, {
      reportDateCount: dates.length,
      avgHoldingCount: avg(holdingCounts),
      avgTopWeightPct: avg(topWeights),
      avgCashPct: avg(cashPercents),
      avgStockPct: avg(stockPercents),
      avgTurnoverPct: avg(turnoverPercents),
    });
  }

  return out;
}

function deriveActorProfile(item: DanjuanFundRegistryItem, stats?: DanjuanFundStats): DaaHumanActor {
  const statsSafe = stats ?? {
    reportDateCount: 1,
    avgHoldingCount: 10,
    avgTopWeightPct: 20,
    avgCashPct: 8,
    avgStockPct: 92,
    avgTurnoverPct: 35,
  };

  if (item.kind === "balanced") {
    const baseQuality = {
      accuracyPct: 70,
      riskControlPct: 85,
      disciplinePct: 80,
      transparencyPct: 78,
      maxDrawdownPenaltyPct: 12,
    };
    return {
      actorId: `danjuan_${item.fundCode}`,
      displayName: item.label,
      kind: "fund",
      markets: ["CN", "HK", "US"],
      styleCluster: "balanced",
      stance: "defensive",
      sourcePolicy: "hybrid",
      quality: {
        accuracyPct: clampPct(baseQuality.accuracyPct + Math.min(6, statsSafe.reportDateCount * 1.2) - Math.max(0, statsSafe.avgTurnoverPct - 45) * 0.12, baseQuality.accuracyPct),
        riskControlPct: clampPct(baseQuality.riskControlPct + (statsSafe.avgCashPct - 15) * 0.22 - Math.max(0, statsSafe.avgTopWeightPct - 24) * 0.35, baseQuality.riskControlPct),
        disciplinePct: clampPct(baseQuality.disciplinePct + (statsSafe.reportDateCount >= 2 ? 4 : -6) - Math.max(0, statsSafe.avgTurnoverPct - 35) * 0.18, baseQuality.disciplinePct),
        transparencyPct: clampPct(baseQuality.transparencyPct + Math.min(8, statsSafe.reportDateCount * 2) + Math.min(6, (statsSafe.avgHoldingCount - 12) * 0.3), baseQuality.transparencyPct),
        maxDrawdownPenaltyPct: clampRange(
          baseQuality.maxDrawdownPenaltyPct
            + Math.max(0, statsSafe.avgTopWeightPct - 25) * 0.28
            + Math.max(0, statsSafe.avgTurnoverPct - 40) * 0.15
            - statsSafe.avgCashPct * 0.06,
          6,
          30,
          baseQuality.maxDrawdownPenaltyPct,
        ),
      },
    };
  }

  if (item.kind === "qdii") {
    const baseQuality = {
      accuracyPct: 72,
      riskControlPct: 76,
      disciplinePct: 76,
      transparencyPct: 82,
      maxDrawdownPenaltyPct: 17,
    };
    return {
      actorId: `danjuan_${item.fundCode}`,
      displayName: item.label,
      kind: "fund",
      markets: ["US", "HK", "CN"],
      styleCluster: "global",
      stance: "neutral",
      sourcePolicy: "hybrid",
      quality: {
        accuracyPct: clampPct(baseQuality.accuracyPct + Math.min(5, statsSafe.reportDateCount * 1.1) - Math.max(0, statsSafe.avgTurnoverPct - 55) * 0.08, baseQuality.accuracyPct),
        riskControlPct: clampPct(baseQuality.riskControlPct + (statsSafe.avgCashPct - 10) * 0.16 - Math.max(0, statsSafe.avgTopWeightPct - 20) * 0.4, baseQuality.riskControlPct),
        disciplinePct: clampPct(baseQuality.disciplinePct + (statsSafe.reportDateCount >= 2 ? 3 : -5) - Math.max(0, statsSafe.avgTurnoverPct - 40) * 0.2, baseQuality.disciplinePct),
        transparencyPct: clampPct(baseQuality.transparencyPct + Math.min(8, statsSafe.reportDateCount * 2) + Math.min(4, (statsSafe.avgHoldingCount - 10) * 0.25), baseQuality.transparencyPct),
        maxDrawdownPenaltyPct: clampRange(
          baseQuality.maxDrawdownPenaltyPct
            + Math.max(0, statsSafe.avgTopWeightPct - 22) * 0.35
            + Math.max(0, statsSafe.avgTurnoverPct - 48) * 0.15
            - statsSafe.avgCashPct * 0.04,
          8,
          35,
          baseQuality.maxDrawdownPenaltyPct,
        ),
      },
    };
  }

  const baseQuality = {
    accuracyPct: 75,
    riskControlPct: 72,
    disciplinePct: 74,
    transparencyPct: 80,
    maxDrawdownPenaltyPct: 18,
  };
  return {
    actorId: `danjuan_${item.fundCode}`,
    displayName: item.label,
    kind: "fund",
    markets: ["CN", "HK"],
    styleCluster: "equity",
    stance: "offensive",
    sourcePolicy: "hybrid",
    quality: {
      accuracyPct: clampPct(baseQuality.accuracyPct + Math.min(6, statsSafe.reportDateCount * 1.3) - Math.max(0, statsSafe.avgTurnoverPct - 50) * 0.1, baseQuality.accuracyPct),
      riskControlPct: clampPct(baseQuality.riskControlPct + (statsSafe.avgCashPct - 8) * 0.18 - Math.max(0, statsSafe.avgTopWeightPct - 18) * 0.42, baseQuality.riskControlPct),
      disciplinePct: clampPct(baseQuality.disciplinePct + (statsSafe.reportDateCount >= 2 ? 3 : -6) - Math.max(0, statsSafe.avgTurnoverPct - 38) * 0.22, baseQuality.disciplinePct),
      transparencyPct: clampPct(baseQuality.transparencyPct + Math.min(8, statsSafe.reportDateCount * 2) + Math.min(5, (statsSafe.avgHoldingCount - 10) * 0.25), baseQuality.transparencyPct),
      maxDrawdownPenaltyPct: clampRange(
        baseQuality.maxDrawdownPenaltyPct
          + Math.max(0, statsSafe.avgTopWeightPct - 18) * 0.4
          + Math.max(0, statsSafe.avgTurnoverPct - 45) * 0.2
          - statsSafe.avgCashPct * 0.03,
        10,
        40,
        baseQuality.maxDrawdownPenaltyPct,
      ),
    },
  };
}

function reportDateToTs(reportDate: string): number {
  const t = Date.parse(`${reportDate}T00:00:00.000Z`);
  return Number.isFinite(t) ? t : 0;
}

function toHoldingSnapshots(rows: DanjuanHoldingRow[], registry: DanjuanFundRegistryItem[]): {
  actors: DaaHumanActor[];
  holdings: DaaActorHoldingSnapshot[];
} {
  const registryByCode = new Map(registry.map((item) => [item.fundCode, item]));
  const statsByCode = computeFundStatsByCode(rows);
  const actorById = new Map<string, DaaHumanActor>();

  for (const row of rows) {
    const config = registryByCode.get(row.fundCode);
    if (!config) continue;
    const actor = deriveActorProfile(config, statsByCode.get(row.fundCode));
    actorById.set(actor.actorId, actor);
  }

  const sorted = [...rows].sort((a, b) => reportDateToTs(b.reportDate) - reportDateToTs(a.reportDate));
  const prevWeightMap = new Map<string, number>();
  const holdings: DaaActorHoldingSnapshot[] = [];

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

function resolveDanjuanConcurrency(): number {
  const raw = Number(process.env.DAA_HF_DANJUAN_CONCURRENCY || 4);
  if (!Number.isFinite(raw)) return 4;
  return Math.max(1, Math.min(12, Math.trunc(raw)));
}

async function runTasksWithConcurrency<T, R>(
  tasks: T[],
  concurrency: number,
  worker: (task: T) => Promise<R>,
): Promise<R[]> {
  if (tasks.length === 0) return [];
  const size = Math.max(1, Math.min(concurrency, tasks.length));
  const out: R[] = [];
  let cursor = 0;

  async function consume() {
    while (cursor < tasks.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await worker(tasks[index]);
    }
  }

  await Promise.all(Array.from({ length: size }, () => consume()));
  return out;
}

async function fetchDanjuanRows(opts: {
  reportDates?: string[];
  fundCodes?: string[];
}): Promise<{
  rows: DanjuanHoldingRow[];
  rawPayloads: Array<{
    fundCode: string;
    reportDate: string;
    raw: DanjuanFundFetchRaw;
  }>;
  registry: DanjuanFundRegistryItem[];
  diagnostics: {
    requestPairs: number;
    nonEmptyPairs: number;
    concurrency: number;
  };
}> {
  let resolvedRegistry = resolveDanjuanFundRegistry().filter((item) => item.enabled);
  try {
    const system = await getDaaSystemConfig();
    const hfSource = system.config.dataSources.hfFund;
    if (hfSource.enabled === false) {
      return {
        rows: [],
        rawPayloads: [],
        registry: [],
        diagnostics: { requestPairs: 0, nonEmptyPairs: 0, concurrency: resolveDanjuanConcurrency() },
      };
    }
    resolvedRegistry = (hfSource.funds ?? [])
      .map((item): DanjuanFundRegistryItem => {
        const kind: DanjuanFundRegistryItem["kind"] =
          item?.kind === "qdii" || item?.kind === "balanced" ? item.kind : "equity";
        const fundCode = String(item?.fundCode || "").trim();
        return {
          fundCode,
          label: String(item?.label || "").trim() || `基金 ${fundCode}`,
          kind,
          enabled: item?.enabled !== false,
        };
      })
      .filter((item) => item.fundCode.length > 0 && item.enabled);
  } catch (err) {
    logSwallowed("hfService.resolveRegistry", err);
  }

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
  if (!registry.length) {
    return {
      rows: [],
      rawPayloads: [],
      registry: [],
      diagnostics: { requestPairs: 0, nonEmptyPairs: 0, concurrency: resolveDanjuanConcurrency() },
    };
  }

  const reportDates = (opts.reportDates && opts.reportDates.length > 0 ? opts.reportDates : resolveDanjuanReportDates(2))
    .map((d) => String(d || "").trim())
    .filter(Boolean);

  const tasks = registry.flatMap((item) =>
    reportDates.map((reportDate) => ({ fundCode: item.fundCode, reportDate })),
  );
  const concurrency = resolveDanjuanConcurrency();
  const fetched = await runTasksWithConcurrency(tasks, concurrency, async (task) => {
    const fetchedRows = await fetchDanjuanFundAssetPercentWithRaw({
      fundCode: task.fundCode,
      reportDate: task.reportDate,
    });
    return {
      fundCode: task.fundCode,
      reportDate: task.reportDate,
      rows: fetchedRows.rows,
      raw: fetchedRows.raw,
    };
  });

  const results: DanjuanHoldingRow[] = [];
  const rawPayloads: Array<{
    fundCode: string;
    reportDate: string;
    raw: DanjuanFundFetchRaw;
  }> = [];
  let nonEmptyPairs = 0;
  for (const item of fetched) {
    if (item.raw) {
      rawPayloads.push({
        fundCode: item.fundCode,
        reportDate: item.reportDate,
        raw: item.raw,
      });
    }
    if (!item.rows.length) continue;
    nonEmptyPairs += 1;
    results.push(...item.rows);
  }

  const dedup = new Map<string, DanjuanHoldingRow>();
  for (const row of results) {
    const key = `${row.fundCode}::${row.reportDate}::${row.symbol}`;
    dedup.set(key, row);
  }

  return {
    rows: [...dedup.values()],
    rawPayloads,
    registry,
    diagnostics: {
      requestPairs: tasks.length,
      nonEmptyPairs,
      concurrency,
    },
  };
}

function buildSignalBatchFromActorsAndHoldings(opts: {
  actors: DaaHumanActor[];
  holdings: DaaActorHoldingSnapshot[];
  marketScope?: string[];
  symbols?: string[];
  mode: DaaHumanSignalBatch["mode"];
}): DaaHumanSignalBatch {
  const scopeValues = normalizeMarketScope(opts.marketScope);
  const scope = new Set(scopeValues);
  const symbolFilter = new Set((opts.symbols ?? []).map((s) => normalizeSymbol(s)).filter(Boolean));

  const actors = opts.actors.filter((actor) => actor.markets.some((m) => matchesScope(m, scope)));
  const actorIds = new Set(actors.map((actor) => actor.actorId));
  const actorsById = new Map(actors.map((actor) => [actor.actorId, actor]));

  const holdings = opts.holdings.filter(
    (row) => actorIds.has(row.actorId) && matchesScope(row.market, scope) && matchesSymbolFilter(row.symbol, symbolFilter),
  );

  const grouped = new Map<string, DaaActorHoldingSnapshot[]>();
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

function buildSeedSignalBatch(opts: { marketScope?: string[]; symbols?: string[] }): DaaHumanSignalBatch {
  return buildSignalBatchFromActorsAndHoldings({
    actors: HF_SEED_ACTORS_.map((x) => ({ ...x })),
    holdings: HF_SEED_HOLDINGS_.map((x) => ({ ...x })),
    marketScope: opts.marketScope,
    symbols: opts.symbols,
    mode: "official_first",
  });
}

type RuntimeHumanFactorState = {
  lastIngestAt: string | null;
  ingestCount: number;
  latestBatch: DaaHumanSignalBatch | null;
  latestActors: DaaHumanActor[];
  latestHoldings: DaaActorHoldingSnapshot[];
  hydratedFromStore: boolean;
};

const runtimeState: RuntimeHumanFactorState = {
  lastIngestAt: null,
  ingestCount: 0,
  latestBatch: null,
  latestActors: [],
  latestHoldings: [],
  hydratedFromStore: false,
};

let runtimeHydrationPromise: Promise<void> | null = null;

function sanitizeBatchFromStore(raw: unknown): DaaHumanSignalBatch | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as any;
  if (!Array.isArray(value.signals)) return null;
  return {
    generatedAt: String(value.generatedAt || new Date().toISOString()),
    asOfDate: String(value.asOfDate || new Date().toISOString().slice(0, 10)),
    marketScope: Array.isArray(value.marketScope) ? value.marketScope.map((x: unknown) => String(x || "").trim().toUpperCase()).filter(Boolean) : [],
    mode: value.mode === "danjuan_primary_with_official_fallback" ? "danjuan_primary_with_official_fallback" : "official_first",
    sourceStatus: value.sourceStatus === "live" ? "live" : "fallback_seed",
    diagnostics: Array.isArray(value.diagnostics) ? value.diagnostics.map((x: unknown) => String(x || "")).filter(Boolean) : [],
    actorCount: Math.max(0, Number(value.actorCount) || 0),
    holdingCount: Math.max(0, Number(value.holdingCount) || 0),
    signals: Array.isArray(value.signals) ? value.signals : [],
    sources: Array.isArray(value.sources) ? value.sources : [],
  };
}

function sanitizeActorsFromStore(raw: unknown): DaaHumanActor[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x) => x && typeof x === "object") as DaaHumanActor[];
}

function sanitizeHoldingsFromStore(raw: unknown): DaaActorHoldingSnapshot[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x) => x && typeof x === "object") as DaaActorHoldingSnapshot[];
}

async function ensureRuntimeHydratedFromStore(): Promise<void> {
  if (runtimeState.hydratedFromStore) return;
  if (runtimeHydrationPromise) return runtimeHydrationPromise;

  runtimeHydrationPromise = (async () => {
    try {
      const persisted = await getDaaHumanIngestState();
      if (persisted) {
        runtimeState.lastIngestAt = persisted.lastIngestAt;
        runtimeState.ingestCount = Math.max(0, Number(persisted.ingestCount) || 0);
        runtimeState.latestBatch = sanitizeBatchFromStore(persisted.latestBatch);
        runtimeState.latestActors = sanitizeActorsFromStore(persisted.latestActors);
        runtimeState.latestHoldings = sanitizeHoldingsFromStore(persisted.latestHoldings);
      }
    } catch (err) {
      logSwallowed("hfService.hydrateFromStore", err);
    } finally {
      runtimeState.hydratedFromStore = true;
      runtimeHydrationPromise = null;
    }
  })();

  return runtimeHydrationPromise;
}

function shouldUseCache(maxAgeMs = 6 * 60 * 60 * 1000): boolean {
  if (!runtimeState.lastIngestAt || !runtimeState.latestBatch) return false;
  const ts = Date.parse(runtimeState.lastIngestAt);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < maxAgeMs;
}

export type DaaFundManagerOperation = {
  symbol: string;
  actorId: string;
  fundCode: string;
  fundName: string;
  deltaWeightPct: number;
  weightPct: number;
  prevWeightPct: number;
  disclosedAt: string;
  sourceName: string;
  sourceRef: string;
  confidencePct: number;
};

export type DaaFundManagerOpsBySymbol = {
  symbol: string;
  generatedAt: string;
  sourceStatus: "live" | "fallback_seed" | "unknown";
  topAdds: DaaFundManagerOperation[];
  topReduces: DaaFundManagerOperation[];
};

function buildBatchFromRuntimeState(opts: {
  marketScope?: string[];
  symbols?: string[];
  fundCodes?: string[];
}): DaaHumanSignalBatch {
  const baseActors = runtimeState.latestActors.length > 0
    ? runtimeState.latestActors.map((x) => ({ ...x }))
    : HF_SEED_ACTORS_.map((x) => ({ ...x }));
  const baseHoldings = runtimeState.latestHoldings.length > 0
    ? runtimeState.latestHoldings.map((x) => ({ ...x }))
    : HF_SEED_HOLDINGS_.map((x) => ({ ...x }));

  const filtered = filterActorsAndHoldingsByFundCodes(baseActors, baseHoldings, opts.fundCodes);
  const mode = runtimeState.latestBatch?.mode ?? "official_first";
  const sourceStatus = runtimeState.latestBatch?.sourceStatus ?? "fallback_seed";
  const diagnostics = runtimeState.latestBatch?.diagnostics ?? [];

  const batch = buildSignalBatchFromActorsAndHoldings({
    actors: filtered.actors,
    holdings: filtered.holdings,
    marketScope: opts.marketScope,
    symbols: opts.symbols,
    mode,
  });

  return {
    ...batch,
    sourceStatus,
    diagnostics,
  };
}

async function buildDanjuanSignalBatch(opts: {
  marketScope?: string[];
  symbols?: string[];
  reportDates?: string[];
  fundCodes?: string[];
}): Promise<{
  batch: DaaHumanSignalBatch;
  actors: DaaHumanActor[];
  holdings: DaaActorHoldingSnapshot[];
  rawPayloads: Array<{
    fundCode: string;
    reportDate: string;
    raw: DanjuanFundFetchRaw;
  }>;
  diagnostics: {
    requestPairs: number;
    nonEmptyPairs: number;
    concurrency: number;
  };
} | null> {
  if (!isDanjuanSourceEnabled()) return null;

  const { rows, rawPayloads, registry, diagnostics } = await fetchDanjuanRows({
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
    rawPayloads,
    diagnostics,
  };
}

export function listHumanActors(opts: { marketScope?: string[] } = {}): DaaHumanActor[] {
  const scope = new Set(normalizeMarketScope(opts.marketScope));
  const source = runtimeState.latestActors.length > 0 ? runtimeState.latestActors : HF_SEED_ACTORS_;
  return source.filter((actor) => actor.markets.some((m) => matchesScope(m, scope))).map((actor) => ({ ...actor }));
}

export function listActorHoldings(actorId: string, opts: { marketScope?: string[] } = {}): DaaActorHoldingSnapshot[] {
  const normalizedActorId = String(actorId || "").trim();
  if (!normalizedActorId) return [];

  const scope = new Set(normalizeMarketScope(opts.marketScope));
  const source = runtimeState.latestHoldings.length > 0 ? runtimeState.latestHoldings : HF_SEED_HOLDINGS_;

  return source
    .filter((row) => row.actorId === normalizedActorId && matchesScope(row.market, scope))
    .map((row) => ({ ...row }));
}

export async function listFundManagerOperationsBySymbols(opts: {
  symbols: string[];
  marketScope?: string[];
  topN?: number;
}): Promise<Record<string, DaaFundManagerOpsBySymbol>> {
  const symbols = [...new Set((opts.symbols ?? []).map((item) => normalizeSymbol(item)).filter(Boolean))];
  if (!symbols.length) return {};

  await getLatestHumanSignalBatch({
    symbols,
    marketScope: opts.marketScope,
    autoIngestOnMiss: false,
  });

  const runtime = getHumanIngestRuntimeState();
  const sourceStatus = runtime.latestBatch?.sourceStatus ?? "unknown";
  const generatedAt = runtime.latestBatch?.generatedAt || new Date().toISOString();
  const scope = new Set(normalizeMarketScope(opts.marketScope));
  const topN = Math.max(1, Math.min(10, Math.trunc(Number(opts.topN) || 5)));

  const actors = runtime.latestActors.length > 0 ? runtime.latestActors : HF_SEED_ACTORS_;
  const actorMap = new Map(actors.map((actor) => [actor.actorId, actor]));
  const holdings = runtime.latestHoldings.length > 0
    ? runtime.latestHoldings
    : HF_SEED_HOLDINGS_;
  const symbolSet = new Set(symbols);
  const rowsBySymbol = new Map<string, DaaFundManagerOperation[]>();

  for (const row of holdings) {
    const symbol = normalizeSymbol(row.symbol);
    if (!symbolSet.has(symbol)) continue;
    if (!matchesScope(row.market, scope)) continue;

    const deltaWeightPct = Number((Number(row.weightPct || 0) - Number(row.prevWeightPct || 0)).toFixed(4));
    if (!Number.isFinite(deltaWeightPct) || Math.abs(deltaWeightPct) < 0.0001) continue;

    const actor = actorMap.get(row.actorId);
    const fundCode = extractDanjuanFundCode(row.actorId) || normalizeSymbol(row.actorId);
    const operation: DaaFundManagerOperation = {
      symbol,
      actorId: row.actorId,
      fundCode,
      fundName: actor?.displayName || fundCode,
      deltaWeightPct,
      weightPct: Number((Number(row.weightPct || 0)).toFixed(4)),
      prevWeightPct: Number((Number(row.prevWeightPct || 0)).toFixed(4)),
      disclosedAt: row.disclosedAt,
      sourceName: row.sourceName,
      sourceRef: row.sourceRef,
      confidencePct: Number((Number(row.confidencePct || 0)).toFixed(2)),
    };

    const bucket = rowsBySymbol.get(symbol);
    if (bucket) {
      bucket.push(operation);
    } else {
      rowsBySymbol.set(symbol, [operation]);
    }
  }

  const out: Record<string, DaaFundManagerOpsBySymbol> = {};
  for (const symbol of symbols) {
    const rows = rowsBySymbol.get(symbol) ?? [];
    out[symbol] = {
      symbol,
      generatedAt,
      sourceStatus,
      topAdds: rows
        .filter((row) => row.deltaWeightPct > 0)
        .sort((a, b) => b.deltaWeightPct - a.deltaWeightPct || b.confidencePct - a.confidencePct)
        .slice(0, topN),
      topReduces: rows
        .filter((row) => row.deltaWeightPct < 0)
        .sort((a, b) => a.deltaWeightPct - b.deltaWeightPct || b.confidencePct - a.confidencePct)
        .slice(0, topN),
    };
  }

  return out;
}

export function computeHumanSignalBatch(opts: { marketScope?: string[]; symbols?: string[] } = {}): DaaHumanSignalBatch {
  return buildSeedSignalBatch(opts);
}

export async function runHumanIngest(opts: {
  marketScope?: string[];
  symbols?: string[];
  reportDates?: string[];
  fundCodes?: string[];
} = {}): Promise<{ summary: DaaHumanIngestSummary; batch: DaaHumanSignalBatch }> {
  await ensureRuntimeHydratedFromStore();

  const diagnostics: string[] = [];
  let danjuan: Awaited<ReturnType<typeof buildDanjuanSignalBatch>> = null;

  try {
    danjuan = await buildDanjuanSignalBatch(opts);
    if (!danjuan) diagnostics.push("danjuan_unavailable_or_empty");
    if (danjuan?.diagnostics) {
      diagnostics.push(
        `danjuan_fetch_pairs=${danjuan.diagnostics.requestPairs},non_empty_pairs=${danjuan.diagnostics.nonEmptyPairs},concurrency=${danjuan.diagnostics.concurrency}`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    diagnostics.push(`danjuan_error:${message}`);
    danjuan = null;
  }

  const usingFallback = !danjuan;
  const batch = danjuan?.batch ?? buildSeedSignalBatch({ marketScope: opts.marketScope, symbols: opts.symbols });
  const actors = danjuan?.actors ?? HF_SEED_ACTORS_;
  const holdings = danjuan?.holdings ?? HF_SEED_HOLDINGS_;
  const batchWithSource: DaaHumanSignalBatch = {
    ...batch,
    sourceStatus: usingFallback ? "fallback_seed" : "live",
    diagnostics,
  };

  runtimeState.latestBatch = batchWithSource;
  runtimeState.latestActors = actors.map((x) => ({ ...x }));
  runtimeState.latestHoldings = holdings.map((x) => ({ ...x }));
  runtimeState.lastIngestAt = new Date().toISOString();
  runtimeState.ingestCount += 1;

  try {
    await saveDaaHumanIngestState({
      lastIngestAt: runtimeState.lastIngestAt,
      ingestCount: runtimeState.ingestCount,
      latestBatch: batchWithSource as unknown as Record<string, unknown>,
      latestActors: runtimeState.latestActors as unknown as Array<Record<string, unknown>>,
      latestHoldings: runtimeState.latestHoldings as unknown as Array<Record<string, unknown>>,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    diagnostics.push(`store_persist_failed:${message}`);
  }

  try {
    const rawRefByFundReport = new Map<string, string>();
    const ingestFetchedAt = runtimeState.lastIngestAt || new Date().toISOString();
    if (danjuan?.rawPayloads?.length) {
      for (const payload of danjuan.rawPayloads) {
        try {
          const raw = await appendDaaExternalPayloadRaw({
            provider: "danjuan",
            resource: "danjuan.fund.asset.percent",
            subjectKey: `${payload.fundCode}::${payload.reportDate}`,
            requestUrl: payload.raw.requestUrl,
            requestJson: {
              fundCode: payload.fundCode,
              reportDate: payload.reportDate,
            },
            responseStatus: payload.raw.responseStatus,
            responseHeadersJson: payload.raw.responseHeadersJson,
            payloadJson: payload.raw.payloadJson,
            payloadText: payload.raw.payloadText || null,
            fetchedAt: ingestFetchedAt,
            expireAt: new Date(Date.now() + HF_RAW_RETENTION_DAYS_ * 24 * 3600 * 1000).toISOString(),
          });
          rawRefByFundReport.set(`${payload.fundCode}::${payload.reportDate}`, raw.id);
        } catch {
          // ignore raw persist errors
        }
      }
    }

    await replaceDaaHfHoldingSnapshots(
      runtimeState.latestHoldings.map((row) => {
        const fundCode = extractDanjuanFundCode(row.actorId) || row.actorId;
        const reportDate = String(row.disclosedAt || "").slice(0, 10);
        return {
          provider: "danjuan",
          fundCode,
          reportDate,
          symbol: normalizeSymbol(row.symbol),
          market: normalizeSymbol(row.market),
          weightPct: Number(row.weightPct || 0),
          prevWeightPct: Number(row.prevWeightPct || 0),
          disclosedAt: row.disclosedAt,
          confidencePct: Number(row.confidencePct || 0),
          sourceRef: row.sourceRef,
          fetchedAt: ingestFetchedAt,
          rawRefId: rawRefByFundReport.get(`${fundCode}::${reportDate}`) || null,
        };
      }),
      "danjuan",
    );
    await upsertDaaHfSignalSnapshots(
      batchWithSource.signals.map((signal) => ({
        provider: "human_signal",
        symbol: signal.symbol,
        aggregatedScorePct: signal.aggregatedScorePct,
        convictionPct: signal.convictionPct,
        thesisDriftPct: signal.thesisDriftPct,
        fundCount: signal.evidenceCount,
        fundsJson: signal.actorIds.map((actorId) => ({ actorId })),
        generatedAt: batchWithSource.generatedAt,
      })),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    diagnostics.push(`hf_snapshot_persist_failed:${message}`);
  }

  return {
    summary: {
      ingestedAt: runtimeState.lastIngestAt,
      marketScope: batch.marketScope,
      actorCount: batch.actorCount,
      holdingCount: batch.holdingCount,
      signalCount: batch.signals.length,
      mode: batch.mode,
      sourceStatus: batchWithSource.sourceStatus,
      diagnostics,
    },
    batch: batchWithSource,
  };
}

export async function getLatestHumanSignalBatch(opts: {
  marketScope?: string[];
  symbols?: string[];
  reportDates?: string[];
  fundCodes?: string[];
  forceRefresh?: boolean;
  autoIngestOnMiss?: boolean;
} = {}): Promise<DaaHumanSignalBatch> {
  await ensureRuntimeHydratedFromStore();

  const autoIngestOnMiss = opts.autoIngestOnMiss !== false;
  const shouldForceRefresh = Boolean(opts.forceRefresh)
    || (Array.isArray(opts.reportDates) && opts.reportDates.length > 0);
  if (shouldForceRefresh) {
    const ingest = await runHumanIngest({
      marketScope: opts.marketScope,
      symbols: opts.symbols,
      reportDates: opts.reportDates,
      fundCodes: opts.fundCodes,
    });
    return ingest.batch;
  }

  if (shouldUseCache()) {
    return buildBatchFromRuntimeState(opts);
  }

  if (!autoIngestOnMiss) {
    return buildBatchFromRuntimeState(opts);
  }

  const ingest = await runHumanIngest({
    marketScope: opts.marketScope,
    symbols: opts.symbols,
    reportDates: opts.reportDates,
    fundCodes: opts.fundCodes,
  });
  return ingest.batch;
}

export function getHumanIngestRuntimeState(): RuntimeHumanFactorState {
  return {
    lastIngestAt: runtimeState.lastIngestAt,
    ingestCount: runtimeState.ingestCount,
    latestBatch: runtimeState.latestBatch,
    latestActors: runtimeState.latestActors.map((x) => ({ ...x })),
    latestHoldings: runtimeState.latestHoldings.map((x) => ({ ...x })),
    hydratedFromStore: runtimeState.hydratedFromStore,
  };
}
