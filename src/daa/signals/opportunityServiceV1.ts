import { getLatestHumanSignalBatchV1 } from "@/src/daa/hf/hfServiceV1";
import { buildFusedOpportunitiesV1, type DaaFusedOpportunityV1, type DaaFusionWeightsV1 } from "@/src/daa/signals/fusionV1";
import { buildNewsSignalsV1, type DaaNewsSignalV1 } from "@/src/daa/signals/newsSignalV1";
import { buildTechnicalSignalsV1, type DaaTechnicalSignalV1 } from "@/src/daa/signals/technicalSignalV1";
import { buildValuationSignalsV1, type DaaValuationSignalV1 } from "@/src/daa/signals/valuationSignalV1";
import { getDaaSystemConfigV2 } from "@/src/daa/store/daaStorePgV1";

export type DaaOpportunityPanelV1 = {
  generatedAt: string;
  symbols: string[];
  opportunities: DaaFusedOpportunityV1[];
  diagnostics: {
    humanSignalCount: number;
    humanSourceStatus: "live" | "fallback_seed" | "unknown";
    humanDiagnostics: string[];
    newsSignalCount: number;
    technicalSignalCount: number;
    valuationSignalCount: number;
    valuationEnabled: boolean;
    weights: DaaFusionWeightsV1;
    newsProvider: string;
    newsQuery: string;
  };
  raw: {
    newsSignals: DaaNewsSignalV1[];
    technicalSignals: DaaTechnicalSignalV1[];
    valuationSignals: DaaValuationSignalV1[];
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

function resolveFusionWeights(config: Record<string, unknown>): DaaFusionWeightsV1 {
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

export async function buildOpportunityPanelV1(input: {
  symbols: string[];
  fundCodes?: string[];
}): Promise<DaaOpportunityPanelV1> {
  const symbols = [...new Set((input.symbols ?? []).map((item) => normalizeSymbol(item)).filter(Boolean))];

  const [system, batch] = await Promise.all([
    getDaaSystemConfigV2(),
    getLatestHumanSignalBatchV1({ symbols, fundCodes: input.fundCodes }),
  ]);
  const newsConfig = system.config.dataSources.newsFeed;
  const newsProvider = String(newsConfig.provider || "yahoo_rss").trim() || "yahoo_rss";
  const newsQuery = String(newsConfig.query || "").trim();
  const newsSymbols = parseSymbolsFromConfig(newsConfig.symbols);
  const finalNewsSymbols = [...new Set([...symbols, ...newsSymbols])];
  const valuationEnabled = newsConfig.valuationEnabled !== false;

  const [newsSignals, technicalSignals, valuationSignals] = await Promise.all([
    newsProvider === "yahoo_rss"
      ? buildNewsSignalsV1({ symbols: finalNewsSymbols, query: newsQuery })
      : Promise.resolve([] as DaaNewsSignalV1[]),
    buildTechnicalSignalsV1(symbols),
    buildValuationSignalsV1(symbols),
  ]);

  const weights = resolveFusionWeights(newsConfig as unknown as Record<string, unknown>);

  const opportunities = buildFusedOpportunitiesV1({
    symbols,
    humanSignals: batch.signals,
    newsSignals,
    technicalSignals,
    valuationSignals,
    weights: valuationEnabled ? weights : { ...weights, valuation: 0 },
  });
  const effectiveWeights = opportunities[0]?.weights
    ?? (valuationEnabled ? weights : { ...weights, valuation: 0 });

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
