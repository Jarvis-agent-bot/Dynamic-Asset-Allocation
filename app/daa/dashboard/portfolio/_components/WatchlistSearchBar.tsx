"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Minus, Plus, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";

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
  onListFeaturedAssets: (input: { role?: string; market: string; assetClass: string; theme?: string; limitPerRole?: number }) => Promise<WorkbenchFeaturedAssetsResult>;
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "搜索失败");
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加入失败");
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "移除失败");
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
        <div className="flex flex-1 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--elevated)] px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-[var(--faint)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleSearch(); } }}
            placeholder="搜索标的 NVDA / 0700 / BTC ..."
            className="h-[34px] w-full bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--faint)]"
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
          className="h-10 shrink-0 rounded-[var(--radius-sm)] px-4"
          onClick={() => void handleSearch()}
          disabled={searching || !q.trim()}
        >
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          搜索
        </DaaSurfaceActionButton>
        <DaaSurfaceActionButton
          tone="neutral"
          className="h-10 shrink-0 rounded-[var(--radius-sm)] px-3"
          onClick={() => setFeaturedOpen(true)}
        >
          <Sparkles className="h-4 w-4" />
          候选池
        </DaaSurfaceActionButton>
      </div>

      {/* 搜索结果 */}
      {hasSearched ? (
        <div className="space-y-1">
          {results.length === 0 ? (
            <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] px-2.5 py-2 text-xs text-[var(--muted)]">未找到匹配资产，试试其他关键词</div>
          ) : (
            results.slice(0, 8).map((item) => {
              const joined = isJoined(item);
              const busy = addingKey === assetKey(item);
              const name = item.longName || item.shortName || item.name || item.symbol;
              const displayName = item.displayNameZh || name;
              return (
                <div
                  key={`${item.market}::${item.symbol}`}
                  className="flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 transition-colors hover:bg-[var(--elevated)]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold text-[var(--text)]">{displayName}</span>
                      <span className="font-[var(--font-mono)] text-xs text-[var(--faint)]">{item.symbol}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--faint)]">
                      <span>{item.market} · {item.currency}</span>
                      {item.price > 0 ? (
                        <span className="font-[var(--font-mono)]">{formatCurrency(item.price, item.currency)}</span>
                      ) : null}
                    </div>
                  </div>
                  <DaaSurfaceActionButton
                    tone={joined ? "neutral" : "primary"}
                    className="h-8 shrink-0 rounded-[var(--radius-sm)] px-3 text-xs"
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
/*  配置候选池弹窗                                                     */
/* ------------------------------------------------------------------ */

function FeaturedAssetsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  joinedAssetKeys: Record<string, true>;
  onListFeaturedAssets: (input: { role?: string; market: string; assetClass: string; theme?: string; limitPerRole?: number }) => Promise<WorkbenchFeaturedAssetsResult>;
  onAddAsset: (item: WorkbenchFeaturedAssetItem) => Promise<void>;
  onRemoveAsset: (item: WorkbenchFeaturedAssetItem) => Promise<void>;
  loading?: boolean;
}) {
  const [groups, setGroups] = useState<WorkbenchFeaturedAssetGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState("ALL");
  const [market, setMarket] = useState("ALL");
  const [assetClass, setAssetClass] = useState("ALL");
  const [addingKey, setAddingKey] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await props.onListFeaturedAssets({ role, market, assetClass, limitPerRole: 20 });
      setGroups(Array.isArray(data.groups) ? data.groups : []);
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [role, market, assetClass, props.onListFeaturedAssets]);

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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加入失败");
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "移除失败");
    } finally {
      setAddingKey(null);
    }
  }

  const ROLES = [
    { value: "ALL", label: "全部" },
    { value: "cash_buffer", label: "现金/短债" },
    { value: "core_equity", label: "核心宽基" },
    { value: "defensive_bond", label: "债券/收益" },
    { value: "real_asset", label: "黄金/商品" },
    { value: "regional_diversifier", label: "区域市场" },
    { value: "satellite_theme", label: "行业主题/龙头" },
    { value: "crypto_optional", label: "加密资产" },
    { value: "currency_hedge", label: "汇率工具" },
  ];
  const MARKETS = [
    { value: "ALL", label: "全部市场" },
    { value: "US", label: "美股/美 ETF" },
    { value: "HK", label: "港股" },
    { value: "CN", label: "A 股" },
    { value: "KR", label: "韩股" },
    { value: "COMMODITY", label: "商品" },
    { value: "CRYPTO", label: "加密" },
  ];
  const CLASSES = [
    { value: "ALL", label: "全部品种" }, { value: "EQUITY", label: "股票" },
    { value: "ETF", label: "ETF" }, { value: "COMMODITY", label: "商品/黄金" },
    { value: "BOND", label: "债券/短债" }, { value: "CRYPTO", label: "加密" }, { value: "CURRENCY", label: "货币 ETF" },
  ];
  const marketLabel = (item: WorkbenchFeaturedAssetItem): string => {
    if (item.market === "US") return "美股";
    if (item.market === "HK") return "港股";
    if (item.market === "CN") return "A股";
    if (item.market === "KR") return "韩股";
    if (item.market === "CRYPTO") return "加密";
    if (item.market === "COMMODITY") return "商品";
    return item.market;
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DaaSurfaceDialogShell
        accent="info"
        className="max-w-[800px] max-h-[80dvh]"
        title="配置候选池"
        description="按配置用途、市场和品种筛选高流动性资产，用于构建目标配置。"
        bodyClassName="space-y-4 overflow-y-auto"
      >
        {/* 筛选器 */}
        <div className="flex flex-wrap gap-4">
          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-normal text-[var(--faint)]">配置用途</div>
            <div className="flex flex-wrap gap-1.5">
              {ROLES.map((roleOption) => (
                <DaaSurfaceFilterChip key={roleOption.value} active={role === roleOption.value} onClick={() => { setRole(roleOption.value); }}>
                  {roleOption.label}
                </DaaSurfaceFilterChip>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-normal text-[var(--faint)]">市场</div>
            <div className="flex flex-wrap gap-1.5">
              {MARKETS.map((marketOption) => (
                <DaaSurfaceFilterChip key={marketOption.value} active={market === marketOption.value} onClick={() => { setMarket(marketOption.value); }}>
                  {marketOption.label}
                </DaaSurfaceFilterChip>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-normal text-[var(--faint)]">品种</div>
            <div className="flex flex-wrap gap-1.5">
              {CLASSES.map((classOption) => (
                <DaaSurfaceFilterChip key={classOption.value} active={assetClass === classOption.value} onClick={() => { setAssetClass(classOption.value); }}>
                  {classOption.label}
                </DaaSurfaceFilterChip>
              ))}
            </div>
          </div>
          <DaaSurfaceActionButton tone="primary" className="mt-auto h-8 rounded-[var(--radius-sm)] px-4 text-xs" onClick={() => void loadData()} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            刷新
          </DaaSurfaceActionButton>
        </div>

        {/* 资产列表 */}
        {groups.length === 0 && !loading ? (
          <DaaSurfaceEmptyState title="暂无候选" description="切换配置角色或资产类型试试" />
        ) : null}

        {groups.map((group) => (
          <div key={group.groupKey} className="space-y-2">
            <div>
              <div className="text-sm font-semibold text-[var(--text)]">{group.groupLabelZh}</div>
              <div className="mt-0.5 text-xs leading-5 text-[var(--muted)]">{group.groupDescriptionZh}</div>
            </div>
            <div className="divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]">
              {group.items.map((item) => {
                const joined = isJoined(item);
                const busy = addingKey === assetKey(item);
                const name = item.displayNameZh;
                const note = item.allocationNoteZh;
                return (
                  <div
                    key={`${item.market}::${item.symbol}`}
                    className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-[var(--elevated)]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <div className="text-sm font-semibold text-[var(--text)]">{name}</div>
                        <div className="font-[var(--font-mono)] text-xs text-[var(--faint)]">{item.symbol}</div>
                      </div>
                      <div className="mt-0.5 text-[11px] leading-4 text-[var(--muted)]">{note}</div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <DaaSurfaceStatusPill tone="neutral">{item.typeDisp}</DaaSurfaceStatusPill>
                        <DaaSurfaceStatusPill tone="neutral">{marketLabel(item)} · {item.currency}</DaaSurfaceStatusPill>
                        <DaaSurfaceStatusPill tone="neutral">参考 {item.suggestedWeightBandZh}</DaaSurfaceStatusPill>
                      </div>
                      {item.price > 0 ? (
                        <div className="mt-0.5 font-[var(--font-mono)] text-xs text-[var(--text)]">
                          {formatCurrency(item.price, item.currency)}
                        </div>
                      ) : null}
                    </div>
                    <DaaSurfaceActionButton
                      tone={joined ? "neutral" : "primary"}
                      className="h-8 shrink-0 rounded-[var(--radius-sm)] px-3 text-xs"
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
