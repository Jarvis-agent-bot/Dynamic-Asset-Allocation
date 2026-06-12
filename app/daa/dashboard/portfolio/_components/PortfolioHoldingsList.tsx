"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCurrency } from "@/app/daa/dashboard/_components/daaFormatters";
import { Sparkline } from "@/app/daa/dashboard/_components/Sparkline";
import { deriveAssetPriceChange } from "@/app/daa/dashboard/_components/assetPriceChange";
import { DaaSurfaceEmptyState, DaaSurfacePanel } from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { holdingCategoryKey, HOLDING_CATEGORY_META } from "@/app/daa/dashboard/_components/assetLabels";
import { useFundamentalsState, type AssetFundamentals } from "@/app/daa/dashboard/_hooks/useFundamentals";
import { useSparklines } from "@/app/daa/dashboard/_hooks/useSparklines";
import { filterVisibleHoldings, MIN_VISIBLE_HOLDING_VALUE_BASE } from "@/app/daa/dashboard/_shared/holdingVisibility";
import type { AssetUniverseView } from "@/src/daa/modules/workbench/workbenchTypes";
import {
  deriveGrowthRequirementBadge,
  deriveValuationBadge,
  formatCompanyMarketCap,
  formatFundamentalRatio,
  type ValuationTone,
} from "./fundamentalDisplay";

/* ------------------------------------------------------------------ */
/*  单行组件                                                           */
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
  const companyMarketCap = formatCompanyMarketCap(
    input.fundamentals?.marketCap,
    input.fundamentals?.marketCapCurrency || input.row.currency,
  );
  if (companyMarketCap !== "--") parts.push(`${marketCapLabel(input.row)} ${companyMarketCap}`);

  const pe = formatFundamentalRatio(input.fundamentals?.trailingPE);
  const pb = formatFundamentalRatio(input.fundamentals?.pbRatio);
  if (pe !== "--") parts.push(`PE ${pe}`);
  if (pb !== "--") parts.push(`PB ${pb}`);

  if (parts.length > 0) return parts.join(" · ");
  return isStock(input.row) ? "基本面数据不足" : "基本面不适用";
}

