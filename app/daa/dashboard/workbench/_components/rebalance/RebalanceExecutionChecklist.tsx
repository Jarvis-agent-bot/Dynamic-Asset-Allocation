"use client";

import { CheckCircle2, Circle } from "lucide-react";

import {
  DeepLedgerActionButton,
  DeepLedgerPanel,
  DeepLedgerStatusPill,
  deepLedgerSubtlePanelClassName,
} from "@/app/daa/dashboard/_components/DeepLedgerUI";
import { formatCurrency } from "@/app/daa/dashboard/_components/daaFormatters";
import { cn } from "@/lib/utils";
import type { PreTradeRiskCheck, RebalanceCycle, WorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchTypes";

import { riskOverallTone, riskStatusLabel } from "./rebalanceLabels";

export type WorkbenchChecklistItem = {
  id: string;
  label: string;
  ok: boolean;
  hint: string;
};

export function RebalanceExecutionChecklist(props: {
  bootstrap: WorkbenchBootstrap;
  currentCycle: RebalanceCycle | null;
  currentRiskCheck: PreTradeRiskCheck | null;
  busy: boolean;
  selectedProposalCount: number;
  selectedProposalNotional: number;
  canExecuteSelected: boolean;
  rebalanceChecklist: WorkbenchChecklistItem[];
  rebalanceChecklistAllPassed: boolean;
  firstUnmetChecklist?: WorkbenchChecklistItem;
  onOpenExecuteDialog: (mode: "selected" | "all") => void;
  onGenerateCycle: () => Promise<void>;
}) {
  return (
    <DeepLedgerPanel
      accent={props.rebalanceChecklistAllPassed ? "green" : "amber"}
      title="执行确认"
      subtitle={props.rebalanceChecklistAllPassed ? "条件已满足，可以执行。" : `还差：${props.firstUnmetChecklist?.hint || "请按清单检查"}`}
    >
      <div className="space-y-3">
        <div className={cn(deepLedgerSubtlePanelClassName, "grid grid-cols-2 gap-x-4 gap-y-2.5 px-4 py-3.5 text-sm")}>
          <div className="text-[var(--faint)]">已选建议</div>
          <div className="text-right font-[var(--font-mono)] text-[var(--text)]">{props.selectedProposalCount} / {props.currentCycle?.proposals.length ?? 0}</div>
          <div className="text-[var(--faint)]">预计成交</div>
          <div className="text-right font-[var(--font-mono)] text-[var(--text)]">{formatCurrency(props.selectedProposalNotional, props.bootstrap.baseCurrency)}</div>
          <div className="text-[var(--faint)]">风控状态</div>
          <div className="flex justify-end">
            {props.currentRiskCheck
              ? <DeepLedgerStatusPill tone={riskOverallTone(props.currentRiskCheck.overallStatus)}>{riskStatusLabel(props.currentRiskCheck.overallStatus)}</DeepLedgerStatusPill>
              : <span className="text-xs text-[var(--faint)]">待勾选后检查</span>}
          </div>
        </div>

        <DeepLedgerActionButton tone="success" className="w-full justify-center" onClick={() => props.onOpenExecuteDialog("selected")} disabled={!props.canExecuteSelected}>
          执行选中{props.selectedProposalCount > 0 ? ` (${props.selectedProposalCount})` : ""}
        </DeepLedgerActionButton>
        <DeepLedgerActionButton tone="primary" className="w-full justify-center" onClick={() => void props.onGenerateCycle()} disabled={props.busy}>
          {props.busy ? "处理中…" : "生成/刷新建议"}
        </DeepLedgerActionButton>

        <div className="border-t border-[var(--border)] pt-3">
          <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">执行条件</div>
          <div className="space-y-2">
            {props.rebalanceChecklist.map((item) => (
              <div key={item.id} className="flex items-center gap-2 text-xs">
                {item.ok
                  ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  : <Circle className="h-3.5 w-3.5 shrink-0 text-[var(--faint)]" />}
                <span className={item.ok ? "text-[var(--text)]" : "text-[var(--muted)]"}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DeepLedgerPanel>
  );
}
