import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, readJsonBodyV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { listFundManagerOperationsBySymbolsV1 } from "@/src/daa/hf/hfServiceV1";
import { type AssetInsightDetailModeV1, type DaaAssetInsightsResponseV1 } from "@/src/daa/insights/assetInsightsV1";
import { runLlmAnalysisV1 } from "@/src/daa/llm/llmAnalysisV1";
import { buildOpportunityPanelV1 } from "@/src/daa/signals/opportunityServiceV1";

export const runtime = "nodejs";

type AssetInsightsBody = {
  symbols?: unknown;
  detailMode?: unknown;
  analysisFocus?: unknown;
  fundCodes?: unknown;
  fundOpsLimit?: unknown;
  includeLlm?: unknown;
};

function normalizeSymbol(value: unknown): string {
  return String(value || "").trim().toUpperCase();
}

function parseSymbols(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out = new Set<string>();
  for (const raw of value) {
    const symbol = normalizeSymbol(raw);
    if (!symbol) continue;
    out.add(symbol);
  }
  return [...out];
}

function parseCsv(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))];
  }
  if (typeof value === "string") {
    return [...new Set(value.split(/[\s,;，]+/g).map((item) => item.trim()).filter(Boolean))];
  }
  return [];
}

function parseDetailMode(value: unknown): AssetInsightDetailModeV1 {
  const text = String(value || "").trim().toLowerCase();
  return text === "full" ? "full" : "lite";
}

function parseBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (text === "1" || text === "true" || text === "yes" || text === "on") return true;
    if (text === "0" || text === "false" || text === "no" || text === "off") return false;
  }
  return fallback;
}

function parsePositiveInt(value: unknown, fallback: number, min: number, max: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(num)));
}

function trimNewsItemsToRecentDays<T extends { ts: string }>(items: T[], days: number): T[] {
  const now = Date.now();
  const floor = now - Math.max(1, days) * 24 * 60 * 60 * 1000;
  return items.filter((item) => {
    const ms = Date.parse(String(item.ts || ""));
    return Number.isFinite(ms) && ms >= floor;
  });
}

export async function GET(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    return okV1({
      message: "POST { symbols, detailMode, analysisFocus } to query asset insights.",
      detailModes: ["lite", "full"],
      now: new Date().toISOString(),
    });
  });
}

export async function POST(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const body = await readJsonBodyV1<AssetInsightsBody>(req);
    const symbols = parseSymbols(body?.symbols).slice(0, 40);
    const detailMode = parseDetailMode(body?.detailMode);
    const analysisFocus = String(body?.analysisFocus || "").trim();
    const fundCodes = parseCsv(body?.fundCodes);
    const fundOpsLimit = parsePositiveInt(body?.fundOpsLimit, 5, 1, 10);
    const includeLlm = parseBool(body?.includeLlm, detailMode === "full");

    if (!symbols.length) {
      return failV1("VALIDATION_FAILED", "symbols must be a non-empty array", { status: 400 });
    }
    if (!analysisFocus) {
      return failV1("VALIDATION_FAILED", "analysisFocus is required", { status: 400 });
    }

    const panel = await buildOpportunityPanelV1({ symbols, fundCodes });
    const oppMap = new Map(panel.opportunities.map((item) => [normalizeSymbol(item.symbol), item]));
    const techMap = new Map(panel.raw.technicalSignals.map((item) => [normalizeSymbol(item.symbol), item]));
    const newsMap = new Map(panel.raw.newsSignals.map((item) => [normalizeSymbol(item.symbol), item]));

    const fundOpsMap = detailMode === "full"
      ? await listFundManagerOperationsBySymbolsV1({ symbols, topN: fundOpsLimit })
      : {};

    const llmMap = new Map<string, Awaited<ReturnType<typeof runLlmAnalysisV1>>>();
    if (detailMode === "full" && includeLlm) {
      const symbolsForLlm = symbols.slice(0, 5);
      await Promise.all(symbolsForLlm.map(async (symbol) => {
        const opp = oppMap.get(symbol);
        if (!opp) return;
        const llm = await runLlmAnalysisV1({
          analysisContext: "insight",
          baseCurrency: "USD",
          shouldRebalance: opp.action === "open_or_add",
          analysisFocus,
          opportunities: [{
            symbol: opp.symbol,
            finalScorePct: opp.finalScorePct,
            confidencePct: opp.confidencePct,
            riskScorePct: opp.riskScorePct,
            action: opp.action,
            reasons: opp.reasons,
          }],
          warnings: opp.reasons.slice(0, 4),
        });
        llmMap.set(symbol, llm);
      }));
    }

    const response: DaaAssetInsightsResponseV1 = {
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      detailMode,
      analysisFocus,
      insights: symbols.map((symbol) => {
        const opp = oppMap.get(symbol);
        const news = detailMode === "full" ? (newsMap.get(symbol) ?? null) : null;
        const trimmedNews = news
          ? { ...news, items: trimNewsItemsToRecentDays(news.items, 7).slice(0, 7) }
          : null;
        return {
          symbol,
          lite: {
            finalScorePct: Number(opp?.finalScorePct || 0),
            confidencePct: Number(opp?.confidencePct || 0),
            riskScorePct: Number(opp?.riskScorePct || 0),
            action: (opp?.action || "watch") as "open_or_add" | "watch" | "reduce_or_avoid",
            reasons: Array.isArray(opp?.reasons) ? opp.reasons : [],
          },
          technical: detailMode === "full" ? (techMap.get(symbol) ?? null) : null,
          news: trimmedNews,
          fundManagerOps: detailMode === "full" ? (fundOpsMap[symbol] ?? null) : null,
          llmAnalysis: detailMode === "full" ? (llmMap.get(symbol) ?? null) : null,
        };
      }),
      diagnostics: {
        humanSourceStatus: panel.diagnostics.humanSourceStatus,
        humanDiagnostics: panel.diagnostics.humanDiagnostics,
        opportunityCount: panel.opportunities.length,
        technicalSignalCount: panel.diagnostics.technicalSignalCount,
        newsSignalCount: panel.diagnostics.newsSignalCount,
      },
    };

    return okV1(response);
  });
}
