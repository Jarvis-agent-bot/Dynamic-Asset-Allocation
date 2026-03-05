"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type {
  WorkbenchFeaturedAssetGroupV1,
  WorkbenchFeaturedAssetItemV1,
  WorkbenchFeaturedAssetsResultV1,
  WorkbenchSearchAssetResultV1,
} from "@/src/daa/modules/workbench/workbenchTypesV1";

const ASSET_CLASS_OPTIONS_V1 = [
  { value: "EQUITY", label: "股票" },
  { value: "ETF", label: "ETF" },
  { value: "BOND", label: "债券" },
  { value: "CRYPTO", label: "加密" },
] as const;

const MARKET_OPTIONS_V1 = [
  { value: "ALL", label: "全部" },
  { value: "US", label: "美股" },
  { value: "HK", label: "港股" },
  { value: "CN", label: "A股" },
  { value: "CRYPTO", label: "加密" },
] as const;

function assetClassLabelZhV1(value: string): string {
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

function regionLabelZhV1(value: string): string {
  const key = String(value || "").toUpperCase();
  if (key === "US") return "美国";
  if (key === "HK") return "香港";
  if (key === "CN") return "中国";
  if (key === "EU") return "欧洲";
  if (key === "JP") return "日本";
  if (key === "GLOBAL") return "全球";
  return key || "其他";
}

function marketLabelZhV1(value: string): string {
  const key = String(value || "").toUpperCase();
  if (key === "US") return "美股";
  if (key === "HK") return "港股";
  if (key === "CN") return "A股";
  if (key === "CRYPTO") return "加密";
  return key || "其他";
}

export default function AssetDiscoveryPanel(props: {
  loading?: boolean;
  joinedAssetKeys: Record<string, true>;
  onListFeaturedAssets: (input: { market: string; assetClass: string; limitPerMarket?: number }) => Promise<WorkbenchFeaturedAssetsResultV1>;
  onSearch: (input: { q: string; market: string; assetClass: string; region: string }) => Promise<WorkbenchSearchAssetResultV1[]>;
  onAddAsset: (item: WorkbenchSearchAssetResultV1 | WorkbenchFeaturedAssetItemV1) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [market, setMarket] = useState("ALL");
  const [assetClass, setAssetClass] = useState("EQUITY");
  const [searching, setSearching] = useState(false);
  const [addingAssetKey, setAddingAssetKey] = useState<string | null>(null);
  const [items, setItems] = useState<WorkbenchSearchAssetResultV1[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [featuredGroups, setFeaturedGroups] = useState<WorkbenchFeaturedAssetGroupV1[]>([]);
  const [featuredLoading, setFeaturedLoading] = useState(false);
  const [featuredError, setFeaturedError] = useState("");
  const [featuredCollapsed, setFeaturedCollapsed] = useState(false);
  const featuredRequestIdRef = useRef(0);

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

  function assetKeyV1(input: { market: string; symbol: string }): string {
    return `${String(input.market || "").trim().toUpperCase()}::${String(input.symbol || "").trim().toUpperCase()}`;
  }

  function isJoinedV1(input: { market: string; symbol: string }): boolean {
    return Boolean(props.joinedAssetKeys[assetKeyV1(input)]);
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

  async function handleAdd(item: WorkbenchSearchAssetResultV1 | WorkbenchFeaturedAssetItemV1) {
    if (addingAssetKey) return;
    const nextKey = `${item.market}::${item.symbol}`;
    setAddingAssetKey(nextKey);
    try {
      await props.onAddAsset(item);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加入失败");
    } finally {
      setAddingAssetKey(null);
    }
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">推荐与搜索资产</CardTitle>
        <CardDescription>默认展示优质资产推荐，同时支持输入代码或名称进行精准搜索。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">资产类</div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {ASSET_CLASS_OPTIONS_V1.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={assetClass === option.value ? "default" : "outline"}
                className="h-7 shrink-0 px-3 text-xs"
                onClick={() => setAssetClass(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">市场</div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {MARKET_OPTIONS_V1.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={market === option.value ? "default" : "outline"}
                className="h-7 shrink-0 px-3 text-xs"
                onClick={() => setMarket(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border bg-gradient-to-br from-slate-50/80 to-cyan-50/60 p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">推荐资产</div>
              <div className="text-xs text-muted-foreground">按市场展示优质资产，可直接加入观察。</div>
            </div>
            <div className="flex items-center gap-2">
              {featuredLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 rounded-full border-slate-300 bg-white/80 px-3 text-xs"
                onClick={() => setFeaturedCollapsed((prev) => !prev)}
              >
                {featuredCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                {featuredCollapsed ? "展开推荐" : "收起推荐"}
              </Button>
            </div>
          </div>

          {featuredCollapsed ? (
            <div className="rounded-md border border-dashed border-slate-300 bg-white/60 px-3 py-4 text-center text-xs text-muted-foreground">
              推荐资产已折叠，点击“展开推荐”即可查看。
            </div>
          ) : null}

          {!featuredCollapsed ? (
            <>
              {featuredError ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{featuredError}</div>
              ) : null}

              {!featuredLoading && !featuredError && featuredGroups.length <= 0 ? (
                <div className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                  当前筛选下暂无推荐资产。
                </div>
              ) : null}

              <div className="space-y-3">
                {featuredGroups.map((group) => (
                  <div key={group.market} className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">{group.marketLabelZh}</div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      {group.items.map((item) => {
                        const joined = isJoinedV1(item);
                        const busy = addingAssetKey === assetKeyV1(item);
                        const displayName = item.longName || item.shortName || item.name || item.symbol;
                        return (
                          <div key={`${group.market}::${item.symbol}`} className="rounded-md border bg-background p-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium" title={displayName}>{displayName}</div>
                                <div className="truncate text-xs text-muted-foreground" title={`${item.symbol} · ${marketLabelZhV1(item.market)}`}>
                                  {item.symbol} · {marketLabelZhV1(item.market)}
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 shrink-0 px-2 text-xs"
                                disabled={busy || props.loading || joined}
                                onClick={() => void handleAdd(item)}
                              >
                                {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : joined ? null : <Plus className="mr-1 h-3.5 w-3.5" />}
                                {joined ? "已加入" : "加入"}
                              </Button>
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">
                              {assetClassLabelZhV1(item.assetClass)} · {item.currency} {item.price > 0 ? item.price.toFixed(4) : "待补行情"}
                            </div>
                            {item.thesisTagZh ? (
                              <div className="mt-1 truncate text-xs text-muted-foreground" title={item.thesisTagZh}>{item.thesisTagZh}</div>
                            ) : null}
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

        <div className="space-y-2">
          <div className="text-sm font-medium">精准搜索</div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleSearch();
                }
              }}
              placeholder="输入代码或名称，例如 NVDA / 0700 / BTC"
              className="h-8 text-xs"
            />
            <Button
              type="button"
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => void handleSearch()}
              disabled={props.loading || searching || !q.trim()}
            >
              {searching ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Search className="mr-1.5 h-3.5 w-3.5" />}
              {searching ? "搜索中..." : "搜索资产"}
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <Table className="min-w-[860px] table-fixed">
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead>资产</TableHead>
                <TableHead>分类</TableHead>
                <TableHead className="text-right">价格</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const joined = isJoinedV1(item);
                const busy = addingAssetKey === assetKeyV1(item);
                const displayName = item.longName || item.shortName || item.name || item.symbol;
                return (
                  <TableRow key={`${item.market}::${item.symbol}`}>
                    <TableCell className="max-w-0">
                      <div className="truncate font-medium" title={displayName}>{displayName}</div>
                      <div className="truncate text-xs text-muted-foreground" title={`${item.symbol} · ${item.market} · ${item.currency} · ${item.exchangeDisp || item.exchange}`}>{item.symbol} · {item.market} · {item.currency} · {item.exchangeDisp || item.exchange}</div>
                      <div className="truncate text-xs text-muted-foreground" title={`类型：${item.typeDisp || item.quoteType || "未知"} · yfinance：${item.yfinanceSymbol || item.symbol}`}>
                        类型：{item.typeDisp || item.quoteType || "未知"} · yfinance：{item.yfinanceSymbol || item.symbol}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {assetClassLabelZhV1(item.assetClass)} · {regionLabelZhV1(item.region)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.price > 0 ? `${item.currency} ${item.price.toFixed(4)}` : "待补行情"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        disabled={busy || props.loading || joined}
                        onClick={() => void handleAdd(item)}
                      >
                        {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : joined ? null : <Plus className="mr-1 h-3.5 w-3.5" />}
                        {joined ? "已加入" : "加入观察"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}

              {items.length <= 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                    {hasSearched ? "未找到匹配资产，请尝试其他关键词。" : "输入关键词后点击搜索按钮。"}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
