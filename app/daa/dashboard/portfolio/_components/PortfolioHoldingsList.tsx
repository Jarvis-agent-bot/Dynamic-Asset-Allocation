"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCurrency, formatPercent } from "@/app/daa/dashboard/_components/daaFormatters";
import { Sparkline } from "@/app/daa/dashboard/_components/Sparkline";
import { DaaSurfaceEmptyState, DaaSurfacePanel } from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { holdingCategoryKey, HOLDING_CATEGORY_META } from "@/app/daa/dashboard/_components/assetLabels";
import type { AssetUniverseView } from "@/src/daa/modules/workbench/workbenchTypes";

/* ------------------------------------------------------------------ */
/*  Sparkline 数据懒加载 hook                                          */
/* ------------------------------------------------------------------ */

function useSparklineData(symbol: string, market: string, visible: boolean) {
  const [data, setData] = useState<number[] | null>(null);
  const fetched = useRef(false);

  useEffect(() => {
    if (!visible || fetched.current || !symbol) return;
    fetched.current = true;

    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);

    const params = new URLSearchParams({
      symbol,
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
    });

    fetch(`/api/daa/market/yfinance/price-series?${params}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.series?.length) {
          setData(json.series.map((p: { close: number }) => p.close));
        }
      })
      .catch(() => {});
  }, [symbol, market, visible]);

  return data;
}

/* ------------------------------------------------------------------ */
/*  单行组件                                                           */
/* ------------------------------------------------------------------ */

function HoldingRow(props: { row: AssetUniverseView; baseCurrency: string; onClick: () => void }) {
  const { row, baseCurrency } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { rootMargin: "100px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const sparkData = useSparklineData(row.yfinanceSymbol || row.symbol, row.market, visible);

  // costBasis 是标的货币的总成本，需要乘 fxRateToBase 转为基准货币
  const costInstrument = row.costBasis ?? 0;
  const fx = row.fxRateToBase ?? 1;
  const costInBase = costInstrument * fx;
  const valBase = row.valuationBase ?? 0;
  const pnl = costInBase > 0 && valBase > 0
    ? ((valBase - costInBase) / costInBase) * 100
    : null;

  const priceDelta = (row as Record<string, unknown>).priceDelta as number | undefined;
  const priceChangePercent = priceDelta != null && row.lastPrice > 0
    ? (priceDelta / (row.lastPrice - priceDelta)) * 100
    : null;

  const isUp = priceChangePercent != null ? priceChangePercent >= 0 : null;
  const sparkColor = isUp === true ? "hsl(142 71% 45%)" : isUp === false ? "hsl(0 84% 60%)" : "hsl(188 95% 60%)";

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      onClick={props.onClick}
      onKeyDown={(e) => { if (e.key === "Enter") props.onClick(); }}
      className="group flex cursor-pointer items-center gap-3 rounded-[12px] border border-transparent px-4 py-3 transition-colors hover:border-[var(--border)] hover:bg-[rgba(56,189,248,0.04)]"
    >
      {/* 标的信息 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-[var(--text)]">{row.symbol}</span>
          <span className="truncate text-xs text-[var(--muted)]">{row.market} · {row.currency}</span>
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
            priceChangePercent >= 0 ? "text-emerald-400" : "text-red-400",
          )}>
            {priceChangePercent >= 0 ? "+" : ""}{priceChangePercent.toFixed(2)}%
          </div>
        ) : null}
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
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--faint)]">持仓</div>
        <div className="font-[var(--font-mono)] text-xs text-[var(--text)]">
          {row.holdingQty % 1 === 0 ? row.holdingQty.toLocaleString() : row.holdingQty.toFixed(4)}
        </div>
      </div>

      {/* 市值 */}
      <div className="hidden w-[100px] text-right lg:block">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--faint)]">市值</div>
        <div className="font-[var(--font-mono)] text-xs text-[var(--text)]">
          {formatCurrency(row.valuationBase ?? 0, baseCurrency)}
        </div>
      </div>

      {/* 权重 / 偏离 */}
      <div className="hidden w-[80px] text-right md:block">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--faint)]">权重</div>
        <div className="font-[var(--font-mono)] text-xs text-[var(--text)]">
          {(row.actualWeightPct ?? 0) > 0 ? `${(row.actualWeightPct ?? 0).toFixed(1)}%` : "--"}
        </div>
        {row.gapPct != null ? (
          <div className={cn(
            "font-[var(--font-mono)] text-[10px]",
            Math.abs(row.gapPct) > 3 ? "text-amber-400" : "text-[var(--faint)]",
          )}>
            偏离 {row.gapPct >= 0 ? "+" : ""}{row.gapPct.toFixed(1)}%
          </div>
        ) : null}
      </div>

      {/* 浮盈亏 */}
      <div className="w-[80px] text-right">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--faint)]">盈亏</div>
        {pnl != null ? (
          <div className={cn(
            "font-[var(--font-mono)] text-xs",
            pnl >= 0 ? "text-emerald-400" : "text-red-400",
          )}>
            {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}%
          </div>
        ) : (
          <div className="font-[var(--font-mono)] text-xs text-[var(--muted)]">--</div>
        )}
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

  const holdingRows = useMemo(() => rows.filter((r) => r.holdingQty > 0), [rows]);

  // 自动生成有数据的分类 tab
  const availableCategories = useMemo(() => {
    const keys = new Set(holdingRows.map((r) => holdingCategoryKey(r.market, r.assetClass)));
    return HOLDING_CATEGORY_META.filter((m) => m.key === "all" || keys.has(m.key));
  }, [holdingRows]);

  // 按分类筛选
  const filteredRows = useMemo(() => {
    if (activeCategory === "all") return holdingRows;
    return holdingRows.filter((r) => holdingCategoryKey(r.market, r.assetClass) === activeCategory);
  }, [holdingRows, activeCategory]);

  const handleRowClick = useCallback((row: AssetUniverseView) => {
    router.push(`/daa/dashboard/portfolio/${encodeURIComponent(row.assetKey)}`);
  }, [router]);

  if (holdingRows.length === 0) {
    return (
      <DaaSurfacePanel accent="slate" title="持仓" subtitle="当前没有持仓标的">
        <DaaSurfaceEmptyState
          title="暂无持仓"
          description="在观察列表中添加标的并执行买入操作后，持仓将在此显示。"
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
                "rounded-[10px] px-3 py-1.5 text-xs font-medium transition-colors",
                activeCategory === cat.key
                  ? "bg-[rgba(56,189,248,0.12)] text-[var(--text)]"
                  : "text-[var(--muted)] hover:text-[var(--text)] hover:bg-[rgba(255,255,255,0.04)]",
              )}
            >
              {cat.label}
              {cat.key === "all" ? ` ${holdingRows.length}` : ""}
            </button>
          ))}
        </div>
      ) : null}

      {/* 列表 */}
      <div className="divide-y divide-[rgba(255,255,255,0.04)]">
        {filteredRows.map((row) => (
          <HoldingRow
            key={row.assetKey}
            row={row}
            baseCurrency={baseCurrency}
            onClick={() => handleRowClick(row)}
          />
        ))}
      </div>

      {filteredRows.length === 0 ? (
        <div className="py-8 text-center text-sm text-[var(--muted)]">
          该分类下暂无持仓
        </div>
      ) : null}
    </div>
  );
}
