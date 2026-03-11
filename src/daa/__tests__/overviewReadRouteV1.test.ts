import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildOverviewReadModelV1 } from "@/src/daa/modules/read/overviewReadServiceV1";

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminViewerAuth: vi.fn(async () => null),
}));

vi.mock("@/src/daa/modules/read/overviewReadServiceV1", () => ({
  buildOverviewReadModelV1: vi.fn(),
}));

import { GET } from "@/app/api/daa/read/overview/route";

describe("overview-read-route-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(buildOverviewReadModelV1).mockResolvedValue({
      bootstrap: {
        baseCurrency: "USD",
        account: { cash: 1200, investableCash: 1000, frozenCash: 200, totalEquity: 5200 },
        assetUniverse: [],
        execution: { logs: [] },
        rebalance: {
          mode: "manual",
          autoAnalysisEnabled: false,
          analysisTimeUtc: "00:20",
          timezone: "Asia/Shanghai",
          emailTo: "",
          analysisFocus: "mock",
        },
        rebalanceStrategy: {
          calendar: { enabled: false, frequency: "monthly", dayOfMonth: 1 },
          drift: { enabled: true, thresholdPct: 0.05, checkFrequency: "daily" },
          cooldownHours: 24,
          analysisTimeUtc: "00:20",
          timezone: "Asia/Shanghai",
          analysisFocus: "mock",
          autoGenerateEnabled: false,
          notifyEmailTo: "",
        },
        overviewAlerts: [],
        latestCycle: null,
        marketContext: null,
        warnings: [],
      },
      snapshots: [{ ts: "2026-03-01T00:00:00.000Z", totalEquity: 5200, holdingsValue: 4000, cash: 1200, source: "test" }],
      cashLedger: [{ id: "cash-1", ts: "2026-03-01T00:00:00.000Z", side: "deposit", amount: 1000, baseCurrency: "USD" }],
      loadedAt: "2026-03-01T00:00:00.000Z",
    } as any);
  });

  it("返回统一 overview read model", async () => {
    const response = await GET(new Request("http://localhost/api/daa/read/overview"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.loadedAt).toBe("2026-03-01T00:00:00.000Z");
    expect(json.data.cashLedger[0].side).toBe("deposit");
    expect(vi.mocked(buildOverviewReadModelV1)).toHaveBeenCalledTimes(1);
  });
});
