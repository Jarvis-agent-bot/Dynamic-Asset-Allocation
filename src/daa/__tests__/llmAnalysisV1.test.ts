import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SYSTEM_CONFIG_V2 } from "@/src/daa/config/systemConfigV2";

vi.mock("@/src/daa/store/daaStorePgV1", () => ({
  getDaaSystemConfigV2: vi.fn(),
}));

import { runLlmAnalysisV1 } from "@/src/daa/llm/llmAnalysisV1";
import { getDaaSystemConfigV2 } from "@/src/daa/store/daaStorePgV1";

function mockSystemConfigV1(configPatch?: Partial<(typeof DEFAULT_SYSTEM_CONFIG_V2)["dataSources"]["llmAnalysis"]>) {
  return {
    id: "default" as const,
    version: 1,
    updatedAt: "2026-03-01T00:00:00.000Z",
    config: {
      ...DEFAULT_SYSTEM_CONFIG_V2,
      dataSources: {
        ...DEFAULT_SYSTEM_CONFIG_V2.dataSources,
        llmAnalysis: {
          ...DEFAULT_SYSTEM_CONFIG_V2.dataSources.llmAnalysis,
          enabled: true,
          ...configPatch,
        },
      },
    },
  };
}

describe("llm-analysis-v1", () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalEndpoint = process.env.DAA_LLM_ENDPOINT;
  const originalModel = process.env.DAA_LLM_MODEL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = "mock-key";
    process.env.DAA_LLM_ENDPOINT = "https://mock.llm.example/v1/responses";
    process.env.DAA_LLM_MODEL = "gpt-5-codex";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalApiKey == null) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
    if (originalEndpoint == null) delete process.env.DAA_LLM_ENDPOINT;
    else process.env.DAA_LLM_ENDPOINT = originalEndpoint;
    if (originalModel == null) delete process.env.DAA_LLM_MODEL;
    else process.env.DAA_LLM_MODEL = originalModel;
  });

  it("analysisFocus 为空时返回 error", async () => {
    vi.mocked(getDaaSystemConfigV2).mockResolvedValue(mockSystemConfigV1());

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
    vi.mocked(getDaaSystemConfigV2).mockResolvedValue(
      mockSystemConfigV1({
        enabledInDecision: true,
        provider: "codex",
        model: "gpt-5-codex",
      }),
    );

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
    const firstCall = fetchMock.mock.calls[0] as unknown as [unknown, RequestInit | undefined] | undefined;
    const payload = JSON.parse(String(firstCall?.[1]?.body || "{}"));
    expect(String(payload.input || "")).toContain("重点关注技术形态与基金经理加减仓");
  });

  it("enabledInDecision=false 时仅阻断 decision，上层洞察仍可调用", async () => {
    vi.mocked(getDaaSystemConfigV2).mockResolvedValue(
      mockSystemConfigV1({
        enabledInDecision: false,
        provider: "codex",
        model: "gpt-5-codex",
      }),
    );

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
