// @vitest-environment jsdom
import { renderHook, act, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";

import { useExecutionFlow } from "../dashboard/useExecutionFlow";
import type { RebalanceCycle } from "@/src/daa/modules/workbench/workbenchTypes";
import type { PreTradeRiskCheck } from "@/src/daa/modules/rebalance/rebalanceTypes";

vi.mock("@/src/daa/modules/workbench/workbenchApi", () => ({
  executeWorkbenchRebalanceCycle: vi.fn(),
  runWorkbenchRiskCheck: vi.fn(),
  summarizeWorkbenchRebalanceExecution: vi.fn().mockResolvedValue({ orders: [], totalNotional: 0 }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

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
    currentCycle: makeCycle() as RebalanceCycle | null,
    currentRiskCheck: makeRiskCheck() as PreTradeRiskCheck | null,
    selectedProposalCount: 1,
    busy: false,
    setBusy: vi.fn(),
    setRiskCheck: vi.fn(),
    loadBootstrap: vi.fn().mockResolvedValue(undefined),
    mergeCycleState: vi.fn(),
    ...overrides,
  };
}

describe("useExecutionFlow", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const api = await import("@/src/daa/modules/workbench/workbenchApi");
    (api.summarizeWorkbenchRebalanceExecution as ReturnType<typeof vi.fn>).mockResolvedValue({ orders: [], totalNotional: 0 });
  });

  it("initializes with no pending mode and no receipt", () => {
    const { result } = renderHook(() => useExecutionFlow(makeInput()));
    expect(result.current.pendingExecuteMode).toBeNull();
    expect(result.current.executionReceipt).toBeNull();
  });

  it("handleOpenExecuteDialog sets pending mode for valid cycle", async () => {
    const { result } = renderHook(() =>
      useExecutionFlow(makeInput({
        currentCycle: makeCycle({ status: "generated" }),
        selectedProposalCount: 2,
      })),
    );
    act(() => {
      result.current.handleOpenExecuteDialog("selected");
    });
    expect(result.current.pendingExecuteMode).toBe("selected");
  });

  it("handleOpenExecuteDialog rejects completed cycle", async () => {
    const { toast } = await import("sonner");
    const { result } = renderHook(() =>
      useExecutionFlow(makeInput({
        currentCycle: makeCycle({ status: "completed" }),
      })),
    );
    act(() => {
      result.current.handleOpenExecuteDialog("all");
    });
    expect(result.current.pendingExecuteMode).toBeNull();
    expect(toast.error).toHaveBeenCalled();
  });

  it("handleOpenExecuteDialog rejects when risk blocks", async () => {
    const { toast } = await import("sonner");
    const { result } = renderHook(() =>
      useExecutionFlow(makeInput({
        currentRiskCheck: makeRiskCheck({ overallStatus: "block" }),
      })),
    );
    act(() => {
      result.current.handleOpenExecuteDialog("selected");
    });
    expect(result.current.pendingExecuteMode).toBeNull();
    expect(toast.error).toHaveBeenCalled();
  });

  it("handleOpenExecuteDialog rejects selected mode with 0 proposals", async () => {
    const { toast } = await import("sonner");
    const { result } = renderHook(() =>
      useExecutionFlow(makeInput({ selectedProposalCount: 0 })),
    );
    act(() => {
      result.current.handleOpenExecuteDialog("selected");
    });
    expect(result.current.pendingExecuteMode).toBeNull();
    expect(toast.error).toHaveBeenCalled();
  });

  it("handleOpenExecuteDialog allows all mode even with 0 selectedProposalCount", () => {
    const { result } = renderHook(() =>
      useExecutionFlow(makeInput({
        currentCycle: makeCycle({ status: "reviewing" }),
        selectedProposalCount: 0,
      })),
    );
    act(() => {
      result.current.handleOpenExecuteDialog("all");
    });
    expect(result.current.pendingExecuteMode).toBe("all");
  });

  it("clearExecutionReceipt works", () => {
    const { result } = renderHook(() => useExecutionFlow(makeInput({ currentCycle: null })));

    expect(result.current.executionReceipt).toBeNull();

    act(() => {
      result.current.clearExecutionReceipt();
    });
    expect(result.current.executionReceipt).toBeNull();
  });
});
