"use client";

import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";

import { deriveRebalanceInteractionState } from "@/app/daa/dashboard/_hooks/asset-workbench/rebalanceInteractionState";
import { generateWorkbenchRebalanceCycle, patchWorkbenchRebalanceCycle } from "@/src/daa/modules/workbench/workbenchApi";
import type { AssetUniverseView, RebalanceCycle, WorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchTypes";
import type { PreTradeRiskCheck } from "@/src/daa/modules/rebalance/rebalanceTypes";

function isTerminalCycleStatus(status: RebalanceCycle["status"]): boolean {
  return status === "completed" || status === "cancelled";
}

export function useRebalanceFlow(input: {
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
  const [expandedProposalDecisionKeys, setExpandedProposalDecisionKeys] = useState<Record<string, boolean>>({});

  const derived = useMemo(() => deriveRebalanceInteractionState({
    assetRows: input.assetRows,
    currentCycle: input.currentCycle,
    riskCheck: input.riskCheck,
    busy: input.busy,
  }), [input.assetRows, input.currentCycle, input.riskCheck, input.busy]);

  const {
    stage, summary, currentRiskCheck, selectedProposalCount, isCurrentCycleTerminal,
    canEditCurrentCycle, canExecuteAll, canExecuteSelected,
    selectedProposalNotional, buyProposalCount, sellProposalCount,
    rebalanceChecklist, rebalanceChecklistAllPassed,
    firstUnmetChecklist, cycleProgressText, firstBlockedActionReason,
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
        cancel: { reason: "用户手动取消" },
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
    stage,
    summary,
    currentRiskCheck,
    expandedProposalDecisionKeys,
    setExpandedProposalDecisionKeys,
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
    firstBlockedActionReason,
    handleGenerateCycle,
    handleToggleProposal,
    handleSelectAllProposals,
    handleCancelCycle,
    handleSelectCycle: input.syncCycleState,
  };
}
