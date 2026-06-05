import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const getLatestRunMock = vi.fn();
const recordAgentDecisionAuditMock = vi.fn();

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminEditorAuth: authMock,
}));

vi.mock("@/src/daa/api/routeHelpers", async () => {
  const actual = await vi.importActual<typeof import("@/src/daa/api/routeHelpers")>("@/src/daa/api/routeHelpers");
  return actual;
});

vi.mock("@/src/daa/agent/store/agentRunStore", () => ({
  getLatestRun: getLatestRunMock,
}));

vi.mock("@/src/daa/agent/store/agentDecisionAuditStore", () => ({
  recordAgentDecisionAudit: recordAgentDecisionAuditMock,
}));

describe("daily decision action route", () => {
  beforeEach(() => {
    authMock.mockResolvedValue(null);
    recordAgentDecisionAuditMock.mockResolvedValue("audit-1");
    getLatestRunMock.mockResolvedValue({
      id: "run-1",
      briefing: {
        strategyOverlay: {
          generatedAt: "2026-06-05T00:00:00.000Z",
          agentRunId: "run-1",
          regimeOverride: null,
          targetAllocationPlan: {
            reasoning: "降低集中度。",
            intents: [
              {
                assetKey: "US::NVDA",
                symbol: "NVDA",
                proposedTargetWeightPct: 8,
                confidence: 86,
                reasoning: "仓位过高。",
              },
            ],
          },
        },
      },
    });
  });

  it("批准目标权重方案时写入明确的人类决策审计", async () => {
    const { POST } = await import("@/app/api/daa/agent/daily-decision/action/route");
    const response = await POST(new Request("http://localhost/api/daa/agent/daily-decision/action", {
      method: "POST",
      body: JSON.stringify({ action: "approve_plan" }),
      headers: { "content-type": "application/json" },
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(recordAgentDecisionAuditMock).toHaveBeenCalledWith(expect.objectContaining({
      agentRunId: "run-1",
      node: "human",
      decisionKind: "human_daily_decision",
      summary: "人类批准今日目标权重方案",
      decisionPayload: expect.objectContaining({
        action: "approve_plan",
        approvalCount: 1,
      }),
    }));
    expect(recordAgentDecisionAuditMock.mock.calls[0][0].decisionPayload.approvals[0]).toMatchObject({
      assetKey: "US::NVDA",
      proposedTargetWeightPct: 8,
    });
  });

  it("没有目标权重方案时也可以记录保持当前", async () => {
    getLatestRunMock.mockResolvedValue({
      id: "run-hold",
      briefing: {
        surprises: [],
        cognitionGaps: [],
        thesisFailureImpacts: [],
        thesisConflicts: [],
        strategyOverlay: null,
      },
    });

    const { POST } = await import("@/app/api/daa/agent/daily-decision/action/route");
    const response = await POST(new Request("http://localhost/api/daa/agent/daily-decision/action", {
      method: "POST",
      body: JSON.stringify({ action: "hold_current" }),
      headers: { "content-type": "application/json" },
    }));

    expect(response.status).toBe(200);
    expect(recordAgentDecisionAuditMock).toHaveBeenCalledWith(expect.objectContaining({
      agentRunId: "run-hold",
      decisionKind: "human_daily_decision",
      summary: "人类选择今日保持当前仓位",
      decisionPayload: expect.objectContaining({
        action: "hold_current",
        approvalCount: 0,
      }),
    }));
  });
});
