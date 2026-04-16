/**
 * Sub-Agent — 单元测试
 *
 * 测试子 agent 的限制条件和错误处理。
 */

import { describe, it, expect, vi } from "vitest";
import type { SubAgentConfig } from "@/src/daa/agent/subAgent";
import type { ResearchThread } from "@/src/daa/agent/cognitiveTypes";

// mock LLM 和 DB 依赖
vi.mock("@/src/daa/llm/llmClient", () => ({
  callLlm: vi.fn().mockResolvedValue({ text: '```json\n{"action":"result","result":{"thesisChanged":false,"evidenceType":"neutral","evidenceSummary":"mock分析"}}\n```' }),
  resolveLlmConfig: vi.fn().mockResolvedValue({ provider: "deepseek", endpoint: "test", model: "test", apiKey: "test" }),
}));

vi.mock("@/src/daa/pg/daaPg", () => ({
  withDaaPgClient: vi.fn().mockImplementation(async (fn: unknown) => {
    // 不真正连接 DB
    return [];
  }),
}));

// 触发工具自注册
import "@/src/daa/agent/tools/index";
import { runSubAgentInvestigation } from "@/src/daa/agent/subAgent";

const mockThread: ResearchThread = {
  id: "thread-1",
  title: "测试论点",
  status: "active",
  thesisText: "AAPL 在 AI 驱动下将持续上涨",
  conviction: "medium",
  invalidationConditions: "PE > 40",
  reviewAt: null,
  assetKeys: ["US:AAPL"],
  tags: ["tech", "ai"],
  priorityScore: 80,
  createdAt: "2026-04-01T00:00:00Z",
  updatedAt: "2026-04-15T00:00:00Z",
};

describe("runSubAgentInvestigation", () => {
  it("深度超限时返回错误", async () => {
    const config: SubAgentConfig = {
      parentRunId: "parent-1",
      thread: mockThread,
      allowedCategories: ["observe"],
      maxRounds: 3,
      tokenBudget: 8000,
      depth: 2, // MAX_DEPTH = 2，应该被拒绝
      memories: [],
      market: null,
      portfolio: null,
    };

    const result = await runSubAgentInvestigation(config);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("深度超限");
    expect(result.investigateOutput).toBeNull();
  });

  it("正常深度(1)时执行并返回结果", async () => {
    const config: SubAgentConfig = {
      parentRunId: "parent-2",
      thread: mockThread,
      allowedCategories: ["observe", "analyze", "meta"],
      maxRounds: 2,
      tokenBudget: 8000,
      depth: 1,
      memories: [],
      market: { regime: "risk_on", vix: 18, indicators: {} },
      portfolio: { holdings: [], totalEquity: 0, cashPct: 0 },
    };

    const result = await runSubAgentInvestigation(config);
    expect(result.threadId).toBe("thread-1");
    expect(result.threadTitle).toBe("测试论点");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    // LLM mock 直接返回 result，所以 investigateOutput 应该有值
    expect(result.investigateOutput).toBeTruthy();
    expect(result.investigateOutput?.evidenceType).toBe("neutral");
  });

  it("返回结构包含必要字段", async () => {
    const config: SubAgentConfig = {
      parentRunId: "parent-3",
      thread: mockThread,
      allowedCategories: ["observe"],
      maxRounds: 1,
      tokenBudget: 4000,
      depth: 1,
      memories: [],
      market: null,
      portfolio: null,
    };

    const result = await runSubAgentInvestigation(config);
    // 验证返回结构完整性
    expect(result).toHaveProperty("threadId");
    expect(result).toHaveProperty("threadTitle");
    expect(result).toHaveProperty("toolsCalled");
    expect(result).toHaveProperty("tokensUsed");
    expect(result).toHaveProperty("durationMs");
    expect(result).toHaveProperty("errors");
    expect(Array.isArray(result.toolsCalled)).toBe(true);
    expect(Array.isArray(result.errors)).toBe(true);
  });
});
