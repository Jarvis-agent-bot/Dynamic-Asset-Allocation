import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildSystemConfigRow } from "@/src/daa/__tests__/testDataFactories";
import { surfaceNode } from "@/src/daa/agent/nodes/surfaceNode";
import type { CognitiveState } from "@/src/daa/agent/cognitiveState";
import type { DailyBriefing, ResearchThread } from "@/src/daa/agent/cognitiveTypes";

vi.mock("@/src/daa/agent/store/thesisStore", () => ({
  getActiveTheses: vi.fn(),
}));

vi.mock("@/src/daa/agent/store/agentRunStore", () => ({
  getLatestRun: vi.fn(async () => null),
}));

vi.mock("@/src/daa/agent/helpers/llm", () => ({
  callDeepSeekJson: vi.fn(async () => ({
    data: { surprises: [], mindChangeConditions: [] },
    tokensUsed: 0,
  })),
}));

vi.mock("@/src/daa/store/daaStorePg", () => ({
  getDaaSystemConfig: vi.fn(async () => buildSystemConfigRow()),
}));

vi.mock("@/src/daa/automation/automationGuards", () => ({
  shouldSendReviewBriefingTelegram: vi.fn(() => false),
}));

vi.mock("@/src/daa/store/notificationDeliveryLogRepo", () => ({
  hasTodayNotification: vi.fn(async () => true),
}));

vi.mock("@/src/daa/agent/store/agentDecisionAuditStore", () => ({
  recordAgentDecisionAudits: vi.fn(async () => []),
}));

import * as thesisStore from "@/src/daa/agent/store/thesisStore";

function buildThread(overrides?: Partial<ResearchThread>): ResearchThread {
  return {
    id: "thread-1",
    title: "腾讯高权重判断",
    status: "active",
    thesisText: "腾讯基本面需要持续跟踪。",
    conviction: "medium",
    invalidationConditions: "若广告增速持续放缓",
    reviewAt: null,
    assetKeys: ["HK::0700.HK"],
    tags: [],
    priorityScore: 0,
    lastInvestigatedAt: "2026-05-30T11:25:43.000Z",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-30T11:25:43.000Z",
    ...overrides,
  };
}

describe("surfaceNode", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-18T13:00:00.000Z"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("复核队列文案说明是相关判断的上次复核时间", async () => {
    vi.mocked(thesisStore.getActiveTheses).mockResolvedValue([buildThread()]);

    const result = await surfaceNode({
      errors: [],
      agentConfig: { enabled: false, maxInvestigationTargets: 5, reviewIntervalDays: 14, memoryRecallLimit: 5, circuitBreakerThreshold: 3 },
      portfolio: {
        totalEquity: 100_000,
        cashPct: 0.5,
        holdings: [{
          assetKey: "HK::0700.HK",
          symbol: "0700.HK",
          holdingQty: 100,
          lastPrice: 450,
          valuationBase: 7100,
          weightPct: 0.071,
          unrealizedPnlPct: null,
        }],
      },
      watchlist: { candidates: [] },
      market: { regime: "transitional", vix: null, indicators: {} },
    } as unknown as CognitiveState);

    const briefing = result.briefing as DailyBriefing | undefined;
    const reason = briefing?.cognitionGaps[0]?.uncertaintyReason ?? "";
    expect(reason).toContain("高权重持仓需要复核：权重 7.1%，相关判断上次复核 19 天前");
    expect(reason).not.toContain("上次有效复核");
  });
});
