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
    // cognitionGaps 已改为代码直出，不再出现在 prompt schema 中
    expect(prompt).not.toContain("cognitionGaps");
    expect(prompt).toContain("mindChangeConditions");
  });
});

describe("buildStrategyAdvisorPrompt", () => {
  it("把自动跟踪项的 Agent 语义传给策略顾问，而不是只给天数", () => {
    const prompt = buildStrategyAdvisorPrompt({
      holdings: [{ assetKey: "US:NVDA", symbol: "NVDA", weightPct: 0.107, price: 980 }],
      theses: [{ ...mockThread, conviction: "uncertain" }],
      surprises: [],
      cognitionGaps: [{
        assetKey: "US:NVDA",
        portfolioWeight: 0.107,
        daysSinceLastInvestigation: 2,
        uncertaintyReason: "论点仍处观察态，尚未形成高置信度方向",
        suggestedInvestigation: "关注维度：组合、资产配置、宏观",
      }],
      ruleRegime: "risk_on",
      defaultDriftThresholdPct: 0.05,
      maxPositionPct: 0.3,
    });

    expect(prompt).toContain("论点仍处观察态");
    expect(prompt).toContain("关注维度");
    expect(prompt).not.toContain("US:NVDA 权重10.7% 2天未更新");
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

  it("组合概览优先使用基准货币估值，避免港股原币种金额放大", () => {
    const briefing: DailyBriefing = {
      surprises: [],
      cognitionGaps: [],
      mindChangeConditions: [],
      thesesUpdated: 0,
      memoriesCreated: 0,
      totalTokens: 0,
      estimatedCost: 0,
    };
    const html = formatBriefingForTelegram(briefing, {
      totalTokens: 0,
      durationMs: 1000,
      thesesCount: 1,
      memoriesCount: 0,
      portfolio: {
        totalEquity: 10_200,
        cashPct: 0.9,
        holdings: [{
          assetKey: "HK::0388.HK",
          symbol: "0388.HK",
          holdingQty: 20,
          lastPrice: 390,
          valuationBase: 1_000,
          weightPct: 0.098,
          unrealizedPnlPct: 0.032,
        }],
      },
    });

    expect(html).toContain("持仓 <code>$1.0K</code>");
    expect(html).toContain("香港交易所 0388.HK 9.8% $1.0K");
    expect(html).not.toContain("$7.8K");
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

  it("有自动跟踪但无目标权重计划时，明确说明不会直接调仓", () => {
    const briefing: DailyBriefing = {
      surprises: [],
      cognitionGaps: [{
        assetKey: "US::NVDA",
        portfolioWeight: 0.107,
        daysSinceLastInvestigation: 2,
        uncertaintyReason: "论点仍处观察态，尚未形成高置信度方向（权重 10.7%，2 天未更新）",
        suggestedInvestigation: "关注维度：组合、资产配置、宏观",
      }],
      mindChangeConditions: [],
      thesesUpdated: 0,
      memoriesCreated: 0,
      totalTokens: 0,
      estimatedCost: 0,
      configOverlay: {
        generatedAt: "2026-04-27T00:00:00.000Z",
        agentRunId: "run-1",
        regimeOverride: null,
        targetAllocationPlan: null,
      },
    };
    const html = formatBriefingForTelegram(briefing, { totalTokens: 0, durationMs: 100, thesesCount: 1, memoriesCount: 0 });
    expect(html).toContain("策略建议");
    expect(html).toContain("本轮仅保持自动跟踪");
    expect(html).toContain("不会仅因观察态论点直接调仓");
  });

  it("有目标权重计划时，展示 Agent 的目标权重、置信度和理由", () => {
    const briefing: DailyBriefing = {
      surprises: [],
      cognitionGaps: [],
      mindChangeConditions: [],
      thesesUpdated: 0,
      memoriesCreated: 0,
      totalTokens: 0,
      estimatedCost: 0,
      configOverlay: {
        generatedAt: "2026-04-27T00:00:00.000Z",
        agentRunId: "run-1",
        regimeOverride: null,
        targetAllocationPlan: {
          reasoning: "NVDA 论点失效风险抬升，先降至观察仓。",
          intents: [{
            assetKey: "US::NVDA",
            symbol: "NVDA",
            proposedTargetWeightPct: 3,
            confidence: 86,
            reasoning: "论点证据转弱",
          }],
        },
      },
    };
    const html = formatBriefingForTelegram(briefing, { totalTokens: 0, durationMs: 100, thesesCount: 1, memoriesCount: 0 });
    expect(html).toContain("目标权重: NVDA→3.0% (86%)");
    expect(html).toContain("理由: NVDA 论点失效风险抬升");
  });

  it("渲染风险暴露板块（thesisFailureImpacts 存在且达 medium 及以上）", () => {
    const briefing: DailyBriefing = {
      surprises: [],
      cognitionGaps: [],
      mindChangeConditions: [],
      thesesUpdated: 0,
      memoriesCreated: 0,
      totalTokens: 0,
      estimatedCost: 0,
      thesisFailureImpacts: [
        {
          threadId: "t1",
          thesisTitle: "超高集中度论点",
          conviction: "high",
          affectedAssets: [{ assetKey: "HK::0388.HK", weightPct: 0.875 }],
          totalExposurePct: 0.875,
          estimatedLossPct: 0.437,
          riskLevel: "critical",
        },
        // low 级别不应被展示
        {
          threadId: "t2",
          thesisTitle: "小仓位论点",
          conviction: "medium",
          affectedAssets: [{ assetKey: "US::SPY", weightPct: 0.03 }],
          totalExposurePct: 0.03,
          estimatedLossPct: 0.009,
          riskLevel: "low",
        },
      ],
    };
    const html = formatBriefingForTelegram(briefing, { totalTokens: 0, durationMs: 0, thesesCount: 1, memoriesCount: 0 });
    expect(html).toContain("风险暴露");
    expect(html).toContain("严重");
    expect(html).toContain("超高集中度论点");
    // 资产标签走 assetRegistry：HK::0388.HK → "香港交易所 0388.HK"
    expect(html).toContain("香港交易所 0388.HK");
    // low 级别不展示
    expect(html).not.toContain("小仓位论点");
  });

  it("渲染论点冲突板块（thesisConflicts 存在）", () => {
    const briefing: DailyBriefing = {
      surprises: [],
      cognitionGaps: [],
      mindChangeConditions: [],
      thesesUpdated: 0,
      memoriesCreated: 0,
      totalTokens: 0,
      estimatedCost: 0,
      thesisConflicts: [{
        thesisA: { id: "a", title: "看多A", conviction: "high" },
        thesisB: { id: "b", title: "看空A", conviction: "low" },
        conflictType: "directional",
        overlappingAssets: ["US::NVDA"],
        severity: "high",
        llmAssessment: null,
      }],
    };
    const html = formatBriefingForTelegram(briefing, { totalTokens: 0, durationMs: 0, thesesCount: 2, memoriesCount: 0 });
    expect(html).toContain("论点冲突");
    expect(html).toContain("看多A");
    expect(html).toContain("看空A");
    // 资产标签走 assetRegistry：US::NVDA → "英伟达 NVDA"
    expect(html).toContain("英伟达 NVDA");
  });
});
