import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildWorkbenchBootstrapV1 } from "@/src/daa/modules/workbench/workbenchReadServiceV1";

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminViewerAuth: vi.fn(async () => null),
  requireDaaAdminEditorAuth: vi.fn(async () => null),
}));

vi.mock("@/src/daa/store/daaStorePgV1", () => ({
  getDaaSystemConfigV2: vi.fn(),
  patchDaaAssetUniverseRowV1: vi.fn(),
  updateDaaAssetUniverseLastPriceV1: vi.fn(),
  upsertDaaAssetUniverseRowV1: vi.fn(),
}));

vi.mock("@/src/daa/modules/marketCache/marketCacheServiceV1", () => ({
  getMarketPricesWithCacheV1: vi.fn(async () => ({})),
}));

vi.mock("@/src/daa/modules/workbench/workbenchReadServiceV1", () => ({
  buildWorkbenchBootstrapV1: vi.fn(),
}));

vi.mock("@/src/daa/modules/workbench/workbenchSharedV1", () => ({
  mapOpportunityActionLabelZhV1: vi.fn((action: string) => action === "open_or_add" ? "开仓/加仓" : action === "reduce_or_avoid" ? "减仓/回避" : "观察"),
  summarizeOpportunityReasonZhV1: vi.fn((reasons: string[]) => Array.isArray(reasons) ? reasons.join("；") : ""),
  summarizeOpportunityRiskZhV1: vi.fn(() => "风险可控，注意仓位管理"),
}));

vi.mock("@/src/daa/signals/opportunityServiceV1", () => ({
  buildOpportunityPanelV1: vi.fn(),
}));

vi.mock("@/src/daa/llm/llmAnalysisV1", () => ({
  runLlmAnalysisV1: vi.fn(),
}));

import { POST as upsertAsset } from "@/app/api/daa/workbench/assets/upsert/route";
import { PATCH as patchAsset } from "@/app/api/daa/workbench/assets/[assetKey]/route";
import { GET as getAssetInsights } from "@/app/api/daa/workbench/assets/[assetKey]/insights/route";
import { runLlmAnalysisV1 } from "@/src/daa/llm/llmAnalysisV1";
import { buildOpportunityPanelV1 } from "@/src/daa/signals/opportunityServiceV1";
import { getMarketPricesWithCacheV1 } from "@/src/daa/modules/marketCache/marketCacheServiceV1";
import { getDaaSystemConfigV2, patchDaaAssetUniverseRowV1, updateDaaAssetUniverseLastPriceV1, upsertDaaAssetUniverseRowV1 } from "@/src/daa/store/daaStorePgV1";

const MOCK_ASSET_ROW = {
  assetKey: "US::AAPL",
  symbol: "AAPL",
  market: "US",
  currency: "USD",
  assetClass: "EQUITY",
  region: "US",
  exchange: "NASDAQ",
  instrumentType: "STOCK",
  marketGroup: "US_EQUITY",
  holdingQty: 0,
  holdingPrice: 0,
  costBasis: null,
  holdingTags: [],
  watchEnabled: true,
  targetWeightHint: 0,
  watchTags: [],
  notes: null,
  lastPrice: 188.2,
  priceUpdatedAt: "2026-03-01T00:00:00.000Z",
  yfinanceSymbol: "AAPL",
  priceStatus: "fresh" as const,
  priceSource: "yfinance:AAPL",
  priceAgeSec: 60,
  valuationBase: null,
  fxRateToBase: 1,
  fxMissing: false,
  actualWeightPct: 0,
  targetWeightPct: 0,
  gapPct: null,
  hfSignal: null,
};

