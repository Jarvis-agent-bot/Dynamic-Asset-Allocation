// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { useWorkbenchReadModel, normalizePortfolioWorkbenchTab } from "../useWorkbenchReadModel";

vi.mock("@/src/daa/modules/read/readApi", () => ({
  getWorkbenchReadModel: vi.fn(),
}));

vi.mock("@/src/daa/api/client", () => ({
  ApiClientError: class ApiClientError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
  getApiErrorMessage: (err: unknown) => err instanceof Error ? err.message : "Unknown error",
}));

describe("normalizePortfolioWorkbenchTab", () => {
  it("returns valid tab names as-is", () => {
    expect(normalizePortfolioWorkbenchTab("positions")).toBe("positions");
    expect(normalizePortfolioWorkbenchTab("watchlist")).toBe("watchlist");
    expect(normalizePortfolioWorkbenchTab("analysis")).toBe("analysis");
  });

  it("defaults to positions for invalid input", () => {
    expect(normalizePortfolioWorkbenchTab("")).toBe("positions");
    expect(normalizePortfolioWorkbenchTab("invalid")).toBe("positions");
    expect(normalizePortfolioWorkbenchTab("discovery")).toBe("positions");
    expect(normalizePortfolioWorkbenchTab("rebalance")).toBe("positions");
    expect(normalizePortfolioWorkbenchTab("cash")).toBe("positions");
    expect(normalizePortfolioWorkbenchTab("settings")).toBe("positions");
  });
});

describe("useWorkbenchReadModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts in loading state and fetches bootstrap", async () => {
    const { getWorkbenchReadModel } = await import("@/src/daa/modules/read/readApi");
    (getWorkbenchReadModel as ReturnType<typeof vi.fn>).mockResolvedValue({
      bootstrap: {
        baseCurrency: "CNY",
        assetRows: [],
        latestCycle: null,
      },
      cycles: [],
    });

    const { result } = renderHook(() => useWorkbenchReadModel());

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.bootstrap).not.toBeNull();
    expect(result.current.bootstrap?.baseCurrency).toBe("CNY");
    expect(result.current.error).toBe("");
  });

  it("sets error on fetch failure", async () => {
    const { getWorkbenchReadModel } = await import("@/src/daa/modules/read/readApi");
    (getWorkbenchReadModel as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useWorkbenchReadModel());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Network error");
    expect(result.current.bootstrap).toBeNull();
  });

  it("sets authRequired on unauthorized error", async () => {
    const { getWorkbenchReadModel } = await import("@/src/daa/modules/read/readApi");
    (getWorkbenchReadModel as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Unauthorized"));

    const { result } = renderHook(() => useWorkbenchReadModel());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.authRequired).toBe(true);
  });

  it("respects a valid initialTab", async () => {
    const { getWorkbenchReadModel } = await import("@/src/daa/modules/read/readApi");
    (getWorkbenchReadModel as ReturnType<typeof vi.fn>).mockResolvedValue({
      bootstrap: { baseCurrency: "CNY", assetRows: [], latestCycle: null },
      cycles: [],
    });

    const { result } = renderHook(() => useWorkbenchReadModel({ initialTab: "watchlist" }));
    expect(result.current.activeTab).toBe("watchlist");

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it("在无持仓但有观察标的时默认切到 watchlist", async () => {
    const { getWorkbenchReadModel } = await import("@/src/daa/modules/read/readApi");
    (getWorkbenchReadModel as ReturnType<typeof vi.fn>).mockResolvedValue({
      bootstrap: { baseCurrency: "USD", assetRows: [], latestCycle: null },
      cycles: [],
      allocationSummary: {
        holdingCount: 0,
        watchlistCount: 3,
        holdingValue: 0,
        cashValue: 1000,
        investableCash: 1000,
        frozenCash: 0,
        totalEquity: 1000,
        equitySource: "derived_mark_to_market",
        derivedTotalEquity: 1000,
        fxMissingAssetKeys: [],
        topHoldings: [],
      },
    });

    const { result } = renderHook(() => useWorkbenchReadModel());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.activeTab).toBe("watchlist");
  });

  it("picks latestCycle as currentCycle", async () => {
    const { getWorkbenchReadModel } = await import("@/src/daa/modules/read/readApi");
    const cycle = {
      cycleId: "cycle-latest",
      status: "generated",
      triggerSource: "manual",
      createdAt: new Date().toISOString(),
      proposals: [],
      riskCheck: { overallStatus: "pass", items: [] },
    };
    (getWorkbenchReadModel as ReturnType<typeof vi.fn>).mockResolvedValue({
      bootstrap: { baseCurrency: "CNY", assetRows: [], latestCycle: cycle },
      cycles: [cycle],
    });

    const { result } = renderHook(() => useWorkbenchReadModel());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.currentCycle?.cycleId).toBe("cycle-latest");
    expect(result.current.riskCheck?.overallStatus).toBe("pass");
  });
});
