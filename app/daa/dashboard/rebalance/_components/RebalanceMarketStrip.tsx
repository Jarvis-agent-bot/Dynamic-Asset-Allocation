"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { DaaSurfacePanel, DaaSurfaceStatusPill } from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { MarketIndicatorDashboard } from "@/app/daa/dashboard/_shared/MarketIndicatorDashboard";
import { marketRegimeLabel, marketRegimeTone } from "@/app/daa/dashboard/_shared/rebalance/rebalanceLabels";
import type { DaaMarketContext, DaaMarketIndicatorSnapshot } from "@/src/daa/modules/marketContext/marketContextTypes";

const HIGHLIGHT_KEYS: DaaMarketIndicatorSnapshot["key"][] = ["vix", "qqq_spy_ratio", "btc_eth_ratio", "gold_silver_ratio"];

function formatIndicatorValue(ind: DaaMarketIndicatorSnapshot | undefined): string {
  if (!ind || ind.rawValue == null || !Number.isFinite(ind.rawValue)) return "—";
  const value = Number(ind.rawValue);
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function indicatorTone(ind: DaaMarketIndicatorSnapshot | undefined) {
  if (!ind) return "slate" as const;
  if (ind.stance === "risk_off") return "red" as const;
  if (ind.stance === "risk_on") return "green" as const;
  if (ind.stance === "transitional") return "amber" as const;
  return "slate" as const;
}

export function RebalanceMarketStrip({ marketContext }: { marketContext: DaaMarketContext | null }) {
  const [expanded, setExpanded] = useState(false);

  if (!marketContext) return null;

  const indicators = marketContext.indicators ?? [];
  const indicatorMap = new Map(indicators.map((ind) => [ind.key, ind] as const));
  const regime = marketContext.regime;
  const riskScore = Math.round(marketContext.riskOffScorePct ?? 0);
  const reason = marketContext.reasons?.[0];

  return (
    <DaaSurfacePanel
      accent={marketRegimeTone(regime)}
      title="市场环境"
      subtitle={expanded
        ? "完整指标列表，点击单项可看历史走势。仅解释环境，不代表订单方向。"
        : "默认仅显示概览；需要细看时再展开。"}
      action={(
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex min-h-10 items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 text-xs font-medium text-[var(--muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {expanded ? "收起" : "展开全部指标"}
        </button>
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <DaaSurfaceStatusPill tone={marketRegimeTone(regime)}>
          {marketRegimeLabel(regime)} · 风险分 {riskScore}/100
        </DaaSurfaceStatusPill>
        {HIGHLIGHT_KEYS.map((key) => {
          const ind = indicatorMap.get(key);
          if (!ind) return null;
          return (
            <div
              key={key}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11px]"
              title={ind.reason || ind.label}
            >
              <span className="text-[var(--faint)]">{ind.label}</span>
              <span className="font-[var(--font-mono)] text-[var(--text)]">{formatIndicatorValue(ind)}{ind.unit ? ind.unit : ""}</span>
              <DaaSurfaceStatusPill tone={indicatorTone(ind)} className="text-[9px]">
                {ind.stance === "risk_off" ? "避险" : ind.stance === "risk_on" ? "进攻" : ind.stance === "transitional" ? "过渡" : "中性"}
              </DaaSurfaceStatusPill>
            </div>
          );
        })}
      </div>

      {!expanded && reason ? (
        <div className="mt-3 line-clamp-2 text-xs leading-5 text-[var(--muted)]">{reason}</div>
      ) : null}

      {expanded ? (
        <div className="mt-4 border-t border-[var(--border)] pt-4">
          <MarketIndicatorDashboard marketContext={marketContext} hideClock />
        </div>
      ) : null}
    </DaaSurfacePanel>
  );
}
