"use client";

import type { Dispatch, SetStateAction } from "react";

import {
  DeepLedgerStatusPill,
  deepLedgerSubtlePanelClassName,
} from "@/app/daa/dashboard/_components/DeepLedgerUI";
import { cn } from "@/lib/utils";
import type { DaaMarketContext, DaaMarketScopeContext } from "@/src/daa/modules/marketContext/marketContextTypes";

import { marketRegimeLabel, marketRegimeTone } from "./rebalanceLabels";

type ProposalDecisionContext = {
  ruleBasedMarketRegime?: string | null;
  llmMarketRegime?: string | null;
  effectiveMarketRegime?: string | null;
};

export function RebalanceMarketSnapshot(props: {
  activeMarketContext: DaaMarketContext;
  primaryDecisionContext: ProposalDecisionContext | null | undefined;
  decisionMarketContext: DaaMarketContext | DaaMarketScopeContext | null;
  decisionMarketLabel: string;
  currentDecisionFacts: string[];
  marketContextExpanded: boolean;
  setMarketContextExpanded: Dispatch<SetStateAction<boolean>>;
}) {
  return (
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
  );
}
