"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Eye, Loader2, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCurrency } from "@/app/daa/dashboard/_components/daaFormatters";
import { Sparkline } from "@/app/daa/dashboard/_components/Sparkline";
import { deriveAssetPriceChange } from "@/app/daa/dashboard/_components/assetPriceChange";
import { holdingCategoryKey, HOLDING_CATEGORY_META } from "@/app/daa/dashboard/_components/assetLabels";
import { useFundamentals, type AssetFundamentals } from "@/app/daa/dashboard/_hooks/useFundamentals";
import { useSparklines } from "@/app/daa/dashboard/_hooks/useSparklines";
import { useTechnicalSignals } from "@/app/daa/dashboard/_hooks/useTechnicalSignals";
import type { AssetUniverseView } from "@/src/daa/modules/workbench/workbenchTypes";
import type { DaaTechnicalSignal } from "@/src/daa/signals/technicalSignal";
import {
  deriveGrowthRequirementBadge,
  deriveValuationBadge,
  formatCompanyMarketCap,
  formatFundamentalRatio,
  type ValuationTone,
} from "./fundamentalDisplay";

/* ------------------------------------------------------------------ */
/*  单行                                                               */
/* ------------------------------------------------------------------ */

function assetDisplayName(row: AssetUniverseView): string {
  return row.displayNameZh || row.name || row.symbol;
}

function badgeClass(tone: ValuationTone): string {
  if (tone === "cheap") return "bg-emerald-500/12 text-emerald-300";
  if (tone === "fair") return "bg-sky-500/12 text-sky-300";
  if (tone === "expensive") return "bg-amber-500/12 text-amber-300";
  if (tone === "danger") return "bg-red-500/12 text-red-300";
  return "bg-[rgba(255,255,255,0.06)] text-[var(--faint)]";
}

function momentumLabel(value: DaaTechnicalSignal["momentumRegime"]): string {
  if (value === "strong") return "强动量";
  if (value === "weak") return "弱动量";
  return "中性动量";
}

function technicalBadgeClass(signal: DaaTechnicalSignal): string {
  if (signal.momentumRegime === "strong" || signal.scorePct >= 68) return "bg-emerald-500/12 text-emerald-300";
  if (signal.momentumRegime === "weak" || signal.scorePct <= 42) return "bg-red-500/12 text-red-300";
  return "bg-sky-500/12 text-sky-300";
}

