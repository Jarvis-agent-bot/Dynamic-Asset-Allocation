"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Eye } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCurrency, formatPercent } from "@/app/daa/dashboard/_components/daaFormatters";
import { Sparkline } from "@/app/daa/dashboard/_components/Sparkline";
import { holdingCategoryKey, HOLDING_CATEGORY_META } from "@/app/daa/dashboard/_components/assetLabels";
import type { AssetUniverseView } from "@/src/daa/modules/workbench/workbenchTypes";

/* ------------------------------------------------------------------ */
/*  Sparkline 懒加载                                                    */
/* ------------------------------------------------------------------ */

function useSparklineData(symbol: string, visible: boolean) {
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
        if (json?.series?.length) setData(json.series.map((p: { close: number }) => p.close));
      })
      .catch(() => {});
  }, [symbol, visible]);

  return data;
}

/* ------------------------------------------------------------------ */
/*  单行                                                               */
/* ------------------------------------------------------------------ */

function WatchlistRow(props: { row: AssetUniverseView; onClick: () => void }) {
  const { row } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVisible(true); },
      { rootMargin: "100px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const sparkData = useSparklineData(row.yfinanceSymbol || row.symbol, visible);

  const priceDelta = (row as Record<string, unknown>).priceDelta as number | undefined;
  const changePct = priceDelta != null && row.lastPrice > 0
    ? (priceDelta / (row.lastPrice - priceDelta)) * 100
    : null;
  const isUp = changePct != null ? changePct >= 0 : null;
  const sparkColor = isUp === true ? "hsl(142 71% 45%)" : isUp === false ? "hsl(0 84% 60%)" : "hsl(188 95% 60%)";

  const targetPct = (row.targetWeightHint ?? 0) * 100;
  const actualPct = row.actualWeightPct ?? 0;
  const gap = row.gapPct;

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      onClick={props.onClick}
      onKeyDown={(e) => { if (e.key === "Enter") props.onClick(); }}
      className="group flex cursor-pointer items-center gap-3 rounded-[12px] border border-transparent px-4 py-3 transition-colors hover:border-[var(--border)] hover:bg-[rgba(56,189,248,0.04)]"
    >
      {/* 标的 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-[var(--text)]">{row.symbol}</span>
          <span className="truncate text-xs text-[var(--muted)]">{row.market} · {row.currency}</span>
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
        ) : null}
      </div>

      {/* Sparkline */}
      <div className="hidden w-[100px] sm:block">
        {sparkData ? (
          <Sparkline data={sparkData} width={100} height={36} color={sparkColor} />
        ) : (
          <div className="h-[36px] w-[100px]" />
        )}
      </div>

      {/* 目标权重 */}
      <div className="hidden w-[70px] text-right md:block">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--faint)]">目标</div>
        <div className={cn(
          "font-[var(--font-mono)] text-xs",
          targetPct > 0 ? "text-[var(--text)]" : "text-[var(--faint)]",
        )}>
          {targetPct > 0 ? `${targetPct.toFixed(1)}%` : "--"}
        </div>
      </div>

      {/* 实际权重 */}
      <div className="hidden w-[70px] text-right md:block">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--faint)]">实际</div>
        <div className="font-[var(--font-mono)] text-xs text-[var(--text)]">
          {actualPct > 0 ? `${actualPct.toFixed(1)}%` : "--"}
        </div>
      </div>

      {/* 偏离度 */}
      <div className="w-[70px] text-right">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--faint)]">偏离</div>
        {gap != null ? (
          <div className={cn(
            "font-[var(--font-mono)] text-xs",
            Math.abs(gap) > 3 ? "text-amber-400" : "text-[var(--muted)]",
          )}>
            {gap >= 0 ? "+" : ""}{gap.toFixed(1)}%
          </div>
        ) : (
          <div className="font-[var(--font-mono)] text-xs text-[var(--faint)]">--</div>
        )}
      </div>

      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--faint)] transition-colors group-hover:text-[var(--text)]" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  主组件                                                             */
/* ------------------------------------------------------------------ */

export function WatchlistItemList(props: { rows: AssetUniverseView[] }) {
  const router = useRouter();
  const { rows } = props;
  const [activeCategory, setActiveCategory] = useState("all");

  const watchRows = useMemo(() => rows.filter((r) => r.watchEnabled), [rows]);

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
            onClick={() => handleRowClick(row)}
          />
        ))}
      </div>

      {filteredRows.length === 0 ? (
        <div className="py-8 text-center text-sm text-[var(--muted)]">该分类下暂无观察标的</div>
      ) : null}
    </div>
  );
}
