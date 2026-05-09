import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/daa/llm/llmClient", () => ({
  resolveLlmConfig: vi.fn(),
  callLlm: vi.fn(),
}));

import { callLlm, resolveLlmConfig } from "@/src/daa/llm/llmClient";
import { planAssistantIntent } from "@/src/daa/chat/intentParser";

describe("assistant-planner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("优先使用 LLM 规划 trade 动作", async () => {
    vi.mocked(resolveLlmConfig).mockResolvedValue({
      enabled: true,
      provider: "openai",
      model: "gpt-4o-mini",
      endpoint: "https://api.openai.com/v1/chat/completions",
      apiKey: "test-key",
      timeoutMs: 5000,
    });
    vi.mocked(callLlm).mockResolvedValue({
      text: JSON.stringify({
        intent: "trade",
        reason: "用户明确要买入标的",
        answer: "",
        trade: {
          side: "BUY",
          symbol: "QQQ",
          qty: 3,
          notional: null,
        },
        executeMode: "all",
      }),
      raw: {},
    });

    const result = await planAssistantIntent({
      userText: "帮我买入 QQQ 3股",
      allowExecution: true,
      contextDigest: "总权益 10000 USD",
      systemDigest: "当前 LLM 路由：分析解读：启用 / openai / gpt-5.4 / llm-api.onekeytest.com",
      sessionSummary: "",
      recentConversation: "",
      pendingActionDescription: "无",
      learningDigest: "暂无",
    });

    expect(result.source).toBe("llm");
    expect(result.intent).toMatchObject({
      kind: "trade",
      side: "BUY",
      symbol: "QQQ",
      qty: 3,
      notional: null,
    });
  });

  it("LLM 不可用时退回规则解析", async () => {
    vi.mocked(resolveLlmConfig).mockResolvedValue({
      enabled: false,
      provider: "deepseek",
      model: "deepseek-chat",
      endpoint: "https://api.deepseek.com/v1/chat/completions",
      apiKey: "",
      timeoutMs: 5000,
    });

    const result = await planAssistantIntent({
      userText: "生成调仓建议",
      allowExecution: true,
      contextDigest: "",
      systemDigest: "",
      sessionSummary: "",
      recentConversation: "",
      pendingActionDescription: "无",
      learningDigest: "",
    });

    expect(result.source).toBe("fallback");
    expect(result.intent).toMatchObject({
      kind: "rebalance_generate",
    });
  });

  it("LLM 规划执行调仓时默认只执行已选建议", async () => {
    vi.mocked(resolveLlmConfig).mockResolvedValue({
      enabled: true,
      provider: "openai",
      model: "gpt-5.4",
      endpoint: "https://llm-api.onekeytest.com/v1/responses",
      apiKey: "test-key",
      timeoutMs: 5000,
    });
    vi.mocked(callLlm).mockResolvedValue({
      text: JSON.stringify({
        intent: "rebalance_execute",
        reason: "用户要求执行调仓",
        answer: "",
        trade: {
          side: "BUY",
          symbol: "",
          qty: null,
          notional: null,
        },
        executeMode: "",
      }),
      raw: {},
    });

    const result = await planAssistantIntent({
      userText: "执行调仓",
      allowExecution: true,
      contextDigest: "",
      systemDigest: "",
      sessionSummary: "",
      recentConversation: "",
      pendingActionDescription: "无",
      learningDigest: "",
    });

    expect(result.source).toBe("llm");
    expect(result.intent).toMatchObject({
      kind: "rebalance_execute",
      executeMode: "selected",
    });
  });

  it("LLM 可以规划 thesis_status 和 agent_briefing 这类 Agent 查询", async () => {
    vi.mocked(resolveLlmConfig).mockResolvedValue({
      enabled: true,
      provider: "openai",
      model: "gpt-5.4",
      endpoint: "https://llm-api.onekeytest.com/v1/responses",
      apiKey: "test-key",
      timeoutMs: 5000,
    });
    vi.mocked(callLlm).mockResolvedValue({
      text: JSON.stringify({
        intent: "thesis_status",
        reason: "用户在问活跃论点",
        answer: "",
        trade: {
          side: "BUY",
          symbol: "",
          qty: null,
          notional: null,
        },
        executeMode: "all",
      }),
      raw: {},
    });

    const result = await planAssistantIntent({
      userText: "现在有哪些活跃论点？",
      allowExecution: true,
      contextDigest: "",
      systemDigest: "",
      sessionSummary: "",
      recentConversation: "",
      pendingActionDescription: "无",
      learningDigest: "",
    });

    expect(result.source).toBe("llm");
    expect(result.intent).toMatchObject({
      kind: "thesis_status",
    });
  });

  it("LLM 可以规划 brain_status 和 agent_run 这类大脑控制意图", async () => {
    vi.mocked(resolveLlmConfig).mockResolvedValue({
      enabled: true,
      provider: "openai",
      model: "gpt-5.4",
      endpoint: "https://llm-api.onekeytest.com/v1/responses",
      apiKey: "test-key",
      timeoutMs: 5000,
    });
    vi.mocked(callLlm).mockResolvedValue({
      text: JSON.stringify({
        intent: "agent_run",
        reason: "用户要求启动认知循环",
        answer: "",
        trade: {
          side: "BUY",
          symbol: "",
          qty: null,
          notional: null,
        },
        executeMode: "all",
      }),
      raw: {},
    });

    const result = await planAssistantIntent({
      userText: "帮我跑一轮 agent 调查",
      allowExecution: true,
      contextDigest: "",
      systemDigest: "当前 LLM 路由：分析解读：启用 / openai / gpt-5.4 / llm-api.onekeytest.com",
      sessionSummary: "",
      recentConversation: "",
      pendingActionDescription: "无",
      learningDigest: "",
    });

    expect(result.source).toBe("llm");
    expect(result.intent).toMatchObject({
      kind: "agent_run",
    });
  });

  it("LLM 可以规划 brain_set_mode 这类大脑配置意图", async () => {
    vi.mocked(resolveLlmConfig).mockResolvedValue({
      enabled: true,
      provider: "openai",
      model: "gpt-5.4",
      endpoint: "https://llm-api.onekeytest.com/v1/responses",
      apiKey: "test-key",
      timeoutMs: 5000,
    });
    vi.mocked(callLlm).mockResolvedValue({
      text: JSON.stringify({
        intent: "brain_set_mode",
        reason: "用户要求切换到自动驾驶",
        answer: "",
        brainMode: "autopilot",
        trade: {
          side: "BUY",
          symbol: "",
          qty: null,
          notional: null,
        },
        executeMode: "all",
      }),
      raw: {},
    });

    const result = await planAssistantIntent({
      userText: "切到自动驾驶模式",
      allowExecution: true,
      contextDigest: "",
      systemDigest: "大脑模式：操作员模式；配置写入关闭；自动调仓只接受目标权重计划",
      sessionSummary: "",
      recentConversation: "",
      pendingActionDescription: "无",
      learningDigest: "",
    });

    expect(result.source).toBe("llm");
    expect(result.intent).toMatchObject({
      kind: "brain_set_mode",
      mode: "autopilot",
    });
  });
});
