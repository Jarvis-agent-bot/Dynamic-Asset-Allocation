import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/daa/hf/hfService", () => ({
  getLatestHumanSignalBatch: vi.fn(),
}));

vi.mock("@/src/daa/signals/newsSignal", () => ({
  buildNewsSignals: vi.fn(),
}));

vi.mock("@/src/daa/signals/technicalSignal", () => ({
  buildTechnicalSignals: vi.fn(),
}));

vi.mock("@/src/daa/signals/valuationSignal", () => ({
  buildValuationSignals: vi.fn(),
}));

vi.mock("@/src/daa/store/daaStorePg", () => ({
  getDaaSystemConfig: vi.fn(),
}));

import { getLatestHumanSignalBatch } from "@/src/daa/hf/hfService";
import { buildOpportunityPanel } from "@/src/daa/signals/opportunityService";
import { buildNewsSignals } from "@/src/daa/signals/newsSignal";
import { buildTechnicalSignals } from "@/src/daa/signals/technicalSignal";
import { buildValuationSignals } from "@/src/daa/signals/valuationSignal";
import { getDaaSystemConfig } from "@/src/daa/store/daaStorePg";

describe("opportunity-service-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDaaSystemConfig).mockResolvedValue({
      config: {
        dataSources: {
          newsFeed: {
            enabled: false,
            provider: "yahoo_rss",
            query: "AAPL",
            symbols: [],
            valuationEnabled: true,
            fusionWeights: {
              human: 0.35,
              news: 0.2,
              technical: 0.25,
              valuation: 0.2,
            },
          },
        },
      },
    } as any);
    vi.mocked(getLatestHumanSignalBatch).mockResolvedValue({
      signals: [{
        symbol: "AAPL",
        aggregatedScorePct: 78,
        confidencePct: 66,
        riskTags: [],
        sourceRefs: ["human://aapl"],
      }],
      sourceStatus: "live",
      diagnostics: [],
    } as any);
    vi.mocked(buildTechnicalSignals).mockResolvedValue([{
      symbol: "AAPL",
      scorePct: 61,
      confidencePct: 52,
    }] as any);
    vi.mocked(buildValuationSignals).mockResolvedValue([{
      symbol: "AAPL",
      scorePct: 57,
      confidencePct: 48,
    }] as any);
    vi.mocked(buildNewsSignals).mockResolvedValue([{
      symbol: "AAPL",
      scorePct: 90,
      confidencePct: 80,
      items: [],
    }] as any);
  });

  it("newsFeed.enabled=false 时不拉取新闻且新闻权重归零", async () => {
    const panel = await buildOpportunityPanel({ symbols: ["AAPL"] });

    expect(vi.mocked(buildNewsSignals)).not.toHaveBeenCalled();
    expect(panel.diagnostics.newsSignalCount).toBe(0);
    expect(panel.diagnostics.weights.news).toBe(0);
    expect(panel.opportunities[0]?.weights.news).toBe(0);
  });
});
