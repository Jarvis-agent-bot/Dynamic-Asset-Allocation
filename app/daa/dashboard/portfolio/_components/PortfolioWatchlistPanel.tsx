"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, RefreshCcw, Search, Trash2, Upload } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { DEFAULT_ANALYSIS_FOCUS_V1 } from "@/src/daa/llm/analysisFocusDefaultsV1";
import type { DaaAssetInsightLiteV1 } from "@/src/daa/insights/assetInsightsV1";

import { fetchAssetInsightsV1 } from "@/app/daa/dashboard/_components/assetInsightsClient";
import { searchSymbolLookupItemsV1, type SymbolLookupItem } from "@/app/daa/dashboard/_components/symbolLookupClient";
import { toast } from "sonner";
import { usePositions, useStrategyConfig, useWatchlistCandidates } from "../../_components/useDaaStore";
import type { DaaPositionRow, DaaWatchlistCandidateRow } from "../../../unifiedInputStore";

import AssetInsightDrawer from "./AssetInsightDrawer";
import BuyOrderDialog from "./BuyOrderDialog";
import SymbolSearchCombobox from "./SymbolSearchCombobox";

// ─── Constants ────────────────────────────────────────────────────────────────

const TAG_OPTIONS = ["etf", "growth", "value", "bond", "crypto", "dividend", "tech", "largecap"] as const;
const MARKETS = ["ALL", "US", "HK", "CN", "CRYPTO", "OTHER"] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeSymbol(value: string): string {
  return String(value || "").trim().toUpperCase();
}

function toFixed(value: number | null | undefined, digits = 1): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return num.toFixed(digits);
}

