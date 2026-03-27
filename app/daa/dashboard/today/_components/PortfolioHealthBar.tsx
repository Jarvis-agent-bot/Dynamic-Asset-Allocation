"use client";

import { Shield, TrendingUp, BarChart3 } from "lucide-react";
import type { TodayReadModel } from "@/src/daa/modules/today/todayTypes";

type Props = {
  health: TodayReadModel["portfolioHealth"];
};

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1e6) return `¥${(value / 1e6).toFixed(2)}M`;
  if (Math.abs(value) >= 1e4) return `¥${(value / 1e4).toFixed(1)}万`;
  return `¥${value.toFixed(0)}`;
}

export default function PortfolioHealthBar({ health }: Props) {
  const deltaText =
    health.equityDeltaDayPct != null
      ? `${health.equityDeltaDayPct >= 0 ? "+" : ""}${health.equityDeltaDayPct.toFixed(2)}%`
      : null;
  const deltaColor =
    health.equityDeltaDayPct != null
      ? health.equityDeltaDayPct >= 0
        ? "text-green-600 dark:text-green-400"
        : "text-red-600 dark:text-red-400"
      : "";

  return (
    <section>
      <h3 className="mb-3 text-sm font-medium text-muted-foreground">组合健康</h3>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-card px-4 py-3">
        {/* 持仓市值 */}
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <div>
            <span className="text-sm font-semibold">{formatCurrency(health.totalEquity)}</span>
            {deltaText && (
              <span className={`ml-1.5 text-xs ${deltaColor}`}>{deltaText}</span>
            )}
          </div>
        </div>

        {/* 分散度 */}
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">
            HHI {health.hhi}
            <span className="ml-1 text-xs text-muted-foreground">
              ({health.concentrationLevel})
            </span>
          </span>
        </div>

        {/* 最大回撤 */}
        {health.maxDrawdown != null && (
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">
              最大回撤 {(health.maxDrawdown * 100).toFixed(1)}%
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
