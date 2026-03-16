import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildStrategyLabSeedReadModel } from "@/src/daa/modules/read/strategyLabSeedReadService";

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminViewerAuth: vi.fn(async () => null),
}));

vi.mock("@/src/daa/modules/read/strategyLabSeedReadService", () => ({
  buildStrategyLabSeedReadModel: vi.fn(),
}));

import { GET } from "@/app/api/daa/read/strategy-lab-seed/route";

describe("strategy-lab-seed-read-route-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(buildStrategyLabSeedReadModel).mockResolvedValue({
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
        },
        overviewAlerts: [],
        latestCycle: null,
        marketContext: null,
        warnings: [],
      },
      baseCurrency: "USD",
      initialEquity: 100000,
      constraints: { maxPositionPct: 0.3, minNotional: 200, maxOrderPctOfNav: 0.1 },
      policy: { thresholdPct: 0.05, minTradeNotional: 200, cooldownSeconds: 72 * 3600 },
      execution: { feeRateBps: 5, slippageBps: 2, maxOrderPctOfNav: 0.1 },
      availableAssets: [],
      selectedAssetKeys: [],
      loadedAt: "2026-03-01T00:00:00.000Z",
    } as any);
  });

  it("返回 strategy lab seed read model", async () => {
    const response = await GET(new Request("http://localhost/api/daa/read/strategy-lab-seed"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.baseCurrency).toBe("USD");
    expect(json.data.execution.feeRateBps).toBe(5);
    expect(vi.mocked(buildStrategyLabSeedReadModel)).toHaveBeenCalledTimes(1);
  });
});
