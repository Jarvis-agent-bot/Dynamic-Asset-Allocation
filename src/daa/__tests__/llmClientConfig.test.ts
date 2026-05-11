import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildSystemConfigRow } from "@/src/daa/__tests__/testDataFactories";

vi.mock("@/src/daa/config/secretsManager", () => ({
  resolveSecret: vi.fn(),
}));

vi.mock("@/src/daa/store/daaStorePg", () => ({
  getDaaSystemConfig: vi.fn(),
}));

import { resolveSecret } from "@/src/daa/config/secretsManager";
import { resolveLlmConfig, resolveLlmRequestEndpoint } from "@/src/daa/llm/llmClient";
import { getDaaSystemConfig } from "@/src/daa/store/daaStorePg";

function mockOpenAiSystemConfig() {
  vi.mocked(getDaaSystemConfig).mockResolvedValue(buildSystemConfigRow({
    dataSources: {
      llmModels: [
        {
          id: "analysis-openai",
          label: "分析模型",
          taskType: "analysis",
          enabled: true,
          provider: "openai",
          endpoint: "https://llm.example.com/v1",
          model: "gpt-5.4",
          timeoutMs: 20000,
        },
      ],
    },
  }));
}

describe("resolveLlmConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOpenAiSystemConfig();
  });

  it("provider 专用 key 存在时不再读取通用 key", async () => {
    vi.mocked(resolveSecret).mockImplementation(async (key) => {
      if (key === "llm_api_key_openai") return "provider-key";
      return "";
    });

    const config = await resolveLlmConfig("analysis");

    expect(config.apiKey).toBe("provider-key");
    expect(vi.mocked(resolveSecret).mock.calls.map(([key]) => key)).not.toContain("llm_api_key");
  });

  it("provider 专用 key 缺失时回退到通用 key", async () => {
    vi.mocked(resolveSecret).mockImplementation(async (key) => {
      if (key === "llm_api_key") return "generic-key";
      return "";
    });

    const config = await resolveLlmConfig("analysis");

    expect(config.apiKey).toBe("generic-key");
    expect(vi.mocked(resolveSecret).mock.calls.map(([key]) => key)).toContain("llm_api_key");
  });

  it("把 base endpoint 归一化到实际请求端点", () => {
    expect(resolveLlmRequestEndpoint("openai", "https://llm.example.com/v1")).toBe("https://llm.example.com/v1/responses");
    expect(resolveLlmRequestEndpoint("deepseek", "https://api.deepseek.com/v1")).toBe("https://api.deepseek.com/v1/chat/completions");
  });
});
