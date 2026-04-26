"use client";

import { RefreshCcw } from "lucide-react";

import { SkeletonChart } from "@/app/daa/dashboard/_components/SkeletonPatterns";
import {
  DaaSurfaceActionButton,
  DaaSurfaceEmptyState,
  DaaSurfaceStatusPill,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { PerformanceChart } from "@/app/daa/dashboard/_shared/PerformanceChart";
import { cn } from "@/lib/utils";

export type PortfolioStatusProps = {
  baseCurrency: string;
  totalEquity: number;
  holdingsValue: number;
  availableCashValue: number;
  frozenCashValue: number;
  equityDelta: { dayChange: number | null; dayChangePct: number | null; weekChange: number | null; weekChangePct: number | null } | null;
  snapshots: Array<{ ts: string; totalEquity: number }>;
  cashFlowEvents?: Array<{ ts: string; side: "deposit" | "withdraw"; amount: number }>;
  allocationSummary: {
    topHoldings: Array<{ assetKey: string; symbol: string; value: number; weightPct: number }>;
    cashValue?: number;
  } | null;
  loading: boolean;
  refreshing: boolean;
  priceStreamConnected?: boolean;
  onRefresh: () => void;
  /** 入金/出金回调（不传则不显示按钮） */
  onDeposit?: () => void;
  onWithdraw?: () => void;
};

export function PortfolioStatus(props: PortfolioStatusProps) {
  const isEmpty = !props.totalEquity;
  const syncTone = props.loading ? "slate" : props.refreshing ? "amber" : isEmpty ? "slate" : "green";
  const syncLabel = props.loading ? "准备中" : props.refreshing ? "同步中" : isEmpty ? "等待入金" : "数据已同步";

  if (props.loading && !props.totalEquity) {
    return <DaaSurfaceEmptyState title="正在准备数据…" description="正在同步账户、观察列表与再平衡周期，请稍候。" />;
  }

  return (
    <div className="rounded-[18px] border border-[var(--border)] bg-[rgba(8,12,20,0.62)] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[var(--text)]">权益走势</div>
          <div className="mt-1 text-xs text-[var(--muted)]">基于账户快照和手动现金流计算</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DaaSurfaceStatusPill tone={syncTone}>{syncLabel}</DaaSurfaceStatusPill>
          {props.priceStreamConnected != null ? (
            <DaaSurfaceStatusPill tone={props.priceStreamConnected ? "green" : "slate"}>
              {props.priceStreamConnected ? "实时" : "离线"}
            </DaaSurfaceStatusPill>
          ) : null}
          <DaaSurfaceActionButton onClick={props.onRefresh} disabled={props.loading || props.refreshing}>
            <RefreshCcw className={cn("h-3.5 w-3.5", props.refreshing ? "animate-spin" : "")} />
            {props.refreshing ? "刷新中…" : "刷新"}
          </DaaSurfaceActionButton>
        </div>
      </div>

      {!props.snapshots || props.snapshots.length === 0 ? (
        <SkeletonChart />
      ) : (
        <PerformanceChart snapshots={props.snapshots} cashFlowEvents={props.cashFlowEvents} />
      )}
    </div>
  );
}
