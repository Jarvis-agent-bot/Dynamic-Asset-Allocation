import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/daa/llm/llmClient", () => ({
  resolveLlmConfig: vi.fn(),
  callLlm: vi.fn(),
}));

import { resolveLlmConfig } from "@/src/daa/llm/llmClient";
import { planAssistantIntent } from "@/src/daa/chat/intentParser";

describe("assistant-planning-fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("LLM 不可用时会沿用只读会话的降级规则", async () => {
    vi.mocked(resolveLlmConfig).mockResolvedValue({
      enabled: false,
      enabledInDecision: false,
      provider: "deepseek",
      model: "deepseek-chat",
      endpoint: "https://api.deepseek.com/v1/chat/completions",
      apiKey: "",
      timeoutMs: 5000,
    });

    const result = await planAssistantIntent({
      userText: "执行调仓",
      allowExecution: false,
      contextDigest: "",
      sessionSummary: "",
      recentConversation: "",
      pendingActionDescription: "无",
      learningDigest: "",
    });

    expect(result.source).toBe("fallback");
    expect(result.intent).toMatchObject({
      kind: "llm_answer",
      answer: null,
    });
  });
});