describe("workbench-asset-routes-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getDaaSystemConfigV2).mockResolvedValue({
      config: {
        dataSources: {
          priceFeed: {
            marketCache: {
              freshMinutes: 15,
              serveStaleHours: 48,
              rawRetentionDays: 90,
            },
          },
        },
      },
    } as any);
    vi.mocked(getMarketPricesWithCacheV1).mockResolvedValue({});
    vi.mocked(updateDaaAssetUniverseLastPriceV1).mockResolvedValue({
      assetKey: "US::AAPL",
    } as any);

    vi.mocked(upsertDaaAssetUniverseRowV1).mockResolvedValue({
      assetKey: "US::AAPL",
    } as any);

    vi.mocked(patchDaaAssetUniverseRowV1).mockResolvedValue({
      assetKey: "US::AAPL",
    } as any);

    vi.mocked(buildWorkbenchBootstrapV1).mockResolvedValue({
      baseCurrency: "USD",
      account: { cash: 1000, investableCash: 1000, frozenCash: 0, totalEquity: 1000 },
      assetUniverse: [MOCK_ASSET_ROW],
      execution: {
        logs: [],
      },
      rebalance: {
        mode: "manual",
        autoAnalysisEnabled: false,
        analysisTimeUtc: "00:20",
        timezone: "Asia/Shanghai",
        emailTo: "",
        analysisFocus: "mock",
      },
      marketContext: {
        generatedAt: "2026-03-01T00:00:00.000Z",
        regime: "risk_off",
        riskOffScorePct: 72,
        confidencePct: 86,
        buyScale: 0.7,
        highRiskBuyScale: 0.55,
        reasons: ["美股：VIX 处于高分位", "美股：成长风格走弱"],
        indicators: [
          {
            key: "vix",
            label: "VIX",
            category: "volatility",
            scope: "us_equity",
            stance: "risk_off",
            riskOffScorePct: 78,
            confidencePct: 90,
            rawValue: 24.3,
            unit: "%",
            percentile252: 78,
            zscore60: 1.2,
            trend1dPct: 4.1,
            trend7dPct: 9.3,
            trend30dPct: 18.2,
            reason: "VIX 处于高分位",
            source: "test",
            generatedAt: "2026-03-01T00:00:00.000Z",
          },
          {
            key: "qqq_spy_ratio",
            label: "QQQ/SPY",
            category: "relative_value",
            scope: "us_equity",
            stance: "risk_off",
            riskOffScorePct: 66,
            confidencePct: 82,
            rawValue: 1.08,
            unit: "x",
            percentile252: 66,
            zscore60: 0.6,
            trend1dPct: -0.8,
            trend7dPct: -2.1,
            trend30dPct: -4.5,
            reason: "成长风格走弱",
            source: "test",
            generatedAt: "2026-03-01T00:00:00.000Z",
          },
        ],
        scopes: [{
          scope: "us_equity",
          label: "美股",
          generatedAt: "2026-03-01T00:00:00.000Z",
          regime: "risk_off",
          riskOffScorePct: 72,
          confidencePct: 86,
          buyScale: 0.7,
          highRiskBuyScale: 0.55,
          reasons: ["VIX 处于高分位", "成长风格走弱"],
          indicators: [
            {
              key: "vix",
              label: "VIX",
              category: "volatility",
              scope: "us_equity",
              stance: "risk_off",
              riskOffScorePct: 78,
              confidencePct: 90,
              rawValue: 24.3,
              unit: "%",
              percentile252: 78,
              zscore60: 1.2,
              trend1dPct: 4.1,
              trend7dPct: 9.3,
              trend30dPct: 18.2,
              reason: "VIX 处于高分位",
              source: "test",
              generatedAt: "2026-03-01T00:00:00.000Z",
            },
            {
              key: "qqq_spy_ratio",
              label: "QQQ/SPY",
              category: "relative_value",
              scope: "us_equity",
              stance: "risk_off",
              riskOffScorePct: 66,
              confidencePct: 82,
              rawValue: 1.08,
              unit: "x",
              percentile252: 66,
              zscore60: 0.6,
              trend1dPct: -0.8,
              trend7dPct: -2.1,
              trend30dPct: -4.5,
              reason: "成长风格走弱",
              source: "test",
              generatedAt: "2026-03-01T00:00:00.000Z",
            },
          ],
        }],
      },
      warnings: [],
    } as any);

    vi.mocked(buildOpportunityPanelV1).mockResolvedValue({
      generatedAt: "2026-03-01T00:00:00.000Z",
      symbols: ["AAPL"],
      opportunities: [{
        symbol: "AAPL",
        finalScorePct: 66,
        confidencePct: 62,
        riskScorePct: 78,
        action: "watch",
        scores: { human: 66, news: 64, technical: 68, valuation: 0, penalty: 0 },
        weights: { human: 0.45, news: 0.25, technical: 0.3, valuation: 0 },
        reasons: ["风险偏高，建议观察"],
        sourceRefs: ["mock://source"],
        human: null,
        news: null,
        technical: null,
        valuation: null,
      }],
      diagnostics: {
        humanSignalCount: 0,
        humanSourceStatus: "fallback_seed",
        humanDiagnostics: [],
        newsSignalCount: 1,
        technicalSignalCount: 1,
        valuationSignalCount: 0,
        valuationEnabled: false,
        weights: { human: 0.45, news: 0.25, technical: 0.3, valuation: 0 },
        newsProvider: "mock",
        newsQuery: "",
      },
      raw: {
        valuationSignals: [],
        technicalSignals: [{
          symbol: "AAPL",
          scorePct: 68,
          confidencePct: 60,
          momentumRegime: "neutral",
          metrics: {
            close: 188.2,
            sma20: 180,
            sma60: 170,
            ema12: 182,
            ema26: 176,
            macd: 1.2,
            macdSignal: 1.0,
            macdHist: 0.2,
            rsi14: 55,
            bollingerUpper: 190,
            bollingerMid: 180,
            bollingerLower: 170,
            return20Pct: 5,
            return60Pct: 12,
            drawdown30Pct: -3,
            annualizedVolPct: 36.5,
            goldenCross: false,
            deathCross: false,
            macdBullishCross: true,
            macdBearishCross: false,
          },
          specific: [],
          reasons: ["波动上行"],
        }],
        newsSignals: [{
          symbol: "AAPL",
          scorePct: 60,
          confidencePct: 58,
          evidenceCount: 1,
          reasons: ["中性新闻"],
          items: [{
            symbol: "AAPL",
            title: "mock news",
            link: "https://example.com/news",
            ts: "2026-03-01T00:00:00.000Z",
            sentimentScore: 0.2,
            sourceCredibility: 0.7,
            freshness: 0.8,
          }],
        }],
      },
    });

    vi.mocked(runLlmAnalysisV1).mockResolvedValue({
      status: "ok",
      provider: "mock",
      model: "mock-model",
      generatedAt: "2026-03-01T00:00:00.000Z",
      summary: "mock summary",
      opportunityNotes: ["opportunity-1"],
      riskNotes: ["risk-1"],
      latencyMs: 12,
    });
  });

  it("assets/upsert 返回标准 row", async () => {
    const response = await upsertAsset(new Request("http://localhost/api/daa/workbench/assets/upsert", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        symbol: "aapl",
        market: "us",
        currency: "usd",
        assetClass: "EQUITY",
        region: "US",
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.row.assetKey).toBe("US::AAPL");
    expect(json.data.row.assetClass).toBe("EQUITY");
    expect(vi.mocked(upsertDaaAssetUniverseRowV1)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(upsertDaaAssetUniverseRowV1).mock.calls[0]?.[0]?.symbol).toBe("AAPL");
  });

  it("assets/{assetKey} PATCH 返回更新后的 row", async () => {
    const response = await patchAsset(
      new Request("http://localhost/api/daa/workbench/assets/US::AAPL", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          watchEnabled: true,
          watchTags: ["core", "tech"],
          notes: "长期跟踪",
        }),
      }),
      { params: { assetKey: "US::AAPL" } },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.row.assetKey).toBe("US::AAPL");
    expect(vi.mocked(patchDaaAssetUniverseRowV1)).toHaveBeenCalledWith(expect.objectContaining({
      assetKey: "US::AAPL",
      watchEnabled: true,
      watchTags: ["core", "tech"],
      notes: "长期跟踪",
    }));
  });

  it("assets/{assetKey} PATCH 优先返回第三方价格", async () => {
    const updatedAt = new Date().toISOString();
    vi.mocked(getMarketPricesWithCacheV1).mockResolvedValue({
      "US::AAPL": {
        provider: "yfinance",
        symbol: "AAPL",
        market: "US",
        currency: "USD",
        price: 199.8,
        priceStatus: "fresh" as const,
        priceUpdatedAt: updatedAt,
        priceAgeSec: 4,
        priceSource: "asset_patch:yfinance:AAPL",
      },
    });

    const response = await patchAsset(
      new Request("http://localhost/api/daa/workbench/assets/US::AAPL", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          notes: "使用最新行情",
        }),
      }),
      { params: { assetKey: "US::AAPL" } },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.row.lastPrice).toBe(199.8);
    expect(json.data.row.priceStatus).toBe("fresh");
    expect(json.data.row.priceUpdatedAt).toBe(updatedAt);
    expect(json.data.row).not.toHaveProperty("priceFetchedAt");
    expect(json.data.row).not.toHaveProperty("priceAsOf");
    expect(vi.mocked(getMarketPricesWithCacheV1)).toHaveBeenCalledWith(expect.objectContaining({
      forceRefresh: true,
      refreshBudget: 1,
      source: "asset_patch",
    }));
    expect(vi.mocked(updateDaaAssetUniverseLastPriceV1)).toHaveBeenCalledWith({
      assetKey: "US::AAPL",
      lastPrice: 199.8,
      priceUpdatedAt: updatedAt,
    });
  });

  it("assets/{assetKey}/insights 返回 technical/news/llm/risk", async () => {
    const updatedAt = new Date().toISOString();
    vi.mocked(getMarketPricesWithCacheV1).mockResolvedValue({
      "US::AAPL": {
        provider: "yfinance",
        symbol: "AAPL",
        market: "US",
        currency: "USD",
        price: 191.2,
        priceStatus: "fresh" as const,
        priceUpdatedAt: updatedAt,
        priceAgeSec: 8,
        priceSource: "asset_insights:yfinance:AAPL",
      },
    });

    const response = await getAssetInsights(
      new Request("http://localhost/api/daa/workbench/assets/US::AAPL/insights?includeLlm=1&analysisFocus=test"),
      { params: { assetKey: "US::AAPL" } },
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.assetKey).toBe("US::AAPL");
    expect(json.data.priceSnapshot).toMatchObject({
      price: 191.2,
      currency: "USD",
      priceStatus: "fresh" as const,
      priceUpdatedAt: updatedAt,
      priceSource: "asset_insights:yfinance:AAPL",
    });
    expect(json.data.priceSnapshot).not.toHaveProperty("priceFetchedAt");
    expect(json.data.priceSnapshot).not.toHaveProperty("priceAsOf");
    expect(json.data.technical.common.length).toBeGreaterThan(0);
    expect(Array.isArray(json.data.technical.specific)).toBe(true);
    expect(json.data.news.items.length).toBe(1);
    expect(json.data.news.aiSummary.summary).toBe("mock summary");
    expect(json.data.opportunity.actionLabelZh).toBeTruthy();
    expect(json.data.llmAnalysis.summary).toBe("mock summary");
    expect(json.data.marketContext.regime).toBe("risk_off");
    expect(json.data.marketAttribution.relevantKeys).toEqual(["vix", "qqq_spy_ratio"]);
    expect(json.data.marketAttribution.explanation[0]).toContain("美股当前处于 偏防守");
    expect(vi.mocked(runLlmAnalysisV1).mock.calls[0]?.[0]?.marketContext).toMatchObject({ regime: "risk_off" });
    expect(Array.isArray(json.data.riskHints)).toBe(true);
    expect(json.data.riskHints.length).toBeGreaterThan(0);
  });
});
