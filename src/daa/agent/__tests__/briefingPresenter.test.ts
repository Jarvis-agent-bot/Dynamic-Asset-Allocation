/**
 * Briefing Presenter — 简报展示层测试
 *
 * 核心语义：TG 简报是"复核报告"。
 * - 无需人介入（无高优先级变化/无目标权重计划）→ 三行摘要（digest）
 * - 需要人介入 → 今日待办置顶的完整简报（full）
 * - 风险暴露 + 判断不一致合并为按资产聚合的"投资判断风险"
 * - 不输出纯遥测（投资判断/会话摘要计数、覆盖统计、样板文案）
 */
import { describe, it, expect } from "vitest";
import {
  formatBriefingForTelegram,
  formatBriefingForChat,
  formatBriefingTextExcerpt,
  presentBriefing,
  BRIEFING_ACTION_SEVERITY,
} from "@/src/daa/agent/briefingPresenter";
import type { DailyBriefing } from "@/src/daa/agent/cognitiveTypes";

function makeBriefing(patch: Partial<DailyBriefing> = {}): DailyBriefing {
  return {
    surprises: [],
    cognitionGaps: [],
    mindChangeConditions: [],
    thesesUpdated: 0,
    memoriesCreated: 0,
    totalTokens: 0,
    estimatedCost: 0,
    ...patch,
  };
}

const mockPortfolio = {
  holdings: [
    { assetKey: "US::AAPL", symbol: "AAPL", holdingQty: 50, lastPrice: 180, weightPct: 0.078, unrealizedPnlPct: -0.029, valuationBase: 7_800 },
    { assetKey: "US::NVDA", symbol: "NVDA", holdingQty: 10, lastPrice: 980, weightPct: 0.05, unrealizedPnlPct: 0.12, valuationBase: 5_000 },
  ],
  totalEquity: 99_900,
  cashPct: 0.52,
};

// ── 摘要降级（digest） ──

