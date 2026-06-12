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
  const priceChangeTone = priceChangePercent == null || Math.abs(priceChangePercent) < 0.005
    ? "text-[var(--muted)]"
    : priceChangePercent > 0
      ? "text-[var(--success)]"
      : "text-[var(--danger)]";
  const priceChangeText = priceChangePercent == null
    ? null
    : `${priceChangePercent > 0 ? "+" : ""}${priceChangePercent.toFixed(2)}%`;
  const displayName = row.displayNameZh || row.name || row.symbol;

  // 成本与盈亏 — 优先使用 DB 侧预计算的基准货币成本
  const valBase = row.valuationBase ?? 0;
  const costInstrument = row.costBasis ?? 0;
  const costPerShare = row.holdingQty > 0 && costInstrument > 0 ? costInstrument / row.holdingQty : null;
  const pnlAmount = row.unrealizedPnlBase ?? null;
  const pnlPct = row.unrealizedPnlPct ?? null;
  const riskLabel = row.priceStatus === "fresh" ? "正常" : row.priceStatus === "stale" ? "延迟" : "需确认";
  const targetPct = row.targetWeightPct ?? (row.targetWeightHint ?? 0) * 100;
  const gapPct = row.gapPct ?? (targetPct - (row.actualWeightPct ?? 0));
  const absGapPct = Math.abs(gapPct);
  const riskTone = row.priceStatus === "fresh"
    ? "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success)]"
    : row.priceStatus === "stale"
      ? "border-[var(--amber-border)] bg-[var(--amber-bg)] text-[var(--amber)]"
      : "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)]";
  const riskIconTone = row.priceStatus === "fresh"
    ? "text-[var(--success)]"
    : row.priceStatus === "stale"
      ? "text-[var(--amber)]"
      : "text-[var(--danger)]";
  const gapPillTone = absGapPct >= 5
    ? "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)]"
    : absGapPct >= 2
      ? "border-[var(--amber-border)] bg-[var(--amber-bg)] text-[var(--amber)]"
      : "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success)]";

  return (
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-4">
        <div className="flex min-w-[240px] items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/daa/dashboard/portfolio")}
            className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-[var(--muted)] transition-colors hover:bg-[var(--elevated)] hover:text-[var(--text)]"
            title="返回持仓"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-[var(--muted)] transition-colors hover:bg-[var(--primary-bg)] hover:text-[var(--primary)]"
            title="关注"
          >
            <Star className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="truncate text-lg font-bold text-[var(--text)]">{displayName}</span>
              <span className="font-[var(--font-mono)] text-xs text-[var(--muted)]">{row.symbol}</span>
              <Copy className="h-3.5 w-3.5 text-[var(--faint)]" />
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 font-[var(--font-mono)] text-[11px] text-[var(--faint)]">
              <span>{row.market}</span>
              <span>{row.currency}</span>
              <span>{row.assetKey}</span>
            </div>
          </div>
        </div>

        <div className="flex min-w-[150px] flex-col">
          <span className="font-[var(--font-mono)] text-2xl font-bold leading-none text-[var(--text)]">
            {formatCurrency(row.lastPrice, row.currency)}
          </span>
          {priceChangeText != null ? (
            <span className={cn(
              "mt-1 font-[var(--font-mono)] text-sm font-semibold",
              priceChangeTone,
            )}>
              {priceChangeText}
            </span>
          ) : null}
        </div>

        <div className="ml-auto grid flex-1 grid-cols-2 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] md:grid-cols-3 xl:grid-cols-[repeat(5,minmax(92px,1fr))_minmax(170px,1.45fr)]">
          <div className="min-w-0 border-b border-r border-[var(--border)] px-3 py-2 xl:border-b-0">
            <div className="text-[11px] text-[var(--muted)]">市值</div>
            <div className="mt-1 truncate font-[var(--font-mono)] text-sm font-semibold text-[var(--text)]">
              {formatCurrency(valBase, baseCurrency)}
            </div>
          </div>
          <div className="min-w-0 border-b border-[var(--border)] px-3 py-2 md:border-r xl:border-b-0">
            <div className="text-[11px] text-[var(--muted)]">持仓</div>
            <div className="mt-1 truncate font-[var(--font-mono)] text-sm font-semibold text-[var(--text)]">
              {row.holdingQty % 1 === 0 ? row.holdingQty.toLocaleString() : row.holdingQty.toFixed(4)}
            </div>
          </div>
          <div className="min-w-0 border-b border-r border-[var(--border)] px-3 py-2 md:border-r-0 xl:border-b-0 xl:border-r">
            <div className="text-[11px] text-[var(--muted)]">均价</div>
            <div className="mt-1 truncate font-[var(--font-mono)] text-sm font-semibold text-[var(--text)]">
              {costPerShare != null ? formatCurrency(costPerShare, row.currency) : "--"}
            </div>
          </div>
          <div className="min-w-0 border-b border-[var(--border)] px-3 py-2 md:border-b-0 md:border-r">
            <div className="text-[11px] text-[var(--muted)]">当前 / 目标</div>
            <div className="mt-1 truncate font-[var(--font-mono)] text-sm font-semibold text-[var(--text)]">
              {(row.actualWeightPct ?? 0).toFixed(2)}% / {targetPct.toFixed(2)}%
            </div>
          </div>
          <div className="min-w-0 border-r border-[var(--border)] px-3 py-2">
            <div className="text-[11px] text-[var(--muted)]">总盈亏</div>
            <div className={cn(
              "mt-1 truncate font-[var(--font-mono)] text-sm font-semibold",
              (pnlAmount ?? 0) >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]",
            )}>
              {pnlAmount != null && pnlPct != null
                ? `${pnlAmount >= 0 ? "+" : ""}${formatCurrency(pnlAmount, baseCurrency)} (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%)`
                : "--"}
            </div>
          </div>
          <div className="min-w-0 px-3 py-2 xl:min-w-[170px]">
            <div className="text-[11px] text-[var(--muted)]">状态</div>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
              <span className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-sm)] border px-1.5 py-0.5 font-[var(--font-mono)] text-xs font-semibold",
                riskTone,
              )}>
                <ShieldCheck className={cn("h-3.5 w-3.5", riskIconTone)} />
                {riskLabel}
              </span>
              <span className={cn(
                "inline-flex max-w-full items-center rounded-[var(--radius-sm)] border px-1.5 py-0.5 font-[var(--font-mono)] text-xs font-semibold whitespace-nowrap",
                gapPillTone,
              )}>
                偏离 {gapPct >= 0 ? "+" : ""}{gapPct.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
