import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildAssetUniverseView } from "@/src/daa/__tests__/testDataFactories";
import { normalizeSystemConfig } from "@/src/daa/config/systemConfig";
import { runAssistantBootstrap } from "@/src/daa/chat/assistantBrain";
import type { DaaAssistantRuntimeContext } from "@/src/daa/chat/agentContext";

vi.mock("@/src/daa/agent/bootstrap", () => ({
  bootstrapTheses: vi.fn(async () => ({ created: 1, errors: [] })),
  ensureAssetThesisCoverage: vi.fn(async () => ({ created: 0, errors: [] })),
}));

vi.mock("@/src/daa/agent/store/thesisStore", () => ({
  getActiveTheses: vi.fn(async () => []),
}));

vi.mock("@/src/daa/agent/store/agentRunStore", () => ({
  getLatestRun: vi.fn(async () => null),
}));

vi.mock("@/src/daa/agent/autopilotOrchestrator", () => ({
  runAutopilotLoop: vi.fn(),
}));

vi.mock("@/src/daa/agent/cognitiveGraph", () => ({
  runCognitiveAgentCycle: vi.fn(),
}));

vi.mock("@/src/daa/store/daaStorePg", () => ({
  getDaaSystemConfig: vi.fn(),
  patchDaaSystemConfig: vi.fn(),
}));

import { bootstrapTheses } from "@/src/daa/agent/bootstrap";

function makeRuntimeContext(assetUniverse: DaaAssistantRuntimeContext["readModel"]["bootstrap"]["assetUniverse"]): DaaAssistantRuntimeContext {
  return {
    systemConfig: normalizeSystemConfig({}),
    systemConfigVersion: 1,
    readModel: {
      bootstrap: {
        baseCurrency: "USD",
        assetUniverse,
      },
      allocationSummary: {
        holdingCount: 0,
        totalEquity: 0,
      },
    },
    recentMessages: [],
    sessionState: null,
    learningDigest: "",
    systemDigest: "",
    brainContextDigest: "",
    storedPendingAction: null,
  } as unknown as DaaAssistantRuntimeContext;
}

describe("assistantBrain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("手动建立投资判断时不把微小残留仓位当作持仓覆盖", async () => {
    await runAssistantBootstrap(makeRuntimeContext([
      buildAssetUniverseView({
        assetKey: "US::AAPL",
        symbol: "AAPL",
        holdingQty: 10,
        valuationBase: 1000,
        actualWeightPct: 10,
        watchEnabled: false,
      }),
      buildAssetUniverseView({
        assetKey: "HK::9988.HK",
        symbol: "9988.HK",
        holdingQty: 0.00000066,
        valuationBase: 0.00001,
        actualWeightPct: 0.0000001,
        watchEnabled: false,
      }),
    ]));

    expect(vi.mocked(bootstrapTheses).mock.calls[0]?.[0].map((asset) => asset.assetKey)).toEqual(["US::AAPL"]);
  });
});
