"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Minus, Plus, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";
import { formatCurrency } from "@/app/daa/dashboard/_components/daaFormatters";
import {
  DaaSurfaceActionButton,
  DaaSurfaceDialogShell,
  DaaSurfaceEmptyState,
  DaaSurfaceFilterChip,
  DaaSurfaceStatusPill,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import type {
  WorkbenchFeaturedAssetGroup,
  WorkbenchFeaturedAssetItem,
  WorkbenchFeaturedAssetsResult,
  WorkbenchSearchAssetResult,
} from "@/src/daa/modules/workbench/workbenchTypes";

function assetKey(input: { market: string; symbol: string }): string {
  return `${String(input.market || "").trim().toUpperCase()}::${String(input.symbol || "").trim().toUpperCase()}`;
}

/* ------------------------------------------------------------------ */
/*  紧凑搜索栏                                                         */
/* ------------------------------------------------------------------ */

export function WatchlistSearchBar(props: {
  loading?: boolean;
  joinedAssetKeys: Record<string, true>;
  onSearch: (input: { q: string; market: string; assetClass: string; region: string }) => Promise<WorkbenchSearchAssetResult[]>;
  onListFeaturedAssets: (input: { market: string; assetClass: string; theme?: string; limitPerMarket?: number }) => Promise<WorkbenchFeaturedAssetsResult>;
  onAddAsset: (item: WorkbenchSearchAssetResult | WorkbenchFeaturedAssetItem) => Promise<void>;
  onRemoveAsset: (item: WorkbenchSearchAssetResult | WorkbenchFeaturedAssetItem) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<WorkbenchSearchAssetResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [featuredOpen, setFeaturedOpen] = useState(false);

  async function handleSearch() {
    if (!q.trim() || searching) return;
    setSearching(true);
    setHasSearched(true);
    try {
      const rows = await props.onSearch({ q: q.trim(), market: "ALL", assetClass: "ALL", region: "ALL" });
      setResults(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "搜索失败");
    } finally {
      setSearching(false);
    }
  }

  async function handleAdd(item: WorkbenchSearchAssetResult | WorkbenchFeaturedAssetItem) {
    if (addingKey) return;
    const key = assetKey(item);
    setAddingKey(key);
    try {
      await props.onAddAsset(item);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加入失败");
    } finally {
      setAddingKey(null);
    }
  }

  async function handleRemove(item: WorkbenchSearchAssetResult | WorkbenchFeaturedAssetItem) {
    if (addingKey) return;
    const key = assetKey(item);
    setAddingKey(key);
    try {
      await props.onRemoveAsset(item);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "移除失败");
    } finally {
      setAddingKey(null);
    }
  }

  function isJoined(input: { market: string; symbol: string }): boolean {
    return Boolean(props.joinedAssetKeys[assetKey(input)]);
  }

  return (
    <div className="space-y-3">
      {/* 搜索栏 */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-[12px] border border-[var(--border)] bg-[rgba(255,255,255,0.04)] px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-[var(--faint)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleSearch(); } }}
            placeholder="搜索标的 NVDA / 0700 / BTC ..."
            className="w-full bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--faint)]"
          />
          {q ? (
            <button
              type="button"
              onClick={() => { setQ(""); setResults([]); setHasSearched(false); }}
              className="text-xs text-[var(--muted)] hover:text-[var(--text)]"
            >
              清除
            </button>
          ) : null}
        </div>
        <DaaSurfaceActionButton
          tone="primary"
          className="h-10 shrink-0 rounded-[12px] px-4"
          onClick={() => void handleSearch()}
          disabled={searching || !q.trim()}
        >
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          搜索
        </DaaSurfaceActionButton>
        <DaaSurfaceActionButton
          tone="slate"
          className="h-10 shrink-0 rounded-[12px] px-3"
          onClick={() => setFeaturedOpen(true)}
        >
          <Sparkles className="h-4 w-4" />
          推荐
        </DaaSurfaceActionButton>
      </div>

      {/* 搜索结果 */}
      {hasSearched ? (
        <div className="space-y-1">
          {results.length === 0 ? (
            <div className="py-4 text-center text-xs text-[var(--muted)]">未找到匹配资产，试试其他关键词</div>
          ) : (
            results.slice(0, 8).map((item) => {
              const joined = isJoined(item);
              const busy = addingKey === assetKey(item);
              const name = item.longName || item.shortName || item.name || item.symbol;
              return (
                <div
                  key={`${item.market}::${item.symbol}`}
                  className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold text-[var(--text)]">{item.symbol}</span>
                      <span className="truncate text-xs text-[var(--muted)]">{name}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--faint)]">
                      <span>{item.market} · {item.currency}</span>
                      {item.price > 0 ? (
                        <span className="font-[var(--font-mono)]">{formatCurrency(item.price, item.currency)}</span>
                      ) : null}
                    </div>
                  </div>
                  <DaaSurfaceActionButton
                    tone={joined ? "slate" : "primary"}
                    className="h-8 shrink-0 rounded-full px-3 text-xs"
                    disabled={busy || props.loading}
                    onClick={() => void (joined ? handleRemove(item) : handleAdd(item))}
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : joined ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                    {joined ? "移除" : "加入"}
                  </DaaSurfaceActionButton>
                </div>
              );
            })
          )}
        </div>
      ) : null}

      {/* 推荐弹窗 */}
      <FeaturedAssetsDialog
        open={featuredOpen}
        onOpenChange={setFeaturedOpen}
        joinedAssetKeys={props.joinedAssetKeys}
        onListFeaturedAssets={props.onListFeaturedAssets}
        onAddAsset={handleAdd}
        onRemoveAsset={handleRemove}
        loading={props.loading}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  推荐资产弹窗                                                       */