function HoldingRow(props: {
  row: AssetUniverseView;
  baseCurrency: string;
  sparkData: number[] | null;
  fundamentals?: AssetFundamentals;
  fundamentalsLoading: boolean;
  fundamentalsError: string | null;
  onClick: () => void;
}) {
  const { row, baseCurrency, sparkData } = props;
  const displayName = assetDisplayName(row);

  const pnl = row.unrealizedPnlPct ?? null;

  const priceChange = deriveAssetPriceChange(row, sparkData);
  const priceChangePercent = priceChange?.changePct ?? null;

  const isUp = priceChangePercent != null ? priceChangePercent >= 0 : null;
  const sparkColor = isUp === true ? "var(--success)" : isUp === false ? "var(--danger)" : "var(--primary)";
  const valuation = deriveValuationBadge(row, props.fundamentals);
  const growthRequirement = deriveGrowthRequirementBadge(row, props.fundamentals);
  const companyMarketCap = formatCompanyMarketCap(
    props.fundamentals?.marketCap,
    props.fundamentals?.marketCapCurrency || row.currency,
  );
  const fundamentalSummary = buildFundamentalSummary({
    row,
    fundamentals: props.fundamentals,
    loading: props.fundamentalsLoading,
    error: props.fundamentalsError,
  });

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={props.onClick}
      onKeyDown={(e) => { if (e.key === "Enter") props.onClick(); }}
      className="group flex cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-transparent px-3 py-2.5 transition-colors hover:border-[var(--border)] hover:bg-[var(--primary-bg)]"
    >
      {/* 标的信息 */}
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
      </div>

      {/* 最新价 + 涨跌幅 */}
      <div className="w-[100px] text-right">
        <div className="font-[var(--font-mono)] text-sm text-[var(--text)]">
          {formatCurrency(row.lastPrice, row.currency)}
        </div>
        {priceChangePercent != null ? (
          <div className={cn(
            "font-[var(--font-mono)] text-xs",
            priceChangePercent >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]",
          )}>
            {priceChangePercent >= 0 ? "+" : ""}{priceChangePercent.toFixed(2)}%
          </div>
        ) : (
          <div className="font-[var(--font-mono)] text-xs text-[var(--faint)]">--</div>
        )}
      </div>

      {/* Sparkline */}
      <div className="hidden w-[120px] sm:block">
        {sparkData ? (
          <Sparkline data={sparkData} width={120} height={40} color={sparkColor} />
        ) : (
          <div className="h-[40px] w-[120px]" />
        )}
      </div>

      {/* 持仓数量 */}
      <div className="hidden w-[80px] text-right md:block">
        <div className="text-[10px] font-semibold uppercase tracking-normal text-[var(--faint)]">持仓</div>
        <div className="font-[var(--font-mono)] text-xs text-[var(--text)]">
          {row.holdingQty % 1 === 0 ? row.holdingQty.toLocaleString() : row.holdingQty.toFixed(4)}
        </div>
      </div>

      {/* 持仓市值 */}
      <div className="hidden w-[100px] text-right lg:block">
        <div className="text-[10px] font-semibold uppercase tracking-normal text-[var(--faint)]">持仓市值</div>
        <div className="font-[var(--font-mono)] text-xs text-[var(--text)]">
          {formatCurrency(row.valuationBase ?? 0, baseCurrency)}
        </div>
      </div>

      {/* 公司估值 */}
      <div className="hidden w-[112px] text-right xl:block">
        <div className="text-[10px] font-semibold uppercase tracking-normal text-[var(--faint)]">{marketCapLabel(row)}</div>
        <div className="font-[var(--font-mono)] text-xs text-[var(--text)]">
          {companyMarketCap}
        </div>
      </div>

      {/* PE / PB */}
      <div className="hidden w-[82px] text-right xl:block">
        <div className="text-[10px] font-semibold uppercase tracking-normal text-[var(--faint)]">PE / PB</div>
        <div className="font-[var(--font-mono)] text-xs text-[var(--text)]">
          {formatFundamentalRatio(props.fundamentals?.trailingPE)}
          <span className="mx-0.5 text-[var(--faint)]">/</span>
          {formatFundamentalRatio(props.fundamentals?.pbRatio)}
        </div>
      </div>

      {/* 权重 / 偏离 */}
      <div className="hidden w-[80px] text-right md:block">
        <div className="text-[10px] font-semibold uppercase tracking-normal text-[var(--faint)]">权重</div>
        <div className="font-[var(--font-mono)] text-xs text-[var(--text)]">
          {(row.actualWeightPct ?? 0) > 0 ? `${(row.actualWeightPct ?? 0).toFixed(1)}%` : "--"}
        </div>
        {row.gapPct != null ? (
          <div className={cn(
            "font-[var(--font-mono)] text-[10px]",
            Math.abs(row.gapPct) > 3 ? "text-[var(--amber)]" : "text-[var(--faint)]",
          )}>
            偏离 {row.gapPct >= 0 ? "+" : ""}{row.gapPct.toFixed(1)}%
          </div>
        ) : null}
      </div>

      {/* 浮盈亏 */}
      <div className="w-[80px] text-right">
        <div className="text-[10px] font-semibold uppercase tracking-normal text-[var(--faint)]">盈亏</div>
        {pnl != null ? (
          <div className={cn(
            "font-[var(--font-mono)] text-xs",
            pnl >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]",
          )}>
            {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}%
          </div>
        ) : (
          <div className="font-[var(--font-mono)] text-xs text-[var(--muted)]">--</div>
        )}
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

      {/* 箭头 */}
      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--faint)] transition-colors group-hover:text-[var(--text)]" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  主组件                                                             */
/* ------------------------------------------------------------------ */

