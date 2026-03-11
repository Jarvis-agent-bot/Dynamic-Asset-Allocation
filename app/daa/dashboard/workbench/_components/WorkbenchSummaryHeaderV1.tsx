"use client";

import { RefreshCcw } from "lucide-react";

import { formatCurrency } from "@/app/daa/dashboard/_components/daaFormatters";
import {
  DeepLedgerActionButton,
  DeepLedgerEmptyState,
  DeepLedgerStatusPill,
  deepLedgerSubtlePanelClassName,
} from "@/app/daa/dashboard/_components/DeepLedgerUI";
import { cn } from "@/lib/utils";

export function WorkbenchSummaryHeaderV1(props: {
  baseCurrency: string;
  totalEquity: number;
  holdingsValue: number;
  cashValue: number;
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <>
      <div className="rounded-[20px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(24,34,54,0.96),rgba(13,19,32,0.98))] px-5 py-4 shadow-[0_22px_48px_rgba(0,0,0,0.24)] sm:px-6">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: "总权益", value: formatCurrency(props.totalEquity, props.baseCurrency), tone: "cyan" as const },
              { label: "持仓", value: formatCurrency(props.holdingsValue, props.baseCurrency), tone: "indigo" as const },
              { label: "现金", value: formatCurrency(props.cashValue, props.baseCurrency), tone: "green" as const },
            ].map((item) => (
              <div key={item.label} className={cn(deepLedgerSubtlePanelClassName, "px-4 py-3")}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">{item.label}</div>
                <div className="mt-2 font-[var(--font-mono)] text-lg text-[var(--text)]">{item.value}</div>
                <div className="mt-2"><DeepLedgerStatusPill tone={item.tone}>账户快照</DeepLedgerStatusPill></div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <DeepLedgerStatusPill tone={props.refreshing ? "amber" : "green"}>{props.refreshing ? "同步中" : "数据已同步"}</DeepLedgerStatusPill>
            <DeepLedgerActionButton onClick={props.onRefresh} disabled={props.loading || props.refreshing}>
              <RefreshCcw className={cn("h-3.5 w-3.5", props.refreshing ? "animate-spin" : "")} />
              {props.refreshing ? "刷新中…" : "刷新"}
            </DeepLedgerActionButton>
          </div>
        </div>
      </div>

      {props.loading ? (
        <DeepLedgerEmptyState title="正在准备工作台…" description="正在同步账户、观察列表与再平衡周期，请稍候。" />
      ) : null}
    </>
  );
}
