"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Eye, Loader2, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCurrency } from "@/app/daa/dashboard/_components/daaFormatters";
import { Sparkline } from "@/app/daa/dashboard/_components/Sparkline";
import { deriveAssetPriceChange } from "@/app/daa/dashboard/_components/assetPriceChange";
import { holdingCategoryKey, HOLDING_CATEGORY_META } from "@/app/daa/dashboard/_components/assetLabels";
import { useFundamentalsState, type AssetFundamentals } from "@/app/daa/dashboard/_hooks/useFundamentals";
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
  if (tone === "cheap") return "bg-[var(--success-bg)] text-[var(--success)]";
  if (tone === "fair") return "bg-[var(--primary-bg)] text-[var(--primary)]";
  if (tone === "expensive") return "bg-amber-500/12 text-amber-300";
  if (tone === "danger") return "bg-red-500/12 text-red-300";
  return "bg-[var(--elevated)] text-[var(--faint)]";
}

function momentumLabel(value: DaaTechnicalSignal["momentumRegime"]): string {
  if (value === "strong") return "强动量";
  if (value === "weak") return "弱动量";
  return "中性动量";
}

function technicalBadgeClass(signal: DaaTechnicalSignal): string {
  if (signal.momentumRegime === "strong" || signal.scorePct >= 68) return "bg-[var(--success-bg)] text-[var(--success)]";
  if (signal.momentumRegime === "weak" || signal.scorePct <= 42) return "bg-red-500/12 text-red-300";
  return "bg-[var(--primary-bg)] text-[var(--primary)]";
}

function isStock(row: AssetUniverseView): boolean {
  return row.assetClass === "EQUITY" || row.instrumentType === "STOCK";
}

function marketCapLabel(row: AssetUniverseView): string {
  if (row.assetClass === "CRYPTO") return "总市值";
  if (isStock(row)) return "公司市值";
  return "市值";
}

function buildFundamentalSummary(input: {
  row: AssetUniverseView;
  fundamentals?: AssetFundamentals;
  loading: boolean;
  error: string | null;
}): string {
  if (input.loading && !input.fundamentals) return "基本面同步中";
  if (input.error && !input.fundamentals) return "基本面暂不可用";

  const parts: string[] = [];
  const marketCap = formatCompanyMarketCap(
    input.fundamentals?.marketCap,
    input.fundamentals?.marketCapCurrency || input.row.currency,
  );
  if (marketCap !== "--") parts.push(`${marketCapLabel(input.row)} ${marketCap}`);

  const pe = formatFundamentalRatio(input.fundamentals?.trailingPE);
  const pb = formatFundamentalRatio(input.fundamentals?.pbRatio);
  if (pe !== "--") parts.push(`PE ${pe}`);
  if (pb !== "--") parts.push(`PB ${pb}`);

  if (parts.length > 0) return parts.join(" · ");
  return isStock(input.row) ? "基本面数据不足" : "基本面不适用";
}

