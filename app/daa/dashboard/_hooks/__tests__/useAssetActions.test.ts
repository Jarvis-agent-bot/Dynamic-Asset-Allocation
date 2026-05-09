// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { useAssetActions } from "../dashboard/useAssetActions";
import type {
  AssetUniverseView,
  WorkbenchBootstrap,
  WorkbenchSearchAssetResult,
} from "@/src/daa/modules/workbench/workbenchTypes";

vi.mock("@/src/daa/modules/workbench/workbenchApi", () => ({
  executeWorkbenchOrder: vi.fn(),
  getWorkbenchAssetInsights: vi.fn().mockResolvedValue({}),
  listWorkbenchFeaturedAssets: vi.fn().mockResolvedValue({ groups: [] }),
  patchWorkbenchAsset: vi.fn().mockResolvedValue(undefined),
  previewWorkbenchExecution: vi.fn().mockResolvedValue({}),
  searchWorkbenchAssets: vi.fn().mockResolvedValue([]),
  submitWorkbenchLlmFeedback: vi.fn().mockResolvedValue(undefined),
  upsertWorkbenchAsset: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

function makeBootstrap(): WorkbenchBootstrap {
  return {
    baseCurrency: "CNY",
    assetRows: [],
    policy: {},
    marketContext: null,
    positions: [],
    candidateAssets: [],
    fxRates: [],
    account: {},
    assetUniverse: [],
    execution: {},
    rebalance: {},
    latestCycle: null,
    riskConfig: {},
    notificationConfig: {},
  } as unknown as WorkbenchBootstrap;
}

function makeRow(overrides?: Partial<AssetUniverseView>): AssetUniverseView {
  return {
    assetKey: "SH::600519",
    symbol: "600519.SH",
    market: "SH",
    currency: "CNY",
    watchEnabled: true,
    holdingQty: 100,
    targetWeightHint: 0.05,
    lastPrice: 1800,
    holdingPrice: 1750,
    costBasis: 175000,
    ...overrides,
  } as AssetUniverseView;
}

function makeInput(overrides?: Record<string, unknown>) {
  return {
    bootstrap: makeBootstrap() as WorkbenchBootstrap | null,
    assetRows: [makeRow()] as AssetUniverseView[],
    loading: false,
    busy: false,
    setBusy: vi.fn(),
    loadBootstrap: vi.fn().mockResolvedValue(undefined),
    setActiveTab: vi.fn(),
    ...overrides,
  };
}

describe("useAssetActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handleSearchAssets calls API with correct params", async () => {
    const { searchWorkbenchAssets } = await import("@/src/daa/modules/workbench/workbenchApi");
    const mockResults: WorkbenchSearchAssetResult[] = [
      { symbol: "AAPL", market: "US", currency: "USD", assetClass: "stock", region: "us" } as never,
    ];
    (searchWorkbenchAssets as ReturnType<typeof vi.fn>).mockResolvedValue(mockResults);

    const { result } = renderHook(() => useAssetActions(makeInput()));

    let results: WorkbenchSearchAssetResult[] = [];
    await act(async () => {
      results = await result.current.watchlistBuilderProps.onSearch({
        q: "apple",
        market: "US",
        assetClass: "stock",
        region: "us",
      });
    });

    expect(searchWorkbenchAssets).toHaveBeenCalledWith({
      q: "apple",
      market: "US",
      assetClass: "stock",
      region: "us",
      limit: 15,
    });
    expect(results).toHaveLength(1);
  });

  it("handleAddWatchlistAsset upserts and reloads", async () => {
    const { upsertWorkbenchAsset } = await import("@/src/daa/modules/workbench/workbenchApi");
    const input = makeInput();
    const { result } = renderHook(() => useAssetActions(input));

    await act(async () => {
      await result.current.watchlistBuilderProps.onAddAsset({
        symbol: "AAPL",
        market: "US",
        currency: "USD",
        assetClass: "stock",
        region: "us",
        exchange: "NASDAQ",
        instrumentType: "equity",
        marketGroup: "us_stock",
        price: 180,
        name: "Apple Inc.",
      } as never);
    });

    expect(upsertWorkbenchAsset).toHaveBeenCalled();
    expect(input.loadBootstrap).toHaveBeenCalledWith(true);
  });

  it("handleAddManualOrder sets orderDraft", async () => {
    const { result } = renderHook(() => useAssetActions(makeInput()));

    expect(result.current.orderDraft).toBeNull();

    const row = makeRow();
    await act(async () => {
      await result.current.tableProps.onAddToExecution(row, "BUY");
    });

    expect(result.current.orderDraft).toEqual({ row, side: "BUY" });
  });

  it("handleAddManualOrder rejects SELL with no holdings", async () => {
    const { toast } = await import("sonner");
    const { result } = renderHook(() => useAssetActions(makeInput()));

    const row = makeRow({ holdingQty: 0 });
    await act(async () => {
      await result.current.tableProps.onAddToExecution(row, "SELL");
    });

    expect(result.current.orderDraft).toBeNull();
    expect(toast.error).toHaveBeenCalled();
  });

  it("tableProps.disabled reflects busy state", () => {
    const { result: r1 } = renderHook(() =>
      useAssetActions(makeInput({ busy: false, loading: false })),
    );
    expect(r1.current.tableProps.disabled).toBe(false);

    const { result: r2 } = renderHook(() =>
      useAssetActions(makeInput({ busy: true })),
    );
    expect(r2.current.tableProps.disabled).toBe(true);
  });
});
