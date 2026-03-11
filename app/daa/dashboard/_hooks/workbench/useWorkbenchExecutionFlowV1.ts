"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";

import type { ExecutionReceiptV1 } from "@/app/daa/dashboard/_hooks/workbench/workbenchPageTypesV1";
import {
  executeWorkbenchRebalanceCycleV1,
  runWorkbenchRiskCheckV1,
  summarizeWorkbenchRebalanceExecutionV1,
} from "@/src/daa/modules/workbench/workbenchApiV1";
import type { ExecuteRebalanceSummaryV1, PreTradeRiskCheckV1, RebalanceCycleV1 } from "@/src/daa/modules/workbench/workbenchTypesV1";

function isExecutableCycleStatusV1(status: RebalanceCycleV1["status"]): boolean {
  return status === "generated" || status === "reviewing";
}

export function useWorkbenchExecutionFlowV1(input: {
  currentCycle: RebalanceCycleV1 | null;
  currentRiskCheck: PreTradeRiskCheckV1 | null;
  selectedProposalCount: number;
  busy: boolean;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setRiskCheck: Dispatch<SetStateAction<PreTradeRiskCheckV1 | null>>;
  loadBootstrap: (silent?: boolean, preferredCycleId?: string | null) => Promise<void>;
  mergeCycleState: (nextCycle: RebalanceCycleV1) => void;
}) {
  const [pendingExecuteMode, setPendingExecuteMode] = useState<"selected" | "all" | null>(null);
  const [executeSummary, setExecuteSummary] = useState<ExecuteRebalanceSummaryV1 | null>(null);
  const [executeSummaryLoading, setExecuteSummaryLoading] = useState(false);
  const [executeSummaryError, setExecuteSummaryError] = useState("");
  const [executionReceipt, setExecutionReceipt] = useState<ExecutionReceiptV1 | null>(null);

  const executeCycleNow = useCallback(async (mode: "selected" | "all") => {
    if (!input.currentCycle || input.busy) return;
    input.setBusy(true);
    try {
      const selectedSymbols = input.currentCycle.proposals
        .filter((row) => mode === "all" || row.selected)
        .map((row) => row.symbol);
      const latestRisk = await runWorkbenchRiskCheckV1({ cycleId: input.currentCycle.cycleId, selectedSymbols });
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
      const result = await executeWorkbenchRebalanceCycleV1({
        cycleId: input.currentCycle.cycleId,
        executeMode: mode,
      });
      input.mergeCycleState(result.cycle);
      const executed = result.cycle.executionSummary?.ordersExecuted || 0;
      const failed = result.cycle.executionSummary?.ordersFailed || 0;
      if (executed > 0 && failed <= 0) {
        setExecutionReceipt({
          cycleId: result.cycle.cycleId,
          mode,
          status: "success",
          executed,
          failed,
          summary: `执行完成：${executed} 笔成功。`,
          ts: new Date().toISOString(),
        });
        toast.success(`执行完成：${executed} 笔成功`);
      } else if (executed > 0 && failed > 0) {
        setExecutionReceipt({
          cycleId: result.cycle.cycleId,
          mode,
          status: "partial",
          executed,
          failed,
          summary: `部分执行成功：成功 ${executed} 笔，失败 ${failed} 笔。`,
          ts: new Date().toISOString(),
        });
        toast.message(`部分执行成功：成功 ${executed} 笔，失败 ${failed} 笔`);
      } else {
        const ticketSet = new Set(result.cycle.executedOrders || []);
        const rejected = result.logs.filter((row) => ticketSet.has(row.ticketId) && row.status === "rejected");
        const reason = rejected[0]?.rejectMessage || rejected[0]?.rejectCode || "订单被执行层拒绝";
        setExecutionReceipt({
          cycleId: result.cycle.cycleId,
          mode,
          status: "failed",
          executed: 0,
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
        failed: 0,
        summary: "执行请求失败，未完成下单。",
        reason: message,
        ts: new Date().toISOString(),
      });
      toast.error(message);
    } finally {
      input.setBusy(false);
    }
  }, [input]);

  const handleConfirmExecuteCycle = useCallback(async () => {
    if (!pendingExecuteMode) return;
    const mode = pendingExecuteMode;
    setPendingExecuteMode(null);
    setExecuteSummary(null);
    await executeCycleNow(mode);
  }, [executeCycleNow, pendingExecuteMode]);

  const handleOpenExecuteDialog = useCallback((mode: "selected" | "all") => {
    if (!input.currentCycle || input.busy) return;
    if (!isExecutableCycleStatusV1(input.currentCycle.status)) {
      toast.error("该周期不可执行，请生成新周期继续调仓。");
      return;
    }
    if (input.currentRiskCheck?.overallStatus === "block") {
      toast.error("当前风控校验存在阻断项，请先处理风险提示后再执行。");
      return;
    }
    if (mode === "selected" && input.selectedProposalCount <= 0) {
      toast.error("请至少勾选一条建议后再执行");
      return;
    }
    setPendingExecuteMode(mode);
  }, [input]);

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
    void summarizeWorkbenchRebalanceExecutionV1({
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