/* ------------------------------------------------------------------ */

function FeaturedAssetsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  joinedAssetKeys: Record<string, true>;
  onListFeaturedAssets: (input: { market: string; assetClass: string; theme?: string; limitPerMarket?: number }) => Promise<WorkbenchFeaturedAssetsResult>;
  onAddAsset: (item: WorkbenchFeaturedAssetItem) => Promise<void>;
  onRemoveAsset: (item: WorkbenchFeaturedAssetItem) => Promise<void>;
  loading?: boolean;
}) {
  const [groups, setGroups] = useState<WorkbenchFeaturedAssetGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [market, setMarket] = useState("ALL");
  const [assetClass, setAssetClass] = useState("ALL");
  const [theme, setTheme] = useState("ALL");
  const [addingKey, setAddingKey] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await props.onListFeaturedAssets({ market, assetClass, theme, limitPerMarket: 12 });
      setGroups(Array.isArray(data.groups) ? data.groups : []);
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [market, assetClass, theme, props.onListFeaturedAssets]);

  useEffect(() => {
    if (props.open) void loadData();
  }, [props.open, loadData]);

  function isJoined(input: { market: string; symbol: string }): boolean {
    return Boolean(props.joinedAssetKeys[assetKey(input)]);
  }

  async function handleAdd(item: WorkbenchFeaturedAssetItem) {
    if (addingKey) return;
    const key = assetKey(item);
    setAddingKey(key);
    try {
      await props.onAddAsset(item);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加入失败");
    } finally {
      setAddingKey(null);
    }
  }

  async function handleRemove(item: WorkbenchFeaturedAssetItem) {
    if (addingKey) return;
    const key = assetKey(item);
    setAddingKey(key);
    try {
      await props.onRemoveAsset(item);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "移除失败");
    } finally {
      setAddingKey(null);
    }
  }

  const MARKETS = [
    { value: "ALL", label: "全部" }, { value: "US", label: "美股" },
    { value: "HK", label: "港股" }, { value: "CN", label: "A股" }, { value: "KR", label: "韩股" }, { value: "CRYPTO", label: "加密" },
  ];
  const CLASSES = [
    { value: "ALL", label: "全部" }, { value: "EQUITY", label: "股票" },
    { value: "ETF", label: "ETF" }, { value: "COMMODITY", label: "商品" },
    { value: "BOND", label: "债券" }, { value: "CRYPTO", label: "加密" },
  ];
  const THEMES = [
    { value: "ALL", label: "全部" },
    { value: "semiconductor", label: "半导体" },
    { value: "ai_compute", label: "AI算力" },
    { value: "ai_infrastructure", label: "AI基建" },
    { value: "memory_storage", label: "存储/内存" },
    { value: "optical_networking", label: "光互联" },
    { value: "platform", label: "平台软件" },
    { value: "ai_software", label: "AI软件" },
    { value: "power_grid", label: "电力电网" },
    { value: "robotics", label: "机器人" },
    { value: "cybersecurity", label: "网络安全" },
    { value: "broad_etf", label: "宽基ETF" },
    { value: "china_core", label: "中国资产" },
    { value: "global_region", label: "全球区域" },
    { value: "defensive_income", label: "防守收益" },
    { value: "commodity_resource", label: "商品资源" },
  ];

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DaaSurfaceDialogShell
        accent="indigo"
        className="max-w-[800px] max-h-[80dvh]"
        title="推荐资产池"
        description="按市场分类的高流动性标的，可直接加入观察列表。"
        bodyClassName="space-y-4 overflow-y-auto"
      >
        {/* 筛选器 */}
        <div className="flex flex-wrap gap-4">
          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--faint)]">市场</div>
            <div className="flex gap-1.5">
              {MARKETS.map((m) => (
                <DaaSurfaceFilterChip key={m.value} active={market === m.value} onClick={() => { setMarket(m.value); }}>
                  {m.label}
                </DaaSurfaceFilterChip>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--faint)]">类型</div>
            <div className="flex gap-1.5">
              {CLASSES.map((c) => (
                <DaaSurfaceFilterChip key={c.value} active={assetClass === c.value} onClick={() => { setAssetClass(c.value); }}>
                  {c.label}
                </DaaSurfaceFilterChip>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--faint)]">主题</div>
            <div className="flex flex-wrap gap-1.5">
              {THEMES.map((item) => (
                <DaaSurfaceFilterChip key={item.value} active={theme === item.value} onClick={() => { setTheme(item.value); }}>
                  {item.label}
                </DaaSurfaceFilterChip>
              ))}
            </div>
          </div>
          <DaaSurfaceActionButton tone="primary" className="mt-auto h-8 rounded-full px-4 text-xs" onClick={() => void loadData()} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            刷新
          </DaaSurfaceActionButton>
        </div>

        {/* 资产列表 */}
        {groups.length === 0 && !loading ? (
          <DaaSurfaceEmptyState title="暂无推荐" description="切换市场或类型试试" />
        ) : null}

        {groups.map((group) => (
          <div key={group.market} className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--faint)]">{group.marketLabelZh}</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {group.items.map((item) => {
                const joined = isJoined(item);
                const busy = addingKey === assetKey(item);
                const name = item.longName || item.shortName || item.name || item.symbol;
                return (
                  <div
                    key={`${group.market}::${item.symbol}`}
                    className="flex items-center gap-3 rounded-[12px] border border-[var(--border)] bg-[rgba(8,12,20,0.6)] px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-[var(--text)]">{item.symbol}</div>
                      <div className="mt-0.5 truncate text-[11px] text-[var(--muted)]">{name}</div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <DaaSurfaceStatusPill tone="slate">{item.themeLabelZh || item.thesisTagZh}</DaaSurfaceStatusPill>
                      </div>
                      {item.price > 0 ? (
                        <div className="mt-0.5 font-[var(--font-mono)] text-xs text-[var(--text)]">
                          {formatCurrency(item.price, item.currency)}
                        </div>
                      ) : null}
                    </div>
                    <DaaSurfaceActionButton
                      tone={joined ? "slate" : "primary"}
                      className="h-8 shrink-0 rounded-full px-3 text-xs"
                      disabled={busy || props.loading}
                      onClick={() => void (joined ? handleRemove(item) : handleAdd(item))}
                    >
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : joined ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                      {joined ? "移除" : "加入"}
                    </DaaSurfaceActionButton>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </DaaSurfaceDialogShell>
    </Dialog>
  );
}
