"use client";

import { useCallback, useMemo, useState } from "react";

import { useWorkbenchAssetActions } from "@/app/daa/dashboard/_hooks/workbench/useWorkbenchAssetActions";
import { useWorkbenchExecutionFlow } from "@/app/daa/dashboard/_hooks/workbench/useWorkbenchExecutionFlow";
import { useWorkbenchRebalanceFlow } from "@/app/daa/dashboard/_hooks/workbench/useWorkbenchRebalanceFlow";
import { useWorkbenchModel } from "@/app/daa/dashboard/_hooks/useWorkbenchModel";
import type { ExecutionReceipt } from "@/app/daa/dashboard/_hooks/workbench/workbenchPageTypes";
import type { RebalanceCycle } from "@/src/daa/modules/workbench/workbenchTypes";

export type { ExecutionReceipt } from "@/app/daa/dashboard/_hooks/workbench/workbenchPageTypes";

export function useWorkbenchPageModel(input: {
  initialTab?: string;
  syncPrices?: boolean;
  autoRiskCycle?: boolean;
} = {}) {
  const {
    activeTab,
    setActiveTab,
    bootstrap,
    cycles,
    snapshots,
    cashLedger,
    signals,
    allocationSummary,
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
  } = useWorkbenchModel(input);

  const [busy, setBusy] = useState(false);
  const assetRows = useMemo(() => bootstrap?.assetUniverse ?? [], [bootstrap?.assetUniverse]);

  const syncCycleState = useCallback((nextCycle: RebalanceCycle | null) => {
    setCurrentCycle(nextCycle);
    setRiskCheck(nextCycle?.riskCheck || null);
  }, [setCurrentCycle, setRiskCheck]);

  const mergeCycleState = useCallback((nextCycle: RebalanceCycle) => {
    setCycles((prev) => [nextCycle, ...prev.filter((item) => item.cycleId !== nextCycle.cycleId)]);
    syncCycleState(nextCycle);
  }, [setCycles, syncCycleState]);

  const assetActions = useWorkbenchAssetActions({
    bootstrap,
    assetRows,
    loading,
    busy,
    setBusy,
    loadBootstrap,
    setActiveTab,
  });

  const rebalanceFlow = useWorkbenchRebalanceFlow({
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

  const executionFlow = useWorkbenchExecutionFlow({
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
    marketContextExpanded: rebalanceFlow.marketContextExpanded,
    setMarketContextExpanded: rebalanceFlow.setMarketContextExpanded,
    expandedProposalDecisionKeys: rebalanceFlow.expandedProposalDecisionKeys,
    setExpandedProposalDecisionKeys: rebalanceFlow.setExpandedProposalDecisionKeys,
    llmFeedbackSubmittingByContext: assetActions.llmFeedbackSubmittingByContext,
    llmFeedbackScoreByContext: assetActions.llmFeedbackScoreByContext,
    activeMarketContext: rebalanceFlow.activeMarketContext,
    primaryDecisionContext: rebalanceFlow.primaryDecisionContext,
    decisionMarketContext: rebalanceFlow.decisionMarketContext,
    decisionMarketLabel: rebalanceFlow.decisionMarketLabel,
    currentDecisionFacts: rebalanceFlow.currentDecisionFacts,
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
    onCancelCycle: rebalanceFlow.handleCancelCycle,
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
    onConfirmExecute: executionFlow.handleConfirmExecuteCycle,
  };

  return {
    activeTab,
    setActiveTab,
    bootstrap,
    snapshots,
    cashLedger,
    signals,
    allocationSummary,
    loading,
    refreshing,
    error,
    authRequired,
    loadBootstrap,
    summary: rebalanceFlow.summary,
    totalEquity,
    holdingsValue,
    cashValue: totalCashValue,
    availableCashValue,
    frozenCashValue,
    executionReceipt: executionFlow.executionReceipt as ExecutionReceipt | null,
    clearExecutionReceipt: executionFlow.clearExecutionReceipt,
    tableProps: assetActions.tableProps,
    watchlistBuilderProps: assetActions.watchlistBuilderProps,
    rebalanceSectionProps,
    dialogProps,
  };
}

export type WorkbenchPageModel = ReturnType<typeof useWorkbenchPageModel>;
