"use client";

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
      </div>

      {mc.scopes.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
          {mc.scopes.map((s) => (
            <span key={s.scope}>
              {regimeEmoji(s.regime)} {s.label}: {marketRegimeLabel(s.regime)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
