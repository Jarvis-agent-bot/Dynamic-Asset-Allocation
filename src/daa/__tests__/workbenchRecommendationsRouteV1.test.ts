import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminEditorAuth: vi.fn(async () => null),
}));

vi.mock("@/src/daa/modules/workbench/workbenchServiceV1", () => ({
  runWorkbenchRecommendationsV1: vi.fn(),
}));

import { POST } from "@/app/api/daa/workbench/recommendations/route";
import { runWorkbenchRecommendationsV1 } from "@/src/daa/modules/workbench/workbenchServiceV1";

describe("workbench-recommendations-route-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runWorkbenchRecommendationsV1).mockResolvedValue({
      decisionId: "decision_1",
      decisionStatus: "pending",
      summary: {
        shouldRebalance: true,
        executableOrderCount: 2,
        blockedOrderCount: 0,
        totalEquity: 10000,
        baseCurrency: "USD",
      },
      recommendations: [],
      blockedReasons: [],
      warnings: [],
      insightDigest: { topOpportunities: [] },
      riskDigest: { warnings: [], blockedReasons: [] },
    } as any);
  });

  it("返回中文化建议结果", async () => {
    const response = await POST(new Request("http://localhost/api/daa/workbench/recommendations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ analysisFocus: "控制回撤并提升胜率" }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.summary.executableOrderCount).toBe(2);
    expect(vi.mocked(runWorkbenchRecommendationsV1)).toHaveBeenCalledWith({ analysisFocus: "控制回撤并提升胜率" });
  });
});
