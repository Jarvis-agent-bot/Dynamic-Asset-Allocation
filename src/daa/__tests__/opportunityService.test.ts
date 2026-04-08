import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildSystemConfigRow } from "@/src/daa/__tests__/testDataFactories";
import type { DaaHumanSignalBatch } from "@/src/daa/hf/humanSignals";
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
import type { DaaNewsSignal } from "@/src/daa/signals/newsSignal";
import { buildNewsSignals } from "@/src/daa/signals/newsSignal";
import type { DaaTechnicalSignal } from "@/src/daa/signals/technicalSignal";
import { buildTechnicalSignals } from "@/src/daa/signals/technicalSignal";
import type { DaaValuationSignal } from "@/src/daa/signals/valuationSignal";
import { buildValuationSignals } from "@/src/daa/signals/valuationSignal";
import { getDaaSystemConfig } from "@/src/daa/store/daaStorePg";

function buildHumanSignalBatchFixture(): DaaHumanSignalBatch {
  return {
    generatedAt: "2026-03-10T08:00:00.000Z",
    asOfDate: "2026-03-10",
    marketScope: ["US"],
    mode: "official_first",
    sourceStatus: "live",
    diagnostics: [],
    actorCount: 1,
    holdingCount: 1,
    sources: [{
      channel: "official_fund_house",
      sourceName: "human",
      itemCount: 1,
    }],
    signals: [{
      symbol: "AAPL",
      market: "US",
      aggregatedScorePct: 78,
      convictionPct: 70,
      thesisDriftPct: 6,
      momentumRegime: "neutral",
      stance: "offensive",
      confidencePct: 66,
      evidenceCount: 1,
      actorIds: ["actor-1"],
      sourceRefs: ["human://aapl"],
      riskTags: [],
    }],
  };
}

function buildTechnicalSignalFixture(): DaaTechnicalSignal {
  return {
    symbol: "AAPL",
    scorePct: 61,
    confidencePct: 52,
    momentumRegime: "neutral",
    metrics: {
      close: 100,
      sma20: 99,
      sma60: 98,
      ema12: 99,
      ema26: 98,
      macd: 1,
      macdSignal: 0.8,
      macdHist: 0.2,
      rsi14: 55,
      bollingerUpper: 105,
      bollingerMid: 100,
      bollingerLower: 95,
      return20Pct: 3,
      return60Pct: 5,
      drawdown30Pct: -4,
      annualizedVolPct: 18,
      goldenCross: false,
      deathCross: false,
      macdBullishCross: false,
      macdBearishCross: false,
    },
    specific: [],
    reasons: [],
  };
}

function buildValuationSignalFixture(): DaaValuationSignal {
  return {
    symbol: "AAPL",
    scorePct: 57,
    confidencePct: 48,
    temperature: "neutral",
    metrics: {
      close: 100,
      percentile90: 50,
      percentile252: 50,
      zscore60: 0,
      pe: 20,
      pb: 5,
      dividendYieldPct: 1.2,
    },
    relative: null,
    reasons: [],
    specific: [],
  };
}

function buildNewsSignalFixture(): DaaNewsSignal {
  return {
    symbol: "AAPL",
    scorePct: 90,
    confidencePct: 80,
    evidenceCount: 0,
    reasons: [],
    items: [],
    llmSummary: null,
    llmDrivers: null,
    llmMajorEvent: null,
    llmActionHint: null,
  };
}

describe("opportunity-service-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDaaSystemConfig).mockResolvedValue(buildSystemConfigRow({
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
    }));
    vi.mocked(getLatestHumanSignalBatch).mockResolvedValue(buildHumanSignalBatchFixture());
    vi.mocked(buildTechnicalSignals).mockResolvedValue([buildTechnicalSignalFixture()]);
    vi.mocked(buildValuationSignals).mockResolvedValue([buildValuationSignalFixture()]);
    vi.mocked(buildNewsSignals).mockResolvedValue([buildNewsSignalFixture()]);
  });

  it("newsFeed.enabled=false 时不拉取新闻且新闻权重归零", async () => {
    const panel = await buildOpportunityPanel({ symbols: ["AAPL"] });

    expect(vi.mocked(buildNewsSignals)).not.toHaveBeenCalled();
    expect(panel.diagnostics.newsSignalCount).toBe(0);
    expect(panel.diagnostics.weights.news).toBe(0);
    expect(panel.opportunities[0]?.weights.news).toBe(0);
  });
});
