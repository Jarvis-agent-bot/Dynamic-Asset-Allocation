import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildAccountState, buildAssetUniverseRow, buildSystemConfigRow } from "@/src/daa/__tests__/testDataFactories";
import { observeNode } from "@/src/daa/agent/nodes/observeNode";
import type { CognitiveState, PortfolioSnapshot } from "@/src/daa/agent/cognitiveState";

vi.mock("@/src/daa/store/accountStore", () => ({
  getDaaAccountState: vi.fn(),
  getDaaSystemConfig: vi.fn(),
}));

vi.mock("@/src/daa/agent/store/memoryStore", () => ({
  applyMemoryDecay: vi.fn(async () => undefined),
}));

vi.mock("@/src/daa/agent/store/thesisStore", () => ({
  archiveStaleLowConvictionTheses: vi.fn(async () => []),
  archiveStaleUncertainTheses: vi.fn(async () => []),
  enforceActiveThesisCap: vi.fn(async () => []),
  getActiveTheses: vi.fn(async () => []),
}));

vi.mock("@/src/daa/store/assetUniverseStore", () => ({
  listDaaAssetUniverse: vi.fn(),
}));

vi.mock("@/src/daa/store/fxStore", () => ({
  listDaaFxRates: vi.fn(),
}));

vi.mock("@/src/daa/marketSession/marketSessionSnapshot", () => ({
  summarizeMarketSessionsForAssetKeys: vi.fn(() => []),
}));

vi.mock("@/src/daa/agent/bootstrap", () => ({
  ensureAssetThesisCoverage: vi.fn(async () => ({ created: 0, errors: [] })),
}));

vi.mock("@/src/daa/store/marketCacheStore", () => ({
  listDaaDiscoveryCandidates: vi.fn(async () => []),
  listDaaNewsEventsBySymbol: vi.fn(async () => []),
  listDaaNewsItemsBySymbol: vi.fn(async () => []),
  listLatestDaaMarketIndicatorSnapshots: vi.fn(async () => []),
  listLatestDaaNewsEventGraphs: vi.fn(async () => []),
  listLatestDaaNewsPortfolioImpacts: vi.fn(async () => []),
}));

import { getDaaAccountState, getDaaSystemConfig } from "@/src/daa/store/accountStore";
import { ensureAssetThesisCoverage } from "@/src/daa/agent/bootstrap";
import { listDaaAssetUniverse } from "@/src/daa/store/assetUniverseStore";
import { listDaaFxRates } from "@/src/daa/store/fxStore";

describe("observeNode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDaaSystemConfig).mockResolvedValue(buildSystemConfigRow());
    vi.mocked(getDaaAccountState).mockResolvedValue(buildAccountState({
      cash: 1000,
      totalEquity: 2000,
    }));
    vi.mocked(listDaaFxRates).mockResolvedValue([
      { id: "USD/HKD", baseCcy: "USD", quoteCcy: "HKD", rate: 7.8, source: "test", asOfTs: "2026-06-18T00:00:00.000Z", updatedAt: "2026-06-18T00:00:00.000Z" },
    ]);
  });

  it("不把低于最小市值的残留仓位纳入 agent 持仓上下文", async () => {
    vi.mocked(listDaaAssetUniverse).mockResolvedValue([
      buildAssetUniverseRow({
        assetKey: "HK::9988.HK",
        symbol: "9988.HK",
        market: "HK",
        currency: "HKD",
        holdingQty: 0.0000006619760029025201,
        holdingPrice: 127.6,
        lastPrice: 104.9,
        watchEnabled: false,
        targetWeightHint: 0,
      }),
      buildAssetUniverseRow({
        assetKey: "US::AAPL",
        symbol: "AAPL",
        market: "US",
        currency: "USD",
        holdingQty: 10,
        holdingPrice: 100,
        lastPrice: 100,
        watchEnabled: false,
        targetWeightHint: 0,
      }),
    ]);

    const result = await observeNode({ errors: [] } as unknown as CognitiveState);

    const portfolio = result.portfolio as PortfolioSnapshot | undefined;
    expect(portfolio?.holdings.map((row) => row.assetKey)).toEqual(["US::AAPL"]);
    expect(vi.mocked(ensureAssetThesisCoverage).mock.calls[0]?.[0].map((row) => row.assetKey)).toEqual(["US::AAPL"]);
  });
});
