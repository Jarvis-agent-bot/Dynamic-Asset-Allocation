"use client";

import Link from "next/link";
import type { Dispatch, SetStateAction } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CheckSquare2,
  Circle,
  MoreHorizontal,
  TriangleAlert,
  XSquare,
} from "lucide-react";

import type { WorkbenchTabV1 } from "@/app/daa/dashboard/_hooks/useWorkbenchModelV1";
import {
  DeepLedgerActionButton,
  DeepLedgerEmptyState,
  DeepLedgerNoticeBox,
  DeepLedgerPanel,
  DeepLedgerStatusPill,
  deepLedgerMonoPanelClassName,
  deepLedgerSubtlePanelClassName,
  type DeepLedgerTone,
} from "@/app/daa/dashboard/_components/DeepLedgerUI";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCurrency, formatDateTimeV1 } from "@/app/daa/dashboard/_components/daaFormatters";
import { cn } from "@/lib/utils";
import type { DaaMarketContextV1, DaaMarketScopeContextV1 } from "@/src/daa/modules/marketContext/marketContextTypesV1";
import type {
  PreTradeRiskCheckV1,
  RebalanceCycleV1,
  WorkbenchBootstrapV1,
  WorkbenchLlmFeedbackScoreV1,
} from "@/src/daa/modules/workbench/workbenchTypesV1";

export type WorkbenchChecklistItemV1 = {
  id: string;
  label: string;
  ok: boolean;
  hint: string;
};

type ProposalDecisionContextV1 = RebalanceCycleV1["proposals"][number]["decisionContext"];

function cycleStatusLabel(status: RebalanceCycleV1["status"]): string {
  if (status === "generated") return "已生成";
  if (status === "reviewing") return "审阅中";
  if (status === "executing") return "执行中";
  if (status === "completed") return "已完成";
  if (status === "cancelled") return "已取消";
  return status;
}

function triggerSourceLabel(source: RebalanceCycleV1["triggerSource"]): string {
  if (source === "calendar") return "定期触发";
  if (source === "drift") return "偏移触发";
  if (source === "risk") return "止盈止损触发";
  if (source === "cash_idle") return "现金闲置触发";
  return "手动触发";
}

function marketRegimeLabel(regime: string | null | undefined): string {
  if (regime === "risk_off") return "偏防守";
  if (regime === "risk_on") return "偏进攻";
  if (regime === "transitional") return "过渡";
  return "待计算";
}

function marketRegimeTone(regime: string | null | undefined): DeepLedgerTone {
  if (regime === "risk_off") return "amber";
  if (regime === "risk_on") return "green";
  if (regime === "transitional") return "indigo";
  return "slate";
}

function riskStatusLabel(status: PreTradeRiskCheckV1["overallStatus"]) {
  if (status === "block") return "阻断";
  if (status === "warn") return "警告";
  return "通过";
}

function riskOverallTone(status: PreTradeRiskCheckV1["overallStatus"]): DeepLedgerTone {
  if (status === "block") return "red";
  if (status === "warn") return "amber";
  return "green";
}

function cycleStatusTone(status: RebalanceCycleV1["status"]): DeepLedgerTone {
  if (status === "completed") return "green";
  if (status === "executing") return "indigo";
  if (status === "cancelled") return "slate";
  if (status === "reviewing") return "amber";
  return "cyan";
}

function riskRuleLabel(rule: string): string {
  if (rule === "max_position") return "单一持仓上限";
  if (rule === "max_order_pct") return "单日交易上限";
  if (rule === "concentration") return "组合集中度";
  if (rule === "stop_loss_breach") return "止损阈值";
  if (rule === "total_weight") return "目标权重合计";
  return rule;
}

function riskItemStatusLabel(status: "pass" | "warn" | "block"): string {
  if (status === "block") return "阻断";
  if (status === "warn") return "警告";
  return "通过";
}

function riskItemTone(status: "pass" | "warn" | "block"): DeepLedgerTone {
  if (status === "block") return "red";
  if (status === "warn") return "amber";
  return "green";
}

