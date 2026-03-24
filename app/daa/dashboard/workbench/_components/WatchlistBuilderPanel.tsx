"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Plus, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import type {
  WorkbenchFeaturedAssetGroup,
  WorkbenchFeaturedAssetItem,
  WorkbenchFeaturedAssetsResult,
  WorkbenchSearchAssetResult,
} from "@/src/daa/modules/workbench/workbenchTypes";

import {
  DaaSurfaceActionButton,
  DaaSurfaceEmptyState,
  DaaSurfaceFilterChip,
  DaaSurfaceMiniStat,
  DaaSurfaceNoticeBox,
  DaaSurfacePanel,
  DaaSurfaceStatusPill,
  daaSurfaceSearchShellClassName,
  daaSurfaceTableCellClassName,
  daaSurfaceTableHeadClassName,
  daaSurfaceTableShellClassName,
} from "../../_components/DaaSurfaceUI";

const ASSET_CLASS_OPTIONS_ = [
  { value: "ALL", label: "全部" },
  { value: "EQUITY", label: "股票" },
  { value: "ETF", label: "ETF" },
  { value: "COMMODITY", label: "商品" },
  { value: "BOND", label: "债券" },
  { value: "CRYPTO", label: "加密" },
] as const;

const MARKET_OPTIONS_ = [
  { value: "ALL", label: "全部" },
  { value: "US", label: "美股" },
  { value: "HK", label: "港股" },
  { value: "CN", label: "A股" },
  { value: "CRYPTO", label: "加密" },
] as const;

function assetClassLabelZh(value: string): string {
  const key = String(value || "").toUpperCase();
  if (key === "EQUITY") return "股票";
  if (key === "ETF") return "ETF";
  if (key === "BOND") return "债券";
  if (key === "COMMODITY") return "商品";
  if (key === "CRYPTO") return "加密资产";
  if (key === "FUND") return "基金";
  if (key === "INDEX") return "指数";
  return key || "其他";
}

function regionLabelZh(value: string): string {
  const key = String(value || "").toUpperCase();
  if (key === "US") return "美国";
  if (key === "HK") return "香港";
  if (key === "CN") return "中国";
  if (key === "EU") return "欧洲";
  if (key === "JP") return "日本";
  if (key === "GLOBAL") return "全球";
  return key || "其他";
}

function marketLabelZh(value: string): string {
  const key = String(value || "").toUpperCase();
  if (key === "US") return "美股";
  if (key === "HK") return "港股";
  if (key === "CN") return "A股";
  if (key === "CRYPTO") return "加密";
  return key || "其他";
}

function currencySymbol(currency: string): string {
  const ccy = String(currency || "").trim().toUpperCase();
  if (ccy === "CNY" || ccy === "RMB") return "¥";
  if (ccy === "HKD") return "HK$";
  if (ccy === "EUR") return "€";
  if (ccy === "USD") return "$";
  if (ccy === "USDC") return "USDC";
  return ccy || "-";
}

function assetKey(input: { market: string; symbol: string }): string {
  return `${String(input.market || "").trim().toUpperCase()}::${String(input.symbol || "").trim().toUpperCase()}`;
}

