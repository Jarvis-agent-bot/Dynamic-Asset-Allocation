"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  DaaSurfacePanel,
  DaaSurfaceStatusPill,
  daaSurfaceSubtlePanelClassName,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { formatCurrency, formatPercent } from "@/app/daa/dashboard/_components/daaFormatters";
import { DashboardErrorNotice } from "@/app/daa/dashboard/_components/DashboardFeedback";
import { cn } from "@/lib/utils";

type DividendReadModel = {
  summary: {
    totalDividendsBase: number;
    pendingDividendsBase: number;
    creditedDividendsBase: number;
    reinvestedDividendsBase: number;
    lastDividendAt: string | null;
  };
  upcomingDividends: Array<{
    symbol: string;
    market: string;
    exDate: string;
    amountPerShare: number;
    currency: string;
  }>;
  recentPayouts: Array<{
    symbol: string;
    market: string;
    exDate: string;
    amountPerShare: number;
    totalAmount: number;
    amountInBase: number;
    currency: string;
    status: string;
    createdAt: string;
  }>;
  portfolioDividendYield: number;
  baseCurrency: string;
};

export function DividendCalendar() {
  const [data, setData] = useState<DividendReadModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/daa/read/dividends");
        if (!res.ok) throw new Error("股息数据获取失败");
        const json = (await res.json()) as DividendReadModel;
        setData(json);
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
        title="股息日历加载失败"
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

  // If no dividend data, don't show panel
  if (!data.upcomingDividends.length && !data.recentPayouts.length && data.summary.totalDividendsBase === 0) {
    return null;
  }

  return (
    <DaaSurfacePanel
      accent="green"
      title="股息日历"
      subtitle={`年化收益率 ${formatPercent(data.portfolioDividendYield / 100)} · 累计 ${formatCurrency(data.summary.totalDividendsBase, data.baseCurrency)}`}
    >
      <div className="space-y-3">
        {/* 摘要行 */}
        <div className="grid gap-2 sm:grid-cols-3">
          <div className={cn(daaSurfaceSubtlePanelClassName, "px-3 py-2.5")}>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">已到账</div>
            <div className="mt-1 font-[var(--font-mono)] text-sm text-[var(--text)]">
              {formatCurrency(data.summary.creditedDividendsBase, data.baseCurrency)}
            </div>
          </div>
          <div className={cn(daaSurfaceSubtlePanelClassName, "px-3 py-2.5")}>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">待支付</div>
            <div className="mt-1 font-[var(--font-mono)] text-sm text-[var(--text)]">
              {formatCurrency(data.summary.pendingDividendsBase, data.baseCurrency)}
            </div>
          </div>
          <div className={cn(daaSurfaceSubtlePanelClassName, "px-3 py-2.5")}>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">年化收益</div>
            <div className="mt-1 font-[var(--font-mono)] text-sm text-[var(--text)]">
              {formatPercent(data.portfolioDividendYield / 100)}
            </div>
          </div>
        </div>

        {/* 近期除权日期 */}
        {data.upcomingDividends.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-[var(--muted)] mb-2">近30天除权日期</div>
            <div className="space-y-1">
              {data.upcomingDividends.slice(0, 3).map((div) => (
                <div key={`${div.symbol}-${div.exDate}`} className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text)] font-mono">{div.symbol}</span>
                  <span className="text-[var(--muted)]">{div.exDate}</span>
                  <span className="text-cyan-400">{div.amountPerShare.toFixed(4)} {div.currency}</span>
                </div>
              ))}
              {data.upcomingDividends.length > 3 && (
                <button
                  type="button"
                  onClick={() => setExpanded(!expanded)}
                  className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors mt-2 flex items-center gap-1"
                >
                  查看全部 ({data.upcomingDividends.length})
                  <ChevronDown className={cn("h-3 w-3 transition-transform", expanded ? "rotate-180" : "")} />
                </button>
              )}
            </div>
            {expanded && data.upcomingDividends.length > 3 && (
              <div className="mt-2 space-y-1">
                {data.upcomingDividends.slice(3).map((div) => (
                  <div key={`${div.symbol}-${div.exDate}`} className="flex items-center justify-between text-xs">
                    <span className="text-[var(--text)] font-mono">{div.symbol}</span>
                    <span className="text-[var(--muted)]">{div.exDate}</span>
                    <span className="text-cyan-400">{div.amountPerShare.toFixed(4)} {div.currency}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </DaaSurfacePanel>
  );
}
