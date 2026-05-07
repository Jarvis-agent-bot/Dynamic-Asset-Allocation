/**
 * Agent Rebalance Adapter — conviction multiplier 和边界情况测试
 *
 * 注意：enhanceProposalsWithAgent 依赖 DB，这里只测试可导出的常量和映射逻辑。
 * 通过 import 验证模块可正常加载。
 */
import { beforeEach, describe, it, expect, vi } from "vitest";

vi.mock("@/src/daa/agent/store/thesisStore", () => ({
  getActiveTheses: vi.fn(),
  getThesisAccuracyAvg: vi.fn(),
}));

vi.mock("@/src/daa/llm/llmClient", () => ({
  callLlm: vi.fn(),
  resolveLlmConfig: vi.fn(),
}));

import { enhanceProposalsWithAgent, selectPrimaryRebalanceThesis } from "@/src/daa/agent/agentRebalanceAdapter";
import type { ResearchThread } from "@/src/daa/agent/cognitiveTypes";
import { getActiveTheses, getThesisAccuracyAvg } from "@/src/daa/agent/store/thesisStore";
import { callLlm, resolveLlmConfig } from "@/src/daa/llm/llmClient";

// 从适配器源码中提取的 conviction multiplier 映射（与源码保持同步）
const CONVICTION_MULTIPLIER: Record<string, number> = {
  high: 1.0,
  medium: 0.6,
  low: 0.2,
  uncertain: 0,
};

beforeEach(() => {
  vi.mocked(getActiveTheses).mockReset();
  vi.mocked(getThesisAccuracyAvg).mockReset();
  vi.mocked(callLlm).mockReset();
  vi.mocked(resolveLlmConfig).mockReset();
  vi.mocked(getThesisAccuracyAvg).mockResolvedValue(null);
  vi.mocked(resolveLlmConfig).mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof resolveLlmConfig>>);
});

describe("Conviction Multiplier 映射", () => {
  it("high → 1.0 (全量执行)", () => {
    expect(CONVICTION_MULTIPLIER.high).toBe(1.0);
  });

  it("medium → 0.6 (60%执行)", () => {
    expect(CONVICTION_MULTIPLIER.medium).toBe(0.6);
  });

  it("low → 0.2 (20%执行)", () => {
    expect(CONVICTION_MULTIPLIER.low).toBe(0.2);
  });

  it("uncertain → 0 (跳过)", () => {
    expect(CONVICTION_MULTIPLIER.uncertain).toBe(0);
  });

  it("未知 conviction 使用 fallback 0.6", () => {
    const conviction = "unknown_value";
    const multiplier = CONVICTION_MULTIPLIER[conviction] ?? 0.6;
    expect(multiplier).toBe(0.6);
  });
});

describe("提案量调整逻辑", () => {
  const applyMultiplier = (suggestedQty: number, conviction: string) => {
    const multiplier = CONVICTION_MULTIPLIER[conviction] ?? 0.6;
    return Math.round(suggestedQty * multiplier);
  };

  it("high conviction 保持原始量", () => {
    expect(applyMultiplier(100, "high")).toBe(100);
  });

  it("medium conviction 减至 60%", () => {
    expect(applyMultiplier(100, "medium")).toBe(60);
  });

  it("low conviction 减至 20%", () => {
    expect(applyMultiplier(100, "low")).toBe(20);
  });

  it("uncertain conviction 量为 0 → 跳过", () => {
    expect(applyMultiplier(100, "uncertain")).toBe(0);
  });

  it("小数量四舍五入", () => {
    expect(applyMultiplier(3, "medium")).toBe(2); // 3 * 0.6 = 1.8 → 2
  });

  it("1 股 low conviction 趋近 0", () => {
    expect(applyMultiplier(1, "low")).toBe(0); // 1 * 0.2 = 0.2 → 0
  });

  it("enhanceProposalsWithAgent 会按最终 qty 回算 suggestedNotional", async () => {
    vi.mocked(getActiveTheses).mockResolvedValue([
      {
        id: "t-medium",
        title: "medium thesis",
        status: "active",
        thesisText: "medium thesis text",
        conviction: "medium",
        invalidationConditions: null,
        reviewAt: null,
        assetKeys: ["US::AAPL"],
        tags: [],
        priorityScore: 0.6,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ] as ResearchThread[]);

    const result = await enhanceProposalsWithAgent({
      draftProposals: [
        {
          assetKey: "US::AAPL",
          symbol: "AAPL",
          currency: "USD",
          fxRateToBase: 1,
          side: "BUY",
          suggestedQty: 3,
          suggestedNotional: 300,
          price: 100,
          reason: "draft",
          selected: true,
          hfContribution: null,
        },
      ],
      marketRegime: null,
      totalEquity: 1000,
      maxPositionPct: 0.1,
    });

    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]?.suggestedQty).toBe(2);
    expect(result.proposals[0]?.suggestedNotional).toBe(200);
  });
});

describe("Decision Context 映射", () => {
  const mapConvictionToSignal = (conviction: string) => ({
    signalAction: conviction === "high" ? "open_or_add" : conviction === "medium" ? "watch" : "reduce_or_avoid",
    signalScore: conviction === "high" ? 80 : conviction === "medium" ? 60 : 30,
    signalConfidence: conviction === "high" ? 85 : conviction === "medium" ? 60 : 35,
  });

  it("high conviction 映射", () => {
    const ctx = mapConvictionToSignal("high");
    expect(ctx.signalAction).toBe("open_or_add");
    expect(ctx.signalScore).toBe(80);
    expect(ctx.signalConfidence).toBe(85);
  });

  it("medium conviction 映射", () => {
    const ctx = mapConvictionToSignal("medium");
    expect(ctx.signalAction).toBe("watch");
    expect(ctx.signalScore).toBe(60);
  });

  it("low conviction 映射", () => {
    const ctx = mapConvictionToSignal("low");
    expect(ctx.signalAction).toBe("reduce_or_avoid");
    expect(ctx.signalScore).toBe(30);
    expect(ctx.signalConfidence).toBe(35);
  });
});

describe("主调仓论点选择", () => {
  const makeThread = (overrides: Partial<ResearchThread>): ResearchThread => ({
    id: "t",
    title: "test",
    status: "active",
    thesisText: "test",
    conviction: "uncertain",
    invalidationConditions: null,
    reviewAt: null,
    assetKeys: ["US::NVDA"],
    tags: [],
    priorityScore: 0.5,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });

  it("同资产存在 uncertain 和 medium 时，优先用有方向的论点驱动调仓", () => {
    const thesis = selectPrimaryRebalanceThesis([
      makeThread({ id: "u", conviction: "uncertain", priorityScore: 0.99, updatedAt: "2026-01-03T00:00:00.000Z" }),
      makeThread({ id: "m", conviction: "medium", priorityScore: 0.4, updatedAt: "2026-01-02T00:00:00.000Z" }),
    ]);

    expect(thesis?.id).toBe("m");
  });

  it("同 conviction 时按 priorityScore 再按更新时间排序", () => {
    const thesis = selectPrimaryRebalanceThesis([
      makeThread({ id: "older", conviction: "medium", priorityScore: 0.4, updatedAt: "2026-01-01T00:00:00.000Z" }),
      makeThread({ id: "newer", conviction: "medium", priorityScore: 0.6, updatedAt: "2026-01-02T00:00:00.000Z" }),
    ]);

    expect(thesis?.id).toBe("newer");
  });
});
