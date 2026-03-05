import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DaaOpportunityPanelV1 } from "@/src/daa/signals/opportunityServiceV1";
import { parseDaaAssetKeyV1 } from "@/src/daa/assetKeyV1";
import type { DaaUnifiedRequestV1 } from "@/src/daa/unifiedRebalanceV1";

vi.mock("@/src/daa/signals/opportunityServiceV1", () => ({
  buildOpportunityPanelV1: vi.fn(),
}));

vi.mock("@/src/daa/store/daaStorePgV1", () => ({
  listDaaCandidateAssetsV1: vi.fn(),
  listDaaFxRatesV1: vi.fn(),
}));

import { hydrateUnifiedRequestWithSignalsV1 } from "@/src/daa/modules/decision/hydrateUnifiedRequestV1";
import { buildOpportunityPanelV1 } from "@/src/daa/signals/opportunityServiceV1";
import { listDaaCandidateAssetsV1, listDaaFxRatesV1 } from "@/src/daa/store/daaStorePgV1";

function mockPanel(symbol = "AAA", close = 123.45): DaaOpportunityPanelV1 {
  return {
    generatedAt: new Date().toISOString(),
    symbols: [symbol],
    opportunities: [
      {
        symbol,
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
          symbol,
          scorePct: 75,
          confidencePct: 60,
          momentumRegime: "strong",
          metrics: {
            close,
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
      humanSourceStatus: "fallback_seed",
      humanDiagnostics: [],
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
          symbol,
          scorePct: 75,
          confidencePct: 60,
          momentumRegime: "strong",
          metrics: {
            close,
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
    vi.mocked(listDaaCandidateAssetsV1).mockResolvedValue([]);
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
      candidateAssets: [
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
    const targetEntries = Object.entries(result.request.targetWeights)
      .filter(([key]) => parseDaaAssetKeyV1(key)?.symbol === "AAA");

    expect(targetEntries.length).toBeGreaterThan(0);
    expect(position).toBeTruthy();
    expect(position?.qty).toBe(0);
    expect(position?.price).toBe(123.45);
  });

  it("symbol 级目标权重会被严格拒绝（必须使用 assetKey）", async () => {
    vi.mocked(buildOpportunityPanelV1).mockResolvedValueOnce(mockPanel("700", 10));

    const request: DaaUnifiedRequestV1 = {
      account: {
        baseCurrency: "USD",
        cash: 1000,
      },
      targetWeights: {
        "700": 0.2,
      },
      positions: [],
      candidateAssets: [
        {
          symbol: "700",
          market: "HK",
          currency: "HKD",
          enabled: true,
          targetWeightHint: 0.08,
        },
        {
          symbol: "700",
          market: "CN",
          currency: "CNY",
          enabled: true,
          targetWeightHint: 0.12,
        },
      ],
    };

    await expect(hydrateUnifiedRequestWithSignalsV1(request)).rejects.toThrow(/MARKET::SYMBOL/);
  });

  it("当传入 humanSignals 时保留用户输入并补齐默认信号", async () => {
    const request: DaaUnifiedRequestV1 = {
      account: {
        baseCurrency: "USD",
        cash: 800,
        investableCash: 0,
      },
      targetWeights: { "US::AAA": 1 },
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
