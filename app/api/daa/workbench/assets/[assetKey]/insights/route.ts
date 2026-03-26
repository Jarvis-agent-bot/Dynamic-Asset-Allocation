import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { parseDaaAssetKey } from "@/src/daa/assetKey";
import { runLlmAnalysis } from "@/src/daa/llm/llmAnalysis";
import { buildMarketContextAttribution } from "@/src/daa/modules/marketContext/marketIndicatorService";
import { preferAssetRowPrice } from "@/src/daa/modules/workbench/preferAssetRowPrice";
import { buildOpportunityPanel } from "@/src/daa/signals/opportunityService";
import { buildWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";
import {
  mapOpportunityActionLabelZh,
  summarizeOpportunityReasonZh,
  summarizeOpportunityRiskZh,
} from "@/src/daa/modules/workbench/workbenchShared";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

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

type InsightMetric = {
  key: string;
  label: string;
  value: number | string;
  unit?: string;
  status?: "bullish" | "bearish" | "neutral" | "unavailable";
  description?: string;
};

function toMetricArray(technical: any): InsightMetric[] {
  if (!technical?.metrics) return [];
  const m = technical.metrics;
  const common: InsightMetric[] = [
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

function valuationTemperatureLabel(value: "cheap" | "neutral" | "expensive"): string {
  if (value === "cheap") return "偏便宜";
  if (value === "expensive") return "偏贵";
  return "中性";
}

function toPriceSnapshot(row: {
  lastPrice: number;
  holdingPrice: number;
  currency: string;
  priceStatus: "fresh" | "stale" | "missing" | "unsupported";
  priceSource: string;
  priceUpdatedAt: string | null;
  priceAgeSec: number | null;
} | null) {
  if (!row) return null;
  const price = Number(row.lastPrice || row.holdingPrice || 0);
  return {
    price,
    currency: row.currency,
    priceStatus: row.priceStatus,
    priceSource: row.priceSource,
    priceUpdatedAt: row.priceUpdatedAt,
    priceAgeSec: row.priceAgeSec,
  };
}

export async function GET(req: Request, ctx: Ctx) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const parsed = parseDaaAssetKey(ctx.params?.assetKey);
    if (!parsed) {
      return fail("VALIDATION_FAILED", "assetKey is required", { status: 400 });
    }

    const url = new URL(req.url);
    const includeLlm = parseBool(url.searchParams.get("includeLlm"), false);
    const analysisFocus = String(url.searchParams.get("analysisFocus") || "评估该资产的机会与风险").trim() || "评估该资产的机会与风险";

    const [bootstrap, panel] = await Promise.all([
      buildWorkbenchBootstrap({ syncPrices: false }),
      buildOpportunityPanel({ symbols: [parsed.symbol] }),
    ]);
    const bootstrapRow = bootstrap.assetUniverse.find((item) => item.assetKey === `${parsed.market}::${parsed.symbol}`) || null;
    let resolvedAssetRow = bootstrapRow;
    if (bootstrapRow) {
      try {
        resolvedAssetRow = await preferAssetRowPrice(bootstrapRow, "asset_insights");
      } catch (err) {
  logSwallowed("insightsRoute.resolveAsset", err);
        resolvedAssetRow = bootstrapRow;
      }
    }
    const priceSnapshot = toPriceSnapshot(resolvedAssetRow);
    const marketContext = bootstrap.marketContext || null;
    const marketAttribution = buildMarketContextAttribution({
      symbol: parsed.symbol,
      assetClass: resolvedAssetRow?.assetClass,
      marketGroup: resolvedAssetRow?.marketGroup,
      instrumentType: resolvedAssetRow?.instrumentType,
      holdingTags: resolvedAssetRow?.holdingTags,
      watchTags: resolvedAssetRow?.watchTags,
      marketContext,
    });

    const opportunities = Array.isArray(panel?.opportunities) ? panel.opportunities : [];
    const technicalSignals = Array.isArray((panel as any)?.raw?.technicalSignals) ? (panel as any).raw.technicalSignals : [];
    const newsSignals = Array.isArray((panel as any)?.raw?.newsSignals) ? (panel as any).raw.newsSignals : [];
    const valuationSignals = Array.isArray((panel as any)?.raw?.valuationSignals) ? (panel as any).raw.valuationSignals : [];
    const opp = opportunities.find((item: any) => item.symbol === parsed.symbol) || null;
    const technical = technicalSignals.find((item: any) => item.symbol === parsed.symbol) || null;
    const news = newsSignals.find((item: any) => item.symbol === parsed.symbol) || null;
    const valuation = valuationSignals.find((item: any) => item.symbol === parsed.symbol) || null;

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
    if (priceSnapshot?.priceStatus === "stale") {
      riskHints.push("当前行情来自较旧缓存，建议结合最新市场状态判断");
    }
    if (priceSnapshot?.priceStatus === "missing") {
      riskHints.push("当前暂无可用行情快照，部分信号可能滞后");
    }

    const llmAnalysis = includeLlm && opp
      ? await runLlmAnalysis({
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
        marketContext,
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
          opp ? `${mapOpportunityActionLabelZh(opp.action)}（${opp.symbol}）` : "继续观察",
          ...(llmAnalysis.opportunityNotes.slice(0, 2)),
        ],
      }
      : null;

    return ok({
      assetKey: `${parsed.market}::${parsed.symbol}`,
      symbol: parsed.symbol,
      generatedAt: new Date().toISOString(),
      priceSnapshot,
      opportunity: opp ? {
        action: opp.action,
        actionLabelZh: mapOpportunityActionLabelZh(opp.action),
        finalScorePct: opp.finalScorePct,
        confidencePct: opp.confidencePct,
        riskScorePct: opp.riskScorePct,
        reasons: opp.reasons,
        reasonZh: summarizeOpportunityReasonZh(opp.reasons),
        riskZh: summarizeOpportunityRiskZh(opp.riskScorePct, opp.reasons),
        scores: opp.scores,
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
        items: news.items.slice(0, 8).map((item: any) => ({
          title: item.title,
          link: item.link || "",
          ts: item.ts,
          sourceCredibility: item.sourceCredibility,
          sentimentScore: item.sentimentScore,
        })),
        aiSummary,
      } : null,
      valuation: valuation ? {
        scorePct: valuation.scorePct,
        confidencePct: valuation.confidencePct,
        temperature: valuation.temperature,
        reasons: valuation.reasons,
        common: [
          {
            key: "valuation_temperature",
            label: "估值温度",
            value: valuationTemperatureLabel(valuation.temperature),
            status: valuation.temperature === "cheap" ? "bullish" : (valuation.temperature === "expensive" ? "bearish" : "neutral"),
          },
          {
            key: "valuation_percentile_90",
            label: "90日价格分位",
            value: valuation.metrics.percentile90,
            unit: "%",
            status: valuation.metrics.percentile90 <= 25 ? "bullish" : (valuation.metrics.percentile90 >= 75 ? "bearish" : "neutral"),
          },
          {
            key: "valuation_percentile_252",
            label: "252日价格分位",
            value: valuation.metrics.percentile252,
            unit: "%",
            status: valuation.metrics.percentile252 <= 30 ? "bullish" : (valuation.metrics.percentile252 >= 70 ? "bearish" : "neutral"),
          },
          {
            key: "valuation_zscore_60",
            label: "60日Z-Score",
            value: valuation.metrics.zscore60,
            status: valuation.metrics.zscore60 <= -1 ? "bullish" : (valuation.metrics.zscore60 >= 1 ? "bearish" : "neutral"),
          },
        ],
        specific: valuation.specific,
        relative: valuation.relative ? {
          ...valuation.relative,
          description: valuation.relative.description,
        } : null,
      } : null,
      marketContext,
      marketAttribution,
      llmAnalysis,
      riskHints,
    });
  });
}
