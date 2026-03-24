"use client";

import { useState } from "react";
import { Bot, ChevronDown, ChevronUp, AlertTriangle, TrendingUp, Banknote } from "lucide-react";

import {
  DaaSurfaceStatusPill,
  daaSurfaceSubtlePanelClassName,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { cn } from "@/lib/utils";
import type { RebalanceCycle } from "@/src/daa/modules/workbench/workbenchTypes";

import { marketRegimeLabel, marketRegimeTone } from "./rebalanceLabels";

type LlmSnapshot = NonNullable<RebalanceCycle["llmDecisionSnapshot"]>;

function confidenceTone(pct: number): "green" | "amber" | "red" | "slate" {
  if (pct >= 70) return "green";
  if (pct >= 40) return "amber";
  if (pct > 0) return "red";
  return "slate";
}

const cashAdviceLabel: Record<string, string> = {
  hold: "持有现金",
  deploy_to_underweight: "部署至低配资产",
  await_signal: "等待信号",
};

export function RebalanceAiInsight(props: {
  currentCycle: RebalanceCycle | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const snapshot = props.currentCycle?.llmDecisionSnapshot;

  if (!props.currentCycle) return null;

  // No snapshot or non-ok status
  if (!snapshot || snapshot.status !== "ok") {
    return (
      <div className="rounded-[18px] border border-[var(--border)] bg-[rgba(13,19,32,0.72)] px-5 py-3.5">
        <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <Bot className="h-4 w-4 shrink-0" />
          <span>AI 分析未启用或本次未生成</span>
        </div>
      </div>
    );
  }

  const snap = snapshot as LlmSnapshot;

  return (
    <div className="overflow-hidden rounded-[20px] border border-[var(--border)] bg-[rgba(13,19,32,0.92)]">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-[var(--hover)]"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Bot className="h-4 w-4 shrink-0 text-[var(--primary)]" />
          <span className="text-sm font-semibold text-[var(--text)]">AI 分析摘要</span>
          <DaaSurfaceStatusPill tone={marketRegimeTone(snap.marketRegime)}>
            {marketRegimeLabel(snap.marketRegime)}
          </DaaSurfaceStatusPill>
          <DaaSurfaceStatusPill tone={confidenceTone(snap.overallConfidence)}>
            置信度 {snap.overallConfidence}%
          </DaaSurfaceStatusPill>
        </div>
        <span className="shrink-0 text-[10px] text-[var(--faint)]">
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </span>
      </button>

      {/* Summary always visible under header */}
      <div className="border-t border-[var(--border)] px-5 py-3">
        <p className="text-sm leading-6 text-[var(--text)]">{snap.summary}</p>
      </div>

      {expanded ? (
        <div className="space-y-3 border-t border-[var(--border)] px-5 pb-5 pt-4">
          {/* Risks & Opportunities */}
          <div className="grid gap-3 md:grid-cols-2">
            {snap.keyRisks.length > 0 ? (
              <div className={cn(daaSurfaceSubtlePanelClassName, "px-4 py-3.5")}>
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-400/80">
                  <AlertTriangle className="h-3 w-3" />
                  关键风险
                </div>
                <ul className="space-y-1.5">
                  {snap.keyRisks.map((risk, i) => (
                    <li key={i} className="text-sm leading-5 text-[var(--text)]">• {risk}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {snap.keyOpportunities.length > 0 ? (
              <div className={cn(daaSurfaceSubtlePanelClassName, "px-4 py-3.5")}>
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-400/80">
                  <TrendingUp className="h-3 w-3" />
                  关键机会
                </div>
                <ul className="space-y-1.5">
                  {snap.keyOpportunities.map((opp, i) => (
                    <li key={i} className="text-sm leading-5 text-[var(--text)]">• {opp}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          {/* Cash Advice */}
          {snap.cashAdvice ? (
            <div className={cn(daaSurfaceSubtlePanelClassName, "px-4 py-3.5")}>
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">
                <Banknote className="h-3 w-3" />
                现金建议
              </div>
              <div className="flex items-center gap-2">
                <DaaSurfaceStatusPill tone="cyan">{cashAdviceLabel[snap.cashAdvice] || snap.cashAdvice}</DaaSurfaceStatusPill>
                {snap.cashRationale ? <span className="text-sm text-[var(--muted)]">{snap.cashRationale}</span> : null}
              </div>
            </div>
          ) : null}

          {/* Model Info */}
          <div className="flex flex-wrap gap-3 text-[11px] text-[var(--faint)]">
            <span>{snap.provider}/{snap.model}</span>
            <span>延迟 {snap.latencyMs}ms</span>
            {snap.generatedAt ? <span>{new Date(snap.generatedAt).toLocaleString("zh-CN")}</span> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
