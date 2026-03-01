import { getLatestHumanSignalBatchV1 } from "@/src/daa/hf/hfServiceV1";
import { buildFusedOpportunitiesV1, type DaaFusedOpportunityV1, type DaaFusionWeightsV1 } from "@/src/daa/signals/fusionV1";
import { buildNewsSignalsV1, type DaaNewsSignalV1 } from "@/src/daa/signals/newsSignalV1";
import { buildTechnicalSignalsV1, type DaaTechnicalSignalV1 } from "@/src/daa/signals/technicalSignalV1";
import { listDaaDataSourcesV1 } from "@/src/daa/store/daaStorePgV1";

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
    weights: DaaFusionWeightsV1;
    newsProvider: string;
    newsQuery: string;
  };
  raw: {
    newsSignals: DaaNewsSignalV1[];
    technicalSignals: DaaTechnicalSignalV1[];
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

  const human = Number(raw.human ?? 0.45);
  const news = Number(raw.news ?? 0.25);
  const technical = Number(raw.technical ?? 0.30);

  return {
    human: Number.isFinite(human) ? Math.max(0, human) : 0.45,
    news: Number.isFinite(news) ? Math.max(0, news) : 0.25,
    technical: Number.isFinite(technical) ? Math.max(0, technical) : 0.3,
  };
}

export async function buildOpportunityPanelV1(input: {
  symbols: string[];
  fundCodes?: string[];
}): Promise<DaaOpportunityPanelV1> {
  const symbols = [...new Set((input.symbols ?? []).map((item) => normalizeSymbol(item)).filter(Boolean))];

  const [newsSources, batch] = await Promise.all([
    listDaaDataSourcesV1("news_feed"),
    getLatestHumanSignalBatchV1({ symbols, fundCodes: input.fundCodes }),
  ]);

  const newsSource = newsSources.find((item) => item.enabled) ?? newsSources[0] ?? null;
  const newsConfig = newsSource?.configJson && typeof newsSource.configJson === "object"
    ? newsSource.configJson
    : {};

  const newsProvider = String((newsConfig as any).provider || "yahoo_rss").trim() || "yahoo_rss";
  const newsQuery = String((newsConfig as any).query || "").trim();
  const newsSymbols = parseSymbolsFromConfig((newsConfig as any).symbols);
  const finalNewsSymbols = [...new Set([...symbols, ...newsSymbols])];

  const [newsSignals, technicalSignals] = await Promise.all([
    newsProvider === "yahoo_rss"
      ? buildNewsSignalsV1({ symbols: finalNewsSymbols, query: newsQuery })
      : Promise.resolve([] as DaaNewsSignalV1[]),
    buildTechnicalSignalsV1(symbols),
  ]);

  const weights = resolveFusionWeights(newsConfig as Record<string, unknown>);

  const opportunities = buildFusedOpportunitiesV1({
    symbols,
    humanSignals: batch.signals,
    newsSignals,
    technicalSignals,
    weights,
  });

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
      weights,
      newsProvider,
      newsQuery,
    },
    raw: {
      newsSignals,
      technicalSignals,
    },
  };
}
