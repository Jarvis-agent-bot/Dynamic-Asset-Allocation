import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { parseDaaAssetKeyV1 } from "@/src/daa/assetKeyV1";
import { runLlmAnalysisV1 } from "@/src/daa/llm/llmAnalysisV1";
import { buildOpportunityPanelV1 } from "@/src/daa/signals/opportunityServiceV1";
import {
  mapOpportunityActionLabelZhV1,
  summarizeOpportunityReasonZhV1,
  summarizeOpportunityRiskZhV1,
} from "@/src/daa/modules/workbench/workbenchServiceV1";

export const runtime = "nodejs";

type Ctx = {
  params: {
    assetKey: string;
  };
};

function parseBool(value: string | null, fallback = false): boolean {
  if (value == null) return fallback;
  const v = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return fallback;
}

type InsightMetricV1 = {
  key: string;
  label: string;
  value: number | string;
  unit?: string;
  status?: "bullish" | "bearish" | "neutral" | "unavailable";
  description?: string;
};

function toMetricArray(technical: any): InsightMetricV1[] {
  if (!technical?.metrics) return [];
  const m = technical.metrics;
  const common: InsightMetricV1[] = [
    { key: "close", label: "最新收盘", value: Number(m.close || 0), unit: "价格" },
    { key: "ema12", label: "EMA12", value: Number(m.ema12 || 0) },
    { key: "ema26", label: "EMA26", value: Number(m.ema26 || 0) },
    {
      key: "macd",
      label: "MACD 柱值",
      value: Number(m.macdHist || 0),
      status: Number(m.macdHist || 0) >= 0 ? "bullish" : "bearish",
      description: `MACD=${Number(m.macd || 0).toFixed(4)} / Signal=${Number(m.macdSignal || 0).toFixed(4)}`,
    },
    {
      key: "rsi14",
      label: "RSI14",
      value: Number(m.rsi14 || 0),
      status: Number(m.rsi14 || 0) >= 70 ? "bearish" : Number(m.rsi14 || 0) <= 35 ? "bullish" : "neutral",
    },
    {
      key: "bollinger",
      label: "布林带(20,2)",
      value: `${Number(m.bollingerLower || 0).toFixed(2)} ~ ${Number(m.bollingerUpper || 0).toFixed(2)}`,
      description: `中轨 ${Number(m.bollingerMid || 0).toFixed(2)}`,
    },
    { key: "return20", label: "20日动量", value: Number(m.return20Pct || 0), unit: "%", status: Number(m.return20Pct || 0) >= 0 ? "bullish" : "bearish" },
    { key: "return60", label: "60日动量", value: Number(m.return60Pct || 0), unit: "%", status: Number(m.return60Pct || 0) >= 0 ? "bullish" : "bearish" },
    { key: "vol", label: "年化波动", value: Number(m.annualizedVolPct || 0), unit: "%", status: Number(m.annualizedVolPct || 0) > 45 ? "bearish" : "neutral" },
    { key: "dd30", label: "30日回撤", value: Number(m.drawdown30Pct || 0), unit: "%", status: Number(m.drawdown30Pct || 0) < -10 ? "bearish" : "neutral" },
    {
      key: "cross",
      label: "形态信号",
      value: [
        m.goldenCross ? "均线金叉" : "",
        m.deathCross ? "均线死叉" : "",
        m.macdBullishCross ? "MACD 金叉" : "",
        m.macdBearishCross ? "MACD 死叉" : "",
      ].filter(Boolean).join(" / ") || "无",
    },
  ];
  return common;
}

export async function GET(req: Request, ctx: Ctx) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const parsed = parseDaaAssetKeyV1(ctx.params?.assetKey);
    if (!parsed) {
      return failV1("VALIDATION_FAILED", "assetKey is required", { status: 400 });
    }

    const url = new URL(req.url);
    const includeLlm = parseBool(url.searchParams.get("includeLlm"), false);
    const analysisFocus = String(url.searchParams.get("analysisFocus") || "评估该资产的机会与风险").trim() || "评估该资产的机会与风险";

    const panel = await buildOpportunityPanelV1({ symbols: [parsed.symbol] });
    const opp = panel.opportunities.find((item) => item.symbol === parsed.symbol) || null;
    const technical = panel.raw.technicalSignals.find((item) => item.symbol === parsed.symbol) || null;
    const news = panel.raw.newsSignals.find((item) => item.symbol === parsed.symbol) || null;

    const riskHints: string[] = [];
    if (opp) {
      if (opp.riskScorePct >= 70) riskHints.push(`风险得分 ${opp.riskScorePct.toFixed(1)} 偏高`);
      if (opp.confidencePct < 45) riskHints.push(`信号置信度 ${opp.confidencePct.toFixed(1)} 偏低`);
      for (const reason of opp.reasons.slice(0, 4)) {
        if (/risk|风险|波动|drawdown|回撤|avoid|reduce/i.test(reason)) {
          riskHints.push(reason);
        }
      }
    }
    if (technical && Number(technical.metrics?.annualizedVolPct || 0) >= 35) {
      riskHints.push(`技术面显示年化波动 ${Number(technical.metrics?.annualizedVolPct || 0).toFixed(2)}% 偏高`);
    }

    const llmAnalysis = includeLlm && opp
      ? await runLlmAnalysisV1({
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
        warnings: riskHints,
      })
      : null;

    const aiSummary = llmAnalysis && llmAnalysis.status === "ok"
      ? {
        summary: llmAnalysis.summary,
        drivers: news?.reasons?.slice(0, 3) || [],
        bullish: llmAnalysis.opportunityNotes.slice(0, 4),
        bearish: llmAnalysis.riskNotes.slice(0, 4),
        uncertainties: riskHints.slice(0, 4),
        actions: [
          opp ? `${mapOpportunityActionLabelZhV1(opp.action)}（${opp.symbol}）` : "继续观察",
          ...(llmAnalysis.opportunityNotes.slice(0, 2)),
        ],
      }
      : null;

    return okV1({
      assetKey: `${parsed.market}::${parsed.symbol}`,
      symbol: parsed.symbol,
      generatedAt: new Date().toISOString(),
      opportunity: opp ? {
        action: opp.action,
        actionLabelZh: mapOpportunityActionLabelZhV1(opp.action),
        finalScorePct: opp.finalScorePct,
        confidencePct: opp.confidencePct,
        riskScorePct: opp.riskScorePct,
        reasons: opp.reasons,
        reasonZh: summarizeOpportunityReasonZhV1(opp.reasons),
        riskZh: summarizeOpportunityRiskZhV1(opp.riskScorePct, opp.reasons),
      } : null,
      technical: technical ? {
        scorePct: technical.scorePct,
        confidencePct: technical.confidencePct,
        momentumRegime: technical.momentumRegime,
        reasons: technical.reasons,
        common: toMetricArray(technical),
        specific: Array.isArray(technical.specific) ? technical.specific : [],
      } : null,
      news: news ? {
        scorePct: news.scorePct,
        confidencePct: news.confidencePct,
        evidenceCount: news.evidenceCount,
        reasons: news.reasons,
        items: news.items.slice(0, 8).map((item) => ({
          title: item.title,
          link: item.link || "",
          ts: item.ts,
          sourceCredibility: item.sourceCredibility,
          sentimentScore: item.sentimentScore,
        })),
        aiSummary,
      } : null,
      llmAnalysis,
      riskHints,
    });
  });
}
