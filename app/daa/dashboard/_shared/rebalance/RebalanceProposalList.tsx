"use client";

import { useMemo, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { AlertCircle, CheckSquare2, TriangleAlert, XSquare } from "lucide-react";

import {
  DaaSurfaceActionButton,
  DaaSurfaceEmptyState,
  DaaSurfaceFilterChip,
  DaaSurfaceNoticeBox,
  DaaSurfacePanel,
  DaaSurfaceStatusPill,
  daaSurfaceSubtlePanelClassName,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { formatCurrency } from "@/app/daa/dashboard/_components/daaFormatters";
import { cn } from "@/lib/utils";
import type { RebalanceCycle, WorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchTypes";

import { allocationAdjustmentLabel, cycleStatusTone, marketRegimeLabel, riskOverallTone, riskStatusLabel, signalActionLabel } from "./rebalanceLabels";
import type { PreTradeRiskCheck } from "@/src/daa/modules/rebalance/rebalanceTypes";

function assetBudgetStanceLabel(value: string | null | undefined): string {
  if (value === "increase") return "增配";
  if (value === "reduce") return "降配";
  return "中性";
}

function formatBudgetScale(value: number | null | undefined): string {
  if (!Number.isFinite(value)) return "—";
  return `${((value ?? 1) * 100).toFixed(0)}%`;
}

function formatSignedCurrency(value: number, currency: string): string {
  if (Math.abs(value) < 0.01) return "0";
  return `${value > 0 ? "+" : ""}${formatCurrency(value, currency)}`;
}

function normalizeCycleSummaryNote(notes: string | null | undefined): string | null {
  const summaryLine = notes?.split("\n").find((line) => line.includes("摘要"));
  return summaryLine ? summaryLine.replace(/^.*摘要/, "系统摘要") : null;
}

export function RebalanceProposalList(props: {
  bootstrap: WorkbenchBootstrap;
  currentCycle: RebalanceCycle | null;
  currentRiskCheck: PreTradeRiskCheck | null;
  busy: boolean;
  isCurrentCycleTerminal: boolean;
  canEditCurrentCycle: boolean;
  buyProposalCount: number;
  sellProposalCount: number;
  selectedProposalNotional: number;
  expandedProposalDecisionKeys: Record<string, boolean>;
  setExpandedProposalDecisionKeys: Dispatch<SetStateAction<Record<string, boolean>>>;
  onSelectAllProposals: (selected: boolean) => Promise<void>;
  onToggleProposal: (assetKey: string, side: "BUY" | "SELL", selected: boolean) => Promise<void>;
  /** 空状态生成按钮回调 */
  onGenerateCycle?: () => Promise<void>;
  sideContent?: ReactNode;
  afterContent?: ReactNode;
}) {
  // 预计算漂移 map 避免 O(N*M) 查找
  const driftMap = useMemo(() => {
    const driftByAssetKey = new Map<string, number>();
    for (const driftSnapshot of props.currentCycle?.driftSnapshot ?? []) {
      driftByAssetKey.set(driftSnapshot.assetKey, driftSnapshot.driftPct);
    }
    return driftByAssetKey;
  }, [props.currentCycle?.driftSnapshot]);

  const visibleRiskItems = useMemo(
    () => (props.currentRiskCheck?.items ?? []).filter((item) => item.status !== "pass"),
    [props.currentRiskCheck?.items],
  );
  const emptyCycleReasons = useMemo(() => {
    const cycle = props.currentCycle;
    if (!cycle || cycle.proposals.length > 0) return [];
    const rows = [
      cycle.triggerReason ? `触发原因：${cycle.triggerReason}` : null,
      cycle.agentDecisionSnapshot?.summary ? `复核判断：${cycle.agentDecisionSnapshot.summary}` : null,
      normalizeCycleSummaryNote(cycle.notes),
      visibleRiskItems[0]?.message ? `风控提示：${visibleRiskItems[0].message}` : null,
    ].filter(Boolean) as string[];
    return rows.length > 0 ? rows : ["本轮没有达到可执行金额、信念强度或风控条件，因此没有生成交易建议。"];
  }, [props.currentCycle, visibleRiskItems]);

  return (
    <DaaSurfacePanel
      accent={props.currentCycle ? cycleStatusTone(props.currentCycle.status) : "neutral"}
      title="建议审阅与执行"
      subtitle={props.currentCycle
        ? `周期 ${props.currentCycle.cycleId.slice(0, 8)} · 买入 ${props.buyProposalCount} · 卖出 ${props.sellProposalCount}`
        : "点击「生成/刷新建议」获取调仓建议"}
      action={(
        <div className="flex flex-wrap gap-2">
          {props.currentRiskCheck ? (
            <DaaSurfaceStatusPill tone={riskOverallTone(props.currentRiskCheck.overallStatus)}>
              风控 {riskStatusLabel(props.currentRiskCheck.overallStatus)}
            </DaaSurfaceStatusPill>
          ) : null}
          {props.selectedProposalNotional > 0 ? (
            <DaaSurfaceStatusPill tone="primary">
              已选 {formatCurrency(props.selectedProposalNotional, props.bootstrap.baseCurrency)}
            </DaaSurfaceStatusPill>
          ) : null}
        </div>
      )}
    >
      <div className="space-y-4">
        <div className={cn(props.sideContent ? "grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_390px]" : "")}>
          <div className="min-w-0">
            {props.currentCycle ? (
              <div className="space-y-4">
          {props.isCurrentCycleTerminal ? (
            <DaaSurfaceNoticeBox tone="neutral" icon={<AlertCircle className="h-4 w-4" />} title="当前周期已终态" description="该周期只读；如需继续调仓，请生成新周期。" />
          ) : null}
          {props.currentCycle.triggerSource === "risk" ? (
            <DaaSurfaceNoticeBox tone="warning" icon={<TriangleAlert className="h-4 w-4" />} title="风险触发建议待处理" description="该周期由止盈/止损阈值触发，请先看理由和风控，再决定是否执行。" />
          ) : null}
          <div className={cn(daaSurfaceSubtlePanelClassName, "space-y-2 px-4 py-3")}>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[var(--faint)]">触发</span>
              <span className="text-[var(--text)]">{props.currentCycle.triggerReason || "组合调仓检查"}</span>
            </div>
            {props.currentCycle.agentDecisionSnapshot?.summary ? (
              <div className="text-xs leading-5 text-[var(--muted)]">
                复核判断：{props.currentCycle.agentDecisionSnapshot.summary}
              </div>
            ) : null}
            {visibleRiskItems.length > 0 ? (
              <div className="space-y-1 border-t border-[var(--elevated)] pt-2 text-xs">
                {visibleRiskItems.slice(0, 3).map((item) => (
                  <div key={`${item.rule}-${item.message}`} className={item.status === "block" ? "text-[var(--danger)]" : "text-[var(--amber)]"}>
                    {item.status === "block" ? "阻断" : "警告"}：{item.message}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {props.currentCycle.proposals.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-2">
                <DaaSurfaceActionButton tone="success" onClick={() => void props.onSelectAllProposals(true)} disabled={!props.canEditCurrentCycle}>
                  <CheckSquare2 className="h-3.5 w-3.5" />
                  一键全选
                </DaaSurfaceActionButton>
                <DaaSurfaceActionButton tone="danger" onClick={() => void props.onSelectAllProposals(false)} disabled={!props.canEditCurrentCycle}>
                  <XSquare className="h-3.5 w-3.5" />
                  清空勾选
                </DaaSurfaceActionButton>

                {/* 批量筛选：先全部取消再逐一选中符合条件的 */}
                <DaaSurfaceFilterChip
                  onClick={async () => {
                    await props.onSelectAllProposals(false);
                    const cycle = props.currentCycle;
                    if (!cycle) return;
                    for (const buyProposal of cycle.proposals.filter((proposal) => proposal.side === "BUY")) {
                      void props.onToggleProposal(buyProposal.assetKey, buyProposal.side, true);
                    }
                  }}
                  disabled={!props.canEditCurrentCycle}
                >
                  仅买入
                </DaaSurfaceFilterChip>
                <DaaSurfaceFilterChip
                  onClick={async () => {
                    await props.onSelectAllProposals(false);
                    const cycle = props.currentCycle;
                    if (!cycle) return;
                    for (const sellProposal of cycle.proposals.filter((proposal) => proposal.side === "SELL")) {
                      void props.onToggleProposal(sellProposal.assetKey, sellProposal.side, true);
                    }
                  }}
                  disabled={!props.canEditCurrentCycle}
                >
                  仅卖出
                </DaaSurfaceFilterChip>
              </div>

              <div className="space-y-2">
                {props.currentCycle.proposals.map((proposal) => {
                  const proposalKey = `${proposal.assetKey}-${proposal.side}`;
                  const decisionExpanded = props.expandedProposalDecisionKeys[proposalKey] !== false;
                  const decisionContext = proposal.decisionContext;
                  const macroShadowDelta = decisionContext?.macroShadowDeltaNotional ?? 0;
                  const hasMacroShadowDelta = decisionContext?.macroShadowNotional != null && Math.abs(macroShadowDelta) >= 0.01;
                  const hasAssetBudgetContext = Boolean(decisionContext?.assetBudgetKey);
                  return (
                    <div
                      key={proposalKey}
                      className={cn(
                        "rounded-[var(--radius-md)] border px-4 py-3 transition-colors",
                        proposal.selected
                          ? "border-[var(--primary-bg)] bg-[var(--primary-bg)]"
                          : "border-[var(--border)] bg-[var(--surface)]",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 shrink-0 accent-[var(--primary)]"
                          checked={proposal.selected}
                          onChange={(e) => void props.onToggleProposal(proposal.assetKey, proposal.side, e.target.checked)}
                          disabled={!props.canEditCurrentCycle}
                          aria-label={`选中 ${proposal.symbol} 提案`}
                        />
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-[var(--font-mono)] text-sm font-semibold text-[var(--text)]">{proposal.symbol}</span>
                            <DaaSurfaceStatusPill tone={proposal.side === "BUY" ? "success" : "warning"}>{proposal.side === "BUY" ? "买入" : "卖出"}</DaaSurfaceStatusPill>
                            {/* 金额直接显示 */}
                            <span className="font-[var(--font-mono)] text-sm text-[var(--text)]">{formatCurrency(proposal.suggestedNotional, props.bootstrap.baseCurrency)}</span>
                            {hasMacroShadowDelta ? (
                              <DaaSurfaceStatusPill tone={macroShadowDelta < 0 ? "warning" : "primary"} className="max-w-full normal-case tracking-normal">
                                宏观影子 {formatCurrency(decisionContext?.macroShadowNotional ?? 0, props.bootstrap.baseCurrency)} ({formatSignedCurrency(macroShadowDelta, props.bootstrap.baseCurrency)})
                              </DaaSurfaceStatusPill>
                            ) : null}
                            {/* 漂移（仅超阈值时显示） */}
                            {(() => {
                              const drift = driftMap.get(proposal.assetKey);
                              return drift && Math.abs(drift) >= 0.03 ? (
                                <span className="text-xs text-[var(--amber)]">偏离 {(drift * 100).toFixed(1)}%</span>
                              ) : null;
                            })()}
                            {/* 判断不一致提示 */}
                            {proposal.decisionContext?.signalConflict ? (
                              <span className="rounded-[var(--radius-sm)] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--danger)]">判断不一致</span>
                            ) : null}
                            {/* 跨币种标记 */}
                            {proposal.currency !== props.bootstrap.baseCurrency ? <span className="text-[10px] text-[var(--faint)]">{proposal.currency}</span> : null}
                          </div>
                          {proposal.reason ? (
                            <div className="text-xs leading-5 text-[var(--muted)] line-clamp-1">{proposal.reason}</div>
                          ) : null}

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--faint)]">
                            <span>数量 <span className="font-[var(--font-mono)] text-[var(--muted)]">{proposal.suggestedQty.toFixed(4)}</span></span>
                            <span>价格 <span className="font-[var(--font-mono)] text-[var(--muted)]">{formatCurrency(proposal.price, proposal.currency)}</span></span>
                            <button
                              type="button"
                              onClick={() => props.setExpandedProposalDecisionKeys((prev) => ({ ...prev, [proposalKey]: !decisionExpanded }))}
                              className="text-[var(--muted)] transition-colors hover:text-[var(--text)]"
                              aria-expanded={decisionExpanded}
                            >
                              {decisionExpanded ? "▼ 收起依据" : "▶ 展开依据"}
                            </button>
                          </div>
                          {decisionExpanded ? (
                            <div className={cn(daaSurfaceSubtlePanelClassName, "space-y-2.5 px-4 py-3.5")}>
                              <div className="text-xs leading-5 text-[var(--text)]">{proposal.reason}</div>
                              {proposal.hfContribution ? (
                                <div className="text-xs text-[var(--muted)]">人因贡献：{proposal.hfContribution}</div>
                              ) : null}
                              {proposal.decisionContext ? (
                                <div className="mt-3 space-y-1.5 border-t border-[var(--elevated)] pt-3 font-[var(--font-mono)] text-xs text-[var(--faint)]">
                                  <div>资产信号立场：{signalActionLabel(proposal.decisionContext.signalAction)} · 评分 {proposal.decisionContext.signalScore ?? "—"}</div>
                                  <div>策略建议：{allocationAdjustmentLabel(proposal.decisionContext.llmAdjustment)} · 置信度 {proposal.decisionContext.llmConfidence ?? "—"}%</div>
                                  {proposal.decisionContext.llmRationale ? (
                                    <div className="text-[var(--muted)]">建议理由：{proposal.decisionContext.llmRationale}</div>
                                  ) : null}
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span>市场环境：{marketRegimeLabel(proposal.decisionContext.effectiveMarketRegime)} · 执行倍数 {((proposal.decisionContext.finalQtyMultiplier ?? 1) * 100).toFixed(0)}%</span>
                                    {proposal.decisionContext.llmMarketRegime && proposal.decisionContext.effectiveMarketRegime && proposal.decisionContext.llmMarketRegime !== proposal.decisionContext.effectiveMarketRegime ? (
                                      <span className="text-[var(--amber)]">(市场判断: {marketRegimeLabel(proposal.decisionContext.llmMarketRegime)})</span>
                                    ) : null}
                                  </div>
                                  {hasAssetBudgetContext ? (
                                    <div className="space-y-1.5 rounded-[var(--radius-md)] border border-[var(--primary-bg)] bg-[var(--primary-bg)] px-3 py-2 font-sans text-[11px] leading-5 text-[var(--muted)]">
                                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                        <span className="font-semibold text-[var(--text)]">资产预算：{proposal.decisionContext.assetBudgetLabel || proposal.decisionContext.assetBudgetKey}</span>
                                        <span>{assetBudgetStanceLabel(proposal.decisionContext.assetBudgetStance)} · 影子系数 {formatBudgetScale(proposal.decisionContext.assetBudgetScale)}</span>
                                        <span className="text-[var(--faint)]">仅供审阅，不影响本次执行金额</span>
                                      </div>
                                      {proposal.decisionContext.macroShadowNotional != null ? (
                                        <div>
                                          原始执行 {formatCurrency(proposal.suggestedNotional, props.bootstrap.baseCurrency)} → 宏观影子 {formatCurrency(proposal.decisionContext.macroShadowNotional, props.bootstrap.baseCurrency)}
                                          {Math.abs(proposal.decisionContext.macroShadowDeltaNotional ?? 0) >= 0.01
                                            ? `（${formatSignedCurrency(proposal.decisionContext.macroShadowDeltaNotional ?? 0, props.bootstrap.baseCurrency)}）`
                                            : ""}
                                        </div>
                                      ) : null}
                                      {proposal.decisionContext.macroShadowReason ? (
                                        <div className="text-[var(--faint)]">{proposal.decisionContext.macroShadowReason}</div>
                                      ) : null}
                                    </div>
                                  ) : null}
                                  {(proposal.decisionContext.conflictFlags ?? []).length > 0 ? (
                                    <div className="text-[var(--amber)]">判断不一致：{proposal.decisionContext.conflictFlags.join(" / ")}</div>
                                  ) : null}
                                </div>
                              ) : null}
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
            <div className="space-y-3">
              <DaaSurfaceEmptyState title="当前周期没有可执行建议" description="系统已完成检查，但本轮没有留下可执行买卖单。" />
              <div className={cn(daaSurfaceSubtlePanelClassName, "space-y-2 px-4 py-3")}>
                <div className="text-[11px] font-semibold uppercase tracking-normal text-[var(--faint)]">为什么是空的</div>
                <ul className="space-y-1.5 text-xs leading-5 text-[var(--muted)]">
                  {emptyCycleReasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
                <div className="text-xs text-[var(--faint)]">
                  观察列表资产需要有目标权重和可用价格；自动周期若最终没有提案，会跳过创建新周期。
                </div>
              </div>
            </div>
          )}
              </div>
            ) : (
              <DaaSurfaceEmptyState
                title="尚无调仓建议"
                description="生成建议后，可在此审阅并勾选执行。"
                action={props.onGenerateCycle ? (
                  <DaaSurfaceActionButton tone="primary" onClick={() => void props.onGenerateCycle!()}>
                    生成调仓建议
                  </DaaSurfaceActionButton>
                ) : undefined}
              />
            )}
          </div>
          {props.sideContent ? (
            <div className="min-w-0">{props.sideContent}</div>
          ) : null}
        </div>

        {props.afterContent ? (
          <div className="border-t border-[var(--elevated)] pt-4">
            {props.afterContent}
          </div>
        ) : null}
      </div>
    </DaaSurfacePanel>
  );
}
