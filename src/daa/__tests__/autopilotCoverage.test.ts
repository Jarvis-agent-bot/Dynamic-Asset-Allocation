import { describe, expect, it } from "vitest";

import { buildAutopilotCoverageSummary } from "@/src/daa/agent/autopilotCoverage";

describe("buildAutopilotCoverageSummary", () => {
  it("汇总持仓、观察候选和大脑目标计划采纳数", () => {
    const summary = buildAutopilotCoverageSummary({
      portfolio: {
        holdings: [
          { assetKey: "US::NVDA", symbol: "NVDA", holdingQty: 1, lastPrice: 200, weightPct: 0.1, unrealizedPnlPct: null },
        ],
        totalEquity: 10000,
        cashPct: 0.8,
      },
      watchlist: {
        candidates: [
          {
            assetKey: "US::QQQ",
            symbol: "QQQ",
            lastPrice: 600,
            targetWeightPct: 0,
            autoEntryEnabled: false,
            entryTargetWeightPct: null,
            entryCooldownDays: 14,
            lastEntryTriggeredAt: null,
            fxMissing: false,
            notes: null,
            tags: [],
          },
          {
            assetKey: "US::SPY",
            symbol: "SPY",
            lastPrice: 700,
            targetWeightPct: 3,
            autoEntryEnabled: true,
            entryTargetWeightPct: null,
            entryCooldownDays: 14,
            lastEntryTriggeredAt: null,
            fxMissing: false,
            notes: null,
            tags: [],
          },
        ],
      },
      overlay: {
        generatedAt: "2026-04-27T00:00:00.000Z",
        agentRunId: "run-1",
        regimeOverride: null,
        targetAllocationPlan: {
          reasoning: "建仓 QQQ",
          intents: [
            { assetKey: "US::QQQ", symbol: "QQQ", proposedTargetWeightPct: 5, confidence: 82, reasoning: "高置信度" },
            { assetKey: "US::TSLA", symbol: "TSLA", proposedTargetWeightPct: 3, confidence: 55, reasoning: "低置信度" },
          ],
        },
      },
    });

    expect(summary.holdingAssets).toBe(1);
    expect(summary.watchlistCandidates).toBe(2);
    expect(summary.brainPlanIntents).toBe(2);
    expect(summary.acceptedBrainPlanIntents).toBe(1);
  });
});
