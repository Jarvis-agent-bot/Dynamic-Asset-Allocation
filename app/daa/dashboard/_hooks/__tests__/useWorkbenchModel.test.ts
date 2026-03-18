// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { useWorkbenchModel, normalizeWorkbenchTab } from "../useWorkbenchModel";

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

describe("normalizeWorkbenchTab", () => {
  it("returns valid tab names as-is", () => {
    expect(normalizeWorkbenchTab("positions")).toBe("positions");
    expect(normalizeWorkbenchTab("watchlist")).toBe("watchlist");
    expect(normalizeWorkbenchTab("rebalance")).toBe("rebalance");
    expect(normalizeWorkbenchTab("cash")).toBe("cash");
  });

  it("defaults to positions for invalid input", () => {
    expect(normalizeWorkbenchTab("")).toBe("positions");
    expect(normalizeWorkbenchTab("invalid")).toBe("positions");
    expect(normalizeWorkbenchTab("discovery")).toBe("positions");
    expect(normalizeWorkbenchTab("settings")).toBe("positions");
  });
});

describe("useWorkbenchModel", () => {
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

    const { result } = renderHook(() => useWorkbenchModel());

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

    const { result } = renderHook(() => useWorkbenchModel());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Network error");
    expect(result.current.bootstrap).toBeNull();
  });

  it("sets authRequired on unauthorized error", async () => {
    const { getWorkbenchReadModel } = await import("@/src/daa/modules/read/readApi");
    (getWorkbenchReadModel as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Unauthorized"));

    const { result } = renderHook(() => useWorkbenchModel());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.authRequired).toBe(true);
  });

  it("respects initialTab", async () => {
    const { getWorkbenchReadModel } = await import("@/src/daa/modules/read/readApi");
    (getWorkbenchReadModel as ReturnType<typeof vi.fn>).mockResolvedValue({
      bootstrap: { baseCurrency: "CNY", assetRows: [], latestCycle: null },
      cycles: [],
    });

    const { result } = renderHook(() => useWorkbenchModel({ initialTab: "rebalance" }));
    expect(result.current.activeTab).toBe("rebalance");

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
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

    const { result } = renderHook(() => useWorkbenchModel());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.currentCycle?.cycleId).toBe("cycle-latest");
    expect(result.current.riskCheck?.overallStatus).toBe("pass");
  });
});
