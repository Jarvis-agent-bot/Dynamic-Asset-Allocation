import { getLatestHumanSignalBatch } from "@/src/daa/hf/hfService";
import { buildFusedOpportunities, type DaaFusedOpportunity, type DaaFusionWeights } from "@/src/daa/signals/fusion";
import { buildNewsSignals, type DaaNewsSignal } from "@/src/daa/signals/newsSignal";
import { buildTechnicalSignals, type DaaTechnicalSignal } from "@/src/daa/signals/technicalSignal";
import { buildValuationSignals, type DaaValuationSignal } from "@/src/daa/signals/valuationSignal";
import { getDaaSystemConfig } from "@/src/daa/store/daaStorePg";
import type { SignalType } from "@/src/daa/agent/tools/types";

export type DaaOpportunityPanel = {
  generatedAt: string;
  symbols: string[];
  opportunities: DaaFusedOpportunity[];
  diagnostics: {
    humanSignalCount: number;
    humanSourceStatus: "live" | "fallback_seed" | "unknown";
    humanDiagnostics: string[];
    newsSignalCount: number;
    technicalSignalCount: number;
    valuationSignalCount: number;
    valuationEnabled: boolean;
    weights: DaaFusionWeights;
    newsProvider: string;
    newsQuery: string;
  };
  raw: {
    newsSignals: DaaNewsSignal[];
    technicalSignals: DaaTechnicalSignal[];
    valuationSignals: DaaValuationSignal[];
  };
};

function normalizeSymbol(value: unknown): string {
  return String(value || "").trim().toUpperCase();
}

function parseSymbolsFromConfig(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => normalizeSymbol(item)).filter(Boolean))];
  }
  if (typeof value === "string") {
    return [...new Set(
      value
        .split(/[\s,;，]+/g)
        .map((item) => normalizeSymbol(item))
        .filter(Boolean),
    )];
  }
  return [];
}

function resolveFusionWeights(config: Record<string, unknown>): DaaFusionWeights {
  const raw = (config.fusionWeights && typeof config.fusionWeights === "object" && !Array.isArray(config.fusionWeights))
    ? config.fusionWeights as Record<string, unknown>
    : {};

  const human = Number(raw.human ?? 0.35);
  const news = Number(raw.news ?? 0.2);
  const technical = Number(raw.technical ?? 0.25);
  const valuation = Number(raw.valuation ?? 0.2);

  return {
    human: Number.isFinite(human) ? Math.max(0, human) : 0.35,
    news: Number.isFinite(news) ? Math.max(0, news) : 0.2,
    technical: Number.isFinite(technical) ? Math.max(0, technical) : 0.25,
    valuation: Number.isFinite(valuation) ? Math.max(0, valuation) : 0.2,
  };
}

export type SignalPlanEntry = {
  requiredSignals: Set<SignalType>;
  suggestedWeights?: DaaFusionWeights;
};

export async function buildOpportunityPanel(input: {
  symbols: string[];
  fundCodes?: string[];
  /** 选择性信号采集（用于 insights 展示筛选） */
  signalPlan?: Map<string, SignalPlanEntry>;
}): Promise<DaaOpportunityPanel> {
  const symbols = [...new Set((input.symbols ?? []).map((item) => normalizeSymbol(item)).filter(Boolean))];
  const plan = input.signalPlan;

  const [system, batch] = await Promise.all([
    getDaaSystemConfig(),
    getLatestHumanSignalBatch({ symbols, fundCodes: input.fundCodes }),
  ]);
  const newsConfig = system.config.dataSources.newsFeed;
  const newsProvider = String(newsConfig.provider || "yahoo_rss").trim() || "yahoo_rss";
  const newsQuery = String(newsConfig.query || "").trim();
  const newsSymbols = parseSymbolsFromConfig(newsConfig.symbols);
  const newsEnabled = newsConfig.enabled !== false;
  const valuationEnabled = newsConfig.valuationEnabled !== false;

  // 如果有 signalPlan，只对 plan 中包含且指定了该信号的 symbol 采集
  const needsSignal = (sym: string, signal: SignalType): boolean => {
    if (!plan) return true; // 无 plan 时全量采集
    const entry = plan.get(sym);
    if (!entry) return false; // 不在 plan 中（skipDetail）= 不采集
    return entry.requiredSignals.has(signal);
  };

  const newsSymbolsFiltered = plan
    ? [...new Set([...symbols.filter((s) => needsSignal(s, "news")), ...newsSymbols])]
    : [...new Set([...symbols, ...newsSymbols])];
  const technicalSymbolsFiltered = plan ? symbols.filter((s) => needsSignal(s, "technical")) : symbols;
  const valuationSymbolsFiltered = plan ? symbols.filter((s) => needsSignal(s, "valuation")) : symbols;

  const [newsSignals, technicalSignals, valuationSignals] = await Promise.all([
    newsEnabled && newsProvider === "yahoo_rss" && newsSymbolsFiltered.length > 0
      ? buildNewsSignals({ symbols: newsSymbolsFiltered, query: newsQuery })
      : Promise.resolve([] as DaaNewsSignal[]),
    technicalSymbolsFiltered.length > 0
      ? buildTechnicalSignals(technicalSymbolsFiltered)
      : Promise.resolve([] as DaaTechnicalSignal[]),
    valuationSymbolsFiltered.length > 0
      ? buildValuationSignals(valuationSymbolsFiltered)
      : Promise.resolve([] as DaaValuationSignal[]),
  ]);

  const weights = resolveFusionWeights(newsConfig as unknown as Record<string, unknown>);
  const requestedWeights = {
    ...weights,
    ...(newsEnabled ? {} : { news: 0 }),
    ...(valuationEnabled ? {} : { valuation: 0 }),
  };

  const opportunities = buildFusedOpportunities({
    symbols,
    humanSignals: batch.signals,
    newsSignals,
    technicalSignals,
    valuationSignals,
    weights: requestedWeights,
  });
  const effectiveWeights = opportunities[0]?.weights ?? requestedWeights;

  return {
    generatedAt: new Date().toISOString(),
    symbols,
    opportunities,
    diagnostics: {
      humanSignalCount: batch.signals.length,
      humanSourceStatus: batch.sourceStatus ?? "unknown",
      humanDiagnostics: Array.isArray(batch.diagnostics) ? batch.diagnostics : [],
      newsSignalCount: newsSignals.length,
      technicalSignalCount: technicalSignals.length,
      valuationSignalCount: valuationSignals.length,
      valuationEnabled,
      weights: effectiveWeights,
      newsProvider,
      newsQuery,
    },
    raw: {
      newsSignals,
      technicalSignals,
      valuationSignals,
    },
  };
}
