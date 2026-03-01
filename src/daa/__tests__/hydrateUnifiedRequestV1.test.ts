import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DaaOpportunityPanelV1 } from "@/src/daa/signals/opportunityServiceV1";
import type { DaaUnifiedRequestV1 } from "@/src/daa/unifiedRebalanceV1";

vi.mock("@/src/daa/signals/opportunityServiceV1", () => ({
  buildOpportunityPanelV1: vi.fn(),
}));

vi.mock("@/src/daa/store/daaStorePgV1", () => ({
  listDaaWatchlistCandidatesV1: vi.fn(),
  listDaaFxRatesV1: vi.fn(),
}));

import { hydrateUnifiedRequestWithSignalsV1 } from "@/src/daa/modules/decision/hydrateUnifiedRequestV1";
import { buildOpportunityPanelV1 } from "@/src/daa/signals/opportunityServiceV1";
import { listDaaFxRatesV1, listDaaWatchlistCandidatesV1 } from "@/src/daa/store/daaStorePgV1";

function mockPanel(): DaaOpportunityPanelV1 {
  return {
    generatedAt: new Date().toISOString(),
    symbols: ["AAA"],
    opportunities: [
      {
        symbol: "AAA",
        finalScorePct: 79,
        confidencePct: 68,
        riskScorePct: 24,
        action: "open_or_add",
        scores: { human: 80, news: 70, technical: 75, penalty: 0 },
        weights: { human: 0.45, news: 0.25, technical: 0.3 },
        reasons: ["test"],
        sourceRefs: ["mock://news/aaa"],
        human: null,
        news: null,
        technical: {
          symbol: "AAA",
          scorePct: 75,
          confidencePct: 60,
          momentumRegime: "strong",
          metrics: {
            close: 123.45,
            sma20: 120,
            sma60: 110,
            rsi14: 58,
            return20Pct: 6,
            annualizedVolPct: 21,
          },
          reasons: ["价格高于SMA20"],
        },
      },
    ],
    diagnostics: {
      humanSignalCount: 0,
      newsSignalCount: 0,
      technicalSignalCount: 1,
      weights: { human: 0.45, news: 0.25, technical: 0.3 },
      newsProvider: "mock",
      newsQuery: "",
    },
    raw: {
      newsSignals: [],
      technicalSignals: [
        {
          symbol: "AAA",
          scorePct: 75,
          confidencePct: 60,
          momentumRegime: "strong",
          metrics: {
            close: 123.45,
            sma20: 120,
            sma60: 110,
            rsi14: 58,
            return20Pct: 6,
            annualizedVolPct: 21,
          },
          reasons: ["价格高于SMA20"],
        },
      ],
    },
  };
}

describe("hydrate-unified-request-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listDaaWatchlistCandidatesV1).mockResolvedValue([]);
    vi.mocked(listDaaFxRatesV1).mockResolvedValue([]);
    vi.mocked(buildOpportunityPanelV1).mockResolvedValue(mockPanel());
  });

  it("会为候选建仓标的注入 0 仓位价格，支持现金起步下单", async () => {
    const request: DaaUnifiedRequestV1 = {
      account: {
        baseCurrency: "USD",
        cash: 1000,
      },
      targetWeights: {},
      positions: [],
      watchlistCandidates: [
        {
          symbol: "AAA",
          market: "US",
          currency: "USD",
          enabled: true,
          targetWeightHint: 0.08,
          tags: ["growth"],
        },
      ],
    };

    const result = await hydrateUnifiedRequestWithSignalsV1(request);
    const position = result.request.positions.find((item) => item.symbol === "AAA");

    expect(result.request.targetWeights.AAA).toBeGreaterThan(0);
    expect(position).toBeTruthy();
    expect(position?.qty).toBe(0);
    expect(position?.price).toBe(123.45);
  });

  it("当传入 humanSignals 时保留用户输入并补齐默认信号", async () => {
    const request: DaaUnifiedRequestV1 = {
      account: {
        baseCurrency: "USD",
        cash: 800,
        investableCash: 0,
      },
      targetWeights: { AAA: 1 },
      positions: [],
      humanSignals: [
        {
          symbol: "AAA",
          aggregatedScorePct: 88,
          convictionPct: 66,
          thesisDriftPct: 9,
          confidencePct: 77,
          momentumRegime: "strong",
          riskTags: ["manual_override"],
        },
      ],
    };

    const result = await hydrateUnifiedRequestWithSignalsV1(request);
    const manual = result.request.humanSignals?.find((item) => item.symbol === "AAA");

    expect(manual?.aggregatedScorePct).toBe(88);
    expect(manual?.riskTags).toContain("manual_override");
    expect(result.request.account?.investableCash).toBe(800);
  });
});
