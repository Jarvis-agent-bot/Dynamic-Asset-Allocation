"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCcw, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SymbolLookupItem } from "@/app/daa/dashboard/_components/symbolLookupClient";
import { searchSymbolLookupItemsV1 } from "@/app/daa/dashboard/_components/symbolLookupClient";
import type { DaaPositionRow } from "@/app/daa/unifiedInputStore";

import SymbolSearchCombobox from "./SymbolSearchCombobox";

const TAG_OPTIONS = ["high", "mid", "low", "growth", "bond", "cash", "crypto", "sb"] as const;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-fill symbol (e.g. when triggered from watchlist "买入") */
  prefillSymbol?: string | null;
  /** Existing position to add to (shows current qty) */
  existingPosition?: DaaPositionRow | null;
  /** Portfolio base value for weight calculation */
  portfolioBase?: number;
  /** Current actual weight of this symbol (0-100) */
  actualWeightPct?: number;
  /** Target weight hint (0-100) */
  targetWeightPct?: number;
  /** AI action hint */
  aiAction?: string | null;
  /** AI score */
  aiScore?: number | null;
  onConfirm: (result: {
    symbol: string;
    market: string;
    currency: string;
    price: number;
    qty: number;
    costBasis: number;
    tags: string[];
    name?: string;
  }) => void;
};

