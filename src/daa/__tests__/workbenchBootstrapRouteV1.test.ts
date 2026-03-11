import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildWorkbenchBootstrapV1 } from "@/src/daa/modules/workbench/workbenchReadServiceV1";

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminViewerAuth: vi.fn(async () => null),
}));

vi.mock("@/src/daa/modules/workbench/workbenchReadServiceV1", () => ({
  buildWorkbenchBootstrapV1: vi.fn(),
}));

import { GET } from "@/app/api/daa/workbench/bootstrap/route";

describe("workbench-bootstrap-route-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(buildWorkbenchBootstrapV1).mockResolvedValue({
      baseCurrency: "USD",
      account: { cash: 1000, investableCash: 1000, frozenCash: 0, totalEquity: 1000 },
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
        drift: { enabled: true, thresholdPct: 0.05 },
        cooldownHours: 24,
        analysisTimeUtc: "00:20",
        timezone: "Asia/Shanghai",
        analysisFocus: "mock",
        autoGenerateEnabled: false,
        notifyEmailTo: "",
      },
      overviewAlerts: [],
      latestCycle: null,
      marketContext: {
        generatedAt: "2026-03-01T00:00:00.000Z",
        regime: "transitional",
        riskOffScorePct: 51,
        confidencePct: 80,
        buyScale: 0.85,
        highRiskBuyScale: 0.75,
        reasons: ["美股：VIX 中性"],
        indicators: [],
        scopes: [{
          scope: "us_equity",
          label: "美股",
          generatedAt: "2026-03-01T00:00:00.000Z",
          regime: "transitional",
          riskOffScorePct: 51,
          confidencePct: 80,
          buyScale: 0.85,
          highRiskBuyScale: 0.75,
          reasons: ["VIX 中性"],
          indicators: [],
        }],
      },
      warnings: [],
    } as any);
  });

  it("工作台总览读取 bootstrap 时保持只读", async () => {
    const response = await GET(new Request("http://localhost/api/daa/workbench/bootstrap"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.marketContext.regime).toBe("transitional");
    expect(vi.mocked(buildWorkbenchBootstrapV1)).toHaveBeenCalledWith({
      syncPrices: false,
      autoRiskCycle: false,
    });
  });
});
