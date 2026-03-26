// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildWorkbenchBootstrap as buildWorkbenchBootstrapFixture } from "@/src/daa/__tests__/testDataFactories";
import type { NotificationStatusSummary } from "@/src/daa/notify/notificationStatus";
import type { WorkbenchPageModel } from "@/app/daa/dashboard/_hooks/useWorkbenchPageModel";
import { WorkbenchActiveTabPanel } from "../WorkbenchActiveTabPanel";

afterEach(() => {
  cleanup();
});

vi.mock("../AssetUniverseTable", () => ({
  default: ({ view }: { view: string }) => <div data-testid={`asset-table-${view}`}>{view}</div>,
}));

vi.mock("../WatchlistBuilderPanel", () => ({
  default: () => <div data-testid="watchlist-builder">watchlist-builder</div>,
}));

vi.mock("../WorkbenchCashSection", () => ({
  WorkbenchCashSection: () => <div data-testid="cash-section">cash</div>,
}));

vi.mock("../WorkbenchRebalanceSection", () => ({
  WorkbenchRebalanceSection: ({ onNavigateTab }: { onNavigateTab: (tab: "positions" | "watchlist" | "rebalance" | "cash") => void }) => (
    <button type="button" data-testid="rebalance-go-watchlist" onClick={() => onNavigateTab("watchlist")}>
      go-watchlist
    </button>
  ),
}));

function createNotificationSummaryFixture(): NotificationStatusSummary {
  return {
    cronConfigured: true,
    recentJobs: [],
    channels: {
      telegram: {
        channel: "telegram",
        enabled: false,
        configured: false,
        secretStates: [],
        lastAttemptAt: null,
        lastSuccessAt: null,
        lastFailureAt: null,
        lastErrorMessage: null,
        deliveryEvents: [],
      },
      feishu: {
        channel: "feishu",
        enabled: false,
        configured: false,
        secretStates: [],
        lastAttemptAt: null,
        lastSuccessAt: null,
        lastFailureAt: null,
        lastErrorMessage: null,
        deliveryEvents: [],
      },
    },
    telegramAssistant: {
      ready: false,
      secretStates: [],
      lastSessionAt: null,
      lastUserText: null,
      lastAssistantText: null,
      lastIntentKind: null,
      participantId: null,
      title: null,
    },
  };
}

function createOrderPreviewFixture() {
  return {
    assetKey: "US::AAPL",
    symbol: "AAPL",
    market: "US",
    currency: "USD",
    side: "BUY" as const,
    qty: 1,
    price: 100,
    grossNotional: 100,
    feeRateBps: 0,
    fee: 0,
    feeInBase: 0,
    fxRateToBase: 1,
    notionalInBase: 100,
    baseCurrency: "USD",
    accountCash: 1000,
    holdingQty: 0,
    canSubmit: true,
    riskCheck: {
      overallStatus: "pass" as const,
      items: [],
    },
    priceSource: "test",
    priceSnapshotAt: "2026-03-01T00:00:00.000Z",
    warnings: [],
  };
}

type WorkbenchPageModelOverrides =
  Partial<Omit<WorkbenchPageModel, "tableProps" | "watchlistBuilderProps" | "rebalanceSectionProps" | "dialogProps">> & {
    tableProps?: Partial<WorkbenchPageModel["tableProps"]>;
    watchlistBuilderProps?: Partial<WorkbenchPageModel["watchlistBuilderProps"]>;
    rebalanceSectionProps?: Partial<NonNullable<WorkbenchPageModel["rebalanceSectionProps"]>> | null;
    dialogProps?: Partial<WorkbenchPageModel["dialogProps"]>;
  };

