import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/daa/hf/hfServiceV1", () => ({
  getLatestHumanSignalBatchV1: vi.fn(),
}));

vi.mock("@/src/daa/signals/newsSignalV1", () => ({
  buildNewsSignalsV1: vi.fn(),
}));

vi.mock("@/src/daa/signals/technicalSignalV1", () => ({
  buildTechnicalSignalsV1: vi.fn(),
}));

vi.mock("@/src/daa/signals/valuationSignalV1", () => ({
  buildValuationSignalsV1: vi.fn(),
}));

vi.mock("@/src/daa/store/daaStorePgV1", () => ({
  getDaaSystemConfigV2: vi.fn(),
}));

import { getLatestHumanSignalBatchV1 } from "@/src/daa/hf/hfServiceV1";
import { buildOpportunityPanelV1 } from "@/src/daa/signals/opportunityServiceV1";
import { buildNewsSignalsV1 } from "@/src/daa/signals/newsSignalV1";
import { buildTechnicalSignalsV1 } from "@/src/daa/signals/technicalSignalV1";
import { buildValuationSignalsV1 } from "@/src/daa/signals/valuationSignalV1";
import { getDaaSystemConfigV2 } from "@/src/daa/store/daaStorePgV1";

describe("opportunity-service-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDaaSystemConfigV2).mockResolvedValue({
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
    vi.mocked(getLatestHumanSignalBatchV1).mockResolvedValue({
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
    vi.mocked(buildTechnicalSignalsV1).mockResolvedValue([{
      symbol: "AAPL",
      scorePct: 61,
      confidencePct: 52,
    }] as any);
    vi.mocked(buildValuationSignalsV1).mockResolvedValue([{
      symbol: "AAPL",
      scorePct: 57,
      confidencePct: 48,
    }] as any);
    vi.mocked(buildNewsSignalsV1).mockResolvedValue([{
      symbol: "AAPL",
      scorePct: 90,
      confidencePct: 80,
      items: [],
    }] as any);
  });

  it("newsFeed.enabled=false 时不拉取新闻且新闻权重归零", async () => {
    const panel = await buildOpportunityPanelV1({ symbols: ["AAPL"] });

    expect(vi.mocked(buildNewsSignalsV1)).not.toHaveBeenCalled();
    expect(panel.diagnostics.newsSignalCount).toBe(0);
    expect(panel.diagnostics.weights.news).toBe(0);
    expect(panel.opportunities[0]?.weights.news).toBe(0);
  });
});
