"use client";

import { useMemo, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronUp, Circle, MoreHorizontal } from "lucide-react";

import type { DashboardTab } from "@/app/daa/dashboard/_hooks/useDashboardModel";
import {
  DaaSurfaceActionButton,
  DaaSurfaceNoticeBox,
  DaaSurfacePanel,
  DaaSurfaceStatusPill,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type {
  PreTradeRiskCheck,
  RebalanceCycle,
  WorkbenchBootstrap,
  WorkbenchLlmFeedbackScore,
} from "@/src/daa/modules/workbench/workbenchTypes";

import {
  DriftBarChart,
  WhatIfPreview,
  RebalanceProposalList,
  RebalanceExecutionChecklist,
  RebalanceCycleHistory,
  cycleStatusLabel,
  cycleStatusTone,
  triggerSourceLabel,
  type WorkbenchChecklistItem,
} from "@/app/daa/dashboard/workbench/_components/rebalance";
import { RiskGateStep } from "./RiskGateStep";
import { deriveWorkflowStep, WORKFLOW_STEPS, type WorkflowStep } from "./workflowSteps";

// ─── Stepper indicator ───

function StepIndicator(props: { stepIndex: number; currentIndex: number; label: string }) {
  const done = props.currentIndex > props.stepIndex;
  const active = props.currentIndex === props.stepIndex;
  return (
    <div className="flex items-center gap-2">
      <div className={cn(
        "flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
        done ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
          : active ? "border-[var(--primary)] bg-[var(--primary)]/20 text-[var(--primary)]"
          : "border-[var(--border)] text-[var(--faint)]",
      )}>
        {done ? <Check className="h-3 w-3" /> : props.stepIndex}
      </div>
      <span className={cn(
        "text-xs font-medium",
        active ? "text-[var(--text)]" : done ? "text-emerald-400" : "text-[var(--faint)]",
      )}>
        {props.label}
      </span>
    </div>
  );
}

// ─── Main component ───

export function ActionWorkflow(props: {
  bootstrap: WorkbenchBootstrap;
  cycles: RebalanceCycle[];
  currentCycle: RebalanceCycle | null;
  currentRiskCheck: PreTradeRiskCheck | null;
  summary: { holdingAssets: number; watchlistAssets: number };
  busy: boolean;
  driftCount: number;
  expandedProposalDecisionKeys: Record<string, boolean>;
  setExpandedProposalDecisionKeys: Dispatch<SetStateAction<Record<string, boolean>>>;
  llmFeedbackSubmittingByContext: Record<string, boolean>;
  llmFeedbackScoreByContext: Record<string, WorkbenchLlmFeedbackScore>;
  canEditCurrentCycle: boolean;
  canExecuteAll: boolean;
  canExecuteSelected: boolean;
  isCurrentCycleTerminal: boolean;
  cycleProgressText: string;
  selectedProposalCount: number;
  selectedProposalNotional: number;
  buyProposalCount: number;
  sellProposalCount: number;
  rebalanceChecklist: WorkbenchChecklistItem[];
  rebalanceChecklistAllPassed: boolean;
  firstUnmetChecklist?: WorkbenchChecklistItem;
  onNavigateTab: (tab: DashboardTab) => void;
  onGenerateCycle: () => Promise<void>;
  onOpenExecuteDialog: (mode: "selected" | "all") => void;
  onCancelCycle: () => void;
  onSelectAllProposals: (selected: boolean) => Promise<void>;
  onToggleProposal: (assetKey: string, side: "BUY" | "SELL", selected: boolean) => Promise<void>;
  onSubmitLlmFeedback: (input: { contextId: string; type: "decision"; score: WorkbenchLlmFeedbackScore; comment?: string }) => Promise<void>;
  onSelectCycle: (cycle: RebalanceCycle) => void;
}) {
  const stepMeta = useMemo(() => deriveWorkflowStep({
    currentCycle: props.currentCycle,
    currentRiskCheck: props.currentRiskCheck,
    driftCount: props.driftCount,
    selectedProposalCount: props.selectedProposalCount,
    isCurrentCycleTerminal: props.isCurrentCycleTerminal,
    rebalanceChecklistAllPassed: props.rebalanceChecklistAllPassed,
    busy: props.busy,
  }), [props.currentCycle, props.currentRiskCheck, props.driftCount, props.selectedProposalCount, props.isCurrentCycleTerminal, props.rebalanceChecklistAllPassed, props.busy]);

  const isIdle = stepMeta.step === "idle";
  const isComplete = stepMeta.step === "complete";

  // ── idle 折叠态 ──
  if (isIdle) {
    return (
      <div className="rounded-[18px] border border-[var(--border)] bg-[rgba(8,12,20,0.42)] px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-full border border-emerald-500 bg-emerald-500/20">
              <Check className="h-3 w-3 text-emerald-400" />
            </div>
            <div>
              <span className="text-sm font-medium text-emerald-400">{stepMeta.label}</span>
              <span className="ml-2 text-xs text-[var(--muted)]">{stepMeta.hint}</span>
            </div>
          </div>
          <DaaSurfaceActionButton onClick={() => void props.onGenerateCycle()} disabled={props.busy}>
            手动生成建议
          </DaaSurfaceActionButton>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[18px] border border-[var(--border)] bg-[rgba(8,12,20,0.42)]">
      {/* ── Stepper 导航条 ── */}
      <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-4 overflow-x-auto">
          {WORKFLOW_STEPS.map((ws, i) => (
            <StepIndicator key={ws.step} stepIndex={i + 1} currentIndex={stepMeta.index} label={ws.label} />
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {props.currentCycle && (
            <>
              <span className="font-[var(--font-mono)] text-xs text-[var(--muted)]">{props.currentCycle.cycleId.slice(0, 8)}</span>
              <DaaSurfaceStatusPill tone={cycleStatusTone(props.currentCycle.status)}>{cycleStatusLabel(props.currentCycle.status)}</DaaSurfaceStatusPill>
            </>
          )}
        </div>
      </div>

      {/* ── 当前步骤状态说明 ── */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[var(--border)] bg-[rgba(13,19,32,0.5)]">
        <div className="text-sm">
          <span className="font-semibold text-[var(--text)]">{stepMeta.label}</span>
          <span className="ml-2 text-[var(--muted)]">{stepMeta.hint}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* 主操作按钮：根据步骤动态显示 */}
          {(stepMeta.step === "detect" || stepMeta.step === "generate" || isComplete) && (
            <DaaSurfaceActionButton tone="primary" onClick={() => void props.onGenerateCycle()} disabled={props.busy}>
              {isComplete ? "生成新周期" : "生成建议"}
            </DaaSurfaceActionButton>
          )}
          {(stepMeta.step === "review" || stepMeta.step === "risk_gate" || stepMeta.step === "execute") && (
            <DaaSurfaceActionButton tone="success" onClick={() => props.onOpenExecuteDialog("selected")} disabled={!props.canExecuteSelected}>
              执行选中{props.selectedProposalCount > 0 ? ` (${props.selectedProposalCount})` : ""}
            </DaaSurfaceActionButton>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <DaaSurfaceActionButton disabled={props.busy}>
                <MoreHorizontal className="h-3.5 w-3.5" />
              </DaaSurfaceActionButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 border-[var(--border)] bg-[rgba(8,12,20,0.98)] text-[var(--text)]">
              <DropdownMenuItem onClick={() => void props.onGenerateCycle()} disabled={props.busy}>刷新建议</DropdownMenuItem>
              <DropdownMenuItem onClick={() => props.onOpenExecuteDialog("all")} disabled={!props.canExecuteAll}>执行全部（需确认）</DropdownMenuItem>
              <DropdownMenuItem onClick={() => props.onCancelCycle()} disabled={!props.currentCycle || props.isCurrentCycleTerminal || props.busy}>取消本次调仓</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild><Link href="/daa/dashboard/trades">查看历史详情</Link></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── 步骤内容区 ── */}
      <div className="p-4 space-y-4">
        {/* 首次引导 */}
        {props.summary.holdingAssets <= 0 && (
          <DaaSurfaceNoticeBox tone="amber" title="推荐路径" description="观察列表内添加标的并设置目标权重 → 生成建议 → 勾选并执行。" />
        )}

        {/* Step 1 (检测): 偏移分布图 */}
        {(stepMeta.step === "detect" || stepMeta.step === "generate") && props.driftCount > 0 && (
          <DriftBarChart
            rows={props.bootstrap.assetUniverse}
            thresholdPct={props.bootstrap.rebalanceStrategy?.drift?.thresholdPct ?? 5}
          />
        )}

        {/* Step 3 (审阅): 建议列表 */}
        {props.currentCycle && props.currentCycle.proposals.length > 0 && (
          <RebalanceProposalList
            bootstrap={props.bootstrap}
            currentCycle={props.currentCycle}
            currentRiskCheck={props.currentRiskCheck}
            busy={props.busy}
            isCurrentCycleTerminal={props.isCurrentCycleTerminal}
            canEditCurrentCycle={props.canEditCurrentCycle}
            buyProposalCount={props.buyProposalCount}
            sellProposalCount={props.sellProposalCount}
            selectedProposalNotional={props.selectedProposalNotional}
            expandedProposalDecisionKeys={props.expandedProposalDecisionKeys}
            setExpandedProposalDecisionKeys={props.setExpandedProposalDecisionKeys}
            llmFeedbackSubmittingByContext={props.llmFeedbackSubmittingByContext}
            llmFeedbackScoreByContext={props.llmFeedbackScoreByContext}
            onSelectAllProposals={props.onSelectAllProposals}
            onToggleProposal={props.onToggleProposal}
            onSubmitLlmFeedback={props.onSubmitLlmFeedback}
          />
        )}

        {/* Step 3.5: What-If 预览（审阅时展示当前 vs 执行后） */}
        {props.currentCycle && props.currentCycle.proposals.some((p) => p.selected) && (
          <WhatIfPreview
            holdings={props.bootstrap.assetUniverse}
            proposals={props.currentCycle.proposals}
            cash={props.bootstrap.account.cash}
            baseCurrency={props.bootstrap.baseCurrency}
          />
        )}

        {/* Step 4 (风控门禁): Before/After 对比 */}
        {props.currentCycle && props.selectedProposalCount > 0 && (
          <RiskGateStep
            bootstrap={props.bootstrap}
            currentCycle={props.currentCycle}
            currentRiskCheck={props.currentRiskCheck}
          />
        )}

        {/* Step 5 (执行): 执行清单 */}
        {props.currentCycle && (
          <div className="grid gap-4 xl:grid-cols-[1fr_296px] xl:items-start">
            <RebalanceExecutionChecklist
              bootstrap={props.bootstrap}
              currentCycle={props.currentCycle}
              currentRiskCheck={props.currentRiskCheck}
              selectedProposalCount={props.selectedProposalCount}
              selectedProposalNotional={props.selectedProposalNotional}
              rebalanceChecklist={props.rebalanceChecklist}
              rebalanceChecklistAllPassed={props.rebalanceChecklistAllPassed}
              firstUnmetChecklist={props.firstUnmetChecklist}
            />

            <RebalanceCycleHistory
              cycles={props.cycles}
              currentCycleId={props.currentCycle?.cycleId ?? null}
              onSelectCycle={props.onSelectCycle}
            />
          </div>
        )}
      </div>
    </div>
  );
}