function WatchlistRow(props: {
  row: AssetUniverseView;
  sparkData: number[] | null;
  fundamentals?: AssetFundamentals;
  fundamentalsLoading: boolean;
  fundamentalsError: string | null;
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
  const fundamentalSummary = buildFundamentalSummary({
    row,
    fundamentals: props.fundamentals,
    loading: props.fundamentalsLoading,
    error: props.fundamentalsError,
  });
  const technicalSignal = props.technicalSignal;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={props.onClick}
      onKeyDown={(e) => { if (e.key === "Enter") props.onClick(); }}
      className="group flex cursor-pointer items-center gap-3 rounded-[12px] border border-transparent px-4 py-3 transition-colors hover:border-[var(--border)] hover:bg-[var(--primary-bg)]"
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
        <div className="mt-0.5 line-clamp-1 text-[10px] text-[var(--faint)]" title={fundamentalSummary}>
          {fundamentalSummary}
        </div>
        <div className="mt-0.5 line-clamp-1 text-[10px] text-[var(--faint)]" title={`${valuation.description} ${growthRequirement.description}`}>
          估值：{valuation.reason}；增长要求：{growthRequirement.reason}
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
          <div className="mt-0.5 flex items-center gap-1 text-[10px] text-[var(--success)]">
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
            changePct >= 0 ? "text-[var(--success)]" : "text-red-400",
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
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--faint)]">{marketCapLabel(row)}</div>
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
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--faint)]">估值 / 增长</div>
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
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--danger-bg)] hover:text-[var(--danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger-bg)]",
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
  const [sortKey, setSortKey] = useState<"default" | "change_desc" | "change_asc" | "name_asc" | "target_desc">("default");
  const [showAll, setShowAll] = useState(false);

  const watchRows = useMemo(() => rows.filter((r) => r.watchEnabled), [rows]);

  // 批量 sparkline（1 次 API）
  const sparklineSymbols = useMemo(() => watchRows.map((r) => r.yfinanceSymbol || r.symbol), [watchRows]);
  const sparklines = useSparklines(sparklineSymbols);
  const fundamentalsState = useFundamentalsState(sparklineSymbols);
  const fundamentals = fundamentalsState.items;
  const technicalSignals = useTechnicalSignals(sparklineSymbols);

  const availableCategories = useMemo(() => {
    const keys = new Set(watchRows.map((r) => holdingCategoryKey(r.market, r.assetClass)));
    return HOLDING_CATEGORY_META.filter((m) => m.key === "all" || keys.has(m.key));
  }, [watchRows]);

  const categoryFiltered = useMemo(() => {
    if (activeCategory === "all") return watchRows;
    return watchRows.filter((r) => holdingCategoryKey(r.market, r.assetClass) === activeCategory);
  }, [watchRows, activeCategory]);

  const sortedRows = useMemo(() => {
    if (sortKey === "default") return categoryFiltered;
    const arr = categoryFiltered.slice();
    const changePct = (r: AssetUniverseView): number => {
      const s = sparklines[r.yfinanceSymbol || r.symbol] ?? sparklines[r.symbol] ?? null;
      const change = deriveAssetPriceChange(r, s);
      return change?.changePct ?? 0;
    };
    if (sortKey === "change_desc") arr.sort((a, b) => changePct(b) - changePct(a));
    else if (sortKey === "change_asc") arr.sort((a, b) => changePct(a) - changePct(b));
    else if (sortKey === "name_asc") arr.sort((a, b) => assetDisplayName(a).localeCompare(assetDisplayName(b), "zh-CN"));
    else if (sortKey === "target_desc") arr.sort((a, b) => (b.targetWeightHint ?? 0) - (a.targetWeightHint ?? 0));
    return arr;
  }, [categoryFiltered, sortKey, sparklines]);

  const PAGE_SIZE = 20;
  const totalCount = sortedRows.length;
  const filteredRows = showAll || totalCount <= PAGE_SIZE ? sortedRows : sortedRows.slice(0, PAGE_SIZE);

  const handleRowClick = useCallback((row: AssetUniverseView) => {
    router.push(`/daa/dashboard/portfolio/${encodeURIComponent(row.assetKey)}`);
  }, [router]);

  if (watchRows.length === 0) return null;

  return (
    <div className="space-y-2">
      {/* 分类 Tab + 排序 */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        {availableCategories.length > 2 ? (
          <div className="flex flex-wrap gap-1.5" role="tablist">
            {availableCategories.map((cat) => (
              <button
                key={cat.key}
                type="button"
                role="tab"
                aria-selected={activeCategory === cat.key}
                onClick={() => setActiveCategory(cat.key)}
                className={cn(
                  "min-h-9 rounded-[10px] px-3 py-1.5 text-xs font-medium transition-colors",
                  activeCategory === cat.key
                    ? "bg-[var(--primary-bg)] text-[var(--text)]"
                    : "text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--elevated)]",
                )}
              >
                {cat.label}
                {cat.key === "all" ? ` ${watchRows.length}` : ""}
              </button>
            ))}
          </div>
        ) : <div />}
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-[var(--faint)]">排序</label>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
            className="h-10 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2 text-[11px] text-[var(--muted)] outline-none"
            aria-label="排序方式"
          >
            <option value="default">默认</option>
            <option value="change_desc">涨幅 高→低</option>
            <option value="change_asc">跌幅 高→低</option>
            <option value="target_desc">目标权重 高→低</option>
            <option value="name_asc">名称 A-Z</option>
          </select>
        </div>
      </div>

      <div className="divide-y divide-[var(--elevated)]">
        {filteredRows.map((row) => (
          <WatchlistRow
            key={row.assetKey}
            row={row}
            sparkData={sparklines[row.yfinanceSymbol || row.symbol] ?? sparklines[row.symbol] ?? null}
            fundamentals={fundamentals[(row.yfinanceSymbol || row.symbol).toUpperCase()] ?? fundamentals[row.symbol.toUpperCase()]}
            fundamentalsLoading={fundamentalsState.loading}
            fundamentalsError={fundamentalsState.error}
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

      {!showAll && totalCount > PAGE_SIZE ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mx-auto block min-h-9 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
        >
          展开剩余 {totalCount - PAGE_SIZE} 条
        </button>
      ) : null}
    </div>
  );
}
