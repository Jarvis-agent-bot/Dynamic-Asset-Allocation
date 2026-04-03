"use client";

import { useCallback, useMemo, useState } from "react";

import { useAssetActions } from "@/app/daa/dashboard/_hooks/dashboard/useAssetActions";
import { useExecutionFlow } from "@/app/daa/dashboard/_hooks/dashboard/useExecutionFlow";
import { useRebalanceFlow } from "@/app/daa/dashboard/_hooks/dashboard/useRebalanceFlow";
import { useAssistantChat } from "@/app/daa/dashboard/_hooks/useAssistantChat";
import { useDashboardModel } from "@/app/daa/dashboard/_hooks/useDashboardModel";
import type { ExecutionReceipt } from "@/app/daa/dashboard/_hooks/dashboard/dashboardPageTypes";
import type { AssetUniverseView, RebalanceCycle } from "@/src/daa/modules/workbench/workbenchTypes";
import type { AssetDetailDraft } from "@/app/daa/dashboard/workbench/_components/AssetDetailDialog";

export type PendingConfirm =
  | { type: "cancelCycle" }
  | { type: "removeWatchlist"; row: AssetUniverseView }
  | null;

export type { ExecutionReceipt } from "@/app/daa/dashboard/_hooks/dashboard/dashboardPageTypes";

