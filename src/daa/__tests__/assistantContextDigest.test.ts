import { describe, expect, it } from "vitest";

import { buildAssistantBrainContextDigest, buildAssistantSystemDigest } from "@/src/daa/chat/agentContext";

describe("assistant-context-digest", () => {
  it("会汇总权限边界、LLM 路由与投资助理复核状态", () => {
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
    expect(digest).toContain("通道权限：Web 与 Telegram 入站");
    expect(digest).toContain("权限边界：不返回敏感密钥明文");
    expect(digest).toContain("系统设置只允许显式切换投资助理授权等级");
    expect(digest).toContain("投资助理授权：手动复核授权");
    expect(digest).toContain("投资助理动作边界：手动复核授权");
    expect(digest).toContain("分析解读：启用 / openai / gpt-5.4 / llm-api.onekeytest.com");
    expect(digest).toContain("深度研究：关闭 / openai / gpt-5.4 / llm-api.onekeytest.com");
    expect(digest).toContain("投资助理复核：已启用");
    expect(digest).toContain("输出目标权重计划");
  });

  it("会把活跃投资判断和最新简报整理成聊天可用的投资助理上下文", () => {
    const digest = buildAssistantBrainContextDigest({
      activeTheses: [{
        id: "t1",
        title: "NVDA 数据中心增长",
        status: "active",
        thesisText: "数据中心收入继续支撑估值，但需要观察毛利率。",
        conviction: "medium",
        invalidationConditions: null,
        reviewAt: null,
        assetKeys: ["US::NVDA"],
        tags: ["AI"],
        priorityScore: 0.8,
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: new Date().toISOString(),
      }],
      latestRun: {
        id: "run-1",
        trigger: "manual",
        langgraphThreadId: null,
        status: "completed",
        targetThreadIds: [],
        toolsCalled: [],
        reasoningTraces: [],
        surprises: [],
        briefing: {
          surprises: [{ title: "毛利率低于预期", description: "最新数据削弱原先高增长假设。", relatedThesisId: "t1", severityScore: 7, suggestedAction: "复核目标权重" }],
          cognitionGaps: [{ assetKey: "US::NVDA", portfolioWeight: 0.12, daysSinceLastInvestigation: 9, uncertaintyReason: "高权重持仓需要复核", suggestedInvestigation: "核对失效条件" }],
          mindChangeConditions: [{ thesisTitle: "NVDA 数据中心增长", currentConviction: "medium", conditions: ["毛利率连续两个季度低于预期"], monitoringIndicators: ["gross margin"] }],
          thesesUpdated: 1,
          memoriesCreated: 0,
          totalTokens: 100,
          estimatedCost: 0,
        },
        totalTokens: 100,
        totalCostUsd: 0,
        durationMs: 1000,
        createdAt: "2026-05-28T00:00:00.000Z",
        completedAt: "2026-05-28T00:01:00.000Z",
      },
    });

    expect(digest).toContain("活跃投资判断（1 个）");
    expect(digest).toContain("NVDA 数据中心增长");
    expect(digest).toContain("需要复核的变化");
    expect(digest).toContain("毛利率低于预期");
    expect(digest).toContain("投资判断复核");
    expect(digest).toContain("改变判断的条件");
  });
});