export function PortfolioHoldingsList(props: {
  rows: AssetUniverseView[];
  baseCurrency: string;
}) {
  const router = useRouter();
  const { rows, baseCurrency } = props;
  const [activeCategory, setActiveCategory] = useState("all");

  const rawHoldingCount = useMemo(() => rows.filter((assetRow) => assetRow.holdingQty > 0).length, [rows]);
  const holdingRows = useMemo(() => filterVisibleHoldings(rows), [rows]);
  const hiddenTinyHoldingCount = Math.max(0, rawHoldingCount - holdingRows.length);

  // 批量获取所有持仓的 sparkline（1 次 API 调用替代 N 次）
  const sparklineSymbols = useMemo(
    () => holdingRows.map((holdingRow) => holdingRow.yfinanceSymbol || holdingRow.symbol),
    [holdingRows],
  );
  const sparklines = useSparklines(sparklineSymbols);
  const fundamentalsState = useFundamentalsState(sparklineSymbols);
  const fundamentals = fundamentalsState.items;

  // 自动生成有数据的分类 tab
  const availableCategories = useMemo(() => {
    const categoryKeys = new Set(holdingRows.map((holdingRow) => holdingCategoryKey(holdingRow.market, holdingRow.assetClass)));
    return HOLDING_CATEGORY_META.filter((categoryMeta) => categoryMeta.key === "all" || categoryKeys.has(categoryMeta.key));
  }, [holdingRows]);

  // 按分类筛选
  const filteredRows = useMemo(() => {
    if (activeCategory === "all") return holdingRows;
    return holdingRows.filter((holdingRow) => holdingCategoryKey(holdingRow.market, holdingRow.assetClass) === activeCategory);
  }, [holdingRows, activeCategory]);

  const handleRowClick = useCallback((row: AssetUniverseView) => {
    router.push(`/daa/dashboard/portfolio/${encodeURIComponent(row.assetKey)}`);
  }, [router]);

  if (holdingRows.length === 0) {
    return (
      <DaaSurfacePanel
        accent="neutral"
        title="持仓"
        subtitle={hiddenTinyHoldingCount > 0 ? `已隐藏 ${hiddenTinyHoldingCount} 个市值低于 ${baseCurrency} ${MIN_VISIBLE_HOLDING_VALUE_BASE} 的残留仓位` : "当前没有持仓标的"}
      >
        <DaaSurfaceEmptyState
          title={hiddenTinyHoldingCount > 0 ? "暂无有效持仓" : "暂无持仓"}
          description={hiddenTinyHoldingCount > 0 ? "只保留达到最小有效市值的仓位，清仓后留下的极小残值不会再占用持仓列表。" : "在观察列表中添加标的并执行买入操作后，持仓将在此显示。"}
        />
      </DaaSurfacePanel>
    );
  }

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
                "rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium transition-colors",
                activeCategory === cat.key
                  ? "bg-[var(--primary-bg)] text-[var(--text)]"
                  : "text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--elevated)]",
              )}
            >
              {cat.label}
              {cat.key === "all" ? ` ${holdingRows.length}` : ""}
            </button>
          ))}
        </div>
      ) : null}

      {hiddenTinyHoldingCount > 0 ? (
        <div className="px-1 text-xs leading-5 text-[var(--faint)]">
          已隐藏 {hiddenTinyHoldingCount} 个低于 {baseCurrency} {MIN_VISIBLE_HOLDING_VALUE_BASE} 的残留仓位。
        </div>
      ) : null}

      {/* 列表 */}
      <div className="divide-y divide-[var(--elevated)]">
        {filteredRows.map((row) => (
          <HoldingRow
            key={row.assetKey}
            row={row}
            baseCurrency={baseCurrency}
            sparkData={sparklines[row.yfinanceSymbol || row.symbol] ?? sparklines[row.symbol] ?? null}
            fundamentals={fundamentals[(row.yfinanceSymbol || row.symbol).toUpperCase()] ?? fundamentals[row.symbol.toUpperCase()]}
            fundamentalsLoading={fundamentalsState.loading}
            fundamentalsError={fundamentalsState.error}
            onClick={() => handleRowClick(row)}
          />
        ))}
      </div>

      {filteredRows.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-3.5 py-3 text-sm text-[var(--muted)]">
          该分类下暂无持仓
        </div>
      ) : null}
    </div>
  );
}
