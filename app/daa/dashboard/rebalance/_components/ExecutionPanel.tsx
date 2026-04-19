"use client";

import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCurrency } from "@/app/daa/dashboard/_components/daaFormatters";
import {
  DaaSurfaceActionButton,
  DaaSurfaceStatusPill,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import {
  riskOverallTone,
  riskStatusLabel,
  cycleStatusLabel,
  cycleStatusTone,
} from "@/app/daa/dashboard/_shared/rebalance/rebalanceLabels";
import type { RebalanceCycle, PreTradeRiskCheck } from "@/src/daa/modules/workbench/workbenchTypes";

export function ExecutionPanel(props: {
  currentCycle: RebalanceCycle | null;
  currentRiskCheck: PreTradeRiskCheck | null;
  baseCurrency: string;
  busy: boolean;
  selectedProposalCount: number;
  selectedProposalNotional: number;
  canExecuteAll: boolean;
  canExecuteSelected: boolean;
  isCurrentCycleTerminal: boolean;
  rebalanceChecklistAllPassed: boolean;
  onGenerateCycle: () => Promise<void>;
  onOpenExecuteDialog: (mode: "all" | "selected") => void;
  onCancelCycle: () => void;
}) {
  const cycle = props.currentCycle;
  const riskCheck = props.currentRiskCheck;
  const hasCycle = !!cycle;
  const hasProposals = (cycle?.proposals?.length ?? 0) > 0;
  const hasSelected = props.selectedProposalCount > 0;

  return (
    <div className="space-y-3 rounded-[14px] border border-[var(--border)] bg-[rgba(13,19,32,0.92)] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--faint)]">执行面板</div>

      {/* 周期状态 */}
      {cycle ? (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-[var(--font-mono)] text-xs text-[var(--muted)]">{cycle.cycleId.slice(0, 8)}</span>
            <DaaSurfaceStatusPill tone={cycleStatusTone(cycle.status)}>
              {cycleStatusLabel(cycle.status)}
            </DaaSurfaceStatusPill>
          </div>
        </div>
      ) : null}

      {/* 选中统计 */}
      {hasCycle && hasProposals ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--muted)]">选中</span>
            <span className="font-[var(--font-mono)] text-[var(--text)]">
              {props.selectedProposalCount} / {cycle?.proposals?.length ?? 0}
            </span>
          </div>
          {hasSelected ? (
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--muted)]">金额</span>
              <span className="font-[var(--font-mono)] text-[var(--text)]">
                {formatCurrency(props.selectedProposalNotional, props.baseCurrency)}
              </span>
            </div>
          ) : null}

          {/* 风控状态 */}
          {riskCheck ? (
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--muted)]">风控</span>
              <DaaSurfaceStatusPill tone={riskOverallTone(riskCheck.overallStatus)}>
                {riskStatusLabel(riskCheck.overallStatus)}
              </DaaSurfaceStatusPill>
            </div>
          ) : null}

          {/* 风控阻断原因 */}
          {riskCheck?.overallStatus === "block" ? (
            <div className="rounded-[8px] border border-red-500/20 bg-red-500/8 px-3 py-2 text-xs text-red-300">
              {riskCheck.items.find((i) => i.status === "block")?.message || "风控阻断"}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 操作按钮 */}
      <div className="space-y-2 pt-1">
        {!hasCycle ? (
          <DaaSurfaceActionButton
            tone="primary"
            className="h-10 w-full justify-center rounded-[12px]"
            onClick={() => void props.onGenerateCycle()}
            disabled={props.busy}
          >
            {props.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {props.busy ? "生成中..." : "生成调仓建议"}
          </DaaSurfaceActionButton>
        ) : props.isCurrentCycleTerminal ? (
          <DaaSurfaceActionButton
            tone="primary"
            className="h-10 w-full justify-center rounded-[12px]"
            onClick={() => void props.onGenerateCycle()}
            disabled={props.busy}
          >
            {props.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            生成新一轮建议
          </DaaSurfaceActionButton>
        ) : (
          <>
            {hasSelected ? (
              <DaaSurfaceActionButton
                tone="success"
                className="h-10 w-full justify-center rounded-[12px]"
                onClick={() => props.onOpenExecuteDialog("selected")}
                disabled={!props.canExecuteSelected || props.busy}
              >
                执行选中 ({props.selectedProposalCount} 笔)
              </DaaSurfaceActionButton>
            ) : null}

            {props.canExecuteAll ? (
              <DaaSurfaceActionButton
                tone="slate"
                className="h-9 w-full justify-center rounded-[10px] text-xs"
                onClick={() => props.onOpenExecuteDialog("all")}
                disabled={props.busy}
              >
                执行全部
              </DaaSurfaceActionButton>
            ) : null}

            <DaaSurfaceActionButton
              tone="slate"
              className="h-8 w-full justify-center rounded-[10px] text-xs"
              onClick={props.onCancelCycle}
              disabled={props.busy}
            >
              取消本次调仓
            </DaaSurfaceActionButton>
          </>
        )}
      </div>
    </div>
  );
}
