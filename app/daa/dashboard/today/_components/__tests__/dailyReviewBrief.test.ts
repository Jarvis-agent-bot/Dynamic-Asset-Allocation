import { describe, expect, it } from "vitest";

import {
  buildDailyReviewBrief,
  buildDailyReviewBriefFromBriefing,
  type DailyReviewBriefInput,
} from "../dailyReviewBrief";

function baseInput(overrides: Partial<DailyReviewBriefInput> = {}): DailyReviewBriefInput {
  return {
    queue: {
      decisionCount: 0,
      confirmCount: 0,
      investigateCount: 0,
      monitorCount: 0,
      diagnosticsCount: 0,
    },
    backgroundCount: 0,
    strategyOverlay: null,
    ...overrides,
  };
}

describe("dailyReviewBrief", () => {
  it("只把目标权重变化算作需要人批准的动作", () => {
    const brief = buildDailyReviewBrief(baseInput({
      queue: {
        decisionCount: 2,
        confirmCount: 3,
        investigateCount: 1,
        monitorCount: 0,
        diagnosticsCount: 4,
      },
      strategyOverlay: {
        generatedAt: "2026-06-05T00:00:00.000Z",
        agentRunId: "run-1",
        regimeOverride: null,
        targetAllocationPlan: {
          reasoning: "降低单一科技股集中度。",
          intents: [
            {
              assetKey: "US::NVDA",
              symbol: "NVDA",
              proposedTargetWeightPct: 8,
              confidence: 86,
              reasoning: "仓位集中，先降到风险预算内。",
            },
          ],
        },
      },
    }));

    expect(brief.posture).toBe("approve_required");
    expect(brief.metrics.approvalCount).toBe(1);
    expect(brief.approvals).toHaveLength(1);
    expect(brief.approvals[0]?.title).toBe("NVDA 目标 8.00%");
  });

  it("没有目标权重变化时，普通确认项不会显示成授权", () => {
    const brief = buildDailyReviewBrief(baseInput({
      queue: {
        decisionCount: 0,
        confirmCount: 5,
        investigateCount: 2,
        monitorCount: 1,
        diagnosticsCount: 8,
      },
      backgroundCount: 16,
    }));

    expect(brief.posture).toBe("risk_watch");
    expect(brief.metrics.approvalCount).toBe(0);
    expect(brief.approvals).toEqual([]);
    expect(brief.title).toContain("不建议直接交易");
  });

  it("可以从后台 briefing 直接生成给接口使用的摘要", () => {
    const brief = buildDailyReviewBriefFromBriefing({
      surprises: [{ severityScore: 8 }],
      cognitionGaps: [{ portfolioWeight: 0.06 }],
      thesisFailureImpacts: [{ riskLevel: "medium" }],
      thesisConflicts: [{}],
      strategyOverlay: null,
    });

    expect(brief?.posture).toBe("risk_watch");
    expect(brief?.metrics.approvalCount).toBe(0);
    expect(brief?.metrics.backgroundCount).toBe(4);
    expect(brief?.metrics.investigationCount).toBe(1);
  });
});