describe("digest 模式", () => {
  it("无待办时降级为三行摘要，不渲染完整板块", () => {
    const briefing = makeBriefing({
      surprises: [{ title: "中等变化", description: "描述", relatedThesisId: null, severityScore: 5, suggestedAction: "看看" }],
      cognitionGaps: [{ assetKey: "US::SGOV", portfolioWeight: 0, daysSinceLastInvestigation: 25, uncertaintyReason: "观察列表判断需要复核", suggestedInvestigation: "核对失效条件" }],
    });
    const html = formatBriefingForTelegram(briefing, { portfolio: mockPortfolio });

    expect(html).toContain("今日无需操作");
    expect(html).toContain("观察中：变化 1 条 · 投资判断复核 1 个");
    expect(html).toContain("总权益 <code>$99.9K</code>");
    // 完整板块不应出现
    expect(html).not.toContain("今日待办");
    expect(html).not.toContain("需要复核的变化");
    expect(html).not.toContain("中等变化");
    // 三行以内
    expect(html.split("\n").length).toBeLessThanOrEqual(3);
  });

  it("空 briefing 输出平稳摘要", () => {
    const html = formatBriefingForTelegram(makeBriefing());
    expect(html).toContain("今日无需操作");
    expect(html).toContain("今日平稳");
  });

  it("组合概览优先使用基准货币估值，避免港股原币种金额放大", () => {
    const html = formatBriefingForTelegram(makeBriefing(), {
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
    expect(html).not.toContain("$7.8K");
  });
});

// ── 完整简报（full） ──

describe("full 模式", () => {
  it(`severity >= ${BRIEFING_ACTION_SEVERITY} 的变化进入今日待办并触发完整简报`, () => {
    const briefing = makeBriefing({
      surprises: [{ title: "黄金突破历史新高", description: "GLD单日涨幅3.2%，与美元走强矛盾。", relatedThesisId: null, severityScore: 8, suggestedAction: "检查避险资产配置" }],
    });
    const html = formatBriefingForTelegram(briefing, { portfolio: mockPortfolio });

    expect(html).toContain("今日待办");
    expect(html).toContain("[8/10] 复核「黄金突破历史新高」");
    expect(html).toContain("需要复核的变化");
    expect(html).toContain("组合概览");
    expect(html).toContain("苹果 AAPL 7.8%");
  });

  it("目标权重计划触发完整简报，展示计划详情", () => {
    const briefing = makeBriefing({
      strategyOverlay: {
        generatedAt: "2026-06-11T00:00:00.000Z",
        agentRunId: "run-1",
        regimeOverride: null,
        targetAllocationPlan: {
          reasoning: "NVDA 投资判断失效风险抬升，先降至观察仓。",
          intents: [{ assetKey: "US::NVDA", symbol: "NVDA", proposedTargetWeightPct: 3, confidence: 86, reasoning: "判断依据转弱" }],
        },
      },
    });
    const html = formatBriefingForTelegram(briefing);

    expect(html).toContain("复核目标权重计划 1 条：NVDA→3.0%");
    expect(html).toContain("目标权重计划");
    expect(html).toContain("NVDA→3.0% (86%)");
    expect(html).toContain("理由: NVDA 投资判断失效风险抬升");
  });

  it("regime 覆盖建议进入今日待办", () => {
    const briefing = makeBriefing({
      strategyOverlay: {
        generatedAt: "2026-06-11T00:00:00.000Z",
        agentRunId: "run-1",
        regimeOverride: { suggestedRegime: "risk_off", confidence: 82, reasoning: "信用利差走阔", ruleBasedRegime: "risk_on" },
        targetAllocationPlan: null,
      },
    });
    const html = formatBriefingForTelegram(briefing);
    expect(html).toContain("Regime 建议调整：risk_on → risk_off (82%)");
  });

  it("超长描述按句子收口，避免硬截断成半句话", () => {
    const longDescription = "在仅持有NVDA与0388.HK两只股票的情况下，现金占比达到80%，显著高于常规防守配置区间，组合主要矛盾已经从选股错误转为暴露不足，需要优先复核建仓节奏。结合当前市场regime为transitional、VIX仅18.02且SPY过去90天回报为正同时最大回撤温和所以这里是非常长的第二句话没有可用句号旧逻辑会直接切断。";
    const briefing = makeBriefing({
      surprises: [{ title: "现金仓位异常偏高", description: longDescription, relatedThesisId: null, severityScore: 8, suggestedAction: "复核建仓节奏" }],
    });
    const html = formatBriefingForTelegram(briefing);
    expect(html).toContain("需要优先复核建仓节奏。…");
    expect(html).not.toContain("VIX仅");
  });
});

// ── 投资判断风险（风险暴露 + 判断不一致合并） ──

describe("投资判断风险板块（按资产聚合）", () => {
  it("medium 及以上的失效影响与 high 判断不一致合并到同一资产行", () => {
    const briefing = makeBriefing({
      surprises: [{ title: "触发完整简报", description: "x", relatedThesisId: null, severityScore: 8, suggestedAction: "" }],
      thesisFailureImpacts: [
        {
          threadId: "t1",
          thesisTitle: "科技集中度 vs 利率上行",
          conviction: "medium",
          affectedAssets: [{ assetKey: "US::AAPL", weightPct: 0.078 }],
          totalExposurePct: 0.386,
          estimatedLossPct: 0.116,
          riskLevel: "high",
        },
        // low 级别不展示
        {
          threadId: "t2",
          thesisTitle: "小仓位判断",
          conviction: "medium",
          affectedAssets: [{ assetKey: "US::SPY", weightPct: 0.03 }],
          totalExposurePct: 0.03,
          estimatedLossPct: 0.009,
          riskLevel: "low",
        },
      ],
      thesisConflicts: [
        {
          thesisA: { id: "a", title: "七姐妹降风险", conviction: "medium" },
          thesisB: { id: "b", title: "苹果重新定价", conviction: "low" },
          conflictType: "directional",
          overlappingAssets: ["US::AAPL"],
          severity: "high",
          llmAssessment: null,
        },
        // medium severity 判断不一致不展示
        {
          thesisA: { id: "c", title: "次要判断甲", conviction: "medium" },
          thesisB: { id: "d", title: "次要判断乙", conviction: "low" },
          conflictType: "directional",
          overlappingAssets: ["US::TSLA"],
          severity: "medium",
          llmAssessment: null,
        },
      ],
    });
    const html = formatBriefingForTelegram(briefing, { portfolio: mockPortfolio });

    expect(html).toContain("投资判断风险");
    // AAPL 一行同时聚合风险判断与判断不一致
    expect(html).toContain("[高] 苹果 AAPL 7.8% — 风险判断 1 个（最高「科技集中度 vs 利率上行」暴露 38.6%）；方向不一致 1 组");
    expect(html).toContain("「七姐妹降风险」×「苹果重新定价」");
    // 不再有两个独立板块
    expect(html).not.toContain("风险暴露");
    expect(html).not.toContain("同一资产判断不一致");
    // low 影响、medium 判断不一致被过滤
    expect(html).not.toContain("小仓位判断");
    expect(html).not.toContain("次要判断甲");
  });
});

// ── 遥测清理 ──

describe("遥测与样板文案清理", () => {
  it("不再输出投资判断/会话摘要计数 footer 和无计划样板文案", () => {
    const briefing = makeBriefing({
      surprises: [{ title: "触发完整简报", description: "x", relatedThesisId: null, severityScore: 8, suggestedAction: "" }],
      cognitionGaps: [{ assetKey: "US::NVDA", portfolioWeight: 0.05, daysSinceLastInvestigation: 10, uncertaintyReason: "需要复核", suggestedInvestigation: "" }],
      autopilotCoverage: { holdingAssets: 21, watchlistCandidates: 3, watchlistTargetedAssets: 0, brainPlanIntents: 0, acceptedBrainPlanIntents: 0 },
      strategyOverlay: { generatedAt: "2026-06-11T00:00:00.000Z", agentRunId: "r", regimeOverride: null, targetAllocationPlan: null },
    });
    const html = formatBriefingForTelegram(briefing);

    expect(html).not.toContain("记忆:");
    expect(html).not.toContain("本轮未形成高置信度目标权重计划");
    // 无实际动作时覆盖遥测整段省略
    expect(html).not.toContain("自动复核覆盖");
    expect(html).not.toContain("持仓复核");
  });

  it("自动复核产生实际动作时上报一行", () => {
    const briefing = makeBriefing({
      surprises: [{ title: "触发完整简报", description: "x", relatedThesisId: null, severityScore: 8, suggestedAction: "" }],
      autopilotCoverage: { holdingAssets: 21, watchlistCandidates: 3, watchlistTargetedAssets: 2, brainPlanIntents: 3, acceptedBrainPlanIntents: 1 },
    });
    const html = formatBriefingForTelegram(briefing);
    expect(html).toContain("已设目标 2 个 | 目标计划已接受 1/3 条");
  });
});

// ── presentBriefing 归一化 ──

describe("presentBriefing", () => {
  it("digest/full 由待办决定", () => {
    expect(presentBriefing(makeBriefing()).mode).toBe("digest");
    const full = presentBriefing(makeBriefing({
      surprises: [{ title: "大事", description: "x", relatedThesisId: null, severityScore: 9, suggestedAction: "" }],
    }));
    expect(full.mode).toBe("full");
    expect(full.actions).toHaveLength(1);
    expect(full.actions[0].kind).toBe("surprise_review");
  });

  it("severity 低于阈值的复核变化不产生待办", () => {
    const p = presentBriefing(makeBriefing({
      surprises: [{ title: "小事", description: "x", relatedThesisId: null, severityScore: BRIEFING_ACTION_SEVERITY - 1, suggestedAction: "" }],
    }));
    expect(p.mode).toBe("digest");
    expect(p.counts.surprises).toBe(1);
  });
});

// ── Chat 渲染 ──

describe("formatBriefingForChat", () => {
  it("digest 模式输出摘要", () => {
    const text = formatBriefingForChat(makeBriefing({
      cognitionGaps: [{ assetKey: "US::SGOV", portfolioWeight: 0, daysSinceLastInvestigation: 25, uncertaintyReason: "需要复核", suggestedInvestigation: "" }],
    }));
    expect(text).toContain("今日无需操作");
    expect(text).toContain("投资判断复核 1 个");
    expect(text).not.toContain("<b>");
  });

  it("full 模式输出待办与板块，且无 HTML 标签", () => {
    const text = formatBriefingForChat(makeBriefing({
      surprises: [{ title: "黄金突破新高", description: "GLD大涨。", relatedThesisId: null, severityScore: 8, suggestedAction: "检查配置" }],
    }));
    expect(text).toContain("📌 今日待办:");
    expect(text).toContain("黄金突破新高");
    expect(text).not.toContain("<b>");
  });
});

// ── 截断 fallback ──

describe("formatBriefingTextExcerpt", () => {
  it("短文本原样返回", () => {
    expect(formatBriefingTextExcerpt("短句。", 100)).toBe("短句。");
  });

  it("长文本在句子边界收口并加省略号", () => {
    const text = "这是一段足够长的第一句话用来测试句子边界收口逻辑正常工作。第二句话会非常长并且超过限制所以应该在第一句之后被切断不留半句。";
    const out = formatBriefingTextExcerpt(text, 40);
    expect(out).toBe("这是一段足够长的第一句话用来测试句子边界收口逻辑正常工作。…");
  });
});
