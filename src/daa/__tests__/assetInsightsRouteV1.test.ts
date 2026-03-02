import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminViewerAuth: vi.fn(async () => null),
}));

vi.mock("@/src/daa/signals/opportunityServiceV1", () => ({
  buildOpportunityPanelV1: vi.fn(),
}));

vi.mock("@/src/daa/hf/hfServiceV1", () => ({
  listFundManagerOperationsBySymbolsV1: vi.fn(),
}));

vi.mock("@/src/daa/llm/llmAnalysisV1", () => ({
  runLlmAnalysisV1: vi.fn(),
}));

import { POST } from "@/app/api/daa/insights/assets/route";
import { listFundManagerOperationsBySymbolsV1 } from "@/src/daa/hf/hfServiceV1";
import { runLlmAnalysisV1 } from "@/src/daa/llm/llmAnalysisV1";
import { buildOpportunityPanelV1 } from "@/src/daa/signals/opportunityServiceV1";

function makeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/daa/insights/assets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("asset-insights-route-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(buildOpportunityPanelV1).mockResolvedValue({
      generatedAt: "2026-03-01T00:00:00.000Z",
      symbols: ["AAA"],
      opportunities: [{
        symbol: "AAA",
        finalScorePct: 72.1,
        confidencePct: 66.4,
        riskScorePct: 28.9,
        action: "open_or_add",
        scores: { human: 70, news: 74, technical: 73, penalty: 0 },
        weights: { human: 0.45, news: 0.25, technical: 0.3 },
        reasons: ["mock_reason"],
        sourceRefs: ["mock://source"],
        human: null,
        technical: {
          symbol: "AAA",
          scorePct: 73,
          confidencePct: 61,
          momentumRegime: "strong",
          metrics: {
            close: 12.34,
            sma20: 12.11,
            sma60: 11.8,
            rsi14: 58.2,
            return20Pct: 4.2,
            annualizedVolPct: 22.7,
          },
          reasons: ["价格高于SMA20"],
        },
        news: {
          symbol: "AAA",
          scorePct: 68,
          confidencePct: 60,
          evidenceCount: 2,
          reasons: ["新闻偏正面"],
          items: [
            {
              symbol: "AAA",
              title: "fresh news",
              link: "https://example.com/fresh",
              ts: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
              sentimentScore: 0.6,
              sourceCredibility: 0.8,
              freshness: 0.9,
            },
            {
              symbol: "AAA",
              title: "stale news",
              link: "https://example.com/stale",
              ts: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
              sentimentScore: 0.3,
              sourceCredibility: 0.7,
              freshness: 0.4,
            },
          ],
        },
      }],
      diagnostics: {
        humanSignalCount: 1,
        humanSourceStatus: "live",
        humanDiagnostics: [],
        newsSignalCount: 1,
        technicalSignalCount: 1,
        weights: { human: 0.45, news: 0.25, technical: 0.3 },
        newsProvider: "mock",
        newsQuery: "",
      },
      raw: {
        technicalSignals: [{
          symbol: "AAA",
          scorePct: 73,
          confidencePct: 61,
          momentumRegime: "strong",
          metrics: {
            close: 12.34,
            sma20: 12.11,
            sma60: 11.8,
            rsi14: 58.2,
            return20Pct: 4.2,
            annualizedVolPct: 22.7,
          },
          reasons: ["价格高于SMA20"],
        }],
        newsSignals: [{
          symbol: "AAA",
          scorePct: 68,
          confidencePct: 60,
          evidenceCount: 2,
          reasons: ["新闻偏正面"],
          items: [
            {
              symbol: "AAA",
              title: "fresh news",
              link: "https://example.com/fresh",
              ts: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
              sentimentScore: 0.6,
              sourceCredibility: 0.8,
              freshness: 0.9,
            },
            {
              symbol: "AAA",
              title: "stale news",
              link: "https://example.com/stale",
              ts: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
              sentimentScore: 0.3,
              sourceCredibility: 0.7,
              freshness: 0.4,
            },
          ],
        }],
      },
    });

    vi.mocked(listFundManagerOperationsBySymbolsV1).mockResolvedValue({
      AAA: {
        symbol: "AAA",
        generatedAt: "2026-03-01T00:00:00.000Z",
        sourceStatus: "live",
        topAdds: [{
          symbol: "AAA",
          actorId: "danjuan_001",
          fundCode: "001",
          fundName: "基金A",
          deltaWeightPct: 2.1,
          weightPct: 5,
          prevWeightPct: 2.9,
          disclosedAt: "2026-02-28",
          sourceName: "蛋卷",
          sourceRef: "https://example.com/fund-a",
          confidencePct: 70,
        }],
        topReduces: [{
          symbol: "AAA",
          actorId: "danjuan_002",
          fundCode: "002",
          fundName: "基金B",
          deltaWeightPct: -1.4,
          weightPct: 1.2,
          prevWeightPct: 2.6,
          disclosedAt: "2026-02-28",
          sourceName: "蛋卷",
          sourceRef: "https://example.com/fund-b",
          confidencePct: 66,
        }],
      },
    });

    vi.mocked(runLlmAnalysisV1).mockResolvedValue({
      status: "ok",
      provider: "mock",
      model: "mock-model",
      generatedAt: "2026-03-01T00:00:00.000Z",
      summary: "mock summary",
      opportunityNotes: ["note-1"],
      riskNotes: ["risk-1"],
      latencyMs: 120,
    });
  });

  it("lite 模式仅返回 lite 字段，不触发 full 依赖", async () => {
    const response = await POST(makeRequest({
      symbols: ["AAA"],
      detailMode: "lite",
      analysisFocus: "只看风险收益比",
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.schemaVersion).toBe(2);
    expect(json.data.detailMode).toBe("lite");
    expect(json.data.insights[0].symbol).toBe("AAA");
    expect(json.data.insights[0].lite.finalScorePct).toBeGreaterThan(0);
    expect(json.data.insights[0].technical).toBeNull();
    expect(json.data.insights[0].news).toBeNull();
    expect(json.data.insights[0].fundManagerOps).toBeNull();
    expect(json.data.insights[0].llmAnalysis).toBeNull();
    expect(vi.mocked(listFundManagerOperationsBySymbolsV1)).not.toHaveBeenCalled();
    expect(vi.mocked(runLlmAnalysisV1)).not.toHaveBeenCalled();
  });

  it("full 模式返回新闻/技术/基金经理操作与 llm，且新闻截断到近 7 天", async () => {
    const response = await POST(makeRequest({
      symbols: ["AAA"],
      detailMode: "full",
      analysisFocus: "时效新闻+技术形态",
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.schemaVersion).toBe(2);
    expect(json.data.detailMode).toBe("full");
    expect(json.data.insights[0].technical).toBeTruthy();
    expect(json.data.insights[0].fundManagerOps.topAdds.length).toBe(1);
    expect(json.data.insights[0].llmAnalysis.summary).toBe("mock summary");
    expect(json.data.insights[0].news.items.length).toBe(1);
    expect(json.data.insights[0].news.items[0].title).toBe("fresh news");
    expect(vi.mocked(listFundManagerOperationsBySymbolsV1)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runLlmAnalysisV1)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runLlmAnalysisV1).mock.calls[0]?.[0]?.analysisFocus).toBe("时效新闻+技术形态");
  });
});
