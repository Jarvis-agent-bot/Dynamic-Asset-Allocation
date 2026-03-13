import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DaaOpportunityPanel } from "@/src/daa/signals/opportunityService";
import { parseDaaAssetKey } from "@/src/daa/assetKey";
import type { DaaUnifiedRequest } from "@/src/daa/unifiedRebalance";

vi.mock("@/src/daa/signals/opportunityService", () => ({
  buildOpportunityPanel: vi.fn(),
}));

vi.mock("@/src/daa/store/daaStorePg", () => ({
  listDaaCandidateAssets: vi.fn(),
  listDaaFxRates: vi.fn(),
}));

import { hydrateUnifiedRequestWithSignals } from "@/src/daa/modules/decision/hydrateUnifiedRequest";
import { buildOpportunityPanel } from "@/src/daa/signals/opportunityService";
import { listDaaCandidateAssets, listDaaFxRates } from "@/src/daa/store/daaStorePg";

function mockPanel(symbol = "AAA", close = 123.45): DaaOpportunityPanel {
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
        scores: { human: 80, news: 70, technical: 75, valuation: 0, penalty: 0 },
        weights: { human: 0.45, news: 0.25, technical: 0.3, valuation: 0 },
        reasons: ["test"],
        sourceRefs: ["mock://news/aaa"],
        human: null,
        news: null,
        valuation: null,
        technical: {
          symbol,
          scorePct: 75,
          confidencePct: 60,
          momentumRegime: "strong",
          metrics: {
            close,
            sma20: 120,
            sma60: 110,
            ema12: 121,
            ema26: 115,
            macd: 1.2,
            macdSignal: 1.0,
            macdHist: 0.2,
            rsi14: 58,
            bollingerUpper: 130,
            bollingerMid: 120,
            bollingerLower: 110,
            return20Pct: 6,
            return60Pct: 10,
            drawdown30Pct: -2,
            annualizedVolPct: 21,
            goldenCross: false,
            deathCross: false,
            macdBullishCross: true,
            macdBearishCross: false,
          },
          reasons: ["价格高于SMA20"],
          specific: [],
        },
      },
    ],
    diagnostics: {
      humanSignalCount: 0,
      humanSourceStatus: "fallback_seed",
      humanDiagnostics: [],
      newsSignalCount: 0,
      technicalSignalCount: 1,
      valuationSignalCount: 0,
      valuationEnabled: false,
      weights: { human: 0.45, news: 0.25, technical: 0.3, valuation: 0 },
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
            ema12: 121,
            ema26: 115,
            macd: 1.2,
            macdSignal: 1.0,
            macdHist: 0.2,
            rsi14: 58,
            bollingerUpper: 130,
            bollingerMid: 120,
            bollingerLower: 110,
            return20Pct: 6,
            return60Pct: 10,
            drawdown30Pct: -2,
            annualizedVolPct: 21,
            goldenCross: false,
            deathCross: false,
            macdBullishCross: true,
            macdBearishCross: false,
          },
          reasons: ["价格高于SMA20"],
          specific: [],
        },
      ],
      valuationSignals: [],
    },
  };
}

describe("hydrate-unified-request-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listDaaCandidateAssets).mockResolvedValue([]);
    vi.mocked(listDaaFxRates).mockResolvedValue([]);
    vi.mocked(buildOpportunityPanel).mockResolvedValue(mockPanel());
  });

  it("会为候选建仓标的注入 0 仓位价格，支持现金起步下单", async () => {
    const request: DaaUnifiedRequest = {
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

    const result = await hydrateUnifiedRequestWithSignals(request);
    const position = result.request.positions.find((item) => item.symbol === "AAA");
    const targetEntries = Object.entries(result.request.targetWeights)
      .filter(([key]) => parseDaaAssetKey(key)?.symbol === "AAA");

    expect(targetEntries.length).toBeGreaterThan(0);
    expect(position).toBeTruthy();
    expect(position?.qty).toBe(0);
    expect(position?.price).toBe(123.45);
  });

  it("symbol 级目标权重会被严格拒绝（必须使用 assetKey）", async () => {
    vi.mocked(buildOpportunityPanel).mockResolvedValueOnce(mockPanel("700", 10));

    const request: DaaUnifiedRequest = {
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

    await expect(hydrateUnifiedRequestWithSignals(request)).rejects.toThrow(/MARKET::SYMBOL/);
  });

  it("当传入 humanSignals 时保留用户输入并补齐默认信号", async () => {
    const request: DaaUnifiedRequest = {
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

    const result = await hydrateUnifiedRequestWithSignals(request);
    const manual = result.request.humanSignals?.find((item) => item.symbol === "AAA");

    expect(manual?.aggregatedScorePct).toBe(88);
    expect(manual?.riskTags).toContain("manual_override");
    expect(result.request.account?.investableCash).toBe(800);
  });
});
