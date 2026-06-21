import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildAssetUniverseView, buildWorkbenchBootstrap } from "@/src/daa/__tests__/testDataFactories";
import type { DaaStoreFundamentalSnapshot } from "@/src/daa/store/daaStorePg";

vi.mock("@/src/daa/adminAuth", () => ({
  requireDaaAdminViewerAuth: vi.fn(async () => null),
}));

vi.mock("@/src/daa/modules/workbench/workbenchReadService", () => ({
  buildWorkbenchBootstrap: vi.fn(),
}));

vi.mock("@/src/daa/pg/daaPg", () => ({
  withDaaPgClient: vi.fn(async () => {
    throw new Error("portfolio fundamentals route should not read raw payload table");
  }),
}));

vi.mock("@/src/daa/store/daaStorePg", () => ({
  listDaaFundamentalSnapshots: vi.fn(async () => []),
}));

import { GET as portfolioFundamentalsGet } from "@/app/api/daa/portfolio/fundamentals/route";
import { buildWorkbenchBootstrap as loadWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";
import { withDaaPgClient } from "@/src/daa/pg/daaPg";
import { listDaaFundamentalSnapshots } from "@/src/daa/store/daaStorePg";

describe("portfolio-fundamentals-route-v1", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadWorkbenchBootstrap).mockResolvedValue(buildWorkbenchBootstrap({
      assetUniverse: [
        buildAssetUniverseView({
          assetKey: "US::AAPL",
          market: "US",
          symbol: "AAPL",
          name: "Apple",
          currency: "USD",
          holdingQty: 10,
          valuationBase: 2_100,
        }),
      ],
    }));
    const snapshot: DaaStoreFundamentalSnapshot = {
      provider: "yfinance",
      normalizedSymbol: "AAPL",
      symbol: "AAPL",
      market: "US",
      currency: "USD",
      marketCap: 3_000_000_000_000,
      trailingPE: 28.5,
      pbRatio: 42.1,
      debtToEquity: 167.3,
      freeCashflow: 95_000_000_000,
      totalRevenue: 390_000_000_000,
      netIncome: 94_000_000_000,
      trailingEps: 6.42,
      snapshotJson: {},
      fetchedAt: "2026-06-21T00:00:00.000Z",
      expireAt: "2026-06-22T00:00:00.000Z",
      rawRefId: "raw_fundamentals_1",
      updatedAt: "2026-06-21T00:00:00.000Z",
    };
    vi.mocked(listDaaFundamentalSnapshots).mockResolvedValue([snapshot]);
  });

  it("从结构化 fundamentals 快照读取持仓基本面，不直接查询 raw payload", async () => {
    const response = await portfolioFundamentalsGet(new Request("http://localhost/api/daa/portfolio/fundamentals"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.items).toHaveLength(1);
    expect(json.data.items[0]).toMatchObject({
      assetKey: "US::AAPL",
      symbol: "AAPL",
      market: "US",
      displayName: "Apple",
      pe: 28.5,
      pb: 42.1,
      debtToEquityPct: 167.3,
      freeCashflow: 95_000_000_000,
      totalRevenue: 390_000_000_000,
      netIncome: 94_000_000_000,
      trailingEps: 6.42,
      marketCap: 3_000_000_000_000,
      asOf: "2026-06-21T00:00:00.000Z",
      hasData: true,
    });
    expect(vi.mocked(listDaaFundamentalSnapshots)).toHaveBeenCalledWith({
      provider: "yfinance",
      normalizedSymbols: ["AAPL"],
      limit: 1,
    });
    expect(vi.mocked(withDaaPgClient)).not.toHaveBeenCalled();
  });
});
