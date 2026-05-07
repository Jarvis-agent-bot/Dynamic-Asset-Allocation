// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { useRebalanceFlow } from "../dashboard/useRebalanceFlow";
import type {
  AssetUniverseView,
  PreTradeRiskCheck,
  RebalanceCycle,
  WorkbenchBootstrap,
} from "@/src/daa/modules/workbench/workbenchTypes";

vi.mock("@/src/daa/modules/workbench/workbenchApi", () => ({
  generateWorkbenchRebalanceCycle: vi.fn(),
  patchWorkbenchRebalanceCycle: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

function makeBootstrap(overrides?: Partial<WorkbenchBootstrap>): WorkbenchBootstrap {
  return {
    baseCurrency: "CNY",
    assetRows: [],
    rebalanceStrategy: {},
    marketContext: null,
    positions: [],
    candidateAssets: [],
    fxRates: [],
    ...overrides,
  } as WorkbenchBootstrap;
}

function makeAssetRow(overrides?: Partial<AssetUniverseView>): AssetUniverseView {
  return {
    assetKey: "SH:600519",
    symbol: "600519.SH",
    market: "SH",
    currency: "CNY",
    watchEnabled: true,
    holdingQty: 100,
    targetWeightHint: 0.05,
    ...overrides,
  } as AssetUniverseView;
}

function makeCycle(overrides?: Partial<RebalanceCycle>): RebalanceCycle {
  return {
    cycleId: "cycle-001",
    status: "generated",
    triggerSource: "manual",
    createdAt: new Date().toISOString(),
    proposals: [],
    ...overrides,
  } as RebalanceCycle;
}

function makeRiskCheck(overrides?: Partial<PreTradeRiskCheck>): PreTradeRiskCheck {
  return {
    overallStatus: "pass",
    items: [],
    ...overrides,
  } as PreTradeRiskCheck;
}

function makeInput(overrides?: Record<string, unknown>) {
  return {
    bootstrap: makeBootstrap(),
    assetRows: [makeAssetRow()],
    cycles: [] as RebalanceCycle[],
    currentCycle: null as RebalanceCycle | null,
    riskCheck: null as PreTradeRiskCheck | null,
    busy: false,
    setBusy: vi.fn(),
    loadBootstrap: vi.fn().mockResolvedValue(undefined),
    syncCycleState: vi.fn(),
    ...overrides,
  };
}

describe("useRebalanceFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("computes summary from asset rows", () => {
    const { result } = renderHook(() =>
      useRebalanceFlow(makeInput({
        assetRows: [
          makeAssetRow({ holdingQty: 100, watchEnabled: true }),
          makeAssetRow({ assetKey: "SH:000001", holdingQty: 0, watchEnabled: true }),
          makeAssetRow({ assetKey: "US:AAPL", holdingQty: 50, watchEnabled: false }),
        ],
      })),
    );
    expect(result.current.summary.holdingAssets).toBe(2);
    expect(result.current.summary.watchlistAssets).toBe(2);
  });

  it("canExecuteSelected is false when no cycle", () => {
    const { result } = renderHook(() =>
      useRebalanceFlow(makeInput({ currentCycle: null })),
    );
    expect(result.current.canExecuteAll).toBe(false);
    expect(result.current.canExecuteSelected).toBe(false);
  });

  it("canExecuteSelected is false when risk check blocks", () => {
    const cycle = makeCycle({
      proposals: [{ assetKey: "SH:600519", side: "BUY", selected: true, suggestedQty: 10, suggestedNotional: 1000, price: 100, symbol: "600519.SH", currency: "CNY", reason: "test" } as never],
    });
    const { result } = renderHook(() =>
      useRebalanceFlow(makeInput({
        currentCycle: cycle,
        riskCheck: makeRiskCheck({ overallStatus: "block" }),
      })),
    );
    expect(result.current.canExecuteAll).toBe(false);
    expect(result.current.canExecuteSelected).toBe(false);
  });

  it("canExecuteSelected is true when risk passes and proposals selected", () => {
    const cycle = makeCycle({
      proposals: [{ assetKey: "SH:600519", side: "BUY", selected: true, suggestedQty: 10, suggestedNotional: 1000, price: 100, symbol: "600519.SH", currency: "CNY", reason: "test" } as never],
    });
    const { result } = renderHook(() =>
      useRebalanceFlow(makeInput({
        currentCycle: cycle,
        riskCheck: makeRiskCheck({ overallStatus: "pass" }),
      })),
    );
    expect(result.current.canExecuteAll).toBe(true);
    expect(result.current.canExecuteSelected).toBe(true);
    expect(result.current.selectedProposalCount).toBe(1);
  });

  it("riskReadyForExecution requires risk check to exist", () => {
    const cycle = makeCycle({
      proposals: [{ assetKey: "SH:600519", side: "BUY", selected: true, suggestedQty: 10, suggestedNotional: 1000, price: 100, symbol: "600519.SH", currency: "CNY", reason: "test" } as never],
    });
    const { result } = renderHook(() =>
      useRebalanceFlow(makeInput({
        currentCycle: cycle,
        riskCheck: null,
      })),
    );
    // null riskCheck means risk not ready (Bug 1 fix verification)
    expect(result.current.canExecuteAll).toBe(false);
  });

  it("isCurrentCycleTerminal for completed/cancelled", () => {
    const completedCycle = makeCycle({ status: "completed" });
    const { result: r1 } = renderHook(() =>
      useRebalanceFlow(makeInput({ currentCycle: completedCycle })),
    );
    expect(r1.current.isCurrentCycleTerminal).toBe(true);
    expect(r1.current.canEditCurrentCycle).toBe(false);

    const cancelledCycle = makeCycle({ status: "cancelled" });
    const { result: r2 } = renderHook(() =>
      useRebalanceFlow(makeInput({ currentCycle: cancelledCycle })),
    );
    expect(r2.current.isCurrentCycleTerminal).toBe(true);
  });

  it("rebalanceChecklist reports unmet conditions", () => {
    const { result } = renderHook(() =>
      useRebalanceFlow(makeInput({
        assetRows: [makeAssetRow({ watchEnabled: false, holdingQty: 0, targetWeightHint: 0 })],
        currentCycle: null,
        riskCheck: null,
      })),
    );
    expect(result.current.rebalanceChecklistAllPassed).toBe(false);
    const watchlistItem = result.current.rebalanceChecklist.find((item) => item.id === "watchlist");
    expect(watchlistItem?.ok).toBe(false);
  });

  it("rebalanceChecklist passes when all conditions met", () => {
    const cycle = makeCycle({
      proposals: [{ assetKey: "SH:600519", side: "BUY", selected: true, suggestedQty: 10, suggestedNotional: 1000, price: 100, symbol: "600519.SH", currency: "CNY", reason: "test" } as never],
    });
    const { result } = renderHook(() =>
      useRebalanceFlow(makeInput({
        assetRows: [makeAssetRow({ watchEnabled: true, holdingQty: 100, targetWeightHint: 0.1 })],
        currentCycle: cycle,
        riskCheck: makeRiskCheck({ overallStatus: "pass" }),
      })),
    );
    expect(result.current.rebalanceChecklistAllPassed).toBe(true);
  });

  it("cycleProgressText reflects status correctly", () => {
    const { result: r1 } = renderHook(() =>
      useRebalanceFlow(makeInput({ currentCycle: null })),
    );
    expect(r1.current.cycleProgressText).toBe("尚未生成建议");

    const { result: r2 } = renderHook(() =>
      useRebalanceFlow(makeInput({ currentCycle: makeCycle({ status: "completed" }) })),
    );
    expect(r2.current.cycleProgressText).toBe("已执行完成");

    const { result: r3 } = renderHook(() =>
      useRebalanceFlow(makeInput({ currentCycle: makeCycle({ status: "cancelled" }) })),
    );
    expect(r3.current.cycleProgressText).toBe("周期已取消（只读）");
  });

  it("selectedProposalNotional sums selected proposals", () => {
    const cycle = makeCycle({
      proposals: [
        { assetKey: "SH:600519", side: "BUY", selected: true, suggestedQty: 10, suggestedNotional: 1000, price: 100, symbol: "600519.SH", currency: "CNY", reason: "test" } as never,
        { assetKey: "SH:000001", side: "BUY", selected: true, suggestedQty: 5, suggestedNotional: 500, price: 100, symbol: "000001.SH", currency: "CNY", reason: "test" } as never,
        { assetKey: "US:AAPL", side: "SELL", selected: false, suggestedQty: 3, suggestedNotional: 300, price: 100, symbol: "AAPL", currency: "USD", reason: "test" } as never,
      ],
    });
    const { result } = renderHook(() =>
      useRebalanceFlow(makeInput({ currentCycle: cycle })),
    );
    expect(result.current.selectedProposalNotional).toBe(1500);
    expect(result.current.selectedProposalCount).toBe(2);
    expect(result.current.buyProposalCount).toBe(2);
    expect(result.current.sellProposalCount).toBe(1);
  });

  it("handleGenerateCycle calls API and syncs state", async () => {
    const { generateWorkbenchRebalanceCycle } = await import("@/src/daa/modules/workbench/workbenchApi");
    const newCycle = makeCycle({ cycleId: "cycle-new" });
    (generateWorkbenchRebalanceCycle as ReturnType<typeof vi.fn>).mockResolvedValue({
      created: true,
      message: "ok",
      cycle: newCycle,
    });

    const input = makeInput();
    const { result } = renderHook(() => useRebalanceFlow(input));

    await act(async () => {
      await result.current.handleGenerateCycle();
    });

    expect(generateWorkbenchRebalanceCycle).toHaveBeenCalledWith({
      triggerSource: "manual",
      manual: true,
    });
    expect(input.syncCycleState).toHaveBeenCalledWith(newCycle);
    expect(input.loadBootstrap).toHaveBeenCalledWith(true, "cycle-new");
  });
});
