"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";

import type { ExecutionReceipt } from "@/app/daa/dashboard/_hooks/dashboard/dashboardPageTypes";
import {
  executeWorkbenchRebalanceCycle,
  runWorkbenchRiskCheck,
  summarizeWorkbenchRebalanceExecution,
} from "@/src/daa/modules/workbench/workbenchApi";
import type { ExecuteRebalanceSummary, PreTradeRiskCheck, RebalanceCycle } from "@/src/daa/modules/workbench/workbenchTypes";

function isExecutableCycleStatus(status: RebalanceCycle["status"]): boolean {
  return status === "generated" || status === "reviewing";
}

export function useExecutionFlow(input: {
  currentCycle: RebalanceCycle | null;
  currentRiskCheck: PreTradeRiskCheck | null;
  selectedProposalCount: number;
  busy: boolean;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setRiskCheck: Dispatch<SetStateAction<PreTradeRiskCheck | null>>;
  loadBootstrap: (silent?: boolean, preferredCycleId?: string | null) => Promise<void>;
  mergeCycleState: (nextCycle: RebalanceCycle) => void;
}) {
  const [pendingExecuteMode, setPendingExecuteMode] = useState<"selected" | "all" | null>(null);
  const [executeSummary, setExecuteSummary] = useState<ExecuteRebalanceSummary | null>(null);
  const [executeSummaryLoading, setExecuteSummaryLoading] = useState(false);
  const [executeSummaryError, setExecuteSummaryError] = useState("");
  const [executionReceipt, setExecutionReceipt] = useState<ExecutionReceipt | null>(null);

  const executeCycleNow = useCallback(async (mode: "selected" | "all") => {
    if (!input.currentCycle || input.busy) return;
    input.setBusy(true);
    try {
      const selectedSymbols = input.currentCycle.proposals
        .filter((row) => mode === "all" || row.selected)
        .map((row) => row.symbol);
      const latestRisk = await runWorkbenchRiskCheck({ cycleId: input.currentCycle.cycleId, selectedSymbols });
      input.setRiskCheck(latestRisk);
      if (latestRisk.overallStatus === "block") {
        setExecutionReceipt({
          cycleId: input.currentCycle.cycleId,
          mode,
          status: "blocked",
          executed: 0,
          failed: 0,
          summary: "执行前风控阻断，订单未提交。",
          reason: "请先调整目标权重或建议勾选后重试。",
          ts: new Date().toISOString(),
        });
        toast.error("风控阻断，无法执行。请先调整目标权重或建议选项。");
        return;
      }
      const result = await executeWorkbenchRebalanceCycle({
        cycleId: input.currentCycle.cycleId,
        executeMode: mode,
      });
      input.mergeCycleState(result.cycle);
      const executed = result.cycle.executionSummary?.ordersExecuted || 0;
      const submitted = result.cycle.executionSummary?.ordersSubmitted || 0;
      const failed = result.cycle.executionSummary?.ordersFailed || 0;
      if (executed > 0 && submitted <= 0 && failed <= 0) {
        setExecutionReceipt({
          cycleId: result.cycle.cycleId,
          mode,
          status: "success",
          executed,
          submitted,
          failed,
          summary: `执行完成：${executed} 笔成功。`,
          ts: new Date().toISOString(),
        });
        toast.success(`执行完成：${executed} 笔成功`);
      } else if (submitted > 0 && executed <= 0 && failed <= 0) {
        setExecutionReceipt({
          cycleId: result.cycle.cycleId,
          mode,
          status: "submitted",
          executed,
          submitted,
          failed,
          summary: `订单已提交：${submitted} 笔等待后续成交或撤单更新。`,
          ts: new Date().toISOString(),
        });
        toast.message(`订单已提交：${submitted} 笔等待后续成交或撤单更新`);
      } else if ((executed > 0 || submitted > 0) && failed > 0) {
        const summary = submitted > 0
          ? `部分完成：成交 ${executed} 笔，已提交 ${submitted} 笔，失败 ${failed} 笔。`
          : `部分执行成功：成功 ${executed} 笔，失败 ${failed} 笔。`;
        setExecutionReceipt({
          cycleId: result.cycle.cycleId,
          mode,
          status: "partial",
          executed,
          submitted,
          failed,
          summary,
          ts: new Date().toISOString(),
        });
        toast.message(summary);
      } else if (executed > 0 || submitted > 0) {
        const summary = submitted > 0
          ? `本轮已成交 ${executed} 笔，另有 ${submitted} 笔仍在等待成交。`
          : `执行完成：${executed} 笔成功。`;
        setExecutionReceipt({
          cycleId: result.cycle.cycleId,
          mode,
          status: submitted > 0 ? "partial" : "success",
          executed,
          submitted,
          failed,
          summary,
          ts: new Date().toISOString(),
        });
        if (submitted > 0) {
          toast.message(summary);
        } else {
          toast.success(summary);
        }
      } else {
        const ticketSet = new Set(result.cycle.executedOrders || []);
        const rejected = result.logs.filter((row) => ticketSet.has(row.ticketId) && row.status === "rejected");
        const reason = rejected[0]?.rejectMessage || rejected[0]?.rejectCode || "订单被执行层拒绝";
        setExecutionReceipt({
          cycleId: result.cycle.cycleId,
          mode,
          status: "failed",
          executed: 0,
          submitted: 0,
          failed: failed || rejected.length || 0,
          summary: `执行失败：${failed || rejected.length || 0} 笔被拒绝。`,
          reason,
          ts: new Date().toISOString(),
        });
        toast.error(`执行失败：${failed || rejected.length || 0} 笔被拒绝。${reason}`);
      }
      await input.loadBootstrap(true, result.cycle.cycleId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "执行失败";
      setExecutionReceipt({
        cycleId: input.currentCycle.cycleId,
        mode,
        status: "failed",
        executed: 0,
        submitted: 0,
        failed: 0,
        summary: "执行请求失败，未完成下单。",
        reason: message,
        ts: new Date().toISOString(),
      });
      toast.error(message);
    } finally {
      input.setBusy(false);
    }
  }, [input.currentCycle, input.busy, input.setBusy, input.setRiskCheck, input.mergeCycleState, input.loadBootstrap]);

  const handleConfirmExecuteCycle = useCallback(async () => {
    if (!pendingExecuteMode) return;
    const mode = pendingExecuteMode;
    setPendingExecuteMode(null);
    setExecuteSummary(null);
    await executeCycleNow(mode);
  }, [executeCycleNow, pendingExecuteMode]);

  const handleOpenExecuteDialog = useCallback((mode: "selected" | "all") => {
    if (!input.currentCycle || input.busy) return;
    if (!isExecutableCycleStatus(input.currentCycle.status)) {
      toast.error("该周期不可执行，请生成新周期继续调仓。");
      return;
    }
    if (!input.currentRiskCheck || input.currentRiskCheck.overallStatus === "block") {
      toast.error(!input.currentRiskCheck ? "请先运行风控校验后再执行。" : "当前风控校验存在阻断项，请先处理风险提示后再执行。");
      return;
    }
    if (mode === "selected" && input.selectedProposalCount <= 0) {
      toast.error("请至少勾选一条建议后再执行");
      return;
    }
    setPendingExecuteMode(mode);
  }, [input.currentCycle, input.busy, input.currentRiskCheck, input.selectedProposalCount]);

  useEffect(() => {
    if (!pendingExecuteMode || !input.currentCycle) {
      setExecuteSummary(null);
      setExecuteSummaryLoading(false);
      setExecuteSummaryError("");
      return;
    }
    let alive = true;
    setExecuteSummaryLoading(true);
    setExecuteSummaryError("");
    void summarizeWorkbenchRebalanceExecution({
      cycleId: input.currentCycle.cycleId,
      executeMode: pendingExecuteMode,
    }).then((nextSummary) => {
      if (!alive) return;
      setExecuteSummary(nextSummary);
    }).catch((nextError) => {
      if (!alive) return;
      setExecuteSummary(null);
      setExecuteSummaryError(nextError instanceof Error ? nextError.message : "执行摘要生成失败，请重试后再执行。");
    }).finally(() => {
      if (!alive) return;
      setExecuteSummaryLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [input.currentCycle, pendingExecuteMode]);

  return {
    executionReceipt,
    clearExecutionReceipt: () => setExecutionReceipt(null),
    pendingExecuteMode,
    setPendingExecuteMode,
    executeSummary,
    executeSummaryLoading,
    executeSummaryError,
    handleOpenExecuteDialog,
    handleConfirmExecuteCycle,
  };
}