function WatchlistRow(props: {
  row: AssetUniverseView;
  sparkData: number[] | null;
  fundamentals?: AssetFundamentals;
  technicalSignal?: DaaTechnicalSignal;
  onClick: () => void;
  onRemove?: (row: AssetUniverseView) => Promise<void> | void;
  removing?: boolean;
  disabled?: boolean;
}) {
  const { row, sparkData } = props;
  const displayName = assetDisplayName(row);

  const priceChange = deriveAssetPriceChange(row, sparkData);
  const changePct = priceChange?.changePct ?? null;
  const isUp = changePct != null ? changePct >= 0 : null;
  const sparkColor = isUp === true ? "hsl(142 71% 45%)" : isUp === false ? "hsl(0 84% 60%)" : "hsl(188 95% 60%)";

  const targetPct = (row.targetWeightHint ?? 0) * 100;
  const actualPct = row.actualWeightPct ?? 0;
  const gap = row.gapPct;
  const valuation = deriveValuationBadge(row, props.fundamentals);
  const growthRequirement = deriveGrowthRequirementBadge(row, props.fundamentals);
  const marketCap = formatCompanyMarketCap(
    props.fundamentals?.marketCap,
    props.fundamentals?.marketCapCurrency || row.currency,
  );
  const technicalSignal = props.technicalSignal;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={props.onClick}
      onKeyDown={(e) => { if (e.key === "Enter") props.onClick(); }}
      className="group flex cursor-pointer items-center gap-3 rounded-[12px] border border-transparent px-4 py-3 transition-colors hover:border-[var(--border)] hover:bg-[rgba(56,189,248,0.04)]"
    >
      {/* 标的 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-semibold text-[var(--text)]">{displayName}</span>
          <span className="shrink-0 font-[var(--font-mono)] text-xs text-[var(--faint)]">{row.symbol}</span>
        </div>
        <div className="mt-0.5 truncate text-xs text-[var(--muted)]">
          {row.market} · {row.currency}
        </div>
        <div className="mt-0.5 line-clamp-1 text-[10px] text-[var(--faint)]" title={`${valuation.description} ${growthRequirement.description}`}>
          已实现估值：{valuation.reason}；增长要求：{growthRequirement.reason}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[var(--faint)]">
          {targetPct > 0 ? <span>目标 {targetPct.toFixed(1)}%</span> : null}
          {actualPct > 0 ? <span>实际 {actualPct.toFixed(1)}%</span> : null}
          {gap != null ? (
            <span className={Math.abs(gap) > 3 ? "text-amber-400/80" : ""}>
              偏离 {gap >= 0 ? "+" : ""}{gap.toFixed(1)}%
            </span>
          ) : null}
          {technicalSignal ? (
            <>
              <span className={cn("rounded px-1.5 py-0.5 font-medium", technicalBadgeClass(technicalSignal))}>
                评分 {technicalSignal.scorePct.toFixed(0)}
              </span>
              <span className={cn("rounded px-1.5 py-0.5 font-medium", technicalBadgeClass(technicalSignal))}>
                {momentumLabel(technicalSignal.momentumRegime)}
              </span>
            </>
          ) : null}
        </div>
        {row.holdingQty > 0 ? (
          <div className="mt-0.5 flex items-center gap-1 text-[10px] text-emerald-400/70">
            <Eye className="h-3 w-3" />
            已持仓
          </div>
        ) : null}
      </div>

      {/* 价格 + 涨跌 */}
      <div className="w-[100px] text-right">
        <div className="font-[var(--font-mono)] text-sm text-[var(--text)]">
          {formatCurrency(row.lastPrice, row.currency)}
        </div>
        {changePct != null ? (
          <div className={cn(
            "font-[var(--font-mono)] text-xs",
            changePct >= 0 ? "text-emerald-400" : "text-red-400",
          )}>
            {changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%
          </div>
        ) : (
          <div className="font-[var(--font-mono)] text-xs text-[var(--faint)]">--</div>
        )}
      </div>

      {/* Sparkline */}
      <div className="hidden w-[100px] sm:block">
        {sparkData ? (
          <Sparkline data={sparkData} width={100} height={36} color={sparkColor} />
        ) : (
          <div className="h-[36px] w-[100px]" />
        )}
      </div>

      {/* 公司市值 */}
      <div className="hidden w-[110px] text-right lg:block">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--faint)]">公司市值</div>
        <div className="font-[var(--font-mono)] text-xs text-[var(--text)]">
          {marketCap}
        </div>
      </div>

      {/* PE */}
      <div className="hidden w-[74px] text-right xl:block">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--faint)]">PE(TTM)</div>
        <div className="font-[var(--font-mono)] text-xs text-[var(--text)]">
          {formatFundamentalRatio(props.fundamentals?.trailingPE)}
        </div>
      </div>

      {/* PB */}
      <div className="hidden w-[64px] text-right xl:block">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--faint)]">PB</div>
        <div className="font-[var(--font-mono)] text-xs text-[var(--text)]">
          {formatFundamentalRatio(props.fundamentals?.pbRatio)}
        </div>
      </div>

      {/* 估值状态 */}
      <div className="hidden w-[96px] text-right md:block">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--faint)]">已实现 / 增长</div>
        <span
          title={valuation.description}
          className={cn("inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium", badgeClass(valuation.tone))}
        >
          {valuation.label}
        </span>
        <span
          title={growthRequirement.description}
          className={cn("mt-0.5 inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium", badgeClass(growthRequirement.tone))}
        >
          {growthRequirement.label}
        </span>
      </div>

      <button
        type="button"
        title="移出观察列表"
        aria-label={`移出观察列表 ${displayName}`}
        disabled={props.disabled || props.removing}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void props.onRemove?.(row);
        }}
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--faint)] transition-colors hover:bg-red-500/10 hover:text-red-300",
          (props.disabled || props.removing) ? "cursor-not-allowed opacity-50" : "",
        )}
      >
        {props.removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      </button>

      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--faint)] transition-colors group-hover:text-[var(--text)]" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  主组件                                                             */