export function useDashboardPageModel(input: {
  initialTab?: string;
  syncPrices?: boolean;
  autoRiskCycle?: boolean;
} = {}) {
  const assistant = useAssistantChat();
  const {
    activeTab,
    setActiveTab,
    bootstrap,
    cycles,
    snapshots,
    cashLedger,
    signals,
    allocationSummary,
    equityDelta,
    ledgerMeta,
    notificationStatus,
    setCycles,
    currentCycle,
    setCurrentCycle,
    riskCheck,
    setRiskCheck,
    loading,
    refreshing,
    error,
    authRequired,
    loadBootstrap,
    livePrices,
    priceStreamConnected,
  } = useDashboardModel(input);

  const [busy, setBusy] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);
  const [assetDetail, setAssetDetail] = useState<AssetDetailDraft | null>(null);
  const rawAssetRows = useMemo(() => bootstrap?.assetUniverse ?? [], [bootstrap?.assetUniverse]);

  // 将 SSE 实时价格合并到 assetRows（覆盖 lastPrice + 添加 priceDelta/priceDirection）
  const assetRows = useMemo(() => {
    if (livePrices.size === 0) return rawAssetRows;
    return rawAssetRows.map((row) => {
      const live = livePrices.get(row.assetKey);
      if (!live) return row;
      return {
        ...row,
        lastPrice: live.price,
        priceUpdatedAt: live.ts,
        priceDelta: live.delta,
        priceDirection: live.direction,
      };
    });
  }, [rawAssetRows, livePrices]);

  const syncCycleState = useCallback((nextCycle: RebalanceCycle | null) => {
    setCurrentCycle(nextCycle);
    setRiskCheck(nextCycle?.riskCheck || null);
  }, [setCurrentCycle, setRiskCheck]);

  const mergeCycleState = useCallback((nextCycle: RebalanceCycle) => {
    setCycles((prev) => [nextCycle, ...prev.filter((item) => item.cycleId !== nextCycle.cycleId)]);
    syncCycleState(nextCycle);
  }, [setCycles, syncCycleState]);

  const assetActions = useAssetActions({
    bootstrap,
    assetRows,
    loading,
    busy,
    setBusy,
    loadBootstrap,
    setActiveTab,
  });

  const rebalanceFlow = useRebalanceFlow({
    bootstrap,
    assetRows,
    cycles,
    currentCycle,
    riskCheck,
    busy,
    setBusy,
    loadBootstrap,
    syncCycleState,
  });

  const executionFlow = useExecutionFlow({
    currentCycle,
    currentRiskCheck: rebalanceFlow.currentRiskCheck,
    selectedProposalCount: rebalanceFlow.selectedProposalCount,
    busy,
    setBusy,
    setRiskCheck,
    loadBootstrap,
    mergeCycleState,
  });

  const holdingsValue = allocationSummary?.holdingValue ?? assetRows
    .filter((row) => row.holdingQty > 0)
    .reduce((sum, row) => sum + (row.valuationBase ?? 0), 0);
  const totalCashValue = allocationSummary?.cashValue ?? bootstrap?.account.cash ?? 0;
  const frozenCashValue = allocationSummary?.frozenCash ?? bootstrap?.account.frozenCash ?? 0;
  const availableCashValue = Math.max(0, totalCashValue - frozenCashValue);
  const totalEquity = allocationSummary?.totalEquity ?? (holdingsValue + totalCashValue);

  const rebalanceSectionProps = bootstrap ? {
    bootstrap,
    cycles,
    currentCycle,
    currentRiskCheck: rebalanceFlow.currentRiskCheck,
    summary: rebalanceFlow.summary,
    busy,
    expandedProposalDecisionKeys: rebalanceFlow.expandedProposalDecisionKeys,
    setExpandedProposalDecisionKeys: rebalanceFlow.setExpandedProposalDecisionKeys,
    llmFeedbackSubmittingByContext: assetActions.llmFeedbackSubmittingByContext,
    llmFeedbackScoreByContext: assetActions.llmFeedbackScoreByContext,
    canEditCurrentCycle: rebalanceFlow.canEditCurrentCycle,
    canExecuteAll: rebalanceFlow.canExecuteAll,
    canExecuteSelected: rebalanceFlow.canExecuteSelected,
    isCurrentCycleTerminal: rebalanceFlow.isCurrentCycleTerminal,
    cycleProgressText: rebalanceFlow.cycleProgressText,
    selectedProposalCount: rebalanceFlow.selectedProposalCount,
    selectedProposalNotional: rebalanceFlow.selectedProposalNotional,
    buyProposalCount: rebalanceFlow.buyProposalCount,
    sellProposalCount: rebalanceFlow.sellProposalCount,
    rebalanceChecklist: rebalanceFlow.rebalanceChecklist,
    rebalanceChecklistAllPassed: rebalanceFlow.rebalanceChecklistAllPassed,
    firstUnmetChecklist: rebalanceFlow.firstUnmetChecklist,
    onNavigateTab: setActiveTab,
    onGenerateCycle: rebalanceFlow.handleGenerateCycle,
    onOpenExecuteDialog: executionFlow.handleOpenExecuteDialog,
    onCancelCycle: () => setPendingConfirm({ type: "cancelCycle" }),
    onSelectAllProposals: rebalanceFlow.handleSelectAllProposals,
    onToggleProposal: rebalanceFlow.handleToggleProposal,
    onSubmitLlmFeedback: assetActions.handleSubmitLlmFeedback,
    onSelectCycle: rebalanceFlow.handleSelectCycle,
  } : null;

  const dialogProps = {
    orderDraft: assetActions.orderDraft,
    setOrderDraft: assetActions.setOrderDraft,
    orderSubmitting: assetActions.orderSubmitting,
    onPreview: assetActions.handlePreviewOrder,
    onSubmitOrder: assetActions.handleSubmitManualOrder,
    calibrationDraft: assetActions.calibrationDraft,
    setCalibrationDraft: assetActions.setCalibrationDraft,
    calibrating: assetActions.calibrating,
    busy,
    onSubmitCalibration: assetActions.handleSubmitCalibration,
    pendingExecuteMode: executionFlow.pendingExecuteMode,
    setPendingExecuteMode: executionFlow.setPendingExecuteMode,
    executeSummary: executionFlow.executeSummary,
    executeSummaryLoading: executionFlow.executeSummaryLoading,
    executeSummaryError: executionFlow.executeSummaryError,
    currentCycle,
    baseCurrency: bootstrap?.baseCurrency || "USD",
    slippageBps: bootstrap?.execution?.slippageBps ?? 0,
    onConfirmExecute: executionFlow.handleConfirmExecuteCycle,
    pendingConfirm,
    setPendingConfirm,
    onConfirmCancelCycle: rebalanceFlow.handleCancelCycle,
    onConfirmRemoveFromWatchlist: assetActions.tableProps.onRemoveFromWatchlist,
    assetDetail,
    setAssetDetail,
  };

  const overriddenTableProps = {
    ...assetActions.tableProps,
    onRemoveFromWatchlist: (row: AssetUniverseView) => {
      setPendingConfirm({ type: "removeWatchlist", row });
      return Promise.resolve();
    },
    onViewChart: (row: AssetUniverseView) => {
      setAssetDetail({ symbol: row.symbol, market: row.market, assetKey: row.assetKey });
    },
  };

  return {
    assistant,
    activeTab,
    setActiveTab,
    bootstrap,
    snapshots,
    cashLedger,
    signals,
    allocationSummary,
    equityDelta,
    ledgerMeta,
    notificationStatus,
    loading,
    refreshing,
    error,
    authRequired,
    loadBootstrap,
    summary: rebalanceFlow.summary,
    totalEquity,
    holdingsValue,
    availableCashValue,
    frozenCashValue,
    executionReceipt: executionFlow.executionReceipt as ExecutionReceipt | null,
    clearExecutionReceipt: executionFlow.clearExecutionReceipt,
    tableProps: overriddenTableProps,
    watchlistBuilderProps: assetActions.watchlistBuilderProps,
    rebalanceSectionProps,
    dialogProps,
    // SSE 实时价格流状态
    priceStreamConnected,
  };
}

export type DashboardPageModel = ReturnType<typeof useDashboardPageModel>;
