import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminViewerAuth: vi.fn(async () => null),
  requireDaaAdminEditorAuth: vi.fn(async () => null),
}));

vi.mock("@/src/daa/modules/decision/hydrateUnifiedRequestV1", () => ({
  hydrateUnifiedRequestWithSignalsV1: vi.fn(),
}));

vi.mock("@/src/daa/llm/llmAnalysisV1", () => ({
  runLlmAnalysisV1: vi.fn(),
}));

vi.mock("@/src/daa/store/daaStorePgV1", () => ({
  appendDaaRunHistoryV1: vi.fn(async () => undefined),
  createDaaRebalanceDecisionV1: vi.fn(),
  listDaaRebalanceDecisionsV1: vi.fn(async () => []),
}));

vi.mock("@/src/daa/unifiedRebalanceV1", () => ({
  buildDaaUnifiedPlanV1: vi.fn(),
  isDaaUnifiedRequestV1: vi.fn(() => true),
}));

import { POST } from "@/app/api/daa/rebalance/decisions/route";
import { runLlmAnalysisV1 } from "@/src/daa/llm/llmAnalysisV1";
import { hydrateUnifiedRequestWithSignalsV1 } from "@/src/daa/modules/decision/hydrateUnifiedRequestV1";
import { appendDaaRunHistoryV1, createDaaRebalanceDecisionV1 } from "@/src/daa/store/daaStorePgV1";
import { buildDaaUnifiedPlanV1 } from "@/src/daa/unifiedRebalanceV1";

describe("rebalance-decisions-route-v2", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(hydrateUnifiedRequestWithSignalsV1).mockResolvedValue({
      request: {
        account: { baseCurrency: "USD", cash: 1000 },
        targetWeights: { AAA: 1 },
        positions: [],
      },
      opportunityPanel: {
        generatedAt: "2026-03-01T00:00:00.000Z",
        symbols: ["AAA"],
        opportunities: [{
          symbol: "AAA",
          finalScorePct: 75,
          confidencePct: 65,
          riskScorePct: 26,
          action: "open_or_add",
          scores: { human: 70, news: 76, technical: 74, penalty: 0 },
          weights: { human: 0.45, news: 0.25, technical: 0.3 },
          reasons: ["mock_reason"],
          sourceRefs: ["mock://source"],
          human: null,
          news: null,
          technical: null,
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
          newsSignals: [],
          technicalSignals: [],
        },
      },
      diagnostics: {
        addedTargets: ["AAA"],
        candidateCount: 1,
        fxRateCount: 0,
        humanSourceStatus: "live",
        humanDiagnostics: [],
      },
    });

    vi.mocked(buildDaaUnifiedPlanV1).mockReturnValue({
      ok: true,
      generatedAt: "2026-03-01T00:00:00.000Z",
      summary: {
        baseCurrency: "USD",
        totalEquity: 1000,
        triggerThresholdPct: 0.03,
        shouldRebalance: true,
        executableOrderCount: 1,
        blockedOrderCount: 0,
      },
      layers: {
        sensory: {
          fxCoveragePct: 1,
          fxFreshCoveragePct: 1,
          crossMarketExposure: { US: 1 },
        },
        strategy: {
          adjustedTargetWeights: { AAA: 1 },
          riskTierBudget: { low: 0.2, mid: 0.6, high: 0.2 },
        },
        humanFactor: {
          assetDecisions: [],
          defensiveConsensusPct: 0,
          duplicatedStyleClusters: [],
        },
        guardrail: {
          maxOrderPctOfNav: 0.2,
          isolatedSymbols: [],
          riskOffReason: null,
          concentrationWarnings: [],
        },
      },
      executableOrders: [{
        symbol: "AAA",
        side: "BUY",
        qty: 1,
        notional: 100,
      }],
      blockedOrders: [],
      warnings: [],
    });

    vi.mocked(runLlmAnalysisV1).mockResolvedValue({
      status: "ok",
      provider: "mock",
      model: "mock-model",
      generatedAt: "2026-03-01T00:00:00.000Z",
      summary: "mock llm summary",
      opportunityNotes: ["opp"],
      riskNotes: ["risk"],
      latencyMs: 100,
    });

    vi.mocked(createDaaRebalanceDecisionV1).mockResolvedValue({
      decision: {
        id: "decision_1",
        status: "pending",
      },
      orders: [],
    } as any);
  });

  it("POST 返回并落库 V2 契约", async () => {
    const request = new Request("http://localhost/api/daa/rebalance/decisions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        request: { mock: true },
        analysisFocus: "风险收益比 + 新闻 + 技术 + 基金经理",
        triggerSource: "manual",
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.schemaVersion).toBe(2);
    expect(json.data.plan.summary.baseCurrency).toBe("USD");
    expect(json.data.decisionId).toBe("decision_1");
    expect(json.data.decisionStatus).toBe("pending");
    expect(vi.mocked(createDaaRebalanceDecisionV1)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createDaaRebalanceDecisionV1).mock.calls[0]?.[0]?.responseJson?.schemaVersion).toBe(2);
    expect(vi.mocked(appendDaaRunHistoryV1)).toHaveBeenCalledTimes(1);
  });
});
