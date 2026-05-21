"use client";

import { ArrowLeft, Copy, ShieldCheck, Star } from "lucide-react";
import { useRouter } from "next/navigation";

import { formatCurrency } from "@/app/daa/dashboard/_components/daaFormatters";
import { deriveAssetPriceChange } from "@/app/daa/dashboard/_components/assetPriceChange";
import { cn } from "@/lib/utils";
import type { AssetUniverseView } from "@/src/daa/modules/workbench/workbenchTypes";

export function AssetInfoBar(props: {
  row: AssetUniverseView;
  baseCurrency: string;
  sparkData?: number[] | null;
}) {
  const { row, baseCurrency, sparkData } = props;
  const router = useRouter();

  const priceChange = deriveAssetPriceChange(row, sparkData);
  const priceChangePercent = priceChange?.changePct ?? null;
  const displayName = row.displayNameZh || row.name || row.symbol;

  // 成本与盈亏 — 优先使用 DB 侧预计算的基准货币成本
  const valBase = row.valuationBase ?? 0;
  const costInstrument = row.costBasis ?? 0;
  const costPerShare = row.holdingQty > 0 && costInstrument > 0 ? costInstrument / row.holdingQty : null;
  const pnlAmount = row.unrealizedPnlBase ?? null;
  const pnlPct = row.unrealizedPnlPct ?? null;
  const riskLabel = row.priceStatus === "fresh" ? "正常" : row.priceStatus === "stale" ? "延迟" : "需确认";

  return (
    <div className="overflow-hidden rounded-[14px] border border-[#1a222a] bg-[#0b0f13]">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-3 py-3">
        <div className="flex min-w-[240px] items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/daa/dashboard/portfolio")}
            className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[#6d7783] transition-colors hover:bg-[#151b22] hover:text-[#d6dde5]"
            title="返回持仓"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[#6d7783] transition-colors hover:bg-[#151b22] hover:text-[#d6dde5]"
            title="关注"
          >
            <Star className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="truncate text-lg font-bold text-[#f3f6f8]">{displayName}</span>
              <span className="font-[var(--font-mono)] text-xs text-[#8a939f]">{row.symbol}</span>
              <Copy className="h-3.5 w-3.5 text-[#59636f]" />
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 font-[var(--font-mono)] text-[11px] text-[#59636f]">
              <span>{row.market}</span>
              <span>{row.currency}</span>
              <span>{row.assetKey}</span>
            </div>
          </div>
        </div>

        <div className="flex min-w-[150px] flex-col">
          <span className="font-[var(--font-mono)] text-2xl font-bold leading-none text-[#f3f6f8]">
            {formatCurrency(row.lastPrice, row.currency)}
          </span>
          {priceChangePercent != null ? (
            <span className={cn(
              "mt-1 font-[var(--font-mono)] text-sm font-semibold",
              priceChangePercent >= 0 ? "text-[#00c076]" : "text-[#f84960]",
            )}>
              {priceChangePercent >= 0 ? "+" : ""}{priceChangePercent.toFixed(2)}%
            </span>
          ) : null}
        </div>

        <div className="ml-auto grid flex-1 grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-3 xl:grid-cols-6">
          <div className="min-w-0">
            <div className="text-[11px] text-[#59636f]">市值</div>
            <div className="mt-1 truncate font-[var(--font-mono)] text-sm font-semibold text-[#d6dde5]">
              {formatCurrency(valBase, baseCurrency)}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] text-[#59636f]">持仓</div>
            <div className="mt-1 truncate font-[var(--font-mono)] text-sm font-semibold text-[#d6dde5]">
              {row.holdingQty % 1 === 0 ? row.holdingQty.toLocaleString() : row.holdingQty.toFixed(4)}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] text-[#59636f]">均价</div>
            <div className="mt-1 truncate font-[var(--font-mono)] text-sm font-semibold text-[#d6dde5]">
              {costPerShare != null ? formatCurrency(costPerShare, row.currency) : "--"}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] text-[#59636f]">权重</div>
            <div className="mt-1 truncate font-[var(--font-mono)] text-sm font-semibold text-[#d6dde5]">
              {(row.actualWeightPct ?? 0).toFixed(2)}%
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] text-[#59636f]">总盈亏</div>
            <div className={cn(
              "mt-1 truncate font-[var(--font-mono)] text-sm font-semibold",
              (pnlAmount ?? 0) >= 0 ? "text-[#00c076]" : "text-[#f84960]",
            )}>
              {pnlAmount != null && pnlPct != null
                ? `${pnlAmount >= 0 ? "+" : ""}${formatCurrency(pnlAmount, baseCurrency)} (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%)`
                : "--"}
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] text-[#59636f]">风险</div>
            <div className="mt-1 inline-flex items-center gap-1 font-[var(--font-mono)] text-sm font-semibold text-[#d6dde5]">
              <ShieldCheck className="h-3.5 w-3.5 text-[#00c076]" />
              {riskLabel}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
