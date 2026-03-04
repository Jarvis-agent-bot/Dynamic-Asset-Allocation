"use client";

import { useState } from "react";
import { Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { WorkbenchSearchAssetResultV1 } from "@/src/daa/modules/workbench/workbenchTypesV1";

export default function AssetDiscoveryPanel(props: {
  loading?: boolean;
  onSearch: (input: { q: string; market: string; assetClass: string; region: string }) => Promise<WorkbenchSearchAssetResultV1[]>;
  onAddAsset: (item: WorkbenchSearchAssetResultV1) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [market, setMarket] = useState("ALL");
  const [assetClass, setAssetClass] = useState("ALL");
  const [region, setRegion] = useState("ALL");
  const [searching, setSearching] = useState(false);
  const [addingSymbol, setAddingSymbol] = useState<string | null>(null);
  const [items, setItems] = useState<WorkbenchSearchAssetResultV1[]>([]);

  async function handleSearch() {
    if (!q.trim() || searching) return;
    setSearching(true);
    try {
      const rows = await props.onSearch({
        q: q.trim(),
        market,
        assetClass,
        region,
      });
      setItems(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "搜索失败");
    } finally {
      setSearching(false);
    }
  }

  async function handleAdd(item: WorkbenchSearchAssetResultV1) {
    if (addingSymbol) return;
    setAddingSymbol(item.symbol);
    try {
      await props.onAddAsset(item);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加入失败");
    } finally {
      setAddingSymbol(null);
    }
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">资产发现</CardTitle>
        <CardDescription>全市场搜索资产并快速加入资产宇宙。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2">
          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="输入代码或名称，例如 NVDA / 0700 / BTC"
            className="h-8 text-xs"
          />
          <div className="grid grid-cols-3 gap-2">
            <select
              className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
              value={market}
              onChange={(event) => setMarket(event.target.value)}
            >
              <option value="ALL">全部市场</option>
              <option value="US">美股</option>
              <option value="HK">港股</option>
              <option value="CN">A股</option>
              <option value="CRYPTO">加密</option>
            </select>
            <select
              className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
              value={assetClass}
              onChange={(event) => setAssetClass(event.target.value)}
            >
              <option value="ALL">全部资产类</option>
              <option value="EQUITY">股票</option>
              <option value="ETF">ETF</option>
              <option value="BOND">债券</option>
              <option value="COMMODITY">商品</option>
              <option value="CRYPTO">加密</option>
              <option value="FUND">基金</option>
              <option value="INDEX">指数</option>
            </select>
            <select
              className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
              value={region}
              onChange={(event) => setRegion(event.target.value)}
            >
              <option value="ALL">全部地区</option>
              <option value="US">美国</option>
              <option value="HK">香港</option>
              <option value="CN">中国</option>
              <option value="EU">欧洲</option>
              <option value="JP">日本</option>
              <option value="GLOBAL">全球</option>
            </select>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => void handleSearch()}
            disabled={props.loading || searching || !q.trim()}
          >
            {searching ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Search className="mr-1.5 h-3.5 w-3.5" />}
            {searching ? "搜索中..." : "搜索资产"}
          </Button>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <Table>
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
                const busy = addingSymbol === item.symbol;
                return (
                  <TableRow key={`${item.market}::${item.symbol}`}>
                    <TableCell>
                      <div className="font-medium">{item.symbol}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.market} · {item.currency} · {item.exchange || "-"} · {item.yfinanceSymbol || "-"}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {item.assetClass} · {item.region}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.price > 0 ? `${item.currency} ${item.price.toFixed(4)}` : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        disabled={busy || props.loading}
                        onClick={() => void handleAdd(item)}
                      >
                        {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
                        加入
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}

              {items.length <= 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                    先输入关键词后搜索。
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
