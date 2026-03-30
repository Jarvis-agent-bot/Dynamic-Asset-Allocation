"use client";

import { useEffect, useState } from "react";
import { ChevronDown, TrendingDown, TrendingUp } from "lucide-react";
import {
  DaaSurfacePanel,
  DaaSurfaceStatusPill,
  daaSurfaceSubtlePanelClassName,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { DashboardErrorNotice } from "@/app/daa/dashboard/_components/DashboardFeedback";
import { cn } from "@/lib/utils";

type HfHoldingEntry = {
  fundName: string;
  fundCode: string;
  symbol: string;
  market: string;
  action: "买入" | "卖出" | "持仓";
  weightPct: number;
  prevWeightPct: number;
  changePct: number;
  reportDate: string;
  disclosedAt: string | null;
};

type HfHoldingsReadModel = {
  recentChanges: HfHoldingEntry[];
  lastUpdatedAt: string | null;
  baseCurrency: string;
};

export function HfHoldingsPanel() {
  const [data, setData] = useState<HfHoldingsReadModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/daa/read/hf-holdings");
        if (!res.ok) throw new Error("大佬动向加载失败");
        const json = await res.json();
        const payload = json.ok && json.data ? json.data : json;
        setData(payload as HfHoldingsReadModel);
      } catch (err) {
        setError(err instanceof Error ? err.message : "未知错误");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (error) {
    return (
      <DashboardErrorNotice
        title="大佬动向加载失败"
        description={error}
      />
    );
  }

  if (!data || loading) {
    return (
      <div className={cn(daaSurfaceSubtlePanelClassName, "px-5 py-4")}>
        <div className="h-16 animate-pulse bg-[var(--border)] rounded" />
      </div>
    );
  }

  // If no HF data, show empty notice
  if (!data.recentChanges || data.recentChanges.length === 0) {
    return (
      <DashboardErrorNotice
        title="大佬动向"
        description="暂无基金经理持仓变动数据"
      />
    );
  }

  const displayItems = expanded ? data.recentChanges : data.recentChanges.slice(0, 5);
  const hasMore = data.recentChanges.length > 5;

  const actionColor = (action: string) => {
    if (action === "买入") return "green";
    if (action === "卖出") return "amber";
    return "slate";
  };

  return (
    <DaaSurfacePanel
      accent="slate"
      title="大佬动向"
      subtitle={data.lastUpdatedAt ? `最后更新 ${new Date(data.lastUpdatedAt).toLocaleDateString("zh-CN")}` : "暂无数据"}
    >
      <div className="space-y-2">
        {displayItems.map((entry, idx) => (
          <div
            key={`${entry.fundCode}-${entry.symbol}-${entry.reportDate}-${idx}`}
            className={cn(daaSurfaceSubtlePanelClassName, "px-4 py-2.5")}
          >
            <div className="flex items-center justify-between gap-3">
              {/* Fund & Symbol */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono text-[var(--text)] font-semibold">{entry.symbol}</span>
                  <span className="text-xs text-[var(--muted)]">{entry.fundName}</span>
                </div>
              </div>

              {/* Action Badge */}
              <DaaSurfaceStatusPill tone={actionColor(entry.action)}>
                {entry.action === "买入" ? (
                  <TrendingUp className="mr-1 inline h-3 w-3" />
                ) : entry.action === "卖出" ? (
                  <TrendingDown className="mr-1 inline h-3 w-3" />
                ) : null}
                {entry.action}
              </DaaSurfaceStatusPill>

              {/* Change */}
              <div className="text-right flex-shrink-0">
                <div className={cn("text-xs font-mono", entry.changePct > 0 ? "text-emerald-400" : entry.changePct < 0 ? "text-red-400" : "text-[var(--muted)]")}>
                  {entry.changePct > 0 ? "+" : ""}{entry.changePct.toFixed(2)}%
                </div>
                <div className="text-[10px] text-[var(--faint)]">{entry.reportDate}</div>
              </div>
            </div>
          </div>
        ))}

        {/* Expand button */}
        {hasMore && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors py-2 rounded-lg hover:bg-[rgba(56,189,248,0.08)]"
          >
            {expanded ? "收起" : "查看更多"} ({data.recentChanges.length})
            <ChevronDown className={cn("h-3 w-3 transition-transform", expanded ? "rotate-180" : "")} />
          </button>
        )}
      </div>
    </DaaSurfacePanel>
  );
}
