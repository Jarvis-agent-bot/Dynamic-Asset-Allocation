"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Download,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  TrendingDown,
  TrendingUp,
  Upload,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DEFAULT_ANALYSIS_FOCUS_V1 } from "@/src/daa/llm/analysisFocusDefaultsV1";
import type { DaaAssetInsightLiteV1 } from "@/src/daa/insights/assetInsightsV1";

import { toast } from "sonner";
import { fetchAssetInsightsV1 } from "@/app/daa/dashboard/_components/assetInsightsClient";
import { searchSymbolLookupItemsV1 } from "@/app/daa/dashboard/_components/symbolLookupClient";
import TierBadge from "../../_components/TierBadge";
import { formatCurrency, formatPercent } from "../../_components/daaFormatters";
import {
  useFxRates,
  useLastRunResult,
  usePositions,
  useStrategyConfig,
  useWatchlistCandidates,
} from "../../_components/useDaaStore";
import { useMarketDataClient } from "../../../useMarketDataClient";
import type { DaaPositionRow } from "../../../unifiedInputStore";

import AssetInsightDrawer from "./AssetInsightDrawer";
import BuyOrderDialog from "./BuyOrderDialog";
import SellOrderDialog from "./SellOrderDialog";

// ─── Constants ────────────────────────────────────────────────────────────────

const MARKETS = ["US", "HK", "CN", "CRYPTO", "OTHER"] as const;
const CURRENCIES = ["USD", "CNY", "HKD"] as const;
const TAG_OPTIONS = ["high", "mid", "low", "growth", "bond", "cash", "crypto", "sb"] as const;

type PositionTier = "elite" | "steady" | "watch" | "isolated";
type SortKey = "symbol" | "marketValue" | "weight" | "pnl" | "opportunity";
type FxFilter = "all" | "resolved" | "missing";
type TierFilter = "all" | PositionTier;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeSymbol(value: string): string {
  return String(value || "").trim().toUpperCase();
}

function normalizeMarket(value: string): string {
  const m = String(value || "").trim().toUpperCase();
  if (m === "A") return "CN";
  return m || "US";
}

function resolveFxRateToBase(
  baseCurrency: string,
  localCurrency: string,
  fxLookup: Map<string, number>,
): number | null {
  const base = String(baseCurrency || "").trim().toUpperCase() || "USD";
  const local = String(localCurrency || "").trim().toUpperCase() || base;
  if (local === base) return 1;
  const direct = fxLookup.get(`${local}/${base}`);
  if (direct && direct > 0) return direct;
  const reverse = fxLookup.get(`${base}/${local}`);
  if (reverse && reverse > 0) return 1 / reverse;
  return null;
}

function isUnifiedDecisionResultV2(value: unknown): value is {
  schemaVersion: 2;
  plan: { layers?: { humanFactor?: { assetDecisions?: Array<{ symbol: string; tier: PositionTier }> } } };
} {
  const item = value as Record<string, unknown> | null;
  return Boolean(item && item.schemaVersion === 2 && item.plan && typeof item.plan === "object");
}

function toFixed(value: number | null | undefined, digits = 1): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return num.toFixed(digits);
}

