// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useWorkbenchPageModel } from "../useWorkbenchPageModel";

const mockUseWorkbenchModel = vi.fn();
const mockUseWorkbenchAssetActions = vi.fn();
const mockUseWorkbenchRebalanceFlow = vi.fn();
const mockUseWorkbenchExecutionFlow = vi.fn();

vi.mock("../useWorkbenchModel", () => ({
  useWorkbenchModel: (...args: unknown[]) => mockUseWorkbenchModel(...args),
}));

vi.mock("../workbench/useWorkbenchAssetActions", () => ({
  useWorkbenchAssetActions: (...args: unknown[]) => mockUseWorkbenchAssetActions(...args),
}));

vi.mock("../workbench/useWorkbenchRebalanceFlow", () => ({
  useWorkbenchRebalanceFlow: (...args: unknown[]) => mockUseWorkbenchRebalanceFlow(...args),
}));

vi.mock("../workbench/useWorkbenchExecutionFlow", () => ({
  useWorkbenchExecutionFlow: (...args: unknown[]) => mockUseWorkbenchExecutionFlow(...args),
}));

function createAssetActionsMock() {
  return {
    tableProps: {
      rows: [],
      baseCurrency: "USD",
      counts: { all: 0, holdings: 0, watchlist: 0, basket: 0 },
      onAddToExecution: vi.fn(),
      onUpdateTargetWeight: vi.fn(),
      onNormalizeTargetWeights: vi.fn(),
      onToggleBasket: vi.fn(),
      onRemoveFromWatchlist: vi.fn(),
      onOpenCalibration: vi.fn(),
      expandedInsightKeys: {},
      insightLoadingByAssetKey: {},
      insightErrorByAssetKey: {},
      insightDataByAssetKey: {},
      onToggleInlineInsights: vi.fn(),
      onSubmitLlmFeedback: vi.fn(),
      llmFeedbackSubmittingByContext: {},
      llmFeedbackScoreByContext: {},
    },
    watchlistBuilderProps: {
      joinedAssetKeys: {},
      onListFeaturedAssets: vi.fn(),
      onSearch: vi.fn(),
      onAddAsset: vi.fn(),
    },
    orderDraft: null,
    setOrderDraft: vi.fn(),
    orderSubmitting: false,
    handlePreviewOrder: vi.fn(),
    handleSubmitManualOrder: vi.fn(),
    calibrationDraft: null,
    setCalibrationDraft: vi.fn(),
    calibrating: false,
    handleSubmitCalibration: vi.fn(),
    llmFeedbackSubmittingByContext: {},
    llmFeedbackScoreByContext: {},
    handleSubmitLlmFeedback: vi.fn(),
  };
}

function createRebalanceFlowMock() {
  return {
    summary: {
      holdingAssets: 0,
      watchlistAssets: 0,
    },
    currentRiskCheck: null,
    marketContextExpanded: false,
    setMarketContextExpanded: vi.fn(),
    expandedProposalDecisionKeys: {},
    setExpandedProposalDecisionKeys: vi.fn(),
    activeMarketContext: null,
    primaryDecisionContext: null,
    decisionMarketContext: null,
    decisionMarketLabel: "",
    currentDecisionFacts: [],
    canEditCurrentCycle: false,
    canExecuteAll: false,
    canExecuteSelected: false,
    isCurrentCycleTerminal: false,
    cycleProgressText: "",
    selectedProposalCount: 0,
    selectedProposalNotional: 0,
    buyProposalCount: 0,
    sellProposalCount: 0,
    rebalanceChecklist: [],
    rebalanceChecklistAllPassed: false,
    firstUnmetChecklist: undefined,
    handleGenerateCycle: vi.fn(),
    handleCancelCycle: vi.fn(),
    handleSelectAllProposals: vi.fn(),
    handleToggleProposal: vi.fn(),
    handleSelectCycle: vi.fn(),
  };
}

function createExecutionFlowMock() {
  return {
    handleOpenExecuteDialog: vi.fn(),
    pendingExecuteMode: null,
    setPendingExecuteMode: vi.fn(),
    executeSummary: null,
    executeSummaryLoading: false,
    executeSummaryError: "",
    handleConfirmExecuteCycle: vi.fn(),
    executionReceipt: null,
    clearExecutionReceipt: vi.fn(),
  };
}

describe("useWorkbenchPageModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWorkbenchAssetActions.mockReturnValue(createAssetActionsMock());
    mockUseWorkbenchRebalanceFlow.mockReturnValue(createRebalanceFlowMock());
    mockUseWorkbenchExecutionFlow.mockReturnValue(createExecutionFlowMock());
  });

  it("优先使用 read model 的自洽汇总值", () => {
    mockUseWorkbenchModel.mockReturnValue({
      activeTab: "positions",
      setActiveTab: vi.fn(),
      bootstrap: {
        baseCurrency: "USD",
        account: {
          cash: 774,
          investableCash: 548,
          frozenCash: 226,
          totalEquity: 1000,
        },
        assetUniverse: [],
      },
      cycles: [],
      snapshots: [],
      cashLedger: [],
      signals: [],
      allocationSummary: {
        holdingCount: 0,
        watchlistCount: 0,
        holdingValue: 0,
        cashValue: 774,
        investableCash: 548,
        frozenCash: 226,
        totalEquity: 774,
        topHoldings: [],
      },
      setCycles: vi.fn(),
      currentCycle: null,
      setCurrentCycle: vi.fn(),
      riskCheck: null,
      setRiskCheck: vi.fn(),
      loading: false,
      refreshing: false,
      error: "",
      authRequired: false,
      loadBootstrap: vi.fn(),
    });

    const { result } = renderHook(() => useWorkbenchPageModel());

    expect(result.current.totalEquity).toBe(774);
    expect(result.current.availableCashValue).toBe(548);
    expect(result.current.frozenCashValue).toBe(226);
  });

  it("在 read model 缺失时回退到 持仓 + 现金，并拆分冻结现金", () => {
    mockUseWorkbenchModel.mockReturnValue({
      activeTab: "positions",
      setActiveTab: vi.fn(),
      bootstrap: {
        baseCurrency: "USD",
        account: {
          cash: 200,
          investableCash: 150,
          frozenCash: 50,
          totalEquity: 999,
        },
        assetUniverse: [
          {
            assetKey: "US::QQQ",
            symbol: "QQQ",
            holdingQty: 2,
            valuationBase: 150,
          },
        ],
      },
      cycles: [],
      snapshots: [],
      cashLedger: [],
      signals: [],
      allocationSummary: null,
      setCycles: vi.fn(),
      currentCycle: null,
      setCurrentCycle: vi.fn(),
      riskCheck: null,
      setRiskCheck: vi.fn(),
      loading: false,
      refreshing: false,
      error: "",
      authRequired: false,
      loadBootstrap: vi.fn(),
    });

    const { result } = renderHook(() => useWorkbenchPageModel());

    expect(result.current.holdingsValue).toBe(150);
    expect(result.current.totalEquity).toBe(350);
    expect(result.current.availableCashValue).toBe(150);
    expect(result.current.frozenCashValue).toBe(50);
  });
});