/* ------------------------------------------------------------------ */

export function WatchlistItemList(props: {
  rows: AssetUniverseView[];
  onRemoveFromWatchlist?: (row: AssetUniverseView) => Promise<void> | void;
  actioningAssetKey?: string | null;
  disabled?: boolean;
}) {
  const router = useRouter();
  const { rows } = props;
  const [activeCategory, setActiveCategory] = useState("all");

  const watchRows = useMemo(() => rows.filter((r) => r.watchEnabled), [rows]);

  // 批量 sparkline（1 次 API）
  const sparklineSymbols = useMemo(() => watchRows.map((r) => r.yfinanceSymbol || r.symbol), [watchRows]);
  const sparklines = useSparklines(sparklineSymbols);
  const fundamentals = useFundamentals(sparklineSymbols);
  const technicalSignals = useTechnicalSignals(sparklineSymbols);

  const availableCategories = useMemo(() => {
    const keys = new Set(watchRows.map((r) => holdingCategoryKey(r.market, r.assetClass)));
    return HOLDING_CATEGORY_META.filter((m) => m.key === "all" || keys.has(m.key));
  }, [watchRows]);

  const filteredRows = useMemo(() => {
    if (activeCategory === "all") return watchRows;
    return watchRows.filter((r) => holdingCategoryKey(r.market, r.assetClass) === activeCategory);
  }, [watchRows, activeCategory]);

  const handleRowClick = useCallback((row: AssetUniverseView) => {
    router.push(`/daa/dashboard/portfolio/${encodeURIComponent(row.assetKey)}`);
  }, [router]);

  if (watchRows.length === 0) return null;

  return (
    <div className="space-y-2">
      {/* 分类 Tab */}
      {availableCategories.length > 2 ? (
        <div className="flex flex-wrap gap-1.5 px-1" role="tablist">
          {availableCategories.map((cat) => (
            <button
              key={cat.key}
              type="button"
              role="tab"
              aria-selected={activeCategory === cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={cn(
                "rounded-[10px] px-3 py-1.5 text-xs font-medium transition-colors",
                activeCategory === cat.key
                  ? "bg-[rgba(56,189,248,0.12)] text-[var(--text)]"
                  : "text-[var(--muted)] hover:text-[var(--text)] hover:bg-[rgba(255,255,255,0.04)]",
              )}
            >
              {cat.label}
              {cat.key === "all" ? ` ${watchRows.length}` : ""}
            </button>
          ))}
        </div>
      ) : null}

      <div className="divide-y divide-[rgba(255,255,255,0.04)]">
        {filteredRows.map((row) => (
          <WatchlistRow
            key={row.assetKey}
            row={row}
            sparkData={sparklines[row.yfinanceSymbol || row.symbol] ?? sparklines[row.symbol] ?? null}
            fundamentals={fundamentals[(row.yfinanceSymbol || row.symbol).toUpperCase()] ?? fundamentals[row.symbol.toUpperCase()]}
            technicalSignal={technicalSignals[(row.yfinanceSymbol || row.symbol).toUpperCase()] ?? technicalSignals[row.symbol.toUpperCase()]}
            onClick={() => handleRowClick(row)}
            onRemove={props.onRemoveFromWatchlist}
            removing={props.actioningAssetKey === row.assetKey}
            disabled={props.disabled}
          />
        ))}
      </div>

      {filteredRows.length === 0 ? (
        <div className="py-8 text-center text-sm text-[var(--muted)]">该分类下暂无观察标的</div>
      ) : null}
    </div>
  );
}
