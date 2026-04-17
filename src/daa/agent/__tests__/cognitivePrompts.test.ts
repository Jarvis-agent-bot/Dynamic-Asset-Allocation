/**
 * Cognitive Prompts — 测试 prompt builder 输出结构和关键指令
 */
import { describe, it, expect } from "vitest";
import {
  buildPrioritizePrompt,
  buildReflectPrompt,
  buildReviewPrompt,
  buildSurfacePrompt,
  formatBriefingForTelegram,
} from "@/src/daa/agent/cognitivePrompts";
import type { ResearchThread, DailyBriefing } from "@/src/daa/agent/cognitiveTypes";

// ── 测试数据 ──

const mockThread: ResearchThread = {
  id: "test-id-1234",
  title: "NVDA AI 基础设施需求持续",
  status: "active",
  thesisText: "AI 数据中心投资周期尚未见顶",
  conviction: "high",
  invalidationConditions: "NVDA PE > 80x",
  reviewAt: null,
  assetKeys: ["US:NVDA"],
  tags: ["个股", "AI"],
  priorityScore: 0.8,
  createdAt: "2026-03-01T00:00:00Z",
  updatedAt: "2026-04-01T00:00:00Z",
};

const mockPortfolio = {
  holdings: [
    { assetKey: "US:NVDA", symbol: "NVDA", holdingQty: 100, lastPrice: 120, weightPct: 0.15, unrealizedPnlPct: 0.12 },
    { assetKey: "US:AAPL", symbol: "AAPL", holdingQty: 50, lastPrice: 180, weightPct: 0.10, unrealizedPnlPct: -0.05 },
  ],
  totalEquity: 100000,
  cashPct: 0.05,
};

const mockMarket = {
  regime: "risk_on" as const,
  vix: 18.5,
  indicators: {},
};

// ── buildPrioritizePrompt ──

describe("buildPrioritizePrompt", () => {
  it("包含关键角色指令", () => {
    const prompt = buildPrioritizePrompt({
      portfolio: mockPortfolio,
      market: mockMarket,
      news: { items: [] },
      theses: [mockThread],
    });
    expect(prompt).toContain("投委会主席");
    expect(prompt).toContain("JSON");
    expect(prompt).toContain("targets");
  });

  it("包含 few-shot 示例", () => {
    const prompt = buildPrioritizePrompt({
      portfolio: mockPortfolio,
      market: mockMarket,
      news: { items: [] },
      theses: [],
    });
    expect(prompt).toContain("示例输出");
  });

  it("包含持仓数据", () => {
    const prompt = buildPrioritizePrompt({
      portfolio: mockPortfolio,
      market: mockMarket,
      news: { items: [] },
      theses: [mockThread],
    });
    expect(prompt).toContain("US:NVDA");
    expect(prompt).toContain("15.0%");
  });

  it("返回非空字符串", () => {
    const prompt = buildPrioritizePrompt({
      portfolio: { holdings: [], totalEquity: 0, cashPct: 0 },
      market: mockMarket,
      news: { items: [] },
      theses: [],
    });
    expect(prompt.length).toBeGreaterThan(100);
  });
});

// ── buildReflectPrompt ──

describe("buildReflectPrompt", () => {
  it("包含角色和 few-shot", () => {
    const prompt = buildReflectPrompt({
      thread: mockThread,
      updatedThesis: "AI 投资已过热",
      newConviction: "low",
      evidenceSummary: "PE过高",
    });
    expect(prompt).toContain("首席风控官");
    expect(prompt).toContain("示例输出");
    expect(prompt).toContain("overreactionRisk");
  });

  it("包含 conviction 变化信息", () => {
    const prompt = buildReflectPrompt({
      thread: mockThread,
      updatedThesis: "changed",
      newConviction: "low",
      evidenceSummary: "test",
    });
    expect(prompt).toContain("high");
    expect(prompt).toContain("low");
  });
});

// ── buildReviewPrompt ──

describe("buildReviewPrompt", () => {
  it("包含角色和 few-shot", () => {
    const prompt = buildReviewPrompt({
      thread: mockThread,
      marketRegime: "risk_on",
      vix: 20,
    });
    expect(prompt).toContain("复盘审计师");
    expect(prompt).toContain("示例输出");
    expect(prompt).toContain("accuracyScore");
  });

  it("包含 ground truth 价格变动文本", () => {
    const prompt = buildReviewPrompt({
      thread: mockThread,
      marketRegime: "risk_on",
      vix: 20,
      priceChangeText: "\n该资产在论点存续期间(30天)内涨跌幅为 15.2%",
    });
    expect(prompt).toContain("## 实际市场表现");
    expect(prompt).toContain("15.2%");
  });

  it("无 priceChangeText 时不显示市场表现数据段", () => {
    const prompt = buildReviewPrompt({
      thread: mockThread,
      marketRegime: "risk_on",
      vix: 20,
    });
    // 不应包含 "## 实际市场表现" 这个标题（带 ## 前缀），但任务描述中有"实际市场表现"文字
    expect(prompt).not.toContain("## 实际市场表现");
  });
});

// ── buildSurfacePrompt ──

describe("buildSurfacePrompt", () => {
  it("包含角色和 few-shot", () => {
    const prompt = buildSurfacePrompt({
      portfolio: mockPortfolio,
      market: mockMarket,
      theses: [mockThread],
      surprises: [],
      thesesUpdated: 1,
      memoriesCreated: 0,
    });
    expect(prompt).toContain("日报编辑");
    expect(prompt).toContain("示例输出");
    expect(prompt).toContain("cognitionGaps");
    expect(prompt).toContain("mindChangeConditions");
  });
});

// ── formatBriefingForTelegram ──

describe("formatBriefingForTelegram", () => {
  it("格式化含所有板块的 briefing", () => {
    const briefing: DailyBriefing = {
      surprises: [{ title: "测试意外", description: "描述", relatedThesisId: null, severityScore: 8, suggestedAction: "行动" }],
      cognitionGaps: [{ assetKey: "US:NVDA", portfolioWeight: 0.15, daysSinceLastInvestigation: 20, uncertaintyReason: "原因", suggestedInvestigation: "建议" }],
      mindChangeConditions: [{ thesisTitle: "测试论点", currentConviction: "high", conditions: ["条件1"], monitoringIndicators: ["VIX"] }],
      thesesUpdated: 2,
      memoriesCreated: 1,
      totalTokens: 5000,
      estimatedCost: 0.001,
    };
    const html = formatBriefingForTelegram(briefing, { totalTokens: 5000, durationMs: 3000, thesesCount: 10, memoriesCount: 20 });
    expect(html).toContain("Agent 日报");
    expect(html).toContain("测试意外");
    expect(html).toContain("US:NVDA");
    expect(html).toContain("测试论点");
  });

  it("空 briefing 也能正常格式化", () => {
    const briefing: DailyBriefing = {
      surprises: [],
      cognitionGaps: [],
      mindChangeConditions: [],
      thesesUpdated: 0,
      memoriesCreated: 0,
      totalTokens: 0,
      estimatedCost: 0,
    };
    const html = formatBriefingForTelegram(briefing, { totalTokens: 0, durationMs: 100, thesesCount: 0, memoriesCount: 0 });
    expect(html).toContain("市场与预期一致");
  });
});
