"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { DaaSurfaceStatusPill } from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { marketRegimeLabel, marketRegimeTone } from "@/app/daa/dashboard/_shared/rebalance/rebalanceLabels";
import type { DaaMarketContext } from "@/src/daa/modules/marketContext/marketContextTypes";

function regimeEmoji(regime: string): string {
  if (regime === "risk_on") return "\u{1F7E2}";  // 🟢
  if (regime === "risk_off") return "\u{1F534}";  // 🔴
  return "\u{1F7E1}";  // 🟡
}

type AiSnapshot = {
  summary?: string;
  reasoning?: string;
  keyRisks?: string[];
  keyOpportunities?: string[];
  cashAdvice?: string;
  cashRationale?: string;
  overallConfidence?: number;
} | null;

export function MarketContextCard(props: {
  marketContext: DaaMarketContext | null;
  aiSnapshot?: AiSnapshot;
}) {
  const [expanded, setExpanded] = useState(false);
  const mc = props.marketContext;

  if (!mc) {
    return (
      <div className="rounded-[14px] border border-[var(--border)] bg-[rgba(13,19,32,0.92)] px-4 py-3 text-center text-xs text-[var(--muted)]">
        市场环境数据暂不可用
      </div>
    );
  }

  const vix = mc.indicators.find((i) => i.key === "vix");
  const confidence = props.aiSnapshot?.overallConfidence ?? mc.confidencePct;

  return (
    <div className="rounded-[14px] border border-[var(--border)] bg-[rgba(13,19,32,0.92)] p-4">
      {/* 主行：综合态势 + VIX + 置信度 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="text-base">{regimeEmoji(mc.regime)}</span>
          <DaaSurfaceStatusPill tone={marketRegimeTone(mc.regime)}>
            {marketRegimeLabel(mc.regime)}
          </DaaSurfaceStatusPill>
        </div>
        {vix ? (
          <span className="font-[var(--font-mono)] text-xs text-[var(--muted)]">VIX {(vix.rawValue ?? 0).toFixed(1)}</span>
        ) : null}
        {confidence != null ? (
          <span className="text-xs text-[var(--faint)]">置信度 {confidence.toFixed(0)}%</span>
        ) : null}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="ml-auto flex items-center gap-1 rounded-[8px] px-2 py-1 text-xs text-[var(--muted)] transition-colors hover:text-[var(--text)]"
        >
          {expanded ? "收起" : "详情"}
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Scope 行 */}
      {mc.scopes.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
          {mc.scopes.map((s) => (
            <span key={s.scope}>
              {regimeEmoji(s.regime)} {s.label}: {marketRegimeLabel(s.regime)}
            </span>
          ))}
        </div>
      ) : null}

      {/* 展开详情 */}
      {expanded && props.aiSnapshot ? (
        <div className="mt-3 space-y-3 border-t border-[var(--border)] pt-3">
          {props.aiSnapshot.summary ? (
            <p className="text-sm leading-6 text-[var(--text)]">{props.aiSnapshot.summary}</p>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            {props.aiSnapshot.keyRisks?.length ? (
              <div className="rounded-[10px] border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">风险</div>
                <ul className="mt-1.5 space-y-1 text-xs text-[var(--muted)]">
                  {props.aiSnapshot.keyRisks.map((r, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {props.aiSnapshot.keyOpportunities?.length ? (
              <div className="rounded-[10px] border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">机会</div>
                <ul className="mt-1.5 space-y-1 text-xs text-[var(--muted)]">
                  {props.aiSnapshot.keyOpportunities.map((o, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-emerald-400" />
                      {o}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          {props.aiSnapshot.cashAdvice ? (
            <div className="flex items-center gap-2 text-xs text-[var(--faint)]">
              <span>现金建议:</span>
              <span className="text-[var(--muted)]">
                {props.aiSnapshot.cashAdvice === "hold" ? "持有现金" : props.aiSnapshot.cashAdvice === "deploy_to_underweight" ? "投入低配标的" : "等待信号"}
              </span>
              {props.aiSnapshot.cashRationale ? <span className="text-[var(--faint)]">- {props.aiSnapshot.cashRationale}</span> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
