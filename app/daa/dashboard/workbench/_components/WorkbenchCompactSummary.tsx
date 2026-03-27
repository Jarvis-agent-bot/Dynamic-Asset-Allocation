"use client";

import { useMemo } from "react";
import { ArrowDown, ArrowUp, RefreshCcw } from "lucide-react";
import { Line, LineChart, ResponsiveContainer } from "recharts";

import { formatCurrency, formatPercent } from "@/app/daa/dashboard/_components/daaFormatters";
import {
  DaaSurfaceActionButton,
  DaaSurfaceStatusPill,
  daaSurfaceSubtlePanelClassName,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { cn } from "@/lib/utils";

export function WorkbenchCompactSummary(props: {
  baseCurrency: string;
  totalEquity: number;
  holdingsValue: number;
  availableCashValue: number;
  equityDelta: { dayChange: number | null; dayChangePct: number | null; weekChange: number | null; weekChangePct: number | null } | null;
  snapshots: Array<{ ts: string; totalEquity: number }>;
  allocationSummary: { topHoldings: Array<{ assetKey: string; symbol: string; value: number; weightPct: number }> } | null;
  loading: boolean;
  refreshing: boolean;
  priceStreamConnected?: boolean;
  onRefresh: () => void;
}) {
  const sparkData = useMemo(() => {
    const raw = props.snapshots || [];
    return raw.slice(-30).map((s) => ({ v: s.totalEquity }));
  }, [props.snapshots]);

  const topHoldings = useMemo(() => {
    return (props.allocationSummary?.topHoldings || []).slice(0, 5);
  }, [props.allocationSummary]);

  const syncTone = props.loading ? "slate" : props.refreshing ? "amber" : "green";
  const syncLabel = props.loading ? "准备中" : props.refreshing ? "同步中" : "数据已同步";

  return (
    <div className={cn(daaSurfaceSubtlePanelClassName, "px-4 py-3 sm:px-5")}>
      <div className="grid items-center gap-4 xl:grid-cols-[1fr_200px_1fr_auto]">
        {/* 左侧：总权益 + 日/周变化 */}
        <div className="min-w-0">
          {props.loading ? (
            <div className="h-8 w-36 animate-pulse rounded-[8px] bg-[var(--border)]" />
          ) : (
            <div className="font-[var(--font-mono)] text-2xl tabular-nums text-[var(--text)]">
              {formatCurrency(props.totalEquity, props.baseCurrency)}
            </div>
          )}
          {!props.loading && props.equityDelta && (
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
              {props.equityDelta.dayChangePct != null && (
                <span className={(props.equityDelta.dayChange ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}>
                  {(props.equityDelta.dayChange ?? 0) >= 0 ? <ArrowUp className="mr-0.5 inline h-3 w-3" /> : <ArrowDown className="mr-0.5 inline h-3 w-3" />}
                  今日 {formatPercent(Math.abs(props.equityDelta.dayChangePct))}
                </span>
              )}
              {props.equityDelta.weekChangePct != null && (
                <span className={(props.equityDelta.weekChange ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}>
                  {(props.equityDelta.weekChange ?? 0) >= 0 ? <ArrowUp className="mr-0.5 inline h-3 w-3" /> : <ArrowDown className="mr-0.5 inline h-3 w-3" />}
                  本周 {formatPercent(Math.abs(props.equityDelta.weekChangePct))}
                </span>
              )}
            </div>
          )}
          <div className="mt-1 text-xs text-[var(--muted)]">
            持仓 {formatCurrency(props.holdingsValue, props.baseCurrency)} · 现金 {formatCurrency(props.availableCashValue, props.baseCurrency)}
          </div>
        </div>

        {/* 中间：迷你走势图 */}
        <div className="hidden h-14 md:hidden xl:block">
          {sparkData.length > 1 ? (
            <ResponsiveContainer width="100%" height={56}>
              <LineChart data={sparkData}>
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke="var(--primary)"
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-[var(--faint)]">暂无走势</div>
          )}
        </div>

        {/* 右侧：Top 5 持仓 */}
        <div className="min-w-0">
          {topHoldings.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
              {topHoldings.map((h) => (
                <span key={h.symbol} className="whitespace-nowrap">
                  <span className="font-medium text-[var(--text)]">{h.symbol}</span>{" "}
                  {formatPercent(h.weightPct, 0)}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-xs text-[var(--faint)]">暂无持仓数据</div>
          )}
        </div>

        {/* 最右侧：状态 + 刷新 */}
        <div className="flex flex-wrap items-center gap-2">
          <DaaSurfaceStatusPill tone="slate">本地模拟</DaaSurfaceStatusPill>
          <DaaSurfaceStatusPill tone={syncTone}>{syncLabel}</DaaSurfaceStatusPill>
          {props.priceStreamConnected != null && (
            <DaaSurfaceStatusPill tone={props.priceStreamConnected ? "green" : "slate"}>
              {props.priceStreamConnected ? "实时" : "离线"}
            </DaaSurfaceStatusPill>
          )}
          <DaaSurfaceActionButton onClick={props.onRefresh} disabled={props.loading || props.refreshing}>
            <RefreshCcw className={cn("h-3.5 w-3.5", props.refreshing ? "animate-spin" : "")} />
            {props.loading ? "准备中…" : props.refreshing ? "刷新中…" : "刷新"}
          </DaaSurfaceActionButton>
        </div>
      </div>
    </div>
  );
}
