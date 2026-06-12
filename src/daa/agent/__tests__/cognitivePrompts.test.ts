/**
 * Cognitive Prompts — 测试 prompt builder 输出结构和关键指令
 */
import { describe, it, expect } from "vitest";
import {
  buildPrioritizePrompt,
  buildReflectPrompt,
  buildReviewPrompt,
  buildStrategyAdvisorPrompt,
  buildSurfacePrompt,
} from "@/src/daa/agent/cognitivePrompts";
import type { ResearchThread } from "@/src/daa/agent/cognitiveTypes";

// ── 测试数据 ──

const mockThread: ResearchThread = {
  id: "test-id-1234",
  title: "NVDA AI 基础设施需求持续",
  status: "active",
  thesisText: "AI 数据中心投资周期尚未见顶",
  conviction: "high",
  invalidationConditions: "NVDA PE > 80x",
  reviewAt: null,
  assetKeys: ["US::NVDA"],
  tags: ["个股", "AI"],
  priorityScore: 0.8,
  createdAt: "2026-03-01T00:00:00Z",
  updatedAt: "2026-04-01T00:00:00Z",
};

const mockPortfolio = {
  holdings: [
    { assetKey: "US::NVDA", symbol: "NVDA", holdingQty: 100, lastPrice: 120, weightPct: 0.15, unrealizedPnlPct: 0.12 },
    { assetKey: "US::AAPL", symbol: "AAPL", holdingQty: 50, lastPrice: 180, weightPct: 0.10, unrealizedPnlPct: -0.05 },
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
    expect(prompt).toContain("US::NVDA");
    expect(prompt).toContain("15.0%");
  });

  it("把观察列表和事件资产纳入研究优先级上下文", () => {
    const prompt = buildPrioritizePrompt({
      portfolio: mockPortfolio,
      watchlist: [{
        assetKey: "US::QQQ",
        symbol: "QQQ",
        lastPrice: 663,
        targetWeightPct: 0,
        fxMissing: false,
        notes: "纳指核心观察",
        tags: ["growth"],
      }],
      market: mockMarket,
      news: { items: [] },
      theses: [mockThread],
      focusSymbols: ["QQQ"],
      maxTargets: 5,
    });

    expect(prompt).toContain("观察列表");
    expect(prompt).toContain("US::QQQ");
    expect(prompt).toContain("事件触发资产");
    expect(prompt).toContain("QQQ");
    expect(prompt).toContain("1-5 个");
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
      priceChangeText: "\n该资产在投资判断存续期间(30天)内涨跌幅为 15.2%",
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
    expect(prompt).toContain("每日复核简报编辑");
    expect(prompt).toContain("示例输出");
    // cognitionGaps 已改为代码直出，不再出现在 prompt schema 中
    expect(prompt).not.toContain("cognitionGaps");
    expect(prompt).toContain("mindChangeConditions");
  });
});

describe("buildStrategyAdvisorPrompt", () => {
  it("把自动跟踪项的 Agent 语义传给策略顾问，而不是只给天数", () => {
    const prompt = buildStrategyAdvisorPrompt({
      holdings: [{
        assetKey: "US::NVDA",
        symbol: "NVDA",
        weightPct: 0.107,
        lastPrice: 980,
        holdingQty: 10,
        valuationBase: 9_800,
        unrealizedPnlPct: 0.12,
        targetWeightHint: 0.15,
        gapPct: 4.3,
      }],
      watchlist: [],
      theses: [{ ...mockThread, conviction: "uncertain" }],
      surprises: [],
      cognitionGaps: [{
        assetKey: "US::NVDA",
        portfolioWeight: 0.107,
        daysSinceLastInvestigation: 2,
        uncertaintyReason: "投资判断仍处观察态，尚未形成高置信度方向",
        suggestedInvestigation: "关注维度：组合、资产配置、宏观",
      }],
      ruleRegime: "risk_on",
      defaultDriftThresholdPct: 0.05,
      maxPositionPct: 0.3,
    });

    expect(prompt).toContain("投资判断仍处观察态");
    expect(prompt).toContain("关注维度");
    expect(prompt).toContain("目标15.0%");
    expect(prompt).toContain("偏离+4.3pct");
    expect(prompt).toContain("未实现盈亏+12.0%");
    expect(prompt).not.toContain("US::NVDA 权重10.7% 2天未更新");
  });

  it("把观察列表候选交给策略顾问，使投资助理可以生成 BUY 目标权重", () => {
    const prompt = buildStrategyAdvisorPrompt({
      holdings: [],
      watchlist: [{
        assetKey: "US::QQQ",
        symbol: "QQQ",
        lastPrice: 663,
        targetWeightPct: 0,
        fxMissing: false,
        notes: "纳指核心观察",
        tags: ["growth"],
      }],
      theses: [],
      surprises: [],
      cognitionGaps: [],
      ruleRegime: "risk_on",
      defaultDriftThresholdPct: 0.05,
      maxPositionPct: 0.3,
    });

    expect(prompt).toContain("观察列表候选");
    expect(prompt).toContain("QQQ (US::QQQ)");
    expect(prompt).toContain("可以对观察列表候选给出新目标权重");
    expect(prompt).toContain("这会生成 BUY 提案");
  });
});


// ── 输出长度/标题规范（推送语义化重构） ──

describe("prompt 输出规范约束", () => {
  it("prioritize prompt 要求新投资判断标题为 ≤16 字名词短语，禁止疑问句", () => {
    const prompt = buildPrioritizePrompt({
      portfolio: mockPortfolio,
      market: mockMarket,
      news: { items: [] },
      theses: [mockThread],
    });
    expect(prompt).toContain("16 个字");
    expect(prompt).toContain("名词短语");
    expect(prompt).toContain("禁止");
    // few-shot 示例本身必须是短标题
    expect(prompt).toContain("波动率飙升避险");
    expect(prompt).not.toContain("市场波动率飙升的避险策略");
  });

  it("surface prompt 约束 surprises/conditions 的长度，避免推送被硬截断", () => {
    const prompt = buildSurfacePrompt({
      portfolio: mockPortfolio,
      market: mockMarket,
      theses: [mockThread],
      surprises: [],
      thesesUpdated: 0,
      memoriesCreated: 0,
    });
    expect(prompt).toContain("长度规范");
    expect(prompt).toContain("80 字");
    expect(prompt).toContain("60 字");
  });

  it("策略顾问 prompt 约束 reasoning 长度", () => {
    const prompt = buildStrategyAdvisorPrompt({
      holdings: [],
      watchlist: [],
      theses: [],
      surprises: [],
      cognitionGaps: [],
      ruleRegime: "risk_on",
      defaultDriftThresholdPct: 0.05,
      maxPositionPct: 0.3,
    });
    expect(prompt).toContain("120 字");
  });
});
