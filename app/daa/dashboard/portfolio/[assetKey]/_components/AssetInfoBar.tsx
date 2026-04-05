"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

import { formatCurrency } from "@/app/daa/dashboard/_components/daaFormatters";
import { cn } from "@/lib/utils";
import type { AssetUniverseView } from "@/src/daa/modules/workbench/workbenchTypes";

export function AssetInfoBar(props: {
  row: AssetUniverseView;
  baseCurrency: string;
}) {
  const { row, baseCurrency } = props;
  const router = useRouter();

  const priceDelta = (row as Record<string, unknown>).priceDelta as number | undefined;
  const priceChangePercent = priceDelta != null && row.lastPrice > 0
    ? (priceDelta / (row.lastPrice - priceDelta)) * 100
    : null;

  // 成本与盈亏
  // costBasis 是标的货币的总成本，需要乘 fxRateToBase 转为基准货币
  const costInstrument = row.costBasis ?? 0;
  const fx = row.fxRateToBase ?? 1;
  const costInBase = costInstrument * fx;
  const valBase = row.valuationBase ?? 0;
  const costPerShare = row.holdingQty > 0 && costInstrument > 0 ? costInstrument / row.holdingQty : null;
  const pnlAmount = costInBase > 0 && valBase > 0 ? valBase - costInBase : null;
  const pnlPct = costInBase > 0 && valBase > 0 ? ((valBase - costInBase) / costInBase) * 100 : null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-4">
      {/* 返回按钮 */}
      <button
        type="button"
        onClick={() => router.push("/daa/dashboard/portfolio")}
        className="flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-sm text-[var(--muted)] transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--text)]"
      >
        <ArrowLeft className="h-4 w-4" />
        持仓
      </button>

      {/* 标的名称 */}
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-bold text-[var(--text)]">{row.symbol}</span>
        <span className="text-xs text-[var(--muted)]">{row.market} · {row.currency}</span>
      </div>

      {/* 当前价 + 涨跌幅 */}
      <div className="flex items-baseline gap-2">
        <span className="font-[var(--font-mono)] text-xl font-bold text-[var(--text)]">
          {formatCurrency(row.lastPrice, row.currency)}
        </span>
        {priceChangePercent != null ? (
          <span className={cn(
            "font-[var(--font-mono)] text-sm font-semibold",
            priceChangePercent >= 0 ? "text-emerald-400" : "text-red-400",
          )}>
            {priceChangePercent >= 0 ? "+" : ""}{priceChangePercent.toFixed(2)}%
          </span>
        ) : null}
      </div>

      {/* 持仓详情 */}
      {row.holdingQty > 0 ? (
        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
          <span>
            持仓 <span className="font-[var(--font-mono)] text-[var(--text)]">
              {row.holdingQty % 1 === 0 ? row.holdingQty.toLocaleString() : row.holdingQty.toFixed(4)}
            </span>
          </span>
          {costPerShare != null ? (
            <span>
              均价 <span className="font-[var(--font-mono)] text-[var(--text)]">
                {formatCurrency(costPerShare, row.currency)}
              </span>
            </span>
          ) : null}
          <span>
            市值 <span className="font-[var(--font-mono)] text-[var(--text)]">
              {formatCurrency(valBase, baseCurrency)}
            </span>
          </span>
          {pnlAmount != null && pnlPct != null ? (
            <span className={cn(
              "font-[var(--font-mono)] font-semibold",
              pnlAmount >= 0 ? "text-emerald-400" : "text-red-400",
            )}>
              {pnlAmount >= 0 ? "+" : ""}{formatCurrency(pnlAmount, baseCurrency)} ({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%)
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
