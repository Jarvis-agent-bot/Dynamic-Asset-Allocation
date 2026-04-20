"use client";

import { useMemo, type Dispatch, type SetStateAction } from "react";
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
import type {
  RebalanceCycle,
  WorkbenchBootstrap,
} from "@/src/daa/modules/workbench/workbenchTypes";

import { cycleStatusTone, llmAdjustmentLabel, marketRegimeLabel, riskOverallTone, riskStatusLabel, signalActionLabel } from "./rebalanceLabels";

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
  onSelectAllProposals: (selected: boolean) => Promise<void>;
  onToggleProposal: (assetKey: string, side: "BUY" | "SELL", selected: boolean) => Promise<void>;
  /** 空状态生成按钮回调 */
  onGenerateCycle?: () => Promise<void>;
}) {
  // 预计算漂移 map 避免 O(N*M) 查找
  const driftMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of props.currentCycle?.driftSnapshot ?? []) {
      m.set(d.assetKey, d.driftPct);
    }
    return m;
  }, [props.currentCycle?.driftSnapshot]);

  return (
    <DaaSurfacePanel
      accent={props.currentCycle ? cycleStatusTone(props.currentCycle.status) : "slate"}
      title="本次建议"
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
            <DaaSurfaceStatusPill tone="cyan">
              已选 {formatCurrency(props.selectedProposalNotional, props.bootstrap.baseCurrency)}
            </DaaSurfaceStatusPill>
          ) : null}
        </div>
      )}
    >
      {props.currentCycle ? (
        <div className="space-y-4">
          {props.isCurrentCycleTerminal ? (
            <DaaSurfaceNoticeBox tone="slate" icon={<AlertCircle className="h-4 w-4" />} title="当前周期已终态" description="该周期只读；如需继续调仓，请生成新周期。" />
          ) : null}
          {props.currentCycle.triggerSource === "risk" ? (
            <DaaSurfaceNoticeBox tone="amber" icon={<TriangleAlert className="h-4 w-4" />} title="风险触发建议待处理" description="该周期由止盈/止损阈值触发，请先看理由和风控，再决定是否执行。" />
          ) : null}

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
                    for (const p of cycle.proposals.filter((x) => x.side === "BUY")) {
                      void props.onToggleProposal(p.assetKey, p.side, true);
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
                    for (const p of cycle.proposals.filter((x) => x.side === "SELL")) {
                      void props.onToggleProposal(p.assetKey, p.side, true);
                    }
                  }}
                  disabled={!props.canEditCurrentCycle}
                >
                  仅卖出
                </DaaSurfaceFilterChip>
              </div>

              <div className="space-y-2">
                {props.currentCycle.proposals.map((row) => {
                  const proposalKey = `${row.assetKey}-${row.side}`;
                  const decisionExpanded = Boolean(props.expandedProposalDecisionKeys[proposalKey]);
                  return (
                    <div
                      key={proposalKey}
                      className={cn(
                        "rounded-[14px] border px-4 py-3 transition-colors",
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
                          aria-label={`选中 ${row.symbol} 提案`}
                        />
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-[var(--font-mono)] text-sm font-semibold text-[var(--text)]">{row.symbol}</span>
                            <DaaSurfaceStatusPill tone={row.side === "BUY" ? "green" : "amber"}>{row.side === "BUY" ? "买入" : "卖出"}</DaaSurfaceStatusPill>
                            {/* 金额直接显示 */}
                            <span className="font-[var(--font-mono)] text-sm text-[var(--text)]">{formatCurrency(row.suggestedNotional, props.bootstrap.baseCurrency)}</span>
                            {/* 漂移（仅超阈值时显示） */}
                            {(() => {
                              const drift = driftMap.get(row.assetKey);
                              return drift && Math.abs(drift) >= 0.03 ? (
                                <span className="text-xs text-amber-400">偏离 {(drift * 100).toFixed(1)}%</span>
                              ) : null;
                            })()}
                            {/* 冲突警告 */}
                            {row.decisionContext?.signalConflict ? (
                              <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-400">冲突</span>
                            ) : null}
                            {/* 跨币种标记 */}
                            {row.currency !== props.bootstrap.baseCurrency ? <span className="text-[10px] text-[var(--faint)]">{row.currency}</span> : null}
                          </div>
                          {row.reason ? (
                            <div className="text-xs leading-5 text-[var(--muted)] line-clamp-1">{row.reason}</div>
                          ) : null}

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--faint)]">
                            <span>数量 <span className="font-[var(--font-mono)] text-[var(--muted)]">{row.suggestedQty.toFixed(4)}</span></span>
                            <span>价格 <span className="font-[var(--font-mono)] text-[var(--muted)]">{formatCurrency(row.price, row.currency)}</span></span>
                            <button
                              type="button"
                              onClick={() => props.setExpandedProposalDecisionKeys((prev) => ({ ...prev, [proposalKey]: !prev[proposalKey] }))}
                              className="text-[var(--muted)] transition-colors hover:text-[var(--text)]"
                              aria-expanded={decisionExpanded}
                            >
                              {decisionExpanded ? "▼ 收起" : "▶ 详情"}
                            </button>
                          </div>
                          {decisionExpanded ? (
                            <div className={cn(daaSurfaceSubtlePanelClassName, "space-y-2.5 px-4 py-3.5")}>
                              <div className="text-sm leading-6 text-[var(--text)]">{row.reason}</div>
                              {row.hfContribution ? (
                                <div className="text-xs text-[var(--muted)]">人因贡献：{row.hfContribution}</div>
                              ) : null}
                              {row.decisionContext ? (
                                <div className="mt-3 space-y-1.5 border-t border-[rgba(255,255,255,0.06)] pt-3 font-[var(--font-mono)] text-xs text-[var(--faint)]">
                                  <div>信号：{signalActionLabel(row.decisionContext.signalAction)} · 评分 {row.decisionContext.signalScore ?? "—"}</div>
                                  <div>AI：{llmAdjustmentLabel(row.decisionContext.llmAdjustment)} · 置信度 {row.decisionContext.llmConfidence ?? "—"}%</div>
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
            <DaaSurfaceEmptyState title="当前周期没有生成建议" description="可以先调整观察列表目标权重，再重新生成建议。" />
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
    </DaaSurfacePanel>
  );
}