function createModel(overrides: WorkbenchPageModelOverrides = {}): WorkbenchPageModel {
  const {
    tableProps: tablePropsOverride,
    watchlistBuilderProps: watchlistBuilderPropsOverride,
    rebalanceSectionProps: rebalanceSectionPropsOverride,
    dialogProps: dialogPropsOverride,
    ...topLevelOverrides
  } = overrides;
  const summary = overrides.summary ?? {
    holdingAssets: 2,
    watchlistAssets: 5,
  };
  const baseBootstrap = buildWorkbenchBootstrapFixture();
  const tableProps: WorkbenchPageModel["tableProps"] = {
    rows: [],
    baseCurrency: "USD",
    counts: { all: 0, holdings: 2, watchlist: 5, basket: 1 },
    onAddToExecution: vi.fn(async () => undefined),
    onUpdateTargetWeight: vi.fn(async () => undefined),
    onNormalizeTargetWeights: vi.fn(async () => undefined),
    onToggleBasket: vi.fn(async () => undefined),
    onRemoveFromWatchlist: vi.fn(async () => undefined),
    onOpenCalibration: vi.fn(),
    expandedInsightKeys: {},
    insightLoadingByAssetKey: {},
    insightErrorByAssetKey: {},
    insightDataByAssetKey: {},
    onToggleInlineInsights: vi.fn(async () => undefined),
    onSubmitLlmFeedback: vi.fn(async () => undefined),
    llmFeedbackSubmittingByContext: {},
    llmFeedbackScoreByContext: {},
    actioningAssetKey: null,
    disabled: false,
    updatingTarget: false,
    ...tablePropsOverride,
  };
  const watchlistBuilderProps: WorkbenchPageModel["watchlistBuilderProps"] = {
    loading: false,
    joinedAssetKeys: {},
    onListFeaturedAssets: vi.fn(async () => ({ groups: [], generatedAt: "2026-03-01T00:00:00.000Z" })),
    onSearch: vi.fn(async () => []),
    onAddAsset: vi.fn(async () => undefined),
    ...watchlistBuilderPropsOverride,
  };
  const rebalanceSectionProps = rebalanceSectionPropsOverride === null
    ? null
    : {
        bootstrap: baseBootstrap,
        cycles: [],
        currentCycle: null,
        currentRiskCheck: null,
        summary,
        busy: false,
        marketContextExpanded: false,
        setMarketContextExpanded: vi.fn(),
        expandedProposalDecisionKeys: {},
        setExpandedProposalDecisionKeys: vi.fn(),
        llmFeedbackSubmittingByContext: {},
        llmFeedbackScoreByContext: {},
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
        onNavigateTab: vi.fn(),
        onGenerateCycle: vi.fn(async () => undefined),
        onOpenExecuteDialog: vi.fn(),
        onCancelCycle: vi.fn(async () => undefined),
        onSelectAllProposals: vi.fn(async () => undefined),
        onToggleProposal: vi.fn(async () => undefined),
        onSubmitLlmFeedback: vi.fn(async () => undefined),
        onSelectCycle: vi.fn(),
        ...rebalanceSectionPropsOverride,
      };
  const dialogProps: WorkbenchPageModel["dialogProps"] = {
    orderDraft: null,
    setOrderDraft: vi.fn(),
    orderSubmitting: false,
    onPreview: vi.fn(async () => createOrderPreviewFixture()),
    onSubmitOrder: vi.fn(async () => undefined),
    calibrationDraft: null,
    setCalibrationDraft: vi.fn(),
    calibrating: false,
    busy: false,
    onSubmitCalibration: vi.fn(async () => undefined),
    pendingExecuteMode: null,
    setPendingExecuteMode: vi.fn(),
    executeSummary: null,
    executeSummaryLoading: false,
    executeSummaryError: "",
    currentCycle: null,
    baseCurrency: "USD",
    onConfirmExecute: vi.fn(async () => undefined),
    pendingConfirm: null,
    setPendingConfirm: vi.fn(),
    onConfirmCancelCycle: vi.fn(async () => undefined),
    onConfirmRemoveFromWatchlist: vi.fn(async () => undefined),
    ...dialogPropsOverride,
  };

  return {
    assistant: topLevelOverrides.assistant ?? {
      conversation: null,
      session: null,
      messages: [],
      sessions: [],
      threads: [],
      selectedSessionId: null,
      loading: false,
      sending: false,
      error: "",
      refresh: vi.fn(async () => undefined),
      send: vi.fn(async () => undefined),
      selectThread: vi.fn(async () => undefined),
    },
    activeTab: topLevelOverrides.activeTab ?? "watchlist",
    setActiveTab: topLevelOverrides.setActiveTab ?? vi.fn(),
    bootstrap: topLevelOverrides.bootstrap ?? buildWorkbenchBootstrapFixture(),
    snapshots: topLevelOverrides.snapshots ?? [],
    cashLedger: topLevelOverrides.cashLedger ?? [],
    signals: topLevelOverrides.signals ?? [],
    allocationSummary: topLevelOverrides.allocationSummary ?? null,
    ledgerMeta: topLevelOverrides.ledgerMeta ?? {
      ledgerStartTs: null,
      openingBalance: 0,
      archivedCycleCount: 0,
      archivedTradeCount: 0,
      archivedReportCount: 0,
    },
    notificationStatus: topLevelOverrides.notificationStatus ?? createNotificationSummaryFixture(),
    loading: topLevelOverrides.loading ?? false,
    refreshing: topLevelOverrides.refreshing ?? false,
    error: topLevelOverrides.error ?? "",
    authRequired: topLevelOverrides.authRequired ?? false,
    loadBootstrap: topLevelOverrides.loadBootstrap ?? vi.fn(async () => undefined),
    summary,
    totalEquity: topLevelOverrides.totalEquity ?? 1000,
    holdingsValue: topLevelOverrides.holdingsValue ?? 0,
    availableCashValue: topLevelOverrides.availableCashValue ?? 1000,
    frozenCashValue: topLevelOverrides.frozenCashValue ?? 0,
    executionReceipt: topLevelOverrides.executionReceipt ?? null,
    clearExecutionReceipt: topLevelOverrides.clearExecutionReceipt ?? vi.fn(),
    tableProps,
    watchlistBuilderProps,
    rebalanceSectionProps,
    dialogProps,
    equityDelta: topLevelOverrides.equityDelta ?? null,
    priceStreamConnected: topLevelOverrides.priceStreamConnected ?? false,
  };
}

