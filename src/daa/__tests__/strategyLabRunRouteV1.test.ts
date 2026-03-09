import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminViewerAuth: vi.fn(async () => null),
}));

vi.mock("@/src/daa/modules/strategyLab/strategyLabServiceV1", async () => {
  const actual = await vi.importActual<typeof import("@/src/daa/modules/strategyLab/strategyLabServiceV1")>("@/src/daa/modules/strategyLab/strategyLabServiceV1");
  return {
    ...actual,
    runStrategyLabV1: vi.fn(),
  };
});

import { POST } from "@/app/api/daa/strategy-lab/run/route";
import { StrategyLabValidationErrorV1, runStrategyLabV1 } from "@/src/daa/modules/strategyLab/strategyLabServiceV1";

describe("strategy-lab-run-route-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runStrategyLabV1).mockResolvedValue({
      generatedAt: "2026-01-01T00:00:00.000Z",
      benchmark: { symbol: "SPY", dates: [], equity: [], totalReturn: 0 },
      baseCurrency: "USD",
      lookbackBars: 252,
      assetsUsed: [],
      diagnostics: {
        mode: "intersection",
        minBars: 80,
        inputSymbolCount: 0,
        outputSymbolCount: 0,
        unionDateCount: 0,
        commonDateCount: 0,
        startDate: "2025-01-01",
        endDate: "2025-12-31",
        droppedSymbols: [],
        barsBySymbol: {},
      },
      currentTargetWeights: {},
      currentActualWeights: {},
      scenarios: [],
      candidateComparisons: [],
      defaultScenarioId: "executable",
      candidates: [],
      bestCandidateId: null,
      warnings: [],
    } as any);
  });

  it("会把空资产输入映射成产品化的 VALIDATION_FAILED", async () => {
    const response = await POST(new Request("http://localhost/api/daa/strategy-lab/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ assets: [] }),
    }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("VALIDATION_FAILED");
    expect(json.error.message).toBe("请至少选择 1 个研究资产后再运行策略实验室。");
    expect(json.error.details.code).toBe("EMPTY_ASSETS");
  });

  it("会把缺 FX / 缺字段类错误映射成 VALIDATION_FAILED 并保留细节", async () => {
    vi.mocked(runStrategyLabV1).mockRejectedValue(
      new StrategyLabValidationErrorV1(
        "MISSING_FX_SERIES",
        "本轮回测需要把 HKD、CNY 统一换算成 USD，但历史 FX 日线缺失，暂时无法继续。",
        {
          details: {
            baseCurrency: "USD",
            currencies: ["HKD", "CNY"],
          },
        },
      ),
    );

    const response = await POST(new Request("http://localhost/api/daa/strategy-lab/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        assets: [{ assetKey: "HK::0700.HK", symbol: "0700.HK", market: "HK", currency: "HKD" }],
        startDate: "2025-01-01",
        endDate: "2025-01-06",
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("VALIDATION_FAILED");
    expect(json.error.message).toContain("历史 FX 日线缺失");
    expect(json.error.details).toMatchObject({
      code: "MISSING_FX_SERIES",
      baseCurrency: "USD",
      currencies: ["HKD", "CNY"],
    });
  });

  it("未知异常仍然保持 INTERNAL_ERROR", async () => {
    vi.mocked(runStrategyLabV1).mockRejectedValue(new Error("unexpected crash"));

    const response = await POST(new Request("http://localhost/api/daa/strategy-lab/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        assets: [{ assetKey: "US::AAPL", symbol: "AAPL", market: "US", currency: "USD" }],
        startDate: "2025-01-01",
        endDate: "2025-01-06",
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("INTERNAL_ERROR");
    expect(json.error.message).toBe("unexpected crash");
  });
});
