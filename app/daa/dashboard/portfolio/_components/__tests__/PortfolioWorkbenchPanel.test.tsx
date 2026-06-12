// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildWorkbenchBootstrap as buildWorkbenchBootstrapFixture } from "@/src/daa/__tests__/testDataFactories";
import type { NotificationStatusSummary } from "@/src/daa/notify/notificationStatus";
import type { AssetWorkbenchModel } from "@/app/daa/dashboard/_hooks/useAssetWorkbenchModel";
import { PortfolioWorkbenchPanel } from "../PortfolioWorkbenchPanel";

afterEach(() => {
  cleanup();
});

vi.mock("@/app/daa/dashboard/portfolio/_components/WatchlistSearchBar", () => ({
  WatchlistSearchBar: () => <div data-testid="watchlist-search">watchlist-search</div>,
}));

vi.mock("@/app/daa/dashboard/portfolio/_components/WatchlistItemList", () => ({
  WatchlistItemList: () => <div data-testid="watchlist-items">watchlist-items</div>,
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

type AssetWorkbenchModelOverrides =
  Partial<Omit<AssetWorkbenchModel, "tableProps" | "watchlistBuilderProps" | "rebalanceSectionProps" | "dialogProps">> & {
    tableProps?: Partial<AssetWorkbenchModel["tableProps"]>;
    watchlistBuilderProps?: Partial<AssetWorkbenchModel["watchlistBuilderProps"]>;
    rebalanceSectionProps?: Partial<NonNullable<AssetWorkbenchModel["rebalanceSectionProps"]>> | null;
    dialogProps?: Partial<AssetWorkbenchModel["dialogProps"]>;
  };

function createAssetRowFixture(overrides: Record<string, unknown> = {}) {
  return {
    assetKey: "US::AAPL",
    symbol: "AAPL",
    market: "US",
    currency: "USD",
    holdingQty: 1,
    lastPrice: 100,
    valuationBase: 100,
    actualWeightPct: 10,
    fxRateToBase: 1,
    watchEnabled: false,
    targetWeightHint: 0,
    ...overrides,
  };
}

function createModel(overrides: AssetWorkbenchModelOverrides = {}): AssetWorkbenchModel {
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
  const tableProps: AssetWorkbenchModel["tableProps"] = {
    rows: [
      createAssetRowFixture({ assetKey: "US::AAPL", symbol: "AAPL" }),
      createAssetRowFixture({ assetKey: "US::MSFT", symbol: "MSFT" }),
    ] as AssetWorkbenchModel["tableProps"]["rows"],
    baseCurrency: "USD",
    counts: { all: 0, holdings: 2, watchlist: 5, basket: 1 },
    onAddToExecution: vi.fn(async () => undefined),
    onUpdateTargetWeight: vi.fn(async () => undefined),
    onNormalizeTargetWeights: vi.fn(async () => undefined),
    onToggleBasket: vi.fn(async () => undefined),
    onRemoveFromWatchlist: vi.fn(async () => undefined),
    onOpenCalibration: vi.fn(),
    onViewChart: vi.fn(),
    actioningAssetKey: null,
    disabled: false,
    updatingTarget: false,
    ...tablePropsOverride,
  };
  const watchlistBuilderProps: AssetWorkbenchModel["watchlistBuilderProps"] = {
    loading: false,
    joinedAssetKeys: {},
    onListFeaturedAssets: vi.fn(async () => ({ groups: [], generatedAt: "2026-03-01T00:00:00.000Z" })),
    onSearch: vi.fn(async () => []),
    onAddAsset: vi.fn(async () => undefined),
    onRemoveAsset: vi.fn(async () => undefined),
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
        expandedProposalDecisionKeys: {},
        setExpandedProposalDecisionKeys: vi.fn(),
        llmFeedbackSubmittingByContext: {},
        llmFeedbackScoreByContext: {},
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
  const dialogProps: AssetWorkbenchModel["dialogProps"] = {
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
    slippageBps: 0,
    onConfirmExecute: vi.fn(async () => undefined),
    pendingConfirm: null,
    setPendingConfirm: vi.fn(),
    onConfirmCancelCycle: vi.fn(async () => undefined),
    onConfirmRemoveFromWatchlist: vi.fn(async () => undefined),
    assetDetail: null,
    setAssetDetail: vi.fn(),
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

describe("PortfolioWorkbenchPanel", () => {
  it("在组合页切换 tab 时优先走页面级导航回调", () => {
    const onNavigateTab = vi.fn();
    const model = createModel();

    render(<PortfolioWorkbenchPanel model={model} onNavigateTab={onNavigateTab} />);

    fireEvent.click(screen.getByRole("tab", { name: "持仓 2" }));

    expect(onNavigateTab).toHaveBeenCalledWith("positions");
    expect(model.setActiveTab).not.toHaveBeenCalled();
  });

  it("持仓 tab 计数忽略低市值残留仓位", () => {
    const model = createModel({
      tableProps: {
        rows: [
          createAssetRowFixture({ assetKey: "US::AAPL", symbol: "AAPL", valuationBase: 100 }),
          createAssetRowFixture({ assetKey: "US::TINY", symbol: "TINY", holdingQty: 0.001, valuationBase: 0.2, actualWeightPct: 0.002 }),
        ] as AssetWorkbenchModel["tableProps"]["rows"],
      },
    });

    render(<PortfolioWorkbenchPanel model={model} />);

    expect(screen.getByRole("tab", { name: "持仓 1" })).toBeTruthy();
  });

  it("观察列表展示搜索栏和列表", () => {
    const model = createModel();

    render(<PortfolioWorkbenchPanel model={model} />);

    const search = screen.getByTestId("watchlist-search");
    const items = screen.getByTestId("watchlist-items");

    // 搜索栏在列表之前
    expect(Boolean(search.compareDocumentPosition(items) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });
});
