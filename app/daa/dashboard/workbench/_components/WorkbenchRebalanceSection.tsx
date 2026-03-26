"use client";

import Link from "next/link";
import type { Dispatch, SetStateAction } from "react";
import { MoreHorizontal } from "lucide-react";

import type { WorkbenchTab } from "@/app/daa/dashboard/_hooks/useWorkbenchModel";
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
import type { DaaMarketContext, DaaMarketScopeContext } from "@/src/daa/modules/marketContext/marketContextTypes";
import type {
  PreTradeRiskCheck,
  RebalanceCycle,
  WorkbenchBootstrap,
  WorkbenchLlmFeedbackScore,
} from "@/src/daa/modules/workbench/workbenchTypes";

import {
  RebalanceAiInsight,
  RebalanceProposalList,
  RebalanceMarketSnapshot,
  RebalanceRiskAlerts,
  RebalanceExecutionChecklist,
  RebalanceCycleHistory,
  cycleStatusLabel,
  cycleStatusTone,
  triggerSourceLabel,
  type WorkbenchChecklistItem,
} from "./rebalance";

export type { WorkbenchChecklistItem };

type ProposalDecisionContext = RebalanceCycle["proposals"][number]["decisionContext"];

export function WorkbenchRebalanceSection(props: {
  bootstrap: WorkbenchBootstrap;
  cycles: RebalanceCycle[];
  currentCycle: RebalanceCycle | null;
  currentRiskCheck: PreTradeRiskCheck | null;
  summary: { holdingAssets: number; watchlistAssets: number };
  busy: boolean;
  marketContextExpanded: boolean;
  setMarketContextExpanded: Dispatch<SetStateAction<boolean>>;
  expandedProposalDecisionKeys: Record<string, boolean>;
  setExpandedProposalDecisionKeys: Dispatch<SetStateAction<Record<string, boolean>>>;
  llmFeedbackSubmittingByContext: Record<string, boolean>;
  llmFeedbackScoreByContext: Record<string, WorkbenchLlmFeedbackScore>;
  activeMarketContext: DaaMarketContext | null;
  primaryDecisionContext: ProposalDecisionContext | null;
  decisionMarketContext: DaaMarketContext | DaaMarketScopeContext | null;
  decisionMarketLabel: string;
  currentDecisionFacts: string[];
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
  onNavigateTab: (tab: WorkbenchTab) => void;
  onGenerateCycle: () => Promise<void>;
  onOpenExecuteDialog: (mode: "selected" | "all") => void;
  onCancelCycle: () => void;
  onSelectAllProposals: (selected: boolean) => Promise<void>;
  onToggleProposal: (assetKey: string, side: "BUY" | "SELL", selected: boolean) => Promise<void>;
  onSubmitLlmFeedback: (input: { contextId: string; type: "decision"; score: WorkbenchLlmFeedbackScore; comment?: string }) => Promise<void>;
  onSelectCycle: (cycle: RebalanceCycle) => void;
}) {
  return (
    <div className="space-y-4">
      {props.summary.holdingAssets <= 0 ? (
        <DaaSurfacePanel
          accent="amber"
          title="首次调仓引导"
          action={(
            <div className="flex flex-wrap gap-2">
              <DaaSurfaceActionButton tone="primary" onClick={() => props.onNavigateTab("watchlist")}>去观察列表添加标的</DaaSurfaceActionButton>
              <DaaSurfaceActionButton onClick={() => props.onNavigateTab("watchlist")}>去观察列表设权重</DaaSurfaceActionButton>
            </div>
          )}
        >
          <DaaSurfaceNoticeBox tone="amber" title="推荐路径" description="观察列表内添加标的并设置目标权重 → 生成建议 → 勾选并执行。" />
        </DaaSurfacePanel>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(24,34,54,0.96),rgba(13,19,32,0.98))] px-5 py-3.5 shadow-[0_4px_24px_rgba(0,0,0,0.18)]">
        <div className="flex flex-wrap items-center gap-2">
          {props.currentCycle ? (
            <>
              <span className="font-[var(--font-mono)] text-sm font-semibold text-[var(--text)]">{props.currentCycle.cycleId.slice(0, 8)}</span>
              <DaaSurfaceStatusPill tone={cycleStatusTone(props.currentCycle.status)}>{cycleStatusLabel(props.currentCycle.status)}</DaaSurfaceStatusPill>
              <DaaSurfaceStatusPill tone="slate">{triggerSourceLabel(props.currentCycle.triggerSource)}</DaaSurfaceStatusPill>
              <span className="hidden text-xs text-[var(--muted)] sm:inline">{props.cycleProgressText}</span>
            </>
          ) : (
            <span className="text-sm text-[var(--muted)]">尚未生成再平衡建议，点击右侧按钮开始</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DaaSurfaceActionButton tone="primary" onClick={() => void props.onGenerateCycle()} disabled={props.busy}>生成/刷新建议</DaaSurfaceActionButton>
          <DaaSurfaceActionButton tone="success" onClick={() => props.onOpenExecuteDialog("selected")} disabled={!props.canExecuteSelected}>
            执行选中{props.selectedProposalCount > 0 ? ` (${props.selectedProposalCount})` : ""}
          </DaaSurfaceActionButton>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <DaaSurfaceActionButton disabled={props.busy}>
                <MoreHorizontal className="h-3.5 w-3.5" />
                更多
              </DaaSurfaceActionButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 border-[var(--border)] bg-[rgba(8,12,20,0.98)] text-[var(--text)]">
              <DropdownMenuItem onClick={() => props.onOpenExecuteDialog("all")} disabled={!props.canExecuteAll}>执行全部（需确认）</DropdownMenuItem>
              <DropdownMenuItem onClick={() => props.onCancelCycle()} disabled={!props.currentCycle || props.isCurrentCycleTerminal || props.busy}>取消本次再平衡</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild><Link href="/daa/dashboard/trades">查看历史详情</Link></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_296px] xl:items-start">
        <div className="flex min-w-0 flex-col gap-4">
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

          <RebalanceAiInsight currentCycle={props.currentCycle} />

          {props.activeMarketContext ? (
            <RebalanceMarketSnapshot
              activeMarketContext={props.activeMarketContext}
              primaryDecisionContext={props.primaryDecisionContext}
              decisionMarketContext={props.decisionMarketContext}
              decisionMarketLabel={props.decisionMarketLabel}
              currentDecisionFacts={props.currentDecisionFacts}
              marketContextExpanded={props.marketContextExpanded}
              setMarketContextExpanded={props.setMarketContextExpanded}
            />
          ) : null}

          {props.currentRiskCheck ? (
            <RebalanceRiskAlerts currentRiskCheck={props.currentRiskCheck} />
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
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
      </div>
    </div>
  );
}
