import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildWorkbenchReadModel } from "@/src/daa/modules/read/workbenchReadService";

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminViewerAuth: vi.fn(async () => null),
}));

vi.mock("@/src/daa/modules/read/workbenchReadService", () => ({
  buildWorkbenchReadModel: vi.fn(),
}));

import { GET } from "@/app/api/daa/read/workbench/route";

describe("workbench-read-route-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(buildWorkbenchReadModel).mockResolvedValue({
      bootstrap: {
        baseCurrency: "USD",
        account: { cash: 1200, investableCash: 1000, frozenCash: 200, totalEquity: 5200 },
        assetUniverse: [],
        execution: { logs: [] },
        rebalance: { mode: "manual", autoAnalysisEnabled: false, analysisTimeUtc: "00:20", timezone: "Asia/Shanghai", analysisFocus: "mock" },
        rebalanceStrategy: {
          calendar: { enabled: false, frequency: "monthly", dayOfMonth: 1 },
          drift: { enabled: true, thresholdPct: 0.05, checkFrequency: "daily" },
          cooldownHours: 24,
          analysisTimeUtc: "00:20",
          timezone: "Asia/Shanghai",
          analysisFocus: "mock",
          autoGenerateEnabled: false,
        },
        latestCycle: null,
        marketContext: null,
        warnings: [],
      },
      cycles: [{ cycleId: "cycle-1", status: "generated", triggerSource: "manual", createdAt: "2026-03-01T00:00:00.000Z", updatedAt: "2026-03-01T00:00:00.000Z", proposals: [], executedOrders: [], riskCheck: null, notes: null, executionSummary: null, marketContext: null }],
      loadedAt: "2026-03-01T00:00:00.000Z",
    } as any);
  });

  it("返回统一 workbench read model", async () => {
    const response = await GET(new Request("http://localhost/api/daa/read/workbench"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.cycles[0].cycleId).toBe("cycle-1");
    expect(vi.mocked(buildWorkbenchReadModel)).toHaveBeenCalledTimes(1);
  });
});
