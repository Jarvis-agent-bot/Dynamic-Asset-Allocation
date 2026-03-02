import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/daa/store/daaStorePgV1", () => ({
  listDaaDataSourcesV1: vi.fn(),
}));

import { runLlmAnalysisV1 } from "@/src/daa/llm/llmAnalysisV1";
import { listDaaDataSourcesV1 } from "@/src/daa/store/daaStorePgV1";

describe("llm-analysis-v1", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("analysisFocus 为空时返回 error", async () => {
    vi.mocked(listDaaDataSourcesV1).mockResolvedValue([]);

    const result = await runLlmAnalysisV1({
      analysisContext: "decision",
      baseCurrency: "USD",
      shouldRebalance: false,
      analysisFocus: "",
      opportunities: [],
      warnings: [],
    });

    expect(result.status).toBe("error");
    expect(result.reason).toBe("analysisFocus is required");
  });

  it("analysisFocus 会注入 prompt 并成功调用模型", async () => {
    vi.mocked(listDaaDataSourcesV1).mockResolvedValue([{
      id: "llm_1",
      sourceType: "llm_analysis",
      sourceName: "mock llm",
      enabled: true,
      priority: 1,
      configJson: {
        enabledInDecision: true,
        provider: "codex",
        model: "gpt-5-codex",
        endpoint: "https://mock.llm.example/v1/responses",
        apiKey: "mock-key",
      },
      updatedAt: "2026-03-01T00:00:00.000Z",
    } as any]);

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      output_text: "summary\\nopportunity note\\nrisk note",
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await runLlmAnalysisV1({
      analysisContext: "decision",
      baseCurrency: "USD",
      shouldRebalance: true,
      analysisFocus: "重点关注技术形态与基金经理加减仓",
      opportunities: [{
        symbol: "AAA",
        finalScorePct: 70,
        confidencePct: 60,
        riskScorePct: 30,
        action: "open_or_add",
        reasons: ["mock"],
      }],
      warnings: [],
    });

    expect(result.status).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body || "{}"));
    expect(String(payload.input || "")).toContain("重点关注技术形态与基金经理加减仓");
  });

  it("enabledInDecision=false 时仅阻断 decision，上层洞察仍可调用", async () => {
    vi.mocked(listDaaDataSourcesV1).mockResolvedValue([{
      id: "llm_1",
      sourceType: "llm_analysis",
      sourceName: "mock llm",
      enabled: true,
      priority: 1,
      configJson: {
        enabledInDecision: false,
        provider: "codex",
        model: "gpt-5-codex",
        endpoint: "https://mock.llm.example/v1/responses",
        apiKey: "mock-key",
      },
      updatedAt: "2026-03-01T00:00:00.000Z",
    } as any]);

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      output_text: "summary\\nopportunity note\\nrisk note",
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const decisionResult = await runLlmAnalysisV1({
      analysisContext: "decision",
      baseCurrency: "USD",
      shouldRebalance: true,
      analysisFocus: "决策态分析",
      opportunities: [],
      warnings: [],
    });
    expect(decisionResult.status).toBe("skipped");
    expect(decisionResult.reason).toBe("llm_analysis disabled in decision context");
    expect(fetchMock).toHaveBeenCalledTimes(0);

    const insightResult = await runLlmAnalysisV1({
      analysisContext: "insight",
      baseCurrency: "USD",
      shouldRebalance: false,
      analysisFocus: "洞察态分析",
      opportunities: [],
      warnings: [],
    });
    expect(insightResult.status).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
