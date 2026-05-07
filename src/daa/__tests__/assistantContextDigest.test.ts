import { describe, expect, it } from "vitest";

import { buildAssistantSystemDigest } from "@/src/daa/chat/agentContext";

describe("assistant-context-digest", () => {
  it("会汇总权限边界、LLM 路由与认知 Agent 状态", () => {
    const digest = buildAssistantSystemDigest({
      llmRoutes: [
        {
          taskType: "analysis",
          enabled: true,
          provider: "openai",
          model: "gpt-5.4",
          endpoint: "https://llm-api.onekeytest.com/v1/responses",
        },
        {
          taskType: "decision",
          enabled: true,
          provider: "openai",
          model: "gpt-5.4",
          endpoint: "https://llm-api.onekeytest.com/v1/responses",
        },
        {
          taskType: "research",
          enabled: false,
          provider: "openai",
          model: "gpt-5.4",
          endpoint: "https://llm-api.onekeytest.com/v1/responses",
        },
      ],
      brain: {
        mode: "operator",
      },
      cognitiveAgent: {
        enabled: true,
        maxInvestigationTargets: 3,
        reviewIntervalDays: 14,
        memoryRecallLimit: 5,
        circuitBreakerThreshold: 3,
        schedule: "daily",
        memoryDecayRate: 0.97,
        thesisStalenessDays: 7,
      },
    });

    expect(digest).toContain("执行边界：仅支持本地模拟");
    expect(digest).toContain("权限边界：不返回敏感密钥明文");
    expect(digest).toContain("大脑模式：操作员模式");
    expect(digest).toContain("大脑动作边界：操作员模式");
    expect(digest).toContain("分析解读：启用 / openai / gpt-5.4 / llm-api.onekeytest.com");
    expect(digest).toContain("深度研究：关闭 / openai / gpt-5.4 / llm-api.onekeytest.com");
    expect(digest).toContain("认知 Agent：已启用");
    expect(digest).toContain("输出目标权重计划");
  });
});