function formatCurrency(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function BuyOrderDialog({
  open,
  onOpenChange,
  prefillSymbol,
  existingPosition,
  portfolioBase = 0,
  actualWeightPct = 0,
  targetWeightPct,
  aiAction,
  aiScore,
  onConfirm,
}: Props) {
  const [selected, setSelected] = useState<SymbolLookupItem | null>(null);
  const [qty, setQty] = useState("");
  const [costBasisOverride, setCostBasisOverride] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const prefillLoadedRef = useRef<string | null>(null);

  // When dialog opens, reset state
  useEffect(() => {
    if (!open) return;
    setQty("");
    setCostBasisOverride("");
    setTags(existingPosition?.tags ?? []);
    if (!prefillSymbol) {
      setSelected(null);
      setCurrentPrice(0);
      prefillLoadedRef.current = null;
    }
  }, [open, existingPosition, prefillSymbol]);

  // Auto-load prefill symbol
  useEffect(() => {
    if (!open || !prefillSymbol) return;
    if (prefillLoadedRef.current === prefillSymbol) return;
    prefillLoadedRef.current = prefillSymbol;

    void searchSymbolLookupItemsV1({ query: prefillSymbol, market: "ALL", limit: 1 }).then((results) => {
      const match = results.find((r) => r.symbol === prefillSymbol) ?? results[0] ?? null;
      if (match) {
        setSelected(match);
        setCurrentPrice(match.price);
        setCostBasisOverride(match.price > 0 ? match.price.toFixed(2) : "");
      }
    }).catch(() => {
      // prefill failed silently
    });
  }, [open, prefillSymbol]);

  function handleSelect(item: SymbolLookupItem) {
    setSelected(item);
    setCurrentPrice(item.price);
    setCostBasisOverride(item.price > 0 ? item.price.toFixed(2) : "");
  }

  function handleClear() {
    setSelected(null);
    setCurrentPrice(0);
    setCostBasisOverride("");
    prefillLoadedRef.current = null;
  }

  async function refreshPrice() {
    if (!selected || refreshing) return;
    setRefreshing(true);
    try {
      const results = await searchSymbolLookupItemsV1({ query: selected.symbol, market: "ALL", limit: 1 });
      const match = results.find((r) => r.symbol === selected.symbol) ?? results[0];
      if (match && match.price > 0) {
        setCurrentPrice(match.price);
        setSelected({ ...selected, price: match.price });
        if (!costBasisOverride) {
          setCostBasisOverride(match.price.toFixed(2));
        }
      }
    } catch {
      // ignore
    } finally {
      setRefreshing(false);
    }
  }

  const qtyNum = Number(qty) || 0;
  const costBasisNum = Number(costBasisOverride) || currentPrice;
  const estimatedCost = qtyNum * costBasisNum;
  const gapPct = targetWeightPct != null ? targetWeightPct - actualWeightPct : null;

  const canConfirm = selected != null && qtyNum > 0 && currentPrice > 0;

  function handleConfirm() {
    if (!selected || !canConfirm) return;
    onConfirm({
      symbol: selected.symbol,
      market: selected.market,
      currency: selected.currency,
      price: currentPrice,
      qty: qtyNum,
      costBasis: costBasisNum,
      tags,
      name: selected.name || undefined,
    });
    onOpenChange(false);
  }

  function toggleTag(tag: string) {
    setTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
  }

  const actionColor = aiAction === "open_or_add"
    ? "text-emerald-600"
    : aiAction === "reduce_or_avoid"
      ? "text-red-500"
      : "text-amber-500";

  const actionLabel = aiAction === "open_or_add"
    ? "开/加仓信号"
    : aiAction === "reduce_or_avoid"
      ? "减仓信号"
      : "观察";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
            买入
            {existingPosition && (
              <span className="text-xs font-normal text-muted-foreground">（当前持仓 {existingPosition.qty} 股）</span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Symbol search */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">标的</Label>
            <SymbolSearchCombobox
              selected={selected}
              onSelect={handleSelect}
              onClear={handleClear}
              placeholder="搜索代码或名称，如 AAPL / 腾讯"
            />
          </div>

          {/* Price row */}
          {selected && (
            <div className="rounded-md border bg-muted/30 px-3 py-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{selected.market} · {selected.currency}</span>
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
                <span className="text-xl font-semibold tabular-nums">
                  {currentPrice > 0 ? currentPrice.toFixed(2) : "-"}
                </span>
                <span className="text-xs text-muted-foreground">{selected.currency}</span>
              </div>
            </div>
          )}

          {/* Strategy signals */}
          {selected && (gapPct != null || aiScore != null) && (
            <div className="flex items-center gap-4 rounded-md border px-3 py-2 text-xs">
              {gapPct != null && (
                <div>
                  <span className="text-muted-foreground">当前权重</span>
                  <span className="ml-1 font-medium">{actualWeightPct.toFixed(1)}%</span>
                  <span className="mx-1 text-muted-foreground">→</span>
                  <span className="text-muted-foreground">目标</span>
                  <span className="ml-1 font-medium">{targetWeightPct?.toFixed(1)}%</span>
                  <span className={`ml-2 font-semibold ${gapPct > 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {gapPct > 0 ? `缺口 +${gapPct.toFixed(1)}%` : `超配 ${gapPct.toFixed(1)}%`}
                  </span>
                </div>
              )}
              {aiScore != null && (
                <div className={`ml-auto ${actionColor}`}>
                  {actionLabel}
                  <span className="ml-1 font-semibold">{aiScore.toFixed(0)}</span>
                </div>
              )}
            </div>
          )}

          {/* Qty + cost */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">买入数量</Label>
              <Input
                type="number"
                min={1}
                step={1}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">买入均价 <span className="text-muted-foreground">（默认当前价）</span></Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={costBasisOverride}
                onChange={(e) => setCostBasisOverride(e.target.value)}
                placeholder={currentPrice > 0 ? currentPrice.toFixed(2) : "0.00"}
              />
            </div>
          </div>

          {/* Estimated cost */}
          {qtyNum > 0 && costBasisNum > 0 && selected && (
            <div className="text-right text-xs text-muted-foreground">
              预计成本：
              <span className="font-semibold text-foreground ml-1">
                {formatCurrency(estimatedCost, selected.currency)}
              </span>
            </div>
          )}

          {/* Tags */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">标签（可选）</Label>
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

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            买入确认
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
