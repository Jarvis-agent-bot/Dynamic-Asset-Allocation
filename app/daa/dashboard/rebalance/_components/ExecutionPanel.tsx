"use client";

import { Loader2 } from "lucide-react";

import { formatCurrency } from "@/app/daa/dashboard/_components/daaFormatters";
import {
  DaaSurfaceActionButton,
  DaaSurfaceStatusPill,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import {
  riskOverallTone,
  riskStatusLabel,
  riskRuleLabel,
  riskItemTone,
  cycleStatusLabel,
  cycleStatusTone,
} from "@/app/daa/dashboard/_shared/rebalance/rebalanceLabels";
import type { RebalanceCycle } from "@/src/daa/modules/workbench/workbenchTypes";
import type { PreTradeRiskCheck } from "@/src/daa/modules/rebalance/rebalanceTypes";
import { topRiskItems } from "./rebalanceDecisionState";

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
    <div className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="space-y-3">
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
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs">
                <div className="text-[var(--muted)]">选中</div>
                <div className="mt-1 font-[var(--font-mono)] text-[var(--text)]">
                  {props.selectedProposalCount} / {cycle?.proposals?.length ?? 0}
                </div>
              </div>
              <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs">
                <div className="text-[var(--muted)]">金额</div>
                <div className="mt-1 font-[var(--font-mono)] text-[var(--text)]">
                  {hasSelected ? formatCurrency(props.selectedProposalNotional, props.baseCurrency) : "未选择"}
                </div>
              </div>
              {riskCheck ? (
                <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs">
                  <div className="mb-1 text-[var(--muted)]">风控</div>
                  <DaaSurfaceStatusPill tone={riskOverallTone(riskCheck.overallStatus)}>
                    {riskStatusLabel(riskCheck.overallStatus)}
                  </DaaSurfaceStatusPill>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* 风控 top-3 摘要 */}
          {(() => {
            const top = topRiskItems(riskCheck, 3);
            if (top.length === 0) return null;
            const blocked = riskCheck?.overallStatus === "block";
            return (
              <div className={`rounded-[10px] border px-3 py-2.5 ${blocked ? "border-red-500/22 bg-red-500/8" : "border-amber-400/22 bg-amber-500/8"}`}>
                <div className={`mb-1.5 text-[10px] font-semibold uppercase tracking-wider ${blocked ? "text-red-200" : "text-amber-200"}`}>
                  {blocked ? "执行前阻断" : "执行前提示"} · {top.length}/{(riskCheck?.items?.length ?? 0)} 项
                </div>
                <ul className="space-y-1.5">
                  {top.map((item, idx) => (
                    <li key={`${item.rule}-${idx}`} className="flex items-start gap-2 text-xs leading-5">
                      <DaaSurfaceStatusPill tone={riskItemTone(item.status)} className="text-[9px]">
                        {riskRuleLabel(item.rule)}
                      </DaaSurfaceStatusPill>
                      <span className="min-w-0 flex-1 text-[var(--muted)]">{item.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}
        </div>

        {/* 操作按钮 */}
        <div className="space-y-2">
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
    </div>
  );
}