describe("WorkbenchActiveTabPanel", () => {
  it("在组合页切换 tab 时优先走页面级导航回调", () => {
    const onNavigateTab = vi.fn();
    const model = createModel();

    render(<WorkbenchActiveTabPanel model={model} onNavigateTab={onNavigateTab} />);

    fireEvent.click(screen.getByRole("button", { name: "持仓 2" }));

    expect(onNavigateTab).toHaveBeenCalledWith("positions");
    expect(model.setActiveTab).not.toHaveBeenCalled();
  });

  it("观察列表先展示当前列表，再展示补充标的面板", () => {
    const model = createModel();

    render(<WorkbenchActiveTabPanel model={model} />);

    const table = screen.getAllByTestId("asset-table-watchlist")[0];
    fireEvent.click(screen.getByRole("button", { name: "展开观察池工具" }));
    const builder = screen.getByTestId("watchlist-builder");

    expect(Boolean(table.compareDocumentPosition(builder) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it("观察列表异步加载后如果已有标的，会自动收起补充面板避免首屏过长", () => {
    const initialModel = createModel({
      summary: {
        holdingAssets: 0,
        watchlistAssets: 0,
      },
    });
    const { rerender } = render(<WorkbenchActiveTabPanel model={initialModel} />);

    expect(screen.getByTestId("watchlist-builder")).toBeTruthy();

    const loadedModel = createModel({
      summary: {
        holdingAssets: 2,
        watchlistAssets: 5,
      },
    });
    rerender(<WorkbenchActiveTabPanel model={loadedModel} />);

    expect(screen.queryByTestId("watchlist-builder")).toBeNull();
    expect(screen.getByRole("button", { name: "展开观察池工具" })).toBeTruthy();
  });

  it("调仓页的引导动作会复用页面级导航回调，而不是局部 setState", () => {
    const onNavigateTab = vi.fn();
    const localNavigate = vi.fn();
    const model = createModel({
      activeTab: "rebalance",
      rebalanceSectionProps: {
        onNavigateTab: localNavigate,
      },
    });

    render(<WorkbenchActiveTabPanel model={model} onNavigateTab={onNavigateTab} />);

    fireEvent.click(screen.getByTestId("rebalance-go-watchlist"));

    expect(onNavigateTab).toHaveBeenCalledWith("watchlist");
    expect(localNavigate).not.toHaveBeenCalled();
  });
});
