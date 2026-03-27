"use client";

import { useMemo } from "react";
import { ChevronRight, Minus, Plus } from "lucide-react";

import { formatCurrency } from "@/app/daa/dashboard/_components/daaFormatters";
import {
  DaaSurfaceActionButton,
  daaSurfaceSubtlePanelClassName,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { cn } from "@/lib/utils";

export function WorkbenchCashCompact(props: {
  baseCurrency: string;
  availableCash: number;
  frozenCash: number;
  cashLedger: Array<{ side: string; amount: number; baseCurrency: string; ts: string }>;
  cashMutationsAllowed?: boolean;
  onDeposit: () => void;
  onWithdraw: () => void;
  onExpand: () => void;
}) {
  const recentEntries = useMemo(() => {
    return (props.cashLedger || []).slice(0, 3).map((entry) => {
      const sign = entry.side === "withdraw" ? "-" : "+";
      const label = entry.side === "withdraw" ? "出金" : "入金";
      const dateStr = entry.ts
        ? new Date(entry.ts).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })
        : "";
      return { sign, label, amount: entry.amount, currency: entry.baseCurrency, dateStr };
    });
  }, [props.cashLedger]);

  return (
    <div className={cn(daaSurfaceSubtlePanelClassName, "px-4 py-3 sm:px-5")}>
      <div className="flex flex-wrap items-center gap-4">
        {/* 左侧：现金标签 + 金额 */}
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">现金</span>
          <span className="font-[var(--font-mono)] text-lg tabular-nums text-[var(--text)]">
            {formatCurrency(props.availableCash, props.baseCurrency)}
          </span>
          {props.frozenCash > 0 && (
            <span className="text-xs text-[var(--muted)]">
              冻结 {formatCurrency(props.frozenCash, props.baseCurrency)}
            </span>
          )}
        </div>

        {/* 中间：入金/出金按钮 */}
        {props.cashMutationsAllowed && (
          <div className="flex items-center gap-2">
            <DaaSurfaceActionButton tone="success" className="px-2.5 py-1.5 text-xs" onClick={props.onDeposit}>
              <Plus className="h-3.5 w-3.5" />
              入金
            </DaaSurfaceActionButton>
            <DaaSurfaceActionButton tone="warning" className="px-2.5 py-1.5 text-xs" onClick={props.onWithdraw}>
              <Minus className="h-3.5 w-3.5" />
              出金
            </DaaSurfaceActionButton>
          </div>
        )}

        {/* 右侧：最近流水 */}
        {recentEntries.length > 0 && (
          <div className="hidden items-center gap-3 text-xs text-[var(--muted)] lg:flex">
            {recentEntries.map((entry, i) => (
              <span key={i} className="whitespace-nowrap">
                {entry.sign}{formatCurrency(entry.amount, entry.currency)} {entry.label} {entry.dateStr}
              </span>
            ))}
          </div>
        )}

        {/* 最右侧：查看全部 */}
        <button
          type="button"
          onClick={props.onExpand}
          className="ml-auto flex items-center gap-1 text-xs font-medium text-[var(--muted)] transition-colors hover:text-[var(--text)]"
        >
          查看全部
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