function assetTestId(input: { market: string; symbol: string }): string {
  return `${String(input.market || "").trim().toLowerCase()}-${String(input.symbol || "").trim().toLowerCase()}`
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function priceTone(status?: string | null): "cyan" | "amber" | "red" {
  if (status === "fresh") return "cyan";
  if (status === "stale") return "amber";
  return "red";
}

export default function WatchlistBuilderPanel(props: {
  loading?: boolean;
  joinedAssetKeys: Record<string, true>;
  onListFeaturedAssets: (input: { market: string; assetClass: string; limitPerMarket?: number }) => Promise<WorkbenchFeaturedAssetsResult>;
  onSearch: (input: { q: string; market: string; assetClass: string; region: string }) => Promise<WorkbenchSearchAssetResult[]>;
  onAddAsset: (item: WorkbenchSearchAssetResult | WorkbenchFeaturedAssetItem) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [market, setMarket] = useState("ALL");
  const [assetClass, setAssetClass] = useState("ALL");
  const [searching, setSearching] = useState(false);
  const [addingAssetKey, setAddingAssetKey] = useState<string | null>(null);
  const [items, setItems] = useState<WorkbenchSearchAssetResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [featuredGroups, setFeaturedGroups] = useState<WorkbenchFeaturedAssetGroup[]>([]);
  const [featuredLoading, setFeaturedLoading] = useState(false);
  const [featuredError, setFeaturedError] = useState("");
  const [featuredCollapsed, setFeaturedCollapsed] = useState(false);
  const featuredRequestIdRef = useRef(0);
  const hasActiveFilters = market !== "ALL" || assetClass !== "ALL";

  const loadFeatured = useCallback(async () => {
    const requestId = featuredRequestIdRef.current + 1;
    featuredRequestIdRef.current = requestId;
    setFeaturedLoading(true);
    setFeaturedError("");
    try {
      const data = await props.onListFeaturedAssets({
        market,
        assetClass,
        limitPerMarket: 8,
      });
      if (featuredRequestIdRef.current !== requestId) return;
      setFeaturedGroups(Array.isArray(data.groups) ? data.groups : []);
    } catch (e) {
      if (featuredRequestIdRef.current !== requestId) return;
      setFeaturedGroups([]);
      setFeaturedError(e instanceof Error ? e.message : "推荐加载失败");
    } finally {
      if (featuredRequestIdRef.current !== requestId) return;
      setFeaturedLoading(false);
    }
  }, [assetClass, market, props.onListFeaturedAssets]);

  useEffect(() => {
    if (featuredCollapsed) return;
    void loadFeatured();
  }, [featuredCollapsed, loadFeatured]);

  function isJoined(input: { market: string; symbol: string }): boolean {
    return Boolean(props.joinedAssetKeys[assetKey(input)]);
  }

  async function handleSearch() {
    if (!q.trim() || searching) return;
    setSearching(true);
    setHasSearched(true);
    try {
      const rows = await props.onSearch({
        q: q.trim(),
        market,
        assetClass,
        region: "ALL",
      });
      setItems(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "搜索失败");
    } finally {
      setSearching(false);
    }
  }

  async function handleAdd(item: WorkbenchSearchAssetResult | WorkbenchFeaturedAssetItem) {
    if (addingAssetKey) return;
    const nextKey = assetKey(item);
    setAddingAssetKey(nextKey);
    try {
      await props.onAddAsset(item);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加入失败");
    } finally {
      setAddingAssetKey(null);
    }
  }

  function resetFilters() {
    setMarket("ALL");
    setAssetClass("ALL");
  }

  return (
    <DaaSurfacePanel
      title="添加观察标的"
      subtitle="在观察列表里直接完成推荐挑选、搜索补充与加入观察，减少在不同页面之间跳转。"
      accent="indigo"
      bodyClassName="space-y-5"
      action={
        <DaaSurfaceStatusPill tone="indigo">
          {featuredCollapsed ? "推荐已折叠" : "观察池构建"}
        </DaaSurfaceStatusPill>
      }
    >
      <div className="relative overflow-hidden rounded-[18px] border border-[var(--border)] bg-[linear-gradient(135deg,rgba(15,23,38,0.98),rgba(10,15,25,0.94))] p-5">
        <div className="absolute -left-10 top-0 h-32 w-32 rounded-full bg-[rgba(129,140,248,0.16)] blur-3xl" />
        <div className="absolute right-0 top-0 h-full w-[40%] bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.12),transparent_65%)]" />
        <div className="relative grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)] xl:items-end">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(129,140,248,0.22)] bg-[rgba(129,140,248,0.08)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--indigo)]">
              <Sparkles className="h-3.5 w-3.5" />
              观察池补充
            </div>
            <div>
              <div className="font-[var(--font-display)] text-[30px] leading-none tracking-[-0.035em] text-[var(--text)] sm:text-[34px]">
                先补齐观察池，再进入目标权重配置
              </div>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)] sm:text-[15px]">
                推荐池优先覆盖高流动性与代表性标的；搜索区补足主题、市场与个股长尾。加入观察后可以立刻在下方维护目标权重并进入再平衡。
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <DaaSurfaceMiniStat label="当前市场" value={marketLabelZh(market)} tone="cyan" />
            <DaaSurfaceMiniStat label="资产类型" value={assetClassLabelZh(assetClass)} tone="amber" />
            <DaaSurfaceMiniStat label="已纳入观察" value={Object.keys(props.joinedAssetKeys).length} tone="indigo" />
          </div>
        </div>

        <div className="relative mt-5 grid gap-4 lg:grid-cols-2">
          <div className="space-y-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">资产类筛选</div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {ASSET_CLASS_OPTIONS_.map((option) => (
                <DaaSurfaceFilterChip
                  key={option.value}
                  active={assetClass === option.value}
                  onClick={() => setAssetClass(option.value)}
                >
                  {option.label}
                </DaaSurfaceFilterChip>
              ))}
            </div>
          </div>
          <div className="space-y-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">市场筛选</div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {MARKET_OPTIONS_.map((option) => (
                <DaaSurfaceFilterChip
                  key={option.value}
                  active={market === option.value}
                  onClick={() => setMarket(option.value)}
                >
                  {option.label}
                </DaaSurfaceFilterChip>
              ))}
            </div>
          </div>
        </div>
      </div>

      <section className="rounded-[18px] border border-[var(--border)] bg-[rgba(9,15,27,0.78)] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
              <span className="inline-flex h-2 w-2 rounded-full bg-[var(--indigo)]" />
              推荐资产池
            </div>
            <div className="mt-1 text-xs leading-5 text-[var(--muted)]">
              按市场分桶展示高流动性标的，可直接加入观察并继续进入再平衡目标设定。
            </div>
          </div>
          <div className="flex items-center gap-2">
            {featuredLoading ? <Loader2 className="h-4 w-4 animate-spin text-[var(--faint)]" /> : null}
            <DaaSurfaceActionButton
              tone="slate"
              className="rounded-full px-3 py-1.5 text-xs"
              onClick={() => setFeaturedCollapsed((prev) => !prev)}
            >
              {featuredCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              {featuredCollapsed ? "展开推荐" : "收起推荐"}
            </DaaSurfaceActionButton>
          </div>
        </div>

        <div className="mt-4">
          {featuredCollapsed ? (
            <DaaSurfaceEmptyState
              title="推荐池已折叠"
              description="保持当前筛选条件，重新展开即可查看分市场推荐名单。"
            />
          ) : null}

          {!featuredCollapsed ? (
            <>
              {featuredError ? (
                <DaaSurfaceNoticeBox tone="red" title="推荐加载失败" description={featuredError} />
              ) : null}

              {!featuredLoading && !featuredError && featuredGroups.length <= 0 ? (
                <DaaSurfaceEmptyState
                  title="当前筛选下暂无推荐资产"
                  description="可以切换市场与资产类型，或者直接使用下方搜索快速定位目标。"
                  action={hasActiveFilters ? <DaaSurfaceActionButton tone="slate" onClick={resetFilters}>重置筛选</DaaSurfaceActionButton> : null}
                />
              ) : null}

              <div className="space-y-4">
                {featuredGroups.map((group) => (
                  <div key={group.market} className="space-y-3">
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">
                      <span className="h-px w-8 bg-[var(--indigo)]/55" />
                      <span>{group.marketLabelZh}</span>
                    </div>
                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-4">
                      {group.items.map((item) => {
                        const joined = isJoined(item);
                        const busy = addingAssetKey === assetKey(item);
                        const displayName = item.longName || item.shortName || item.name || item.symbol;
                        const testId = assetTestId(item);
                        return (
                          <div
                            key={`${group.market}::${item.symbol}`}
                            data-testid={`featured-asset-${testId}`}
                            data-asset-key={assetKey(item)}
                            className="group rounded-[16px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(24,34,54,0.96),rgba(10,15,25,0.98))] p-4 shadow-[0_16px_36px_rgba(0,0,0,0.22)] transition-transform duration-200 hover:-translate-y-0.5"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-[var(--text)]" title={displayName}>
                                  {displayName}
                                </div>
                                <div className="mt-1 truncate text-[11px] uppercase tracking-[0.14em] text-[var(--faint)]" title={`${item.symbol} · ${marketLabelZh(item.market)}`}>
                                  {item.symbol} · {marketLabelZh(item.market)}
                                </div>
                              </div>
                              <DaaSurfaceActionButton
                                tone={joined ? "slate" : "primary"}
                                data-testid={`featured-asset-add-${testId}`}
                                className="h-8 shrink-0 rounded-full px-3 text-xs"
                                disabled={busy || props.loading || joined}
                                onClick={() => void handleAdd(item)}
                              >
                                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : joined ? null : <Plus className="h-3.5 w-3.5" />}
                                {joined ? "已加入" : "加入"}
                              </DaaSurfaceActionButton>
                            </div>

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <DaaSurfaceStatusPill tone="slate">{assetClassLabelZh(item.assetClass)}</DaaSurfaceStatusPill>
                              <DaaSurfaceStatusPill tone={priceTone(item.priceStatus)}>
                                {item.price > 0 ? `${currencySymbol(item.currency)} ${item.price.toFixed(2)}` : "待补行情"}
                              </DaaSurfaceStatusPill>
                            </div>

                            <div className="mt-3 space-y-1 text-xs text-[var(--muted)]">
                              <div>{regionLabelZh(item.region)} · {item.exchangeDisp || item.exchange || "交易所待补充"}</div>
                              {item.thesisTagZh ? (
                                <div className="truncate text-[var(--faint)]" title={item.thesisTagZh}>
                                  {item.thesisTagZh}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </section>

      <div className="grid gap-3 rounded-[18px] border border-[var(--border)] bg-[rgba(9,15,27,0.72)] p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold text-[var(--text)]">精准搜索</div>
            <DaaSurfaceStatusPill tone="slate">{marketLabelZh(market)}</DaaSurfaceStatusPill>
            <DaaSurfaceStatusPill tone="slate">{assetClassLabelZh(assetClass)}</DaaSurfaceStatusPill>
            {hasSearched ? <DaaSurfaceStatusPill tone="indigo">结果 {items.length}</DaaSurfaceStatusPill> : null}
          </div>
          <div className="text-xs leading-5 text-[var(--muted)]">
            输入代码、名称或常用简称，例如 `NVDA`、`0700`、`BTC`，系统会按当前筛选条件返回匹配资产。
          </div>
        </div>
        <div className="flex flex-col gap-2 lg:min-w-[460px]">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className={cn(daaSurfaceSearchShellClassName, "h-11 flex-1")}>
              <Search className="h-4 w-4 text-[var(--faint)]" />
              <input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleSearch();
                  }
                }}
                placeholder="输入代码或名称，例如 NVDA / 0700 / BTC"
                className="h-11 w-full bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--faint)]"
              />
            </div>
            <DaaSurfaceActionButton
              tone="primary"
              className="h-11 justify-center rounded-[14px] px-4"
              onClick={() => void handleSearch()}
              disabled={props.loading || searching || !q.trim()}
            >
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {searching ? "搜索中..." : "搜索资产"}
            </DaaSurfaceActionButton>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {q ? (
              <DaaSurfaceActionButton
                tone="slate"
                className="rounded-full px-3 py-1.5 text-xs"
                onClick={() => {
                  setQ("");
                  setItems([]);
                  setHasSearched(false);
                }}
              >
                清空关键词
              </DaaSurfaceActionButton>
            ) : null}
            {hasActiveFilters ? (
              <DaaSurfaceActionButton
                tone="slate"
                className="rounded-full px-3 py-1.5 text-xs"
                onClick={resetFilters}
              >
                重置筛选
              </DaaSurfaceActionButton>
            ) : null}
          </div>
        </div>
      </div>

      <div className={cn(daaSurfaceTableShellClassName, "overflow-x-auto")}>
        <table className="min-w-[780px] w-full border-collapse">
          <thead>
            <tr>
              <th className={daaSurfaceTableHeadClassName}>资产</th>
              <th className={daaSurfaceTableHeadClassName}>分类 / 地域</th>
              <th className={cn(daaSurfaceTableHeadClassName, "text-right")}>价格</th>
              <th className={cn(daaSurfaceTableHeadClassName, "text-right")}>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const joined = isJoined(item);
              const busy = addingAssetKey === assetKey(item);
              const displayName = item.longName || item.shortName || item.name || item.symbol;
              const testId = assetTestId(item);
              return (
                <tr
                  key={`${item.market}::${item.symbol}`}
                  data-testid={`search-asset-row-${testId}`}
                  data-asset-key={assetKey(item)}
                  className="border-b border-[var(--border)]/70 text-[13px] transition-colors hover:bg-[rgba(56,189,248,0.04)]"
                >
                  <td className={daaSurfaceTableCellClassName}>
                    <div className="max-w-[320px]">
                      <div className="truncate font-semibold text-[var(--text)]" title={displayName}>
                        {displayName}
                      </div>
                      <div className="mt-1 truncate text-[11px] uppercase tracking-[0.14em] text-[var(--faint)]" title={`${item.symbol} · ${item.market} · ${item.currency} · ${item.exchangeDisp || item.exchange}`}>
                        {item.symbol} · {item.market} · {item.currency} · {item.exchangeDisp || item.exchange}
                      </div>
                      <div className="mt-2 truncate text-xs text-[var(--muted)]" title={`类型：${item.typeDisp || item.quoteType || "未知"} · yfinance：${item.yfinanceSymbol || item.symbol}`}>
                        类型：{item.typeDisp || item.quoteType || "未知"} · 行情映射：{item.yfinanceSymbol || item.symbol}
                      </div>
                    </div>
                  </td>
                  <td className={cn(daaSurfaceTableCellClassName, "text-xs text-[var(--muted)]")}>
                    <div>{assetClassLabelZh(item.assetClass)} · {regionLabelZh(item.region)}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <DaaSurfaceStatusPill tone="slate">{marketLabelZh(item.market)}</DaaSurfaceStatusPill>
                      <DaaSurfaceStatusPill tone={priceTone(item.priceStatus)}>
                        {item.priceStatus === "stale" ? "价格偏旧" : item.price > 0 ? "可交易" : "待补行情"}
                      </DaaSurfaceStatusPill>
                    </div>
                  </td>
                  <td className={cn(daaSurfaceTableCellClassName, "text-right font-[var(--font-mono)] text-[var(--text)]")}>
                    {item.price > 0 ? `${currencySymbol(item.currency)} ${item.price.toFixed(4)}` : "待补行情"}
                    {item.price > 0 && item.priceStatus === "stale" ? (
                      <div className="mt-1 text-[11px] text-[var(--amber)]">缓存稍旧</div>
                    ) : null}
                  </td>
                  <td className={cn(daaSurfaceTableCellClassName, "text-right")}>
                    <DaaSurfaceActionButton
                      tone={joined ? "slate" : "primary"}
                      data-testid={`search-asset-add-${testId}`}
                      className="h-8 rounded-full px-3 text-xs"
                      disabled={busy || props.loading || joined}
                      onClick={() => void handleAdd(item)}
                    >
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : joined ? null : <Plus className="h-3.5 w-3.5" />}
                      {joined ? "已加入" : "加入观察"}
                    </DaaSurfaceActionButton>
                  </td>
                </tr>
              );
            })}

            {items.length <= 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center">
                  <DaaSurfaceEmptyState
                    title={hasSearched ? "未找到匹配资产" : "等待输入搜索指令"}
                    description={hasSearched ? "可以尝试更短的代码、正式英文名称，或放宽当前市场与资产类筛选。" : "输入关键词后点击搜索按钮，结果会显示在这里。"}
                    action={hasSearched ? (
                      <div className="flex flex-wrap justify-center gap-2">
                        {q ? <DaaSurfaceActionButton tone="slate" onClick={() => { setQ(""); setItems([]); setHasSearched(false); }}>清空关键词</DaaSurfaceActionButton> : null}
                        {hasActiveFilters ? <DaaSurfaceActionButton tone="slate" onClick={resetFilters}>重置筛选</DaaSurfaceActionButton> : null}
                      </div>
                    ) : null}
                    className="border-0 bg-transparent px-0 py-0"
                  />
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </DaaSurfacePanel>
  );
}