function toggleArrayItem(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

// ─── Edit dialog (editing existing position) ──────────────────────────────────

function EditPositionDialog({
  position,
  onSave,
}: {
  position: DaaPositionRow;
  onSave: (p: DaaPositionRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState(String(position.qty));
  const [costBasis, setCostBasis] = useState(String(position.costBasis ?? position.price));
  const [price, setPrice] = useState(position.price);
  const [tags, setTags] = useState<string[]>(position.tags);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQty(String(position.qty));
    setCostBasis(String(position.costBasis ?? position.price));
    setPrice(position.price);
    setTags(position.tags);
  }, [open, position]);

  async function refreshPrice() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const results = await searchSymbolLookupItemsV1({ query: position.symbol, market: "ALL", limit: 1 });
      const match = results.find((r) => r.symbol === position.symbol) ?? results[0];
      if (match && match.price > 0) setPrice(match.price);
    } catch { /* ignore */ }
    finally { setRefreshing(false); }
  }

  function handleSave() {
    onSave({
      ...position,
      qty: Math.max(0, Number(qty) || 0),
      price,
      costBasis: Number(costBasis) || price,
      tags,
    });
    setOpen(false);
  }

  function toggleTag(tag: string) {
    setTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="编辑持仓">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">编辑持仓 · {position.symbol}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          {/* Read-only identity info */}
          <div className="rounded-md border bg-muted/30 px-3 py-2.5 space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{position.market} · {position.currency}</span>
              <button
                type="button"
                className="flex items-center gap-1 hover:text-foreground transition-colors"
                onClick={() => void refreshPrice()}
                disabled={refreshing}
              >
                <RefreshCcw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
                {refreshing ? "刷新中..." : "刷新价格"}
              </button>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-semibold tabular-nums">{price.toFixed(2)}</span>
              <span className="text-xs text-muted-foreground">{position.currency}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">持仓数量</Label>
              <Input
                type="number" min={0} step={1}
                value={qty} onChange={(e) => setQty(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">持仓均价</Label>
              <Input
                type="number" min={0} step={0.01}
                value={costBasis} onChange={(e) => setCostBasis(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">标签</Label>
            <div className="flex flex-wrap gap-1.5">
              {TAG_OPTIONS.map((tag) => {
                const active = tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                      active
                        ? tag === "sb"
                          ? "border-red-300 bg-red-100 text-red-700"
                          : "border-sky-300 bg-sky-100 text-sky-700"
                        : "border-border bg-background text-muted-foreground hover:bg-muted"
                    }`}
                    onClick={() => toggleTag(tag)}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
          <Button onClick={handleSave}>保存</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete confirm ───────────────────────────────────────────────────────────

function DeleteConfirmDialog({ onConfirm, label }: { onConfirm: () => void; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-red-400 hover:text-red-600">
          清仓
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xs">
        <DialogHeader><DialogTitle>确认清仓</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">确认从持仓中移除 {label}？此操作不可撤销。</p>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>取消</Button>
          <Button variant="destructive" size="sm" onClick={() => { onConfirm(); setOpen(false); }}>确认清仓</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Import dialog ────────────────────────────────────────────────────────────

function ImportDialog({ onImport }: { onImport: (rows: DaaPositionRow[]) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  function handleImport() {
    setError("");
    try {
      const parsed = JSON.parse(text);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      const rows: DaaPositionRow[] = arr.map((item: any) => ({
        symbol: normalizeSymbol(item.symbol),
        market: normalizeMarket(String(item.market ?? "US")),
        currency: String(item.currency ?? "USD").trim().toUpperCase(),
        qty: Number(item.qty) || 0,
        price: Number(item.price) || 0,
        costBasis: Number(item.costBasis) || 0,
        tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
      })).filter((item: any) => item.symbol);

      if (!rows.length) { setError("未识别到有效持仓。"); return; }
      onImport(rows);
      setOpen(false);
      setText("");
    } catch {
      setError("JSON 格式错误，应为持仓对象数组。");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Upload className="mr-1.5 h-3.5 w-3.5" /> 导入</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>批量导入持仓 (JSON)</DialogTitle></DialogHeader>
        <Textarea
          className="min-h-[160px] font-mono text-xs"
          placeholder='[{"symbol":"SPY","market":"US","qty":40,"costBasis":545}]'
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

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function PortfolioPositionsPanel() {
  const [positions, setPositions] = usePositions();
  const [config] = useStrategyConfig();
  const [fxRates] = useFxRates();
  const [lastRun] = useLastRunResult();
  const [candidates] = useWatchlistCandidates();
  const marketData = useMarketDataClient();

  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [syncResult, setSyncResult] = useState<{ count: number; total: number } | null>(null);

  const [keyword, setKeyword] = useState("");
  const [marketFilter, setMarketFilter] = useState<"ALL" | string>("ALL");
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [fxFilter, setFxFilter] = useState<FxFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("marketValue");

  const [liteInsights, setLiteInsights] = useState<Record<string, DaaAssetInsightLiteV1>>({});
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState("");

  // Buy / sell dialog state
  const [buyOpen, setBuyOpen] = useState(false);
  const [buySymbol, setBuySymbol] = useState<string | null>(null);
  const [buyExistingIdx, setBuyExistingIdx] = useState<number | null>(null);
  const [sellOpen, setSellOpen] = useState(false);
  const [sellIdx, setSellIdx] = useState<number | null>(null);

  // Insight drawer
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailSymbol, setDetailSymbol] = useState("");

  const list = useMemo(() => positions ?? [], [positions]);
  const fxRateRows = useMemo(() => fxRates ?? [], [fxRates]);
  const candidateList = useMemo(() => candidates ?? [], [candidates]);

  const displayCurrency = String(config.account.baseCurrency || "USD").trim().toUpperCase() || "USD";

  const fxLookup = useMemo(() => {
    const output = new Map<string, number>();
    for (const row of fxRateRows) {
      const base = String(row.baseCcy || "").trim().toUpperCase();
      const quote = String(row.quoteCcy || "").trim().toUpperCase();
      const rate = Number(row.rate);
      if (!base || !quote || !Number.isFinite(rate) || rate <= 0) continue;
      output.set(`${base}/${quote}`, rate);
    }
    return output;
  }, [fxRateRows]);

  const tierMap = useMemo(() => {
    const output = new Map<string, PositionTier>();
    if (!isUnifiedDecisionResultV2(lastRun)) return output;
    for (const d of lastRun.plan.layers?.humanFactor?.assetDecisions ?? []) {
      const sym = normalizeSymbol(d.symbol);
      if (sym) output.set(sym, d.tier);
    }
    return output;
  }, [lastRun]);

  // Target weight map from candidates
  const targetWeightMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of candidateList) {
      const sym = normalizeSymbol(c.symbol);
      if (sym && c.targetWeightHint > 0) m.set(sym, (c.targetWeightHint || 0) * 100);
    }
    return m;
  }, [candidateList]);

  const valuationRows = useMemo(() => {
    return list.map((p) => {
      const localValue = Number(p.qty || 0) * Number(p.price || 0);
      const fxRate = resolveFxRateToBase(displayCurrency, p.currency, fxLookup);
      const baseValue = fxRate != null ? localValue * fxRate : null;
      return { localValue, baseValue, fxMissing: localValue > 0 && baseValue == null };
    });
  }, [displayCurrency, fxLookup, list]);

  const totalValue = useMemo(
    () => valuationRows.reduce((sum, r) => sum + (r.baseValue ?? 0), 0),
    [valuationRows],
  );
  const portfolioBase = totalValue + Number(config.account.cash || 0);
  const unresolvedFxCount = useMemo(() => valuationRows.filter((r) => r.fxMissing).length, [valuationRows]);

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

  const filteredRows = useMemo(() => {
    const kw = String(keyword || "").trim().toLowerCase();
    return list.map((p, index) => {
      const valuation = valuationRows[index];
      const sym = normalizeSymbol(p.symbol);
      const marketValue = valuation?.baseValue ?? 0;
      const weightPct = marketValue > 0 && portfolioBase > 0 ? (marketValue / portfolioBase) * 100 : 0;
      const avgCost = p.costBasis ?? p.price;
      const unrealizedPnl = p.qty * (p.price - avgCost);
      const unrealizedPct = avgCost > 0 ? ((p.price - avgCost) / avgCost) * 100 : 0;
      const targetPct = targetWeightMap.get(sym);
      const gapPct = targetPct != null ? targetPct - weightPct : null;
      return {
        index, position: p, sym, marketValue, weightPct,
        unrealizedPnl, unrealizedPct,
        targetPct, gapPct,
        fxMissing: Boolean(valuation?.fxMissing),
        tier: tierMap.get(sym) ?? null,
        lite: liteInsights[sym] ?? null,
      };
    }).filter((row) => {
      if (kw) {
        const target = `${row.position.symbol} ${row.position.market} ${row.position.tags.join(" ")}`.toLowerCase();
        if (!target.includes(kw)) return false;
      }
      if (marketFilter !== "ALL" && row.position.market !== marketFilter) return false;
      if (tagFilters.length > 0 && !tagFilters.some((tag) => row.position.tags.includes(tag))) return false;
      if (tierFilter !== "all" && row.tier !== tierFilter) return false;
      if (fxFilter === "missing" && !row.fxMissing) return false;
      if (fxFilter === "resolved" && row.fxMissing) return false;
      return true;
    }).sort((a, b) => {
      if (sortKey === "symbol") return String(a.sym || "").localeCompare(String(b.sym || ""));
      if (sortKey === "marketValue") return b.marketValue - a.marketValue;
      if (sortKey === "weight") return b.weightPct - a.weightPct;
      if (sortKey === "pnl") return b.unrealizedPnl - a.unrealizedPnl;
      const aScore = a.lite?.finalScorePct ?? Number.NEGATIVE_INFINITY;
      const bScore = b.lite?.finalScorePct ?? Number.NEGATIVE_INFINITY;
      return bScore - aScore;
    });
  }, [fxFilter, keyword, list, liteInsights, marketFilter, portfolioBase, sortKey, tagFilters, targetWeightMap, tierFilter, tierMap, valuationRows]);

  // ── Mutations ────────────────────────────────────────────────────────────────

  const updatePosition = useCallback((index: number, p: DaaPositionRow) => {
    const next = [...(list ?? [])];
    next[index] = p;
    setPositions(next);
  }, [list, setPositions]);

  const removePosition = useCallback((index: number) => {
    setPositions((list ?? []).filter((_, i) => i !== index));
  }, [list, setPositions]);

  const importPositions = useCallback((rows: DaaPositionRow[]) => {
    setPositions([...(list ?? []), ...rows]);
  }, [list, setPositions]);

  function exportJson() {
    const blob = new Blob([JSON.stringify(list, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "daa-positions.json"; a.click();
    URL.revokeObjectURL(url);
  }

  async function syncPrices() {
    if (syncing) return;
    setSyncing(true); setSyncError(""); setSyncResult(null);
    try {
      const today = new Date();
      const start = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const end = today.toISOString().slice(0, 10);
      const updated = [...list];
      let count = 0;
      for (let i = 0; i < updated.length; i++) {
        const row = updated[i];
        try {
          const series = await marketData.yfinance.priceSeriesBars({ symbol: row.symbol, start, end });
          const last = Number(series[series.length - 1]?.close || 0);
          if (last > 0) { updated[i] = { ...row, price: last }; count++; }
        } catch { /* skip */ }
      }
      setPositions(updated);
      if (count <= 0) setSyncError("No prices updated. Check symbol format.");
      else setSyncResult({ count, total: updated.length });
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err));
    } finally { setSyncing(false); }
  }

  // ── Buy / Sell handlers ───────────────────────────────────────────────────────

  function handleBuyConfirm(result: {
    symbol: string; market: string; currency: string;
    price: number; qty: number; costBasis: number; tags: string[];
    name?: string;
  }) {
    const sym = normalizeSymbol(result.symbol);
    const existingIdx = list.findIndex(
      (p) => normalizeSymbol(p.symbol) === sym && p.market === result.market,
    );
    if (existingIdx >= 0) {
      const existing = list[existingIdx];
      const totalQty = existing.qty + result.qty;
      const avgCost = (existing.qty * (existing.costBasis ?? existing.price) + result.qty * result.costBasis) / totalQty;
      const next = [...list];
      next[existingIdx] = { ...existing, qty: totalQty, price: result.price, costBasis: avgCost };
      setPositions(next);
    } else {
      setPositions([...list, {
        symbol: result.symbol,
        market: result.market,
        currency: result.currency,
        qty: result.qty,
        price: result.price,
        costBasis: result.costBasis,
        tags: result.tags,
        ...(result.name ? { name: result.name } : {}),
      }]);
    }
    toast.success(`已买入 ${result.symbol}`, { description: `${result.qty} 股 @ ${result.currency} ${result.price.toFixed(2)}` });
    setBuyOpen(false);
    setBuySymbol(null);
    setBuyExistingIdx(null);
  }

  function handleSellConfirm({ symbol, qtyToSell, price }: { symbol: string; qtyToSell: number; price: number }) {
    if (sellIdx == null) return;
    const pos = list[sellIdx];
    if (!pos) return;
    const remainQty = pos.qty - qtyToSell;
    if (remainQty <= 0) {
      removePosition(sellIdx);
      toast.success(`已清仓 ${symbol}`, { description: `全部 ${pos.qty} 股已卖出 @ ${pos.currency} ${price.toFixed(2)}` });
    } else {
      updatePosition(sellIdx, { ...pos, qty: remainQty, price });
      toast.success(`已卖出 ${symbol}`, { description: `${qtyToSell} 股 @ ${pos.currency} ${price.toFixed(2)}，剩余 ${remainQty} 股` });
    }
    setSellOpen(false);
    setSellIdx(null);
  }

  const sellPosition = sellIdx != null ? list[sellIdx] : null;

  // Buy dialog signals
  const buySymbolNorm = buySymbol ? normalizeSymbol(buySymbol) : null;
  const buyExistingPos = buyExistingIdx != null ? list[buyExistingIdx] : null;
  const buyActualPct = useMemo(() => {
    if (!buySymbolNorm || portfolioBase <= 0) return 0;
    const pos = list.find((p) => normalizeSymbol(p.symbol) === buySymbolNorm);
    if (!pos) return 0;
    return (pos.qty * pos.price / portfolioBase) * 100;
  }, [buySymbolNorm, list, portfolioBase]);
  const buyTargetPct = buySymbolNorm ? targetWeightMap.get(buySymbolNorm) : undefined;
  const buyLite = buySymbolNorm ? liteInsights[buySymbolNorm] : null;

  // Sell dialog signals
  const sellActualPct = sellIdx != null && portfolioBase > 0
    ? ((list[sellIdx]?.qty ?? 0) * (list[sellIdx]?.price ?? 0) / portfolioBase) * 100
    : 0;
  const sellTargetPct = sellPosition ? targetWeightMap.get(normalizeSymbol(sellPosition.symbol)) : undefined;
  const sellLite = sellPosition ? liteInsights[normalizeSymbol(sellPosition.symbol)] : null;

  const targetWeightSum = useMemo(
    () => Object.values(config.targetWeights).reduce((sum, w) => sum + (Number(w) || 0), 0),
    [config.targetWeights],
  );

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Alerts */}
        {syncError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{syncError}</AlertDescription>
          </Alert>
        )}
        {syncResult && (
          <Alert>
            <AlertDescription>
              价格同步完成：{syncResult.count} / {syncResult.total} 个标的更新成功。
            </AlertDescription>
          </Alert>
        )}
        {insightsError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Lite 分析加载失败：{insightsError}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">持仓列表</CardTitle>
                <CardDescription>
                  {filteredRows.length !== list.length
                    ? `${list.length} 个标的（筛选后 ${filteredRows.length}）`
                    : `共 ${list.length} 个标的`} ·
                  总市值 {formatCurrency(totalValue, displayCurrency)}
                  {unresolvedFxCount > 0 ? `（${unresolvedFxCount} 个缺 FX）` : ""}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => { setBuySymbol(null); setBuyExistingIdx(null); setBuyOpen(true); }}
                >
                  <TrendingUp className="mr-1.5 h-3.5 w-3.5" /> 买入
                </Button>
                <ImportDialog onImport={importPositions} />
                <Button variant="outline" size="sm" onClick={exportJson} disabled={!list.length}>
                  <Download className="mr-1.5 h-3.5 w-3.5" /> 导出
                </Button>
                <Button variant="outline" size="sm" onClick={() => void syncPrices()} disabled={syncing || !list.length}>
                  <RefreshCcw className={`mr-1.5 h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
                  {syncing ? "同步中..." : "同步价格"}
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Filter bar */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  className="flex h-8 w-44 rounded-md border border-input bg-transparent pl-7 pr-3 text-xs shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="代码 / 标签..."
                />
              </div>
              <select
                className="flex h-8 rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm"
                value={marketFilter}
                onChange={(e) => setMarketFilter(e.target.value)}
              >
                <option value="ALL">全部市场</option>
                {MARKETS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <select
                className="flex h-8 rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm"
                value={tierFilter}
                onChange={(e) => setTierFilter(e.target.value as TierFilter)}
              >
                <option value="all">Tier: 全部</option>
                <option value="elite">elite</option>
                <option value="steady">steady</option>
                <option value="watch">watch</option>
                <option value="isolated">isolated</option>
              </select>
              <select
                className="flex h-8 rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm"
                value={fxFilter}
                onChange={(e) => setFxFilter(e.target.value as FxFilter)}
              >
                <option value="all">FX: 全部</option>
                <option value="resolved">FX: 可换算</option>
                <option value="missing">FX: 缺失</option>
              </select>
              <select
                className="flex h-8 rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
              >
                <option value="marketValue">排序: 市值</option>
                <option value="weight">排序: 权重</option>
                <option value="pnl">排序: 盈亏</option>
                <option value="opportunity">排序: 机会分</option>
                <option value="symbol">排序: 代码</option>
              </select>
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

            {unresolvedFxCount > 0 && (
              <Alert variant="destructive" className="py-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  {unresolvedFxCount} 个跨币种标的缺少汇率，总市值与权重仅计算已换算部分。请在系统设置补齐汇率快照。
                </AlertDescription>
              </Alert>
            )}

            {/* Positions table */}
            {list.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead>代码</TableHead>
                      <TableHead>市场</TableHead>
                      <TableHead className="text-right">数量</TableHead>
                      <TableHead className="text-right">均价</TableHead>
                      <TableHead className="text-right">现价</TableHead>
                      <TableHead className="text-right">市值</TableHead>
                      <TableHead className="text-right">实际权重</TableHead>
                      <TableHead className="text-right">目标权重</TableHead>
                      <TableHead className="text-right">缺口</TableHead>
                      <TableHead className="text-right">盈亏%</TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead className="text-right">机会分</TableHead>
                      <TableHead>标签</TableHead>
                      <TableHead className="min-w-[160px] text-right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((row) => {
                      const { position: pos } = row;
                      const gapColor = row.gapPct == null
                        ? ""
                        : row.gapPct > 0.5
                          ? "text-emerald-600 font-medium"
                          : row.gapPct < -0.5
                            ? "text-red-500 font-medium"
                            : "text-muted-foreground";

                      return (
                        <TableRow key={`${pos.symbol}-${row.index}`}>
                          <TableCell className="font-medium text-sm">{pos.symbol}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{pos.market}</TableCell>
                          <TableCell className="text-right tabular-nums">{pos.qty}</TableCell>

                          {/* Avg cost */}
                          <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                            {(pos.costBasis ?? pos.price).toFixed(2)}
                          </TableCell>

                          {/* Current price */}
                          <TableCell className="text-right tabular-nums font-medium">
                            {pos.price.toFixed(2)}
                          </TableCell>

                          {/* Market value */}
                          <TableCell className="text-right tabular-nums font-medium">
                            {row.fxMissing ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-help text-muted-foreground underline decoration-dashed">-</span>
                                </TooltipTrigger>
                                <TooltipContent>缺少 {pos.currency}/{displayCurrency} 汇率</TooltipContent>
                              </Tooltip>
                            ) : formatCurrency(row.marketValue, displayCurrency)}
                          </TableCell>

                          {/* Actual weight */}
                          <TableCell className="text-right text-xs tabular-nums">
                            {row.fxMissing ? "-" : formatPercent(row.weightPct, 1)}
                          </TableCell>

                          {/* Target weight */}
                          <TableCell className="text-right text-xs tabular-nums">
                            {row.targetPct != null ? `${row.targetPct.toFixed(1)}%` : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>

                          {/* Gap */}
                          <TableCell className={`text-right text-xs tabular-nums ${gapColor}`}>
                            {row.gapPct != null
                              ? `${row.gapPct > 0 ? "+" : ""}${row.gapPct.toFixed(1)}%`
                              : <span className="text-muted-foreground">-</span>}
                          </TableCell>

                          {/* Unrealized P&L% */}
                          <TableCell className={`text-right text-xs tabular-nums ${
                            row.unrealizedPnl >= 0 ? "text-emerald-600" : "text-red-500"
                          }`}>
                            {row.unrealizedPct !== 0
                              ? `${row.unrealizedPnl >= 0 ? "+" : ""}${row.unrealizedPct.toFixed(1)}%`
                              : "-"}
                          </TableCell>

                          {/* Tier */}
                          <TableCell>
                            {row.tier ? <TierBadge tier={row.tier} /> : <span className="text-xs text-muted-foreground">-</span>}
                          </TableCell>

                          {/* AI score */}
                          <TableCell className="text-right text-xs tabular-nums">
                            {insightsLoading && !row.lite ? "..." : toFixed(row.lite?.finalScorePct, 1)}
                          </TableCell>

                          {/* Tags */}
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {pos.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                                    tag === "sb" ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </TableCell>

                          {/* Action buttons */}
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-muted-foreground"
                                onClick={() => { setDetailSymbol(pos.symbol); setDetailOpen(true); }}
                              >
                                详情
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs font-medium text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                onClick={() => {
                                  setBuySymbol(pos.symbol);
                                  setBuyExistingIdx(row.index);
                                  setBuyOpen(true);
                                }}
                              >
                                <TrendingUp className="mr-1 h-3 w-3" />买入
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs font-medium text-red-500 hover:text-red-600 hover:bg-red-50"
                                onClick={() => { setSellIdx(row.index); setSellOpen(true); }}
                              >
                                <TrendingDown className="mr-1 h-3 w-3" />卖出
                              </Button>
                              <EditPositionDialog
                                position={pos}
                                onSave={(updated) => updatePosition(row.index, updated)}
                              />
                              <DeleteConfirmDialog
                                onConfirm={() => removePosition(row.index)}
                                label={pos.symbol}
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
                <Plus className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">暂无持仓</p>
                <p className="mt-1 text-xs text-muted-foreground">点击右上角"买入"开始建仓，或从候选池点击买入</p>
              </div>
            )}

            {list.length > 0 && filteredRows.length === 0 && (
              <div className="rounded-md border border-dashed p-5 text-center text-xs text-muted-foreground">
                当前筛选条件下没有结果，请调整过滤条件。
              </div>
            )}
          </CardContent>
        </Card>

        {/* Target weight summary */}
        {Object.keys(config.targetWeights).length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">目标权重镜像</CardTitle>
              <CardDescription>
                权重总和：{formatPercent(targetWeightSum * 100, 1)} / 100%
                {targetWeightSum < 0.999 ? `（${formatPercent((1 - targetWeightSum) * 100, 1)} 隐含现金）` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(config.targetWeights)
                  .sort(([, a], [, b]) => Number(b) - Number(a))
                  .map(([sym, weight]) => (
                    <div key={sym} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">{sym}</span>
                        <span className="text-muted-foreground">{formatPercent((Number(weight) || 0) * 100, 1)}</span>
                      </div>
                      <div className="h-1.5 rounded bg-muted">
                        <div
                          className="h-1.5 rounded bg-sky-500"
                          style={{ width: `${Math.max(0, Math.min(100, (Number(weight) || 0) * 100))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                <p className="text-xs text-muted-foreground pt-1">目标权重仅镜像展示，请在"策略实验室"中编辑。</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Buy dialog */}
        <BuyOrderDialog
          open={buyOpen}
          onOpenChange={(v) => { setBuyOpen(v); if (!v) { setBuySymbol(null); setBuyExistingIdx(null); } }}
          prefillSymbol={buySymbol}
          existingPosition={buyExistingPos}
          portfolioBase={portfolioBase}
          actualWeightPct={buyActualPct}
          targetWeightPct={buyTargetPct}
          aiAction={buyLite?.action ?? null}
          aiScore={buyLite?.finalScorePct ?? null}
          onConfirm={handleBuyConfirm}
        />

        {/* Sell dialog */}
        {sellPosition && (
          <SellOrderDialog
            open={sellOpen}
            onOpenChange={(v) => { setSellOpen(v); if (!v) setSellIdx(null); }}
            position={sellPosition}
            actualWeightPct={sellActualPct}
            targetWeightPct={sellTargetPct}
            aiAction={sellLite?.action ?? null}
            aiScore={sellLite?.finalScorePct ?? null}
            onConfirm={handleSellConfirm}
          />
        )}

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