function toggleArrayItem(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function mergeWatchlistRows(
  baseRows: DaaWatchlistCandidateRow[],
  nextRow: DaaWatchlistCandidateRow,
): DaaWatchlistCandidateRow[] {
  const key = `${nextRow.symbol}::${nextRow.market}`;
  const found = baseRows.findIndex((row) => `${row.symbol}::${row.market}` === key);
  if (found < 0) return [...baseRows, nextRow];
  const output = [...baseRows];
  output[found] = { ...output[found], ...nextRow };
  return output;
}

function actionLabel(action: string): string {
  if (action === "open_or_add") return "开/加仓";
  if (action === "reduce_or_avoid") return "减仓";
  return "观察";
}

function actionColor(action: string): string {
  if (action === "open_or_add") return "text-emerald-600";
  if (action === "reduce_or_avoid") return "text-red-500";
  return "text-amber-500";
}

// ─── Toggle component ─────────────────────────────────────────────────────────

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label ?? (checked ? "已启用" : "已停用")}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${
        checked ? "bg-sky-500" : "bg-muted"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition-transform ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

// ─── Delete confirm ───────────────────────────────────────────────────────────

function DeleteConfirmDialog({
  onConfirm,
  description = "此操作不可撤销，是否确认删除？",
}: {
  onConfirm: () => void;
  description?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>确认删除</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{description}</p>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>取消</Button>
          <Button variant="destructive" size="sm" onClick={() => { onConfirm(); setOpen(false); }}>删除</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Import dialog ────────────────────────────────────────────────────────────

function ImportDialog({ onImport }: { onImport: (rows: DaaWatchlistCandidateRow[]) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  function handleImport() {
    setError("");
    try {
      const parsed = JSON.parse(text);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      const rows: DaaWatchlistCandidateRow[] = arr
        .map((item: any) => ({
          symbol: normalizeSymbol(item.symbol),
          market: String(item.market ?? "US").trim().toUpperCase() || "US",
          currency: String(item.currency ?? "USD").trim().toUpperCase() || "USD",
          enabled: item.enabled !== false,
          targetWeightHint: Math.max(0, Math.min(1, Number(item.targetWeightHint) || 0)),
          tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
          notes: String(item.notes ?? "").trim(),
        }))
        .filter((item: any) => item.symbol);

      if (!rows.length) { setError("未识别到有效候选标的。"); return; }
      onImport(rows);
      setOpen(false);
      setText("");
    } catch {
      setError("JSON 格式错误，应为候选对象数组。");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Upload className="mr-1.5 h-3.5 w-3.5" /> 导入</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>批量导入候选池 (JSON)</DialogTitle></DialogHeader>
        <Textarea
          className="min-h-[160px] font-mono text-xs"
          placeholder='[{"symbol":"AAPL","market":"US","targetWeightHint":0.05,"tags":["tech"]}]'
          value={text}
          onChange={(e) => { setText(e.target.value); setError(""); }}
        />
        {error ? <p className="text-xs text-red-500">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
          <Button onClick={handleImport}>导入</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Target weight inline editor ──────────────────────────────────────────────

function TargetWeightCell({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function startEdit() {
    setDraft(((value || 0) * 100).toFixed(1));
    setEditing(true);
  }

  function commit() {
    const parsed = Math.max(0, Math.min(100, Number(draft) || 0));
    onChange(parsed / 100);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          type="number"
          min={0}
          max={100}
          step={0.5}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          className="h-6 w-16 px-1.5 text-xs tabular-nums"
          autoFocus
        />
        <span className="text-xs text-muted-foreground">%</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="rounded px-1.5 py-0.5 text-xs tabular-nums hover:bg-muted transition-colors"
      onClick={startEdit}
      title="点击编辑目标权重"
    >
      {((value || 0) * 100).toFixed(1)}%
    </button>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function PortfolioWatchlistPanel() {
  const [candidates, setCandidates] = useWatchlistCandidates();
  const [positions] = usePositions();
  const [config] = useStrategyConfig();

  // UI state
  const [keyword, setKeyword] = useState("");
  const [marketFilter, setMarketFilter] = useState<string>("ALL");
  const [enabledFilter, setEnabledFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);

  // Buy dialog
  const [buyOpen, setBuyOpen] = useState(false);
  const [buySymbol, setBuySymbol] = useState<string | null>(null);

  // Insight drawer
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailSymbol, setDetailSymbol] = useState("");

  // Insights
  const [liteInsights, setLiteInsights] = useState<Record<string, DaaAssetInsightLiteV1>>({});
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState("");
  const [syncError, setSyncError] = useState("");

  const list = useMemo(() => candidates ?? [], [candidates]);
  const positionsList = useMemo(() => positions ?? [], [positions]);
  const enabledCount = useMemo(() => list.filter((item) => item.enabled).length, [list]);

  // Build position lookup: symbol → qty
  const positionMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of positionsList) {
      const sym = normalizeSymbol(p.symbol);
      if (sym) map.set(sym, (map.get(sym) ?? 0) + p.qty);
    }
    return map;
  }, [positionsList]);

  // Portfolio base value for weight calc
  const displayCurrency = String(config.account.baseCurrency || "USD").toUpperCase();
  const holdingsValue = useMemo(
    () => positionsList.reduce((sum, p) => sum + p.qty * p.price, 0),
    [positionsList],
  );
  const portfolioBase = holdingsValue + Math.max(0, Number(config.account.cash) || 0);

  // Actual weight map: symbol → weight% (0-100)
  const actualWeightMap = useMemo(() => {
    const map = new Map<string, number>();
    if (portfolioBase <= 0) return map;
    for (const p of positionsList) {
      const sym = normalizeSymbol(p.symbol);
      if (!sym) continue;
      const mv = p.qty * p.price;
      map.set(sym, ((map.get(sym) ?? 0) * portfolioBase + mv) / portfolioBase * 100);
    }
    // Simpler:
    const map2 = new Map<string, number>();
    for (const p of positionsList) {
      const sym = normalizeSymbol(p.symbol);
      if (!sym) continue;
      const mv = p.qty * p.price;
      map2.set(sym, (map2.get(sym) ?? 0) + (mv / portfolioBase) * 100);
    }
    return map2;
  }, [positionsList, portfolioBase]);

  const tagsPool = useMemo(() => {
    const output = new Set<string>(TAG_OPTIONS);
    for (const row of list) for (const tag of row.tags ?? []) { const t = String(tag || "").trim(); if (t) output.add(t); }
    return [...output].sort((a, b) => a.localeCompare(b));
  }, [list]);

  // Load insights
  useEffect(() => {
    const symbols = [...new Set(list.map((r) => normalizeSymbol(r.symbol)).filter(Boolean))];
    if (!symbols.length) { setLiteInsights({}); return; }
    let cancelled = false;
    setInsightsLoading(true);
    setInsightsError("");
    void fetchAssetInsightsV1({ symbols, detailMode: "lite", analysisFocus: DEFAULT_ANALYSIS_FOCUS_V1, includeLlm: false })
      .then((res) => {
        if (cancelled) return;
        const map: Record<string, DaaAssetInsightLiteV1> = {};
        for (const item of res.insights) { const sym = normalizeSymbol(item.symbol); if (sym) map[sym] = item.lite; }
        setLiteInsights(map);
      })
      .catch((err) => { if (!cancelled) setInsightsError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (!cancelled) setInsightsLoading(false); });
    return () => { cancelled = true; };
  }, [list]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    const kw = String(keyword || "").trim().toLowerCase();
    return list.map((row, index) => ({ row, index })).filter(({ row }) => {
      if (kw) {
        const target = `${row.symbol} ${row.name || ""} ${row.market} ${row.tags.join(" ")} ${row.notes || ""}`.toLowerCase();
        if (!target.includes(kw)) return false;
      }
      if (marketFilter !== "ALL" && row.market !== marketFilter) return false;
      if (enabledFilter === "enabled" && !row.enabled) return false;
      if (enabledFilter === "disabled" && row.enabled) return false;
      if (tagFilters.length > 0 && !tagFilters.some((tag) => row.tags.includes(tag))) return false;
      return true;
    });
  }, [enabledFilter, keyword, list, marketFilter, tagFilters]);

  // Mutations
  function upsertCandidate(next: DaaWatchlistCandidateRow) {
    setCandidates(mergeWatchlistRows(list, next));
  }

  function handleSymbolSelect(item: SymbolLookupItem) {
    upsertCandidate({
      symbol: normalizeSymbol(item.symbol),
      name: item.name || null,
      market: String(item.market || "US").toUpperCase(),
      currency: String(item.currency || "USD").toUpperCase(),
      enabled: true,
      targetWeightHint: 0.05,
      currentPrice: item.price > 0 ? item.price : null,
      priceChangePct: null,
      priceUpdatedAt: new Date().toISOString(),
      tags: [],
      notes: null,
    });
  }

  function importCandidates(rows: DaaWatchlistCandidateRow[]) {
    let merged = [...list];
    for (const row of rows) merged = mergeWatchlistRows(merged, row);
    setCandidates(merged);
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(list, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "daa-watchlist.json"; a.click();
    URL.revokeObjectURL(url);
  }

  function removeCandidate(index: number) {
    setCandidates(list.filter((_, i) => i !== index));
  }

  function toggleEnabled(index: number) {
    const next = [...list];
    next[index] = { ...next[index], enabled: !next[index].enabled };
    setCandidates(next);
  }

  function updateTargetWeight(index: number, value: number) {
    const next = [...list];
    next[index] = { ...next[index], targetWeightHint: value };
    setCandidates(next);
  }

  // Batch price sync
  async function syncPrices() {
    if (syncing || !list.length) return;
    setSyncing(true);
    setSyncError("");
    const updated = [...list];
    let count = 0;
    for (let i = 0; i < updated.length; i++) {
      const row = updated[i];
      try {
        const results = await searchSymbolLookupItemsV1({ query: row.symbol, market: "ALL", limit: 1 });
        const match = results.find((r) => r.symbol === row.symbol) ?? results[0];
        if (match && match.price > 0) {
          updated[i] = {
            ...row,
            currentPrice: match.price,
            priceUpdatedAt: new Date().toISOString(),
          };
          count++;
        }
      } catch { /* skip */ }
    }
    setCandidates(updated);
    if (count === 0) setSyncError("价格刷新失败，请检查网络或标的代码。");
    setSyncing(false);
  }

  // Handle buy from watchlist
  const [positions2, setPositions] = usePositions();

  function handleBuyConfirm(result: {
    symbol: string; market: string; currency: string;
    price: number; qty: number; costBasis: number; tags: string[];
    name?: string;
  }) {
    const currentPositions = positions2 ?? [];
    const existingIdx = currentPositions.findIndex(
      (p) => normalizeSymbol(p.symbol) === result.symbol && p.market === result.market,
    );
    if (existingIdx >= 0) {
      // Average up existing position
      const existing = currentPositions[existingIdx];
      const totalQty = existing.qty + result.qty;
      const avgCost = (existing.qty * (existing.costBasis ?? existing.price) + result.qty * result.costBasis) / totalQty;
      const next = [...currentPositions];
      next[existingIdx] = { ...existing, qty: totalQty, price: result.price, costBasis: avgCost };
      setPositions(next);
    } else {
      const newPos: DaaPositionRow = {
        symbol: result.symbol,
        market: result.market,
        currency: result.currency,
        qty: result.qty,
        price: result.price,
        costBasis: result.costBasis,
        tags: result.tags,
        ...(result.name ? { name: result.name } : {}),
      };
      setPositions([...currentPositions, newPos]);
    }
    toast.success(`已买入 ${result.symbol}`, { description: `${result.qty} 股 @ ${result.currency} ${result.price.toFixed(2)}` });
    setBuyOpen(false);
    setBuySymbol(null);
  }

  // Derive buy dialog signals for selected symbol
  const buySymbolActualPct = buySymbol ? (actualWeightMap.get(normalizeSymbol(buySymbol)) ?? 0) : 0;
  const buySymbolCandidate = useMemo(
    () => list.find((r) => normalizeSymbol(r.symbol) === (buySymbol ? normalizeSymbol(buySymbol) : "")),
    [list, buySymbol],
  );
  const buySymbolTargetPct = buySymbolCandidate
    ? (buySymbolCandidate.targetWeightHint || 0) * 100
    : undefined;
  const buySymbolLite = buySymbol ? liteInsights[normalizeSymbol(buySymbol)] : null;

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {insightsError && (
          <Alert variant="destructive">
            <AlertDescription>Lite 分析加载失败：{insightsError}</AlertDescription>
          </Alert>
        )}
        {syncError && (
          <Alert variant="destructive">
            <AlertDescription>{syncError}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">候选池</CardTitle>
                <CardDescription>
                  共 {list.length} 个标的（启用 {enabledCount}）· 搜索即可添加关注标的
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void syncPrices()}
                  disabled={syncing || !list.length}
                >
                  <RefreshCcw className={`mr-1.5 h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
                  {syncing ? "刷新中..." : "刷新价格"}
                </Button>
                <ImportDialog onImport={importCandidates} />
                <Button variant="outline" size="sm" onClick={exportJson} disabled={!list.length}>
                  <Download className="mr-1.5 h-3.5 w-3.5" /> 导出
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Search bar — only way to add */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Search className="h-3 w-3" />
                搜索并添加标的
              </Label>
              <SymbolSearchCombobox
                onSelect={handleSymbolSelect}
                placeholder="输入代码或名称，如 AAPL / 腾讯 / SPY"
              />
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Market filter pills */}
              <div className="flex flex-wrap gap-1">
                {MARKETS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                      marketFilter === m
                        ? "border-sky-400 bg-sky-100 text-sky-700"
                        : "border-border bg-background text-muted-foreground hover:bg-muted"
                    }`}
                    onClick={() => setMarketFilter(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <div className="h-4 w-px bg-border" />
              {/* Enabled filter */}
              <select
                className="flex h-7 rounded-md border border-input bg-transparent px-2 py-0.5 text-xs shadow-sm"
                value={enabledFilter}
                onChange={(e) => setEnabledFilter(e.target.value as "all" | "enabled" | "disabled")}
              >
                <option value="all">全部状态</option>
                <option value="enabled">已启用</option>
                <option value="disabled">已停用</option>
              </select>
              {/* Keyword search in list */}
              <div className="relative ml-auto">
                <Search className="pointer-events-none absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  className="flex h-7 w-40 rounded-md border border-input bg-transparent pl-7 pr-3 text-xs shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="过滤列表..."
                />
              </div>
            </div>

            {/* Tag filters */}
            {tagsPool.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tagsPool.map((tag) => {
                  const active = tagFilters.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                        active
                          ? "border-sky-300 bg-sky-100 text-sky-700"
                          : "border-border bg-background text-muted-foreground hover:bg-muted"
                      }`}
                      onClick={() => setTagFilters((prev) => toggleArrayItem(prev, tag))}
                    >
                      {tag}
                    </button>
                  );
                })}
                {tagFilters.length > 0 && (
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setTagFilters([])}>
                    清空
                  </Button>
                )}
              </div>
            )}

            {/* Watchlist table */}
            {list.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead className="w-12">启用</TableHead>
                      <TableHead>代码</TableHead>
                      <TableHead>市场</TableHead>
                      <TableHead className="text-right">现价</TableHead>
                      <TableHead className="text-right">涨跌%</TableHead>
                      <TableHead className="text-right">目标权重</TableHead>
                      <TableHead className="text-right">实际权重</TableHead>
                      <TableHead className="text-right">缺口</TableHead>
                      <TableHead className="text-right">机会分</TableHead>
                      <TableHead>动作</TableHead>
                      <TableHead>标签</TableHead>
                      <TableHead className="min-w-[120px] text-right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map(({ row: item, index }) => {
                      const sym = normalizeSymbol(item.symbol);
                      const lite = liteInsights[sym];
                      const holdingQty = positionMap.get(sym) ?? 0;
                      const actualPct = actualWeightMap.get(sym) ?? 0;
                      const targetPct = (item.targetWeightHint || 0) * 100;
                      const gapPct = targetPct - actualPct;

                      return (
                        <TableRow
                          key={`${item.symbol}-${item.market}-${index}`}
                          className={!item.enabled ? "opacity-50" : undefined}
                        >
                          <TableCell>
                            <Toggle
                              checked={item.enabled}
                              onChange={() => toggleEnabled(index)}
                              label={item.enabled ? `停用 ${item.symbol}` : `启用 ${item.symbol}`}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{item.symbol}</span>
                              {holdingQty > 0 && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="rounded-sm bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 cursor-default">
                                      持仓中
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>当前持仓 {holdingQty} 股</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                            {item.name && (
                              <p className="text-[10px] text-muted-foreground truncate max-w-[120px]">{item.name}</p>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{item.market}</TableCell>

                          {/* Price */}
                          <TableCell className="text-right tabular-nums text-sm font-medium">
                            {item.currentPrice ? item.currentPrice.toFixed(2) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </TableCell>

                          {/* Change% */}
                          <TableCell className="text-right text-xs tabular-nums">
                            {item.priceChangePct != null ? (
                              <span className={item.priceChangePct >= 0 ? "text-emerald-600" : "text-red-500"}>
                                {item.priceChangePct >= 0 ? "+" : ""}{item.priceChangePct.toFixed(2)}%
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>

                          {/* Target weight — inline editable */}
                          <TableCell className="text-right">
                            <TargetWeightCell
                              value={item.targetWeightHint}
                              onChange={(v) => updateTargetWeight(index, v)}
                            />
                          </TableCell>

                          {/* Actual weight */}
                          <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                            {actualPct.toFixed(1)}%
                          </TableCell>

                          {/* Gap */}
                          <TableCell className="text-right text-xs tabular-nums">
                            {targetPct > 0 ? (
                              <span className={gapPct > 0.5 ? "text-emerald-600 font-medium" : gapPct < -0.5 ? "text-red-500 font-medium" : "text-muted-foreground"}>
                                {gapPct > 0 ? "+" : ""}{gapPct.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>

                          {/* AI score */}
                          <TableCell className="text-right text-xs tabular-nums">
                            {insightsLoading && !lite ? "..." : toFixed(lite?.finalScorePct, 1)}
                          </TableCell>

                          {/* Action */}
                          <TableCell className="text-xs">
                            {lite ? (
                              <span className={actionColor(lite.action)}>
                                {actionLabel(lite.action)}
                              </span>
                            ) : "-"}
                          </TableCell>

                          {/* Tags */}
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {item.tags.length ? item.tags.map((tag) => (
                                <span key={tag} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                  {tag}
                                </span>
                              )) : null}
                            </div>
                          </TableCell>

                          {/* Actions */}
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-muted-foreground"
                                onClick={() => { setDetailSymbol(item.symbol); setDetailOpen(true); }}
                              >
                                详情
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs font-medium text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                onClick={() => { setBuySymbol(item.symbol); setBuyOpen(true); }}
                              >
                                买入
                              </Button>
                              <DeleteConfirmDialog
                                onConfirm={() => removeCandidate(index)}
                                description={`确认从候选池移除 ${item.symbol}？`}
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-10 text-center">
                <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">候选池为空</p>
                <p className="mt-1 text-xs text-muted-foreground">在上方搜索框输入代码或名称，即可添加关注标的</p>
              </div>
            )}

            {list.length > 0 && filteredRows.length === 0 && (
              <div className="rounded-md border border-dashed p-5 text-center text-xs text-muted-foreground">
                当前筛选条件下没有结果，请调整过滤条件。
              </div>
            )}
          </CardContent>
        </Card>

        {/* Buy dialog */}
        <BuyOrderDialog
          open={buyOpen}
          onOpenChange={(v) => { setBuyOpen(v); if (!v) setBuySymbol(null); }}
          prefillSymbol={buySymbol}
          portfolioBase={portfolioBase}
          actualWeightPct={buySymbolActualPct}
          targetWeightPct={buySymbolTargetPct}
          aiAction={buySymbolLite?.action ?? null}
          aiScore={buySymbolLite?.finalScorePct ?? null}
          onConfirm={handleBuyConfirm}
        />

        {/* Insight drawer */}
        <AssetInsightDrawer
          open={detailOpen}
          symbol={detailSymbol}
          analysisFocus={DEFAULT_ANALYSIS_FOCUS_V1}
          onOpenChange={setDetailOpen}
        />
      </div>
    </TooltipProvider>
  );
}
