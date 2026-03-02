"use client";

import { useEffect, useState } from "react";
import { RefreshCcw, TrendingDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { searchSymbolLookupItemsV1 } from "@/app/daa/dashboard/_components/symbolLookupClient";
import type { DaaPositionRow } from "@/app/daa/unifiedInputStore";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: DaaPositionRow;
  /** Current actual weight of this symbol (0-100) */
  actualWeightPct?: number;
  /** Target weight hint (0-100) */
  targetWeightPct?: number;
  /** AI action hint */
  aiAction?: string | null;
  /** AI score */
  aiScore?: number | null;
  onConfirm: (result: { symbol: string; qtyToSell: number; price: number }) => void;
};

function formatCurrency(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function SellOrderDialog({
  open,
  onOpenChange,
  position,
  actualWeightPct = 0,
  targetWeightPct,
  aiAction,
  aiScore,
  onConfirm,
}: Props) {
  const [qtyInput, setQtyInput] = useState("");
  const [currentPrice, setCurrentPrice] = useState<number>(position.price);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQtyInput("");
    setCurrentPrice(position.price);
  }, [open, position]);

  async function refreshPrice() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const results = await searchSymbolLookupItemsV1({ query: position.symbol, market: "ALL", limit: 1 });
      const match = results.find((r) => r.symbol === position.symbol) ?? results[0];
      if (match && match.price > 0) setCurrentPrice(match.price);
    } catch {
      // ignore
    } finally {
      setRefreshing(false);
    }
  }

  const qtyNum = Math.min(Number(qtyInput) || 0, position.qty);
  const estimatedProceeds = qtyNum * currentPrice;
  const avgCost = position.costBasis ?? position.price;
  const unrealizedPnl = position.qty * (currentPrice - avgCost);
  const unrealizedPct = avgCost > 0 ? ((currentPrice - avgCost) / avgCost) * 100 : 0;
  const gapPct = targetWeightPct != null ? targetWeightPct - actualWeightPct : null;

  const canConfirm = qtyNum > 0 && qtyNum <= position.qty && currentPrice > 0;

  function handleConfirm() {
    if (!canConfirm) return;
    onConfirm({ symbol: position.symbol, qtyToSell: qtyNum, price: currentPrice });
    onOpenChange(false);
  }

  const actionColor = aiAction === "open_or_add"
    ? "text-emerald-600"
    : aiAction === "reduce_or_avoid"
      ? "text-red-500"
      : "text-amber-500";

  const actionLabel = aiAction === "open_or_add"
    ? "加仓信号"
    : aiAction === "reduce_or_avoid"
      ? "减仓信号"
      : "观察";

  function handleSellAll() {
    setQtyInput(String(position.qty));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <TrendingDown className="h-4 w-4 text-red-500" />
            卖出
            <span className="text-sm font-semibold">{position.symbol}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Position info card */}
          <div className="rounded-md border bg-muted/30 px-3 py-2.5 space-y-2">
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
              <span className="text-xl font-semibold tabular-nums">
                {currentPrice > 0 ? currentPrice.toFixed(2) : "-"}
              </span>
              <span className="text-xs text-muted-foreground">{position.currency}</span>
            </div>

            <div className="grid grid-cols-3 gap-3 border-t pt-2 text-xs">
              <div>
                <p className="text-muted-foreground">持仓数量</p>
                <p className="font-medium tabular-nums">{position.qty}</p>
              </div>
              <div>
                <p className="text-muted-foreground">持仓均价</p>
                <p className="font-medium tabular-nums">{avgCost.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">未实现盈亏</p>
                <p className={`font-medium tabular-nums ${unrealizedPnl >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {unrealizedPnl >= 0 ? "+" : ""}{unrealizedPct.toFixed(1)}%
                </p>
              </div>
            </div>
          </div>

          {/* Strategy signals */}
          {(gapPct != null || aiScore != null) && (
            <div className="flex items-center gap-4 rounded-md border px-3 py-2 text-xs">
              {gapPct != null && (
                <div>
                  <span className="text-muted-foreground">当前权重</span>
                  <span className="ml-1 font-medium">{actualWeightPct.toFixed(1)}%</span>
                  <span className="mx-1 text-muted-foreground">→</span>
                  <span className="text-muted-foreground">目标</span>
                  <span className="ml-1 font-medium">{targetWeightPct?.toFixed(1)}%</span>
                  <span className={`ml-2 font-semibold ${gapPct < 0 ? "text-red-500" : "text-emerald-600"}`}>
                    {gapPct < 0 ? `超配 ${gapPct.toFixed(1)}%` : `缺口 +${gapPct.toFixed(1)}%`}
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

          {/* Sell qty */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">卖出数量 <span className="text-muted-foreground">（最多 {position.qty}）</span></Label>
              <button
                type="button"
                className="text-xs text-sky-600 hover:text-sky-700 transition-colors"
                onClick={handleSellAll}
              >
                全部卖出
              </button>
            </div>
            <Input
              type="number"
              min={1}
              max={position.qty}
              step={1}
              value={qtyInput}
              onChange={(e) => setQtyInput(e.target.value)}
              placeholder={`1 ~ ${position.qty}`}
            />
            {qtyNum > 0 && qtyNum <= position.qty && (
              <p className="text-xs text-muted-foreground">
                卖出后剩余：<span className="font-medium">{position.qty - qtyNum} 股</span>
              </p>
            )}
          </div>

          {/* Estimated proceeds */}
          {qtyNum > 0 && currentPrice > 0 && (
            <div className="text-right text-xs text-muted-foreground">
              预计收回：
              <span className="font-semibold text-foreground ml-1">
                {formatCurrency(estimatedProceeds, position.currency)}
              </span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button
            onClick={handleConfirm}
            disabled={!canConfirm}
            variant="destructive"
          >
            卖出确认
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
