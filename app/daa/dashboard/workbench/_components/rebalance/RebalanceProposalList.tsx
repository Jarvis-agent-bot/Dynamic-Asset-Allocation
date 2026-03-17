"use client";

import type { Dispatch, SetStateAction } from "react";
import { AlertCircle, CheckSquare2, TriangleAlert, XSquare } from "lucide-react";

import {
  DeepLedgerActionButton,
  DeepLedgerEmptyState,
  DeepLedgerNoticeBox,
  DeepLedgerPanel,
  DeepLedgerStatusPill,
  deepLedgerSubtlePanelClassName,
} from "@/app/daa/dashboard/_components/DeepLedgerUI";
import { formatCurrency } from "@/app/daa/dashboard/_components/daaFormatters";
import { cn } from "@/lib/utils";
import type {
  RebalanceCycle,
  WorkbenchBootstrap,
  WorkbenchLlmFeedbackScore,
} from "@/src/daa/modules/workbench/workbenchTypes";

import { cycleStatusTone, marketRegimeLabel, riskOverallTone, riskStatusLabel } from "./rebalanceLabels";

export function RebalanceProposalList(props: {
  bootstrap: WorkbenchBootstrap;
  currentCycle: RebalanceCycle | null;
  currentRiskCheck: { overallStatus: "pass" | "warn" | "block" } | null;
  busy: boolean;
  isCurrentCycleTerminal: boolean;
  canEditCurrentCycle: boolean;
  buyProposalCount: number;
  sellProposalCount: number;
  selectedProposalNotional: number;
  expandedProposalDecisionKeys: Record<string, boolean>;
  setExpandedProposalDecisionKeys: Dispatch<SetStateAction<Record<string, boolean>>>;
  llmFeedbackSubmittingByContext: Record<string, boolean>;
  llmFeedbackScoreByContext: Record<string, WorkbenchLlmFeedbackScore>;
  onSelectAllProposals: (selected: boolean) => Promise<void>;
  onToggleProposal: (assetKey: string, side: "BUY" | "SELL", selected: boolean) => Promise<void>;
  onSubmitLlmFeedback: (input: { contextId: string; type: "decision"; score: WorkbenchLlmFeedbackScore; comment?: string }) => Promise<void>;
}) {
  return (
    <DeepLedgerPanel
      accent={props.currentCycle ? cycleStatusTone(props.currentCycle.status) : "slate"}
      title="本次建议"
      subtitle={props.currentCycle
        ? `周期 ${props.currentCycle.cycleId.slice(0, 8)} · 买入 ${props.buyProposalCount} · 卖出 ${props.sellProposalCount}`
        : "点击「生成/刷新建议」获取调仓建议"}
      action={(
        <div className="flex flex-wrap gap-2">
          {props.currentRiskCheck ? (
            <DeepLedgerStatusPill tone={riskOverallTone(props.currentRiskCheck.overallStatus)}>
              风控 {riskStatusLabel(props.currentRiskCheck.overallStatus)}
            </DeepLedgerStatusPill>
          ) : null}
          {props.selectedProposalNotional > 0 ? (
            <DeepLedgerStatusPill tone="cyan">
              已选 {formatCurrency(props.selectedProposalNotional, props.bootstrap.baseCurrency)}
            </DeepLedgerStatusPill>
          ) : null}
        </div>
      )}
    >
      {props.currentCycle ? (
        <div className="space-y-4">
          {props.isCurrentCycleTerminal ? (
            <DeepLedgerNoticeBox tone="slate" icon={<AlertCircle className="h-4 w-4" />} title="当前周期已终态" description="该周期只读；如需继续调仓，请生成新周期。" />
          ) : null}
          {props.currentCycle.triggerSource === "risk" ? (
            <DeepLedgerNoticeBox tone="amber" icon={<TriangleAlert className="h-4 w-4" />} title="风险触发建议待处理" description="该周期由止盈/止损阈值触发，请先看理由和风控，再决定是否执行。" />
          ) : null}

          {props.currentCycle.proposals.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-2">
                <DeepLedgerActionButton tone="success" onClick={() => void props.onSelectAllProposals(true)} disabled={!props.canEditCurrentCycle}>
                  <CheckSquare2 className="h-3.5 w-3.5" />
                  一键全选
                </DeepLedgerActionButton>
                <DeepLedgerActionButton tone="danger" onClick={() => void props.onSelectAllProposals(false)} disabled={!props.canEditCurrentCycle}>
                  <XSquare className="h-3.5 w-3.5" />
                  清空勾选
                </DeepLedgerActionButton>
              </div>

              <div className="space-y-3">
                {props.currentCycle.proposals.map((row) => {
                  const proposalKey = `${row.assetKey}-${row.side}`;
                  const contextId = `decision:${props.currentCycle?.cycleId}:${row.assetKey}:${row.side}`;
                  const decisionExpanded = Boolean(props.expandedProposalDecisionKeys[proposalKey]);
                  return (
                    <div
                      key={proposalKey}
                      className={cn(
                        "rounded-[18px] border p-4 transition-all",
                        row.selected
                          ? "border-[rgba(56,189,248,0.28)] bg-[rgba(56,189,248,0.08)]"
                          : "border-[var(--border)] bg-[rgba(8,12,20,0.48)]",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 shrink-0 accent-[var(--primary)]"
                          checked={row.selected}
                          onChange={(e) => void props.onToggleProposal(row.assetKey, row.side, e.target.checked)}
                          disabled={!props.canEditCurrentCycle}
                        />
                        <div className="min-w-0 flex-1 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-[var(--font-mono)] text-[15px] font-semibold text-[var(--text)]">{row.symbol}</span>
                            <DeepLedgerStatusPill tone={row.side === "BUY" ? "green" : "amber"}>{row.side === "BUY" ? "买入" : "卖出"}</DeepLedgerStatusPill>
                            {row.currency !== props.bootstrap.baseCurrency ? <DeepLedgerStatusPill tone="slate">{row.currency}</DeepLedgerStatusPill> : null}
                            <DeepLedgerStatusPill tone={row.selected ? "cyan" : "slate"}>{row.selected ? "已纳入执行" : "未勾选"}</DeepLedgerStatusPill>
                          </div>

                          <div className="grid gap-2 sm:grid-cols-3">
                            <div className={cn(deepLedgerSubtlePanelClassName, "px-3 py-2.5")}>
                              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">建议数量</div>
                              <div className="mt-1.5 font-[var(--font-mono)] text-[15px] text-[var(--text)]">{row.suggestedQty.toFixed(4)}</div>
                            </div>
                            <div className={cn(deepLedgerSubtlePanelClassName, "px-3 py-2.5")}>
                              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">建议金额</div>
                              <div className="mt-1.5 font-[var(--font-mono)] text-[15px] text-[var(--text)]">{formatCurrency(row.suggestedNotional, props.bootstrap.baseCurrency)}</div>
                            </div>
                            <div className={cn(deepLedgerSubtlePanelClassName, "px-3 py-2.5")}>
                              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">参考价格</div>
                              <div className="mt-1.5 font-[var(--font-mono)] text-[15px] text-[var(--text)]">{formatCurrency(row.price, row.currency)}</div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => props.setExpandedProposalDecisionKeys((prev) => ({ ...prev, [proposalKey]: !prev[proposalKey] }))}
                            className="flex items-center gap-1.5 text-xs text-[var(--muted)] transition-colors hover:text-[var(--text)]"
                          >
                            <span className="text-[9px]">{decisionExpanded ? "▼" : "▶"}</span>
                            执行说明与决策上下文
                          </button>
                          {decisionExpanded ? (
                            <div className={cn(deepLedgerSubtlePanelClassName, "space-y-2.5 px-4 py-3.5")}>
                              <div className="text-sm leading-6 text-[var(--text)]">{row.reason}</div>
                              {row.hfContribution ? (
                                <div className="text-xs text-[var(--muted)]">人因贡献：{row.hfContribution}</div>
                              ) : null}
                              {row.decisionContext ? (
                                <div className="mt-3 space-y-1.5 border-t border-[rgba(255,255,255,0.06)] pt-3 font-[var(--font-mono)] text-xs text-[var(--faint)]">
                                  <div>信号：{row.decisionContext.signalAction || "—"} · 评分 {row.decisionContext.signalScore ?? "—"}</div>
                                  <div>AI：{row.decisionContext.llmAdjustment || "—"} · 置信度 {row.decisionContext.llmConfidence ?? "—"}%</div>
                                  {row.decisionContext.llmRationale ? (
                                    <div className="text-[var(--muted)]">AI 理由：{row.decisionContext.llmRationale}</div>
                                  ) : null}
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span>市场环境：{marketRegimeLabel(row.decisionContext.effectiveMarketRegime)} · 执行倍数 {((row.decisionContext.finalQtyMultiplier ?? 1) * 100).toFixed(0)}%</span>
                                    {row.decisionContext.llmMarketRegime && row.decisionContext.effectiveMarketRegime && row.decisionContext.llmMarketRegime !== row.decisionContext.effectiveMarketRegime ? (
                                      <span className="text-amber-400/80">(AI判断: {marketRegimeLabel(row.decisionContext.llmMarketRegime)})</span>
                                    ) : null}
                                  </div>
                                  {(row.decisionContext.conflictFlags ?? []).length > 0 ? (
                                    <div className="text-amber-400/80">冲突：{row.decisionContext.conflictFlags.join(" / ")}</div>
                                  ) : null}
                                </div>
                              ) : null}
                              <div className="flex flex-wrap gap-2 border-t border-[rgba(255,255,255,0.06)] pt-3">
                                {(["up", "down"] as const).map((score) => {
                                  const isSelected = props.llmFeedbackScoreByContext[contextId] === score;
                                  const isSubmitting = Boolean(props.llmFeedbackSubmittingByContext[contextId]);
                                  return (
                                    <DeepLedgerActionButton
                                      key={score}
                                      tone={isSelected ? (score === "up" ? "primary" : "danger") : "slate"}
                                      disabled={isSubmitting}
                                      onClick={() => void props.onSubmitLlmFeedback({ contextId, type: "decision", score })}
                                    >
                                      {score === "up" ? "👍 有用" : "👎 无用"}
                                    </DeepLedgerActionButton>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <DeepLedgerEmptyState title="当前周期没有生成建议" description="可以先调整观察列表目标权重，再重新生成建议。" />
          )}
        </div>
      ) : (
        <DeepLedgerEmptyState title="尚无再平衡周期" description="请先点击「生成/刷新建议」，再勾选建议并执行。" />
      )}
    </DeepLedgerPanel>
  );
}
