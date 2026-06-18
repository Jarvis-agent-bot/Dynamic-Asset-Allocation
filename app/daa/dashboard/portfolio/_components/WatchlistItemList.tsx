"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Eye, Loader2, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCurrency } from "@/app/daa/dashboard/_components/daaFormatters";
import { Sparkline } from "@/app/daa/dashboard/_components/Sparkline";
import { deriveAssetPriceChange } from "@/app/daa/dashboard/_components/assetPriceChange";
import { holdingCategoryKey, HOLDING_CATEGORY_META } from "@/app/daa/dashboard/_components/assetLabels";
import { isVisibleHolding } from "@/app/daa/dashboard/_shared/holdingVisibility";
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
  if (tone === "expensive") return "bg-[var(--amber-bg)] text-[var(--amber)]";
  if (tone === "danger") return "bg-[var(--danger-bg)] text-[var(--danger)]";
  return "bg-[var(--elevated)] text-[var(--faint)]";
}

function momentumLabel(value: DaaTechnicalSignal["momentumRegime"]): string {
  if (value === "strong") return "强动量";
  if (value === "weak") return "弱动量";
  return "中性动量";
}

function technicalBadgeClass(signal: DaaTechnicalSignal): string {
  if (signal.momentumRegime === "strong" || signal.scorePct >= 68) return "bg-[var(--success-bg)] text-[var(--success)]";
  if (signal.momentumRegime === "weak" || signal.scorePct <= 42) return "bg-[var(--danger-bg)] text-[var(--danger)]";
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
  onUpdateTargetWeight?: (row: AssetUniverseView, targetWeightPct: number) => Promise<void> | void;
  removing?: boolean;
  updatingTarget?: boolean;
  disabled?: boolean;
}) {
  const { row, sparkData } = props;
  const displayName = assetDisplayName(row);

  const priceChange = deriveAssetPriceChange(row, sparkData);
  const changePct = priceChange?.changePct ?? null;
  const isUp = changePct != null ? changePct >= 0 : null;
  const sparkColor = isUp === true ? "var(--success)" : isUp === false ? "var(--danger)" : "var(--primary)";

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
  const hasVisibleHolding = isVisibleHolding(row);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={props.onClick}
      onKeyDown={(e) => { if (e.key === "Enter") props.onClick(); }}
      className="group flex cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-transparent px-3 py-2.5 transition-colors hover:border-[var(--border)] hover:bg-[var(--primary-bg)]"
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
            <span className={Math.abs(gap) > 3 ? "text-[var(--amber)]" : ""}>
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
        {hasVisibleHolding ? (
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
            changePct >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]",
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
        <div className="text-[10px] font-semibold uppercase tracking-normal text-[var(--faint)]">{marketCapLabel(row)}</div>
        <div className="font-[var(--font-mono)] text-xs text-[var(--text)]">
          {marketCap}
        </div>
      </div>

      {/* PE */}
      <div className="hidden w-[74px] text-right xl:block">
        <div className="text-[10px] font-semibold uppercase tracking-normal text-[var(--faint)]">PE(TTM)</div>
        <div className="font-[var(--font-mono)] text-xs text-[var(--text)]">
          {formatFundamentalRatio(props.fundamentals?.trailingPE)}
        </div>
      </div>

      {/* PB */}
      <div className="hidden w-[64px] text-right xl:block">
        <div className="text-[10px] font-semibold uppercase tracking-normal text-[var(--faint)]">PB</div>
        <div className="font-[var(--font-mono)] text-xs text-[var(--text)]">
          {formatFundamentalRatio(props.fundamentals?.pbRatio)}
        </div>
      </div>

      {/* 估值状态 */}
      <div className="hidden w-[96px] text-right md:block">
        <div className="text-[10px] font-semibold uppercase tracking-normal text-[var(--faint)]">估值 / 增长</div>
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

      <TargetWeightQuickEdit
        row={row}
        disabled={props.disabled}
        updating={props.updatingTarget}
        onUpdate={props.onUpdateTargetWeight}
      />

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
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--muted)] transition-colors hover:bg-[var(--danger-bg)] hover:text-[var(--danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger-bg)]",
          (props.disabled || props.removing) ? "cursor-not-allowed opacity-50" : "",
        )}
      >
        {props.removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      </button>

      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--faint)] transition-colors group-hover:text-[var(--text)]" />
    </div>
  );
}

