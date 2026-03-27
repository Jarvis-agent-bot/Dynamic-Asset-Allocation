"use client";

import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";

import { generateWorkbenchRebalanceCycle, patchWorkbenchRebalanceCycle } from "@/src/daa/modules/workbench/workbenchApi";
import type {
  AssetUniverseView,
  PreTradeRiskCheck,
  RebalanceCycle,
  WorkbenchBootstrap,
} from "@/src/daa/modules/workbench/workbenchTypes";

function isTerminalCycleStatus(status: RebalanceCycle["status"]): boolean {
  return status === "completed" || status === "cancelled";
}

function marketPercentileText(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "近一年位置 N/A";
  return `近一年位置 ${value.toFixed(1)}%`;
}

export function useWorkbenchRebalanceFlow(input: {
  bootstrap: WorkbenchBootstrap | null;
  assetRows: AssetUniverseView[];
  cycles: RebalanceCycle[];
  currentCycle: RebalanceCycle | null;
  riskCheck: PreTradeRiskCheck | null;
  busy: boolean;
  setBusy: Dispatch<SetStateAction<boolean>>;
  loadBootstrap: (silent?: boolean, preferredCycleId?: string | null) => Promise<void>;
  syncCycleState: (nextCycle: RebalanceCycle | null) => void;
}) {
  const [marketContextExpanded, setMarketContextExpanded] = useState(false);
  const [expandedProposalDecisionKeys, setExpandedProposalDecisionKeys] = useState<Record<string, boolean>>({});

  const derived = useMemo(() => {
    const summary = {
      holdingAssets: input.assetRows.filter((row) => row.holdingQty > 0).length,
      watchlistAssets: input.assetRows.filter((row) => row.watchEnabled).length,
    };

    const currentRiskCheck = input.riskCheck || input.currentCycle?.riskCheck || null;
    const selectedProposalCount = input.currentCycle?.proposals.filter((row) => row.selected).length ?? 0;
    const isCurrentCycleTerminal = Boolean(input.currentCycle && isTerminalCycleStatus(input.currentCycle.status));
    const riskReadyForExecution = Boolean(currentRiskCheck && currentRiskCheck.overallStatus !== "block");
    const canEditCurrentCycle = Boolean(input.currentCycle && !isCurrentCycleTerminal && !input.busy);
    const canExecuteAll = Boolean(input.currentCycle && !isCurrentCycleTerminal && riskReadyForExecution && input.currentCycle.status !== "executing" && input.busy === false);
    const canExecuteSelected = Boolean(canExecuteAll && selectedProposalCount > 0);
    const selectedProposalNotional = input.currentCycle?.proposals
      .filter((row) => row.selected)
      .reduce((sum, row) => sum + row.suggestedNotional, 0) ?? 0;
    const buyProposalCount = input.currentCycle?.proposals.filter((row) => row.side === "BUY").length ?? 0;
    const sellProposalCount = input.currentCycle?.proposals.filter((row) => row.side === "SELL").length ?? 0;
    const activeMarketContext = input.currentCycle?.marketContext || input.bootstrap?.marketContext || null;
    const primaryDecisionContext = input.currentCycle?.proposals.find((row) => row.decisionContext)?.decisionContext || null;
    const scopedMarketContext = primaryDecisionContext?.marketScope
      ? activeMarketContext?.scopes?.find((item) => item.scope === primaryDecisionContext.marketScope) || null
      : null;
    const decisionMarketContext = scopedMarketContext || activeMarketContext;
    const decisionMarketLabel = primaryDecisionContext?.marketScopeLabel || scopedMarketContext?.label || "组合摘要";
    const currentDecisionFacts = decisionMarketContext?.indicators.slice(0, 3).map((item) => (
      `${item.label} ${item.rawValue == null ? "N/A" : `${item.rawValue}${item.unit || ""}`} / ${marketPercentileText(item.percentile252)}`
    )) || [];
    const basketAssetCount = input.assetRows.filter((row) => row.watchEnabled && row.targetWeightHint > 0).length;
    const hasCycleProposal = Boolean(input.currentCycle && input.currentCycle.proposals.length > 0);
    const rebalanceChecklist = [
      { id: "watchlist", label: "观察列表至少 1 个资产", ok: summary.watchlistAssets > 0, hint: "去观察列表添加候选资产" },
      { id: "basket", label: "再平衡列表至少 1 个目标权重 > 0 的资产", ok: basketAssetCount > 0, hint: "去观察列表设置目标权重" },
      { id: "cycle", label: "已生成建议周期", ok: Boolean(input.currentCycle), hint: "点击生成/刷新建议" },
      { id: "proposal", label: "建议列表中存在可审阅条目", ok: hasCycleProposal, hint: "先完成建议生成" },
      { id: "risk", label: "执行前风控非阻断", ok: riskReadyForExecution, hint: "查看风控检查并消除阻断项" },
    ];
    const rebalanceChecklistAllPassed = rebalanceChecklist.every((item) => item.ok);
    const firstUnmetChecklist = rebalanceChecklist.find((item) => !item.ok);
    const cycleProgressText = !input.currentCycle
      ? "尚未生成建议"
      : (input.currentCycle.status === "completed"
        ? "已执行完成"
        : (input.currentCycle.status === "cancelled"
          ? "周期已取消（只读）"
          : (input.currentCycle.status === "executing"
            ? "执行中，请等待结果"
            : (selectedProposalCount > 0 ? "建议已勾选，可执行" : "请先勾选建议"))));

    return {
      summary, currentRiskCheck, selectedProposalCount, isCurrentCycleTerminal,
      riskReadyForExecution, canEditCurrentCycle, canExecuteAll, canExecuteSelected,
      selectedProposalNotional, buyProposalCount, sellProposalCount,
      activeMarketContext, primaryDecisionContext, decisionMarketContext,
      decisionMarketLabel, currentDecisionFacts, basketAssetCount,
      hasCycleProposal, rebalanceChecklist, rebalanceChecklistAllPassed,
      firstUnmetChecklist, cycleProgressText,
    };
  }, [input.assetRows, input.currentCycle, input.riskCheck, input.bootstrap?.marketContext, input.busy]);

  const {
    summary, currentRiskCheck, selectedProposalCount, isCurrentCycleTerminal,
    riskReadyForExecution, canEditCurrentCycle, canExecuteAll, canExecuteSelected,
    selectedProposalNotional, buyProposalCount, sellProposalCount,
    activeMarketContext, primaryDecisionContext, decisionMarketContext,
    decisionMarketLabel, currentDecisionFacts, basketAssetCount,
    hasCycleProposal, rebalanceChecklist, rebalanceChecklistAllPassed,
    firstUnmetChecklist, cycleProgressText,
  } = derived;

  const handleGenerateCycle = useCallback(async () => {
    if (input.busy) return;
    input.setBusy(true);
    try {
      const generated = await generateWorkbenchRebalanceCycle({
        triggerSource: "manual",
        manual: true,
      });
      if (!generated.created) toast.message(generated.message);
      else toast.success(generated.message);
      if (generated.cycle) {
        input.syncCycleState(generated.cycle);
      }
      await input.loadBootstrap(true, generated.cycle?.cycleId || null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成再平衡周期失败");
    } finally {
      input.setBusy(false);
    }
  }, [input.busy, input.setBusy, input.syncCycleState, input.loadBootstrap]);

  const handleToggleProposal = useCallback(async (assetKey: string, side: "BUY" | "SELL", selected: boolean) => {
    if (!input.currentCycle || input.busy) return;
    if (isTerminalCycleStatus(input.currentCycle.status)) {
      toast.error("该周期已终态，请生成新周期继续调仓。");
      return;
    }
    input.setBusy(true);
    try {
      const selectedAssetSideKeys = input.currentCycle.proposals
        .map((row) => (row.assetKey === assetKey && row.side === side ? { ...row, selected } : row))
        .filter((row) => row.selected)
        .map((row) => `${row.assetKey}::${row.side}`);
      const next = await patchWorkbenchRebalanceCycle(input.currentCycle.cycleId, { selectedAssetSideKeys });
      input.syncCycleState(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "更新建议选择失败");
    } finally {
      input.setBusy(false);
    }
  }, [input.currentCycle, input.busy, input.setBusy, input.syncCycleState]);

  const handleSelectAllProposals = useCallback(async (selected: boolean) => {
    if (!input.currentCycle || input.busy) return;
    if (isTerminalCycleStatus(input.currentCycle.status)) {
      toast.error("该周期已终态，请生成新周期继续调仓。");
      return;
    }
    input.setBusy(true);
    try {
      const selectedAssetSideKeys = selected
        ? input.currentCycle.proposals.map((row) => `${row.assetKey}::${row.side}`)
        : [];
      const next = await patchWorkbenchRebalanceCycle(input.currentCycle.cycleId, { selectedAssetSideKeys });
      input.syncCycleState(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "批量更新建议选择失败");
    } finally {
      input.setBusy(false);
    }
  }, [input.currentCycle, input.busy, input.setBusy, input.syncCycleState]);

  const handleCancelCycle = useCallback(async () => {
    if (!input.currentCycle || input.busy) return;
    if (isTerminalCycleStatus(input.currentCycle.status)) {
      toast.error("该周期已终态，无需重复取消。");
      return;
    }
    input.setBusy(true);
    try {
      const next = await patchWorkbenchRebalanceCycle(input.currentCycle.cycleId, {
        cancel: { reason: "用户在工作台取消" },
      });
      input.syncCycleState(next);
      toast.success("已取消本次再平衡");
      await input.loadBootstrap(true, next.cycleId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "取消失败");
    } finally {
      input.setBusy(false);
    }
  }, [input.currentCycle, input.busy, input.setBusy, input.syncCycleState, input.loadBootstrap]);

  return {
    summary,
    currentRiskCheck,
    marketContextExpanded,
    setMarketContextExpanded,
    expandedProposalDecisionKeys,
    setExpandedProposalDecisionKeys,
    activeMarketContext,
    primaryDecisionContext,
    decisionMarketContext,
    decisionMarketLabel,
    currentDecisionFacts,
    canEditCurrentCycle,
    canExecuteAll,
    canExecuteSelected,
    isCurrentCycleTerminal,
    cycleProgressText,
    selectedProposalCount,
    selectedProposalNotional,
    buyProposalCount,
    sellProposalCount,
    rebalanceChecklist,
    rebalanceChecklistAllPassed,
    firstUnmetChecklist,
    handleGenerateCycle,
    handleToggleProposal,
    handleSelectAllProposals,
    handleCancelCycle,
    handleSelectCycle: input.syncCycleState,
  };
}
