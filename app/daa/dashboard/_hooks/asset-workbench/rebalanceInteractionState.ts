import type { AssetUniverseView, RebalanceCycle } from "@/src/daa/modules/workbench/workbenchTypes";
import type { PreTradeRiskCheck } from "@/src/daa/modules/rebalance/rebalanceTypes";
import { countVisibleHoldings } from "@/app/daa/dashboard/_shared/holdingVisibility";

export type RebalanceInteractionStage =
  | "empty"
  | "review"
  | "risk_blocked"
  | "executable"
  | "executing"
  | "completed"
  | "cancelled"
  | "busy";

type RebalanceChecklistItem = {
  id: "watchlist" | "basket" | "cycle" | "proposal" | "risk";
  label: string;
  ok: boolean;
  hint: string;
};

function isTerminalCycleStatus(status: RebalanceCycle["status"]): boolean {
  return status === "completed" || status === "cancelled";
}

function isExecutableCycleStatus(status: RebalanceCycle["status"]): boolean {
  return status === "generated" || status === "reviewing";
}

function deriveStage(input: {
  currentCycle: RebalanceCycle | null;
  riskCheck: PreTradeRiskCheck | null;
  busy: boolean;
}): RebalanceInteractionStage {
  const cycle = input.currentCycle;
  if (!cycle) return input.busy ? "busy" : "empty";
  if (cycle.status === "completed") return "completed";
  if (cycle.status === "cancelled") return "cancelled";
  if (cycle.status === "executing") return "executing";
  if (input.busy) return "busy";
  if (!input.riskCheck) return "review";
  if (input.riskCheck.overallStatus === "block") return "risk_blocked";
  return "executable";
}

function describeBlockedExecution(input: {
  currentCycle: RebalanceCycle | null;
  riskCheck: PreTradeRiskCheck | null;
  selectedProposalCount: number;
}): string | null {
  if (!input.currentCycle) return "请先生成再平衡建议。";
  if (!isExecutableCycleStatus(input.currentCycle.status)) return "该周期不可执行，请生成新周期继续调仓。";
  if (!input.riskCheck) return "请先运行风控校验后再执行。";
  if (input.riskCheck.overallStatus === "block") return "当前风控校验存在阻断项，请先处理风险提示后再执行。";
  if (input.selectedProposalCount <= 0) return "请至少勾选一条建议后再执行。";
  return null;
}

export function deriveRebalanceInteractionState(input: {
  assetRows: AssetUniverseView[];
  currentCycle: RebalanceCycle | null;
  riskCheck: PreTradeRiskCheck | null;
  busy: boolean;
}) {
  const summary = {
    holdingAssets: countVisibleHoldings(input.assetRows),
    watchlistAssets: input.assetRows.filter((row) => row.watchEnabled).length,
  };
  const currentRiskCheck = input.riskCheck;
  const currentCycle = input.currentCycle;
  const selectedProposalCount = currentCycle?.proposals.filter((row) => row.selected).length ?? 0;
  const selectedProposalNotional = currentCycle?.proposals
    .filter((row) => row.selected)
    .reduce((sum, row) => sum + row.suggestedNotional, 0) ?? 0;
  const buyProposalCount = currentCycle?.proposals.filter((row) => row.side === "BUY").length ?? 0;
  const sellProposalCount = currentCycle?.proposals.filter((row) => row.side === "SELL").length ?? 0;
  const basketAssetCount = input.assetRows.filter((row) => row.watchEnabled && row.targetWeightPct > 0).length;
  const hasCycleProposal = Boolean(currentCycle && currentCycle.proposals.length > 0);
  const riskReadyForExecution = Boolean(currentRiskCheck && currentRiskCheck.overallStatus !== "block");
  const isCurrentCycleTerminal = Boolean(currentCycle && isTerminalCycleStatus(currentCycle.status));
  const stage = deriveStage({
    currentCycle,
    riskCheck: currentRiskCheck,
    busy: input.busy,
  });
  const canEditCurrentCycle = Boolean(currentCycle && !isCurrentCycleTerminal && currentCycle.status !== "executing" && !input.busy);
  const canExecuteAll = Boolean(
    currentCycle
      && stage === "executable"
      && isExecutableCycleStatus(currentCycle.status)
      && !input.busy,
  );
  const canExecuteSelected = Boolean(canExecuteAll && selectedProposalCount > 0);
  const rebalanceChecklist: RebalanceChecklistItem[] = [
    { id: "watchlist", label: "观察列表至少 1 个资产", ok: summary.watchlistAssets > 0, hint: "先添加候选资产" },
    { id: "basket", label: "再平衡列表至少 1 个目标权重 > 0 的资产", ok: basketAssetCount > 0, hint: "先为候选资产设置目标权重" },
    { id: "cycle", label: "已生成建议周期", ok: Boolean(currentCycle), hint: "点击生成/刷新建议" },
    { id: "proposal", label: "建议列表中存在可审阅条目", ok: hasCycleProposal, hint: "先完成建议生成" },
    { id: "risk", label: "执行前风控非阻断", ok: riskReadyForExecution, hint: "查看风控检查并消除阻断项" },
  ];
  const rebalanceChecklistAllPassed = rebalanceChecklist.every((item) => item.ok);
  const firstUnmetChecklist = rebalanceChecklist.find((item) => !item.ok);
  const cycleProgressText = !currentCycle
    ? "尚未生成建议"
    : (currentCycle.status === "completed"
      ? "已执行完成"
      : (currentCycle.status === "cancelled"
        ? "周期已取消（只读）"
        : (currentCycle.status === "executing"
          ? "执行中，请等待结果"
          : (selectedProposalCount > 0 ? "建议已勾选，可执行" : "请先勾选建议"))));

  return {
    stage,
    summary,
    currentRiskCheck,
    selectedProposalCount,
    isCurrentCycleTerminal,
    riskReadyForExecution,
    canEditCurrentCycle,
    canExecuteAll,
    canExecuteSelected,
    selectedProposalNotional,
    buyProposalCount,
    sellProposalCount,
    basketAssetCount,
    hasCycleProposal,
    rebalanceChecklist,
    rebalanceChecklistAllPassed,
    firstUnmetChecklist,
    cycleProgressText,
    firstBlockedActionReason: describeBlockedExecution({
      currentCycle,
      riskCheck: currentRiskCheck,
      selectedProposalCount,
    }),
  };
}