function TargetWeightQuickEdit(props: {
  row: AssetUniverseView;
  disabled?: boolean;
  updating?: boolean;
  onUpdate?: (row: AssetUniverseView, targetWeightPct: number) => Promise<void> | void;
}) {
  const targetPct = (props.row.targetWeightHint ?? 0) * 100;
  const [draft, setDraft] = useState(() => targetPct > 0 ? targetPct.toFixed(2) : "");
  const parsed = Number(draft);
  const valid = draft.trim() !== "" && Number.isFinite(parsed) && parsed >= 0 && parsed <= 100;
  const dirty = valid && Math.abs(parsed - targetPct) >= 0.005;

  useEffect(() => {
    setDraft(targetPct > 0 ? targetPct.toFixed(2) : "");
  }, [props.row.assetKey, targetPct]);

  if (!props.onUpdate) {
    return null;
  }

  async function submit() {
    if (!props.onUpdate || !dirty || !valid || props.disabled || props.updating) return;
    await props.onUpdate(props.row, parsed);
  }

  return (
    <div
      className="hidden w-[136px] shrink-0 xl:block"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.stopPropagation();
          void submit();
        }
      }}
    >
      <div className="mb-1 text-right text-[10px] font-semibold uppercase tracking-normal text-[var(--faint)]">目标权重</div>
      <div className="flex h-8 items-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--card)] px-2 focus-within:border-[var(--primary)] focus-within:ring-2 focus-within:ring-[var(--primary-bg)]">
        <input
          type="number"
          min="0"
          max="100"
          step="0.01"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={props.disabled || props.updating}
          placeholder="0"
          className="min-w-0 flex-1 bg-transparent text-right font-[var(--font-mono)] text-xs text-[var(--text)] outline-none placeholder:text-[var(--faint)] disabled:cursor-not-allowed"
          aria-label={`${props.row.symbol} 目标权重`}
        />
        <span className="ml-1 text-[10px] text-[var(--muted)]">%</span>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!dirty || !valid || props.disabled || props.updating}
          className={cn(
            "ml-1 inline-flex h-5 w-5 items-center justify-center rounded-[var(--radius-sm)] transition-colors",
            dirty && valid && !props.disabled && !props.updating
              ? "bg-[var(--primary)] text-white"
              : "cursor-not-allowed bg-[var(--elevated)] text-[var(--faint)]",
          )}
          aria-label={`保存 ${props.row.symbol} 目标权重`}
        >
          {props.updating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
        </button>
      </div>
      {!valid && draft.trim() !== "" ? (
        <div className="mt-1 text-right text-[10px] text-[var(--danger)]">0-100%</div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  主组件                                                             */
/* ------------------------------------------------------------------ */

export function WatchlistItemList(props: {
  rows: AssetUniverseView[];
  onRemoveFromWatchlist?: (row: AssetUniverseView) => Promise<void> | void;
  onUpdateTargetWeight?: (row: AssetUniverseView, targetWeightPct: number) => Promise<void> | void;
  actioningAssetKey?: string | null;
  updatingTarget?: boolean;
  disabled?: boolean;
}) {
  const router = useRouter();
  const { rows } = props;
  const [activeCategory, setActiveCategory] = useState("all");
  const [sortKey, setSortKey] = useState<"default" | "change_desc" | "change_asc" | "name_asc" | "target_desc">("default");
  const [showAll, setShowAll] = useState(false);

  const watchRows = useMemo(() => rows.filter((assetRow) => assetRow.watchEnabled), [rows]);

  // 批量 sparkline（1 次 API）
  const sparklineSymbols = useMemo(() => watchRows.map((watchRow) => watchRow.yfinanceSymbol || watchRow.symbol), [watchRows]);
  const sparklines = useSparklines(sparklineSymbols);
  const fundamentalsState = useFundamentalsState(sparklineSymbols);
  const fundamentals = fundamentalsState.items;
  const technicalSignals = useTechnicalSignals(sparklineSymbols);

  const availableCategories = useMemo(() => {
    const categoryKeys = new Set(watchRows.map((watchRow) => holdingCategoryKey(watchRow.market, watchRow.assetClass)));
    return HOLDING_CATEGORY_META.filter((categoryMeta) => categoryMeta.key === "all" || categoryKeys.has(categoryMeta.key));
  }, [watchRows]);

  const categoryFiltered = useMemo(() => {
    if (activeCategory === "all") return watchRows;
    return watchRows.filter((watchRow) => holdingCategoryKey(watchRow.market, watchRow.assetClass) === activeCategory);
  }, [watchRows, activeCategory]);

  const sortedRows = useMemo(() => {
    if (sortKey === "default") return categoryFiltered;
    const sortedWatchRows = categoryFiltered.slice();
    const changePct = (assetRow: AssetUniverseView): number => {
      const sparkline = sparklines[assetRow.yfinanceSymbol || assetRow.symbol] ?? sparklines[assetRow.symbol] ?? null;
      const change = deriveAssetPriceChange(assetRow, sparkline);
      return change?.changePct ?? 0;
    };
    if (sortKey === "change_desc") sortedWatchRows.sort((leftAsset, rightAsset) => changePct(rightAsset) - changePct(leftAsset));
    else if (sortKey === "change_asc") sortedWatchRows.sort((leftAsset, rightAsset) => changePct(leftAsset) - changePct(rightAsset));
    else if (sortKey === "name_asc") sortedWatchRows.sort((leftAsset, rightAsset) => assetDisplayName(leftAsset).localeCompare(assetDisplayName(rightAsset), "zh-CN"));
    else if (sortKey === "target_desc") sortedWatchRows.sort((leftAsset, rightAsset) => (rightAsset.targetWeightHint ?? 0) - (leftAsset.targetWeightHint ?? 0));
    return sortedWatchRows;
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
                  "min-h-9 rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium transition-colors",
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
            onUpdateTargetWeight={props.onUpdateTargetWeight}
            removing={props.actioningAssetKey === row.assetKey}
            updatingTarget={props.updatingTarget}
            disabled={props.disabled}
          />
        ))}
      </div>

      {filteredRows.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-3.5 py-3 text-sm text-[var(--muted)]">
          该分类下暂无观察标的
        </div>
      ) : null}

      {!showAll && totalCount > PAGE_SIZE ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mx-auto block min-h-9 rounded-[var(--radius-sm)] border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
        >
          展开剩余 {totalCount - PAGE_SIZE} 条
        </button>
      ) : null}
    </div>
  );
}