export function WorkbenchRebalanceSectionV1(props: {
  bootstrap: WorkbenchBootstrapV1;
  cycles: RebalanceCycleV1[];
  currentCycle: RebalanceCycleV1 | null;
  currentRiskCheck: PreTradeRiskCheckV1 | null;
  summary: { holdingAssets: number; watchlistAssets: number };
  busy: boolean;
  marketContextExpanded: boolean;
  setMarketContextExpanded: Dispatch<SetStateAction<boolean>>;
  expandedProposalDecisionKeys: Record<string, boolean>;
  setExpandedProposalDecisionKeys: Dispatch<SetStateAction<Record<string, boolean>>>;
  llmFeedbackSubmittingByContext: Record<string, boolean>;
  llmFeedbackScoreByContext: Record<string, WorkbenchLlmFeedbackScoreV1>;
  activeMarketContext: DaaMarketContextV1 | null;
  primaryDecisionContext: ProposalDecisionContextV1 | null;
  decisionMarketContext: DaaMarketContextV1 | DaaMarketScopeContextV1 | null;
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
  rebalanceChecklist: WorkbenchChecklistItemV1[];
  rebalanceChecklistAllPassed: boolean;
  firstUnmetChecklist?: WorkbenchChecklistItemV1;
  onNavigateTab: (tab: WorkbenchTabV1) => void;
  onGenerateCycle: () => Promise<void>;
  onOpenExecuteDialog: (mode: "selected" | "all") => void;
  onCancelCycle: () => Promise<void>;
  onSelectAllProposals: (selected: boolean) => Promise<void>;
  onToggleProposal: (assetKey: string, side: "BUY" | "SELL", selected: boolean) => Promise<void>;
  onSubmitLlmFeedback: (input: { contextId: string; type: "decision"; score: WorkbenchLlmFeedbackScoreV1; comment?: string }) => Promise<void>;
  onSelectCycle: (cycle: RebalanceCycleV1) => void;
}) {
  return (
    <div className="space-y-4">
      {props.summary.holdingAssets <= 0 ? (
        <DeepLedgerPanel
          accent="amber"
          title="首次调仓引导"
          action={(
            <div className="flex flex-wrap gap-2">
              <DeepLedgerActionButton tone="primary" onClick={() => props.onNavigateTab("discovery")}>去资产发现</DeepLedgerActionButton>
              <DeepLedgerActionButton onClick={() => props.onNavigateTab("watchlist")}>去观察列表设权重</DeepLedgerActionButton>
            </div>
          )}
        >
          <DeepLedgerNoticeBox tone="amber" title="推荐路径" description="资产发现添加标的 → 观察列表设置目标权重 → 生成建议 → 勾选并执行。" />
        </DeepLedgerPanel>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(24,34,54,0.96),rgba(13,19,32,0.98))] px-5 py-3.5 shadow-[0_4px_24px_rgba(0,0,0,0.18)]">
        <div className="flex flex-wrap items-center gap-2">
          {props.currentCycle ? (
            <>
              <span className="font-[var(--font-mono)] text-sm font-semibold text-[var(--text)]">{props.currentCycle.cycleId.slice(0, 8)}</span>
              <DeepLedgerStatusPill tone={cycleStatusTone(props.currentCycle.status)}>{cycleStatusLabel(props.currentCycle.status)}</DeepLedgerStatusPill>
              <DeepLedgerStatusPill tone="slate">{triggerSourceLabel(props.currentCycle.triggerSource)}</DeepLedgerStatusPill>
              <span className="hidden text-xs text-[var(--muted)] sm:inline">{props.cycleProgressText}</span>
            </>
          ) : (
            <span className="text-sm text-[var(--muted)]">尚未生成再平衡建议，点击右侧按钮开始</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DeepLedgerActionButton tone="primary" onClick={() => void props.onGenerateCycle()} disabled={props.busy}>生成/刷新建议</DeepLedgerActionButton>
          <DeepLedgerActionButton tone="success" onClick={() => props.onOpenExecuteDialog("selected")} disabled={!props.canExecuteSelected}>
            执行选中{props.selectedProposalCount > 0 ? ` (${props.selectedProposalCount})` : ""}
          </DeepLedgerActionButton>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <DeepLedgerActionButton disabled={props.busy}>
                <MoreHorizontal className="h-3.5 w-3.5" />
                更多
              </DeepLedgerActionButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 border-[var(--border)] bg-[rgba(8,12,20,0.98)] text-[var(--text)]">
              <DropdownMenuItem onClick={() => props.onOpenExecuteDialog("all")} disabled={!props.canExecuteAll}>执行全部（需确认）</DropdownMenuItem>
              <DropdownMenuItem onClick={() => void props.onCancelCycle()} disabled={!props.currentCycle || props.isCurrentCycleTerminal || props.busy}>取消本次再平衡</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild><Link href="/daa/dashboard/trades">查看历史详情</Link></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_296px] xl:items-start">
        <div className="flex min-w-0 flex-col gap-4">
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
                                        <div>市场环境：{marketRegimeLabel(row.decisionContext.effectiveMarketRegime)} · 执行倍数 {((row.decisionContext.finalQtyMultiplier ?? 1) * 100).toFixed(0)}%</div>
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

          {props.activeMarketContext ? (
            <div className="overflow-hidden rounded-[20px] border border-[var(--border)] bg-[rgba(13,19,32,0.92)]">
              <button
                type="button"
                onClick={() => props.setMarketContextExpanded((prev) => !prev)}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-[var(--hover)]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-[var(--text)]">市场快照</span>
                  <DeepLedgerStatusPill tone={marketRegimeTone(props.primaryDecisionContext?.effectiveMarketRegime || props.activeMarketContext.regime)}>
                    {marketRegimeLabel(props.primaryDecisionContext?.effectiveMarketRegime || props.activeMarketContext.regime)}
                  </DeepLedgerStatusPill>
                  <span className="text-xs text-[var(--muted)]">
                    买入系数 {Math.round((props.decisionMarketContext?.buyScale ?? props.activeMarketContext.buyScale) * 100)}% · 高波动 {Math.round((props.decisionMarketContext?.highRiskBuyScale ?? props.activeMarketContext.highRiskBuyScale) * 100)}%
                  </span>
                </div>
                <span className="shrink-0 text-[10px] text-[var(--faint)]">{props.marketContextExpanded ? "▲ 收起" : "▼ 展开详情"}</span>
              </button>

              {props.marketContextExpanded ? (
                <div className="space-y-4 border-t border-[var(--border)] px-5 pb-5 pt-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    {[
                      { label: "规则层市场环境", regime: props.primaryDecisionContext?.ruleBasedMarketRegime || props.activeMarketContext.regime },
                      { label: "AI 市场环境", regime: props.primaryDecisionContext?.llmMarketRegime },
                      { label: "最终生效", regime: props.primaryDecisionContext?.effectiveMarketRegime || props.decisionMarketContext?.regime || props.activeMarketContext.regime },
                    ].map((item) => (
                      <div key={item.label} className={cn(deepLedgerSubtlePanelClassName, "px-4 py-3.5")}>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">{item.label}</div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-[var(--text)]">{marketRegimeLabel(item.regime)}</div>
                          <DeepLedgerStatusPill tone={marketRegimeTone(item.regime)}>{marketRegimeLabel(item.regime)}</DeepLedgerStatusPill>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className={cn(deepLedgerSubtlePanelClassName, "px-4 py-3.5")}>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">{props.decisionMarketLabel} · 买入系数</div>
                      <div className="mt-2 font-[var(--font-mono)] text-[18px] text-[var(--text)]">{props.decisionMarketContext ? Math.round(props.decisionMarketContext.buyScale * 100) : 0}%</div>
                      <div className="mt-1 text-xs text-[var(--muted)]">风险分 {props.decisionMarketContext?.riskOffScorePct.toFixed(1) || "0.0"} · 置信度 {props.decisionMarketContext?.confidencePct.toFixed(1) || "0.0"}%</div>
                    </div>
                    <div className={cn(deepLedgerSubtlePanelClassName, "px-4 py-3.5")}>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">高波动执行系数</div>
                      <div className="mt-2 font-[var(--font-mono)] text-[18px] text-[var(--text)]">{props.decisionMarketContext ? Math.round(props.decisionMarketContext.highRiskBuyScale * 100) : 0}%</div>
                      <div className="mt-1 text-xs text-[var(--muted)]">适用于成长、加密与高波动资产</div>
                    </div>
                  </div>
                  {props.currentDecisionFacts.length > 0 ? (
                    <div className={cn(deepLedgerSubtlePanelClassName, "px-4 py-3.5")}>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">关键市场指标</div>
                      <div className="mt-3 space-y-2 text-sm text-[var(--text)]">
                        {props.currentDecisionFacts.map((fact) => (
                          <div key={fact} className="rounded-xl border border-[rgba(255,255,255,0.06)] px-3 py-2">{fact}</div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {props.currentRiskCheck && props.currentRiskCheck.overallStatus !== "pass" ? (
            <DeepLedgerPanel
              accent={riskOverallTone(props.currentRiskCheck.overallStatus)}
              title="风控提示"
              subtitle={`状态：${riskStatusLabel(props.currentRiskCheck.overallStatus)}（告警可执行，阻断不可执行）`}
              action={<DeepLedgerStatusPill tone={riskOverallTone(props.currentRiskCheck.overallStatus)}>{riskStatusLabel(props.currentRiskCheck.overallStatus)}</DeepLedgerStatusPill>}
            >
              <div className="grid gap-3 lg:grid-cols-2">
                {props.currentRiskCheck.items.filter((item) => item.status !== "pass").map((item) => (
                  <div
                    key={item.rule}
                    className={cn(
                      "rounded-[16px] border px-4 py-3",
                      item.status === "block"
                        ? "border-rose-400/24 bg-rose-500/10"
                        : "border-amber-400/24 bg-amber-500/10",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <DeepLedgerStatusPill tone={riskItemTone(item.status)}>{riskItemStatusLabel(item.status)}</DeepLedgerStatusPill>
                      <span className="text-sm font-semibold text-[var(--text)]">{riskRuleLabel(item.rule)}</span>
                    </div>
                    <div className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.message}</div>
                    <div className="mt-3 font-[var(--font-mono)] text-xs text-[var(--faint)]">当前值 {item.current.toFixed(2)} · 阈值 {item.limit.toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </DeepLedgerPanel>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
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

          <DeepLedgerPanel accent="slate" title="历史周期" subtitle="最近 8 个">
            <div className="space-y-2">
              {props.cycles.slice(0, 8).map((cycle) => {
                const active = cycle.cycleId === props.currentCycle?.cycleId;
                return (
                  <button
                    key={cycle.cycleId}
                    type="button"
                    onClick={() => props.onSelectCycle(cycle)}
                    className={cn(
                      "w-full rounded-[14px] border px-4 py-3 text-left transition-all",
                      active
                        ? "border-[var(--primary)]/32 bg-[rgba(56,189,248,0.10)]"
                        : "border-[var(--border)] bg-[rgba(8,12,20,0.42)] hover:border-[var(--border-strong)] hover:bg-[var(--hover)]",
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-[var(--font-mono)] text-sm font-semibold text-[var(--text)]">{cycle.cycleId.slice(0, 8)}</div>
                      <DeepLedgerStatusPill tone={cycleStatusTone(cycle.status)}>{cycleStatusLabel(cycle.status)}</DeepLedgerStatusPill>
                    </div>
                    <div className="mt-1.5 text-xs text-[var(--faint)]">{triggerSourceLabel(cycle.triggerSource)} · {formatDateTimeV1(cycle.createdAt)}</div>
                  </button>
                );
              })}
              {props.cycles.length === 0 ? (
                <div className="py-4 text-center text-xs text-[var(--faint)]">暂无历史周期</div>
              ) : null}
            </div>
            <div className="mt-3 border-t border-[var(--border)] pt-3">
              <Link href="/daa/dashboard/trades" className="text-xs text-[var(--muted)] underline underline-offset-4 transition-colors hover:text-[var(--text)]">
                查看完整历史 →
              </Link>
            </div>
          </DeepLedgerPanel>
        </div>
      </div>
    </div>
  );
}
