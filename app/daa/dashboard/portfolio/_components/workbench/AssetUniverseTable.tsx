"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCurrency, formatPercent } from "@/app/daa/dashboard/_components/daaFormatters";
import type { TradeTicketSideV1 } from "@/src/daa/modules/trade/tradeTypesV1";
import type { AssetUniverseViewV1 } from "@/src/daa/modules/workbench/workbenchTypesV1";

export type AssetUniverseViewFilterV1 = "all" | "holdings" | "candidates";

function passFilter(row: AssetUniverseViewV1, view: AssetUniverseViewFilterV1): boolean {
  if (view === "holdings") return row.holdingQty > 0;
  if (view === "candidates") return row.watchEnabled;
  return true;
}

function fxLabel(row: AssetUniverseViewV1): string {
  if (row.currency === "") return "-";
  if (row.fxMissing) return "缺失";
  if (row.fxRateToBase == null) return "-";
  return row.fxRateToBase.toFixed(4);
}

function priceLabel(row: AssetUniverseViewV1): string {
  const price = row.lastPrice > 0 ? row.lastPrice : row.holdingPrice;
  if (!(price > 0)) return "-";
  return `${row.currency} ${price.toFixed(4)}`;
}

function priceStatusLabel(row: AssetUniverseViewV1): string {
  if (row.priceStatus === "fresh") return "最新";
  if (row.priceStatus === "stale") return "价格偏旧";
  if (row.priceStatus === "unsupported") return "不支持自动行情";
  return "无价格";
}

function priceStatusClass(row: AssetUniverseViewV1): string {
  if (row.priceStatus === "fresh") return "text-emerald-600";
  if (row.priceStatus === "stale") return "text-amber-600";
  return "text-red-500";
}

function disabledReasonV1(input: {
  disabled: boolean;
  disabledGlobal: boolean;
  price: number;
  requireHolding: boolean;
  holdingQty: number;
}): string {
  if (!input.disabled) return "";
  if (input.disabledGlobal) return "当前有进行中的操作，请稍后再试。";
  if (!(input.price > 0)) return "暂时无可用价格，系统会在后台自动更新。";
  if (input.requireHolding && !(input.holdingQty > 0)) return "当前持仓为 0，无法卖出。";
  return "当前不可操作。";
}

function ActionButtonV1(props: {
  label: string;
  disabled: boolean;
  reason: string;
  testId?: string;
  onClick?: () => void;
}) {
  const button = (
    <Button
      size="sm"
      variant="outline"
      className="h-7 px-2 text-xs"
      data-testid={props.testId}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.label}
    </Button>
  );
  if (!props.disabled || !props.reason) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{button}</span>
      </TooltipTrigger>
      <TooltipContent>{props.reason}</TooltipContent>
    </Tooltip>
  );
}

export default function AssetUniverseTable(props: {
  rows: AssetUniverseViewV1[];
  baseCurrency: string;
  view: AssetUniverseViewFilterV1;
  onViewChange: (next: AssetUniverseViewFilterV1) => void;
  onAddToExecution: (row: AssetUniverseViewV1, side: TradeTicketSideV1) => void;
  onOpenInsights?: (row: AssetUniverseViewV1) => void;
  disabled?: boolean;
}) {
  const [keyword, setKeyword] = useState("");

  const filteredRows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return props.rows.filter((row) => {
      if (!passFilter(row, props.view)) return false;
      if (!kw) return true;
      const text = [
        row.symbol,
        row.market,
        row.currency,
        row.yfinanceSymbol,
        row.notes ?? "",
        row.watchTags.join(" "),
        row.holdingTags.join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return text.includes(kw);
    });
  }, [keyword, props.rows, props.view]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">资产宇宙</CardTitle>
            <CardDescription>持仓与候选统一管理，按市场/类型筛选后直接买入或卖出。</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="h-8 rounded-md border border-input bg-transparent px-2 py-1 text-xs"
              value={props.view}
              onChange={(event) => props.onViewChange(event.target.value as AssetUniverseViewFilterV1)}
            >
              <option value="all">全部</option>
              <option value="holdings">仅持仓</option>
              <option value="candidates">仅候选</option>
            </select>
            <Input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              className="h-8 w-56 text-xs"
              placeholder="搜索代码/市场/yfinance 标识"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-lg border">
          <TooltipProvider delayDuration={120}>
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead>标的</TableHead>
                  <TableHead>分类</TableHead>
                  <TableHead className="text-right">持仓</TableHead>
                  <TableHead className="text-right">现价</TableHead>
                  <TableHead className="text-right">估值({props.baseCurrency})</TableHead>
                  <TableHead className="text-right">实际</TableHead>
                  <TableHead className="text-right">目标</TableHead>
                  <TableHead className="text-right">缺口</TableHead>
                  <TableHead className="text-right">FX</TableHead>
                  <TableHead className="sticky right-0 z-20 bg-background">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row) => {
                  const price = row.lastPrice > 0 ? row.lastPrice : row.holdingPrice;
                  const buyDisabled = props.disabled || !(price > 0);
                  const sellDisabled = props.disabled || !(price > 0) || !(row.holdingQty > 0);
                  const buyReason = disabledReasonV1({
                    disabled: buyDisabled,
                    disabledGlobal: Boolean(props.disabled),
                    price,
                    requireHolding: false,
                    holdingQty: row.holdingQty,
                  });
                  const sellReason = disabledReasonV1({
                    disabled: sellDisabled,
                    disabledGlobal: Boolean(props.disabled),
                    price,
                    requireHolding: true,
                    holdingQty: row.holdingQty,
                  });
                  return (
                    <TableRow key={row.assetKey}>
                      <TableCell>
                        <div className="font-medium">{row.symbol}</div>
                        <div className="text-xs text-muted-foreground">{row.market} · {row.currency} · {row.yfinanceSymbol || "-"}</div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.assetClass} · {row.region}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.holdingQty.toFixed(4)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <div>{priceLabel(row)}</div>
                        <div className={`text-xs ${priceStatusClass(row)}`}>{priceStatusLabel(row)}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.valuationBase != null ? formatCurrency(row.valuationBase, props.baseCurrency) : "-"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatPercent(row.actualWeightPct)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPercent(row.targetWeightPct)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.gapPct == null ? "-" : formatPercent(row.gapPct)}
                      </TableCell>
                      <TableCell className={`text-right text-xs ${row.fxMissing ? "text-red-500" : "text-muted-foreground"}`}>
                        {fxLabel(row)}
                      </TableCell>
                      <TableCell className="sticky right-0 z-10 bg-background">
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            data-testid={`workbench-insight-${row.assetKey}`}
                            disabled={Boolean(props.disabled)}
                            onClick={() => props.onOpenInsights?.(row)}
                          >
                            洞察
                          </Button>
                          <ActionButtonV1
                            label="买入"
                            testId={`workbench-buy-${row.assetKey}`}
                            disabled={buyDisabled}
                            reason={buyReason}
                            onClick={() => props.onAddToExecution(row, "BUY")}
                          />
                          <ActionButtonV1
                            label="卖出"
                            testId={`workbench-sell-${row.assetKey}`}
                            disabled={sellDisabled}
                            reason={sellReason}
                            onClick={() => props.onAddToExecution(row, "SELL")}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}

                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-8 text-center text-sm text-muted-foreground">
                      当前筛选条件下暂无资产。
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </TooltipProvider>
        </div>
      </CardContent>
    </Card>
  );
}
