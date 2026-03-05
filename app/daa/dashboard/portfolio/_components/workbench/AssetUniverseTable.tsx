"use client";

import { Fragment, useMemo, useState } from "react";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCurrency, formatPercent } from "@/app/daa/dashboard/_components/daaFormatters";
import type { TradeTicketSideV1 } from "@/src/daa/modules/trade/tradeTypesV1";
import type { AssetUniverseViewV1, WorkbenchAssetInsightResponseV1 } from "@/src/daa/modules/workbench/workbenchTypesV1";

export type AssetUniverseViewFilterV1 = "all" | "holdings" | "watchlist" | "basket";
type HoldingGroupKeyV1 = "stock" | "etf" | "bond" | "crypto";

const HOLDING_GROUP_META_V1: Array<{ key: HoldingGroupKeyV1; label: string }> = [
  { key: "stock", label: "股票" },
  { key: "etf", label: "ETF" },
  { key: "bond", label: "债券" },
  { key: "crypto", label: "加密" },
];

function isInBasketV1(row: AssetUniverseViewV1): boolean {
  return row.watchEnabled && row.targetWeightHint > 0;
}

function passFilter(row: AssetUniverseViewV1, view: AssetUniverseViewFilterV1): boolean {
  if (view === "holdings") return row.holdingQty > 0;
  if (view === "watchlist") return row.watchEnabled;
  if (view === "basket") return isInBasketV1(row);
  return row.watchEnabled || row.holdingQty > 0;
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

function hfSignalIconV1(signal: AssetUniverseViewV1["hfSignal"]): string {
  if (!signal) return "⚪";
  return signal.icon;
}

function hfTrendLabelV1(trend: "adding" | "trimming" | "neutral" | "none"): string {
  if (trend === "adding") return "整体偏增持";
  if (trend === "trimming") return "整体偏减持";
  if (trend === "neutral") return "整体变化不大";
  return "暂无趋势";
}

function normalizeFundLabelV1(fundName: string, fundCode: string): string {
  const name = String(fundName || "").trim();
  if (name) return name;
  const code = String(fundCode || "").trim();
  if (!code) return "未知来源基金";
  const matched = /(\d{6})/.exec(code);
  if (matched) return `基金代码 ${matched[1]}`;
  return `来源 ${code.replace(/[_-]/g, " ").trim()}`;
}

function localValuationV1(row: AssetUniverseViewV1): number {
  const price = row.lastPrice > 0 ? row.lastPrice : row.holdingPrice;
  if (!(price > 0) || !(row.holdingQty > 0)) return 0;
  return price * row.holdingQty;
}

function gapLabelV1(gapPct: number | null): { text: string; className: string } {
  if (gapPct == null) return { text: "-", className: "text-muted-foreground" };
  if (gapPct > 0.01) return { text: `低配 ${formatPercent(gapPct)}`, className: "text-emerald-600" };
  if (gapPct < -0.01) return { text: `超配 ${formatPercent(Math.abs(gapPct))}`, className: "text-amber-600" };
  return { text: "接近目标", className: "text-muted-foreground" };
}

function holdingGroupKeyV1(row: AssetUniverseViewV1): HoldingGroupKeyV1 {
  const assetClass = String(row.assetClass || "").toUpperCase();
  const instrumentType = String(row.instrumentType || "").toUpperCase();
  const market = String(row.market || "").toUpperCase();
  if (assetClass.includes("CRYPTO") || instrumentType.includes("CRYPTO") || market === "CRYPTO") return "crypto";
  if (assetClass.includes("BOND") || instrumentType.includes("BOND") || instrumentType.includes("FIXED")) return "bond";
  if (assetClass.includes("ETF") || instrumentType.includes("ETF") || instrumentType.includes("FUND")) return "etf";
  return "stock";
}

function ActionButtonV1(props: {
  label: string;
  disabled: boolean;
  reason: string;
  className?: string;
  testId?: string;
  onClick?: () => void;
}) {
  const button = (
    <Button
      size="sm"
      variant="outline"
      className={`h-7 px-2 text-xs ${props.className || ""}`}
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

function InlineInsightsV1(props: {
  loading: boolean;
  error: string;
  data: WorkbenchAssetInsightResponseV1 | null;
}) {
  if (props.loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        正在加载洞察...
      </div>
    );
  }
  if (props.error) {
    return <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{props.error}</div>;
  }
  if (!props.data) {
    return <div className="py-2 text-sm text-muted-foreground">暂无洞察数据。</div>;
  }

  const opportunity = props.data.opportunity;
  const technical = props.data.technical;
  const news = props.data.news;
  const llm = props.data.llmAnalysis;

  return (
    <Tabs defaultValue="opportunity" className="w-full">
      <TabsList className="mb-2 h-8">
        <TabsTrigger value="opportunity" className="px-2 text-xs">机会</TabsTrigger>
        <TabsTrigger value="technical" className="px-2 text-xs">技术</TabsTrigger>
        <TabsTrigger value="news" className="px-2 text-xs">新闻</TabsTrigger>
        <TabsTrigger value="llm" className="px-2 text-xs">AI解读</TabsTrigger>
      </TabsList>

      <TabsContent value="opportunity" className="space-y-2 text-sm">
        {opportunity ? (
          <>
            <div className="text-sm">
              建议动作：<span className="font-medium">{opportunity.actionLabelZh}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              信号强度 {opportunity.finalScorePct.toFixed(1)}%（越高越倾向执行） · 一致性 {opportunity.confidencePct.toFixed(1)}%（越高越稳定）
            </div>
            <div className="text-muted-foreground">{opportunity.reasonZh}</div>
            <div className="text-muted-foreground">{opportunity.riskZh}</div>
          </>
        ) : (
          <div className="text-muted-foreground">暂无机会评分。</div>
        )}
      </TabsContent>

      <TabsContent value="technical" className="space-y-2 text-sm">
        {technical ? (
          <>
            <div>
              动量：<span className="font-medium">{technical.momentumRegime}</span> · 技术评分 {technical.scorePct.toFixed(1)}% · 置信 {technical.confidencePct.toFixed(1)}%
            </div>
            <div className="grid gap-1 md:grid-cols-2">
              {[...technical.common, ...technical.specific].slice(0, 8).map((item) => (
                <div key={item.key} className="rounded border px-2 py-1.5 text-xs">
                  <div className="text-muted-foreground">{item.label}</div>
                  <div className="font-medium">{String(item.value)}{item.unit || ""}</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="text-muted-foreground">暂无技术面数据。</div>
        )}
      </TabsContent>

      <TabsContent value="news" className="space-y-2 text-sm">
        {news ? (
          <>
            <div>新闻评分 {news.scorePct.toFixed(1)}% · 置信 {news.confidencePct.toFixed(1)}% · 证据 {news.evidenceCount}</div>
            {news.aiSummary?.summary ? <div className="text-muted-foreground">{news.aiSummary.summary}</div> : null}
            <div className="space-y-1">
              {(news.items || []).slice(0, 3).map((item) => (
                <a key={item.link || item.title} href={item.link} target="_blank" rel="noreferrer" className="block truncate text-xs text-blue-600 hover:underline">
                  {item.title}
                </a>
              ))}
            </div>
          </>
        ) : (
          <div className="text-muted-foreground">暂无新闻洞察。</div>
        )}
      </TabsContent>

      <TabsContent value="llm" className="space-y-2 text-sm">
        {llm && llm.status === "ok" ? (
          <>
            <div className="text-muted-foreground">模型 {llm.provider}/{llm.model}</div>
            <div>{llm.summary}</div>
            <div className="grid gap-1 md:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">机会</div>
                <ul className="space-y-0.5 text-xs">
                  {llm.opportunityNotes.slice(0, 4).map((note, idx) => <li key={`op-${idx}`}>• {note}</li>)}
                </ul>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">风险</div>
                <ul className="space-y-0.5 text-xs">
                  {llm.riskNotes.slice(0, 4).map((note, idx) => <li key={`risk-${idx}`}>• {note}</li>)}
                </ul>
              </div>
            </div>
          </>
        ) : (
          <div className="text-muted-foreground">暂无 AI 分析结果。</div>
        )}
      </TabsContent>
    </Tabs>
  );
}

export default function AssetUniverseTable(props: {
  rows: AssetUniverseViewV1[];
  baseCurrency: string;
  counts: {
    all: number;
    holdings: number;
    watchlist: number;
    basket: number;
  };
  view: AssetUniverseViewFilterV1;
  onAddToExecution: (row: AssetUniverseViewV1, side: TradeTicketSideV1) => void;
  onUpdateTargetWeight: (row: AssetUniverseViewV1, targetWeightPct: number) => Promise<void>;
  onNormalizeTargetWeights: () => Promise<void>;
  onToggleBasket: (row: AssetUniverseViewV1, nextInBasket: boolean) => Promise<void>;
  onRemoveFromWatchlist: (row: AssetUniverseViewV1) => Promise<void>;
  onOpenCalibration: (row: AssetUniverseViewV1) => void;
  expandedInsightKeys: Record<string, boolean>;
  insightLoadingByAssetKey: Record<string, boolean>;
  insightErrorByAssetKey: Record<string, string>;
  insightDataByAssetKey: Record<string, WorkbenchAssetInsightResponseV1>;
  onToggleInlineInsights: (row: AssetUniverseViewV1) => void;
  actioningAssetKey?: string | null;
  disabled?: boolean;
  updatingTarget?: boolean;
}) {
  const [keyword, setKeyword] = useState("");
  const [targetDrafts, setTargetDrafts] = useState<Record<string, string>>({});

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

  const tableEntries = useMemo(() => {
    if (props.view !== "holdings") {
      return filteredRows.map((row) => ({ type: "item" as const, row }));
    }

    const grouped = new Map<HoldingGroupKeyV1, {
      rows: AssetUniverseViewV1[];
      totalValue: number;
      totalWeightPct: number;
    }>();
    for (const row of filteredRows) {
      const key = holdingGroupKeyV1(row);
      const current = grouped.get(key) || { rows: [], totalValue: 0, totalWeightPct: 0 };
      current.rows.push(row);
      current.totalValue += Math.max(0, row.valuationBase ?? 0);
      current.totalWeightPct += Math.max(0, row.actualWeightPct ?? 0);
      grouped.set(key, current);
    }

    const out: Array<
      | { type: "group"; key: HoldingGroupKeyV1; label: string; totalValue: number; totalWeightPct: number; count: number }
      | { type: "item"; row: AssetUniverseViewV1 }
    > = [];
    for (const meta of HOLDING_GROUP_META_V1) {
      const block = grouped.get(meta.key);
      if (!block || block.rows.length <= 0) continue;
      out.push({
        type: "group",
        key: meta.key,
        label: meta.label,
        totalValue: block.totalValue,
        totalWeightPct: block.totalWeightPct,
        count: block.rows.length,
      });
      for (const row of block.rows) {
        out.push({ type: "item", row });
      }
    }
    return out;
  }, [filteredRows, props.baseCurrency, props.view]);

  function draftTargetValue(row: AssetUniverseViewV1): string {
    if (targetDrafts[row.assetKey] != null) return targetDrafts[row.assetKey];
    return row.targetWeightPct.toFixed(2);
  }

  async function handleSaveTarget(row: AssetUniverseViewV1) {
    const raw = draftTargetValue(row);
    const next = Number(raw);
    if (!Number.isFinite(next) || next < 0) return;
    await props.onUpdateTargetWeight(row, next);
    setTargetDrafts((prev) => {
      const nextState = { ...prev };
      delete nextState[row.assetKey];
      return nextState;
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">观察与再平衡</CardTitle>
            <CardDescription>先加入观察列表，再设定目标权重（大于 0 即进入再平衡列表）。</CardDescription>
            <div className="mt-1 text-xs text-muted-foreground">
              当前视图：{props.view === "holdings" ? "持仓" : "观察列表"} · 持仓 {props.counts.holdings} · 观察 {props.counts.watchlist} · 再平衡列表 {props.counts.basket}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => void props.onNormalizeTargetWeights()}
              disabled={props.disabled || props.updatingTarget}
            >
              {props.updatingTarget ? "处理中..." : "目标权重重算到 100%（不下单）"}
            </Button>
            <Input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              className="h-8 w-56 text-xs"
              placeholder="搜索代码/市场/行情标识"
            />
          </div>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          说明：这里的“重算到 100%”只会调整目标比例，不会触发任何交易执行。
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
                  <TableHead className="text-right">估值(本币)</TableHead>
                  <TableHead className="text-right">实际</TableHead>
                  <TableHead className="text-right">目标(%)</TableHead>
                  <TableHead className="text-right">目标差值</TableHead>
                  <TableHead>人因信号</TableHead>
                  <TableHead className="text-right">汇率</TableHead>
                  <TableHead className="sticky right-0 z-20 bg-background text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableEntries.map((entry) => {
                  if (entry.type === "group") {
                    return (
                      <TableRow key={`group-${entry.key}`} className="bg-muted/40">
                        <TableCell colSpan={11} className="py-2">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="font-medium">{entry.label}（{entry.count}）</span>
                            <span className="text-muted-foreground">
                              市值 {formatCurrency(entry.totalValue, props.baseCurrency)} · 占总权益 {formatPercent(entry.totalWeightPct)}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }

                  const row = entry.row;
                  const price = row.lastPrice > 0 ? row.lastPrice : row.holdingPrice;
                  const targetDraft = draftTargetValue(row);
                  const targetDraftNum = Number(targetDraft);
                  const targetChanged = Number.isFinite(targetDraftNum) && Math.abs(targetDraftNum - row.targetWeightPct) > 1e-6;
                  const targetInvalid = !Number.isFinite(targetDraftNum) || targetDraftNum < 0;
                  const buyDisabled = props.disabled || !(price > 0);
                  const sellDisabled = props.disabled || !(price > 0) || !(row.holdingQty > 0);
                  const actionBusy = props.actioningAssetKey === row.assetKey;
                  const inBasket = isInBasketV1(row);
                  const expanded = Boolean(props.expandedInsightKeys[row.assetKey]);
                  const localValuation = localValuationV1(row);
                  const gapLabel = gapLabelV1(row.gapPct);

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
                    <Fragment key={row.assetKey}>
                      <TableRow key={row.assetKey}>
                        <TableCell>
                          <div className="font-medium">{row.symbol}</div>
                          <div className="text-xs text-muted-foreground">{row.market} · {row.currency} · 行情标识 {row.yfinanceSymbol || "-"}</div>
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
                          {localValuation > 0 ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-default">
                                  {formatCurrency(localValuation, row.currency)}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {row.valuationBase != null ? (
                                  <div className="text-xs">
                                    折算约 {formatCurrency(row.valuationBase, props.baseCurrency)}
                                  </div>
                                ) : (
                                  <div className="text-xs text-muted-foreground">
                                    暂无 {props.baseCurrency} 折算值
                                  </div>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          ) : "-"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatPercent(row.actualWeightPct)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Input
                              value={targetDraft}
                              onChange={(event) => {
                                const value = event.target.value;
                                setTargetDrafts((prev) => ({ ...prev, [row.assetKey]: value }));
                              }}
                              className="h-7 w-20 text-right text-xs tabular-nums"
                              type="number"
                              min="0"
                              step="0.01"
                              disabled={props.disabled || props.updatingTarget}
                              data-testid={`workbench-target-${row.assetKey}`}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              onClick={() => void handleSaveTarget(row)}
                              disabled={props.disabled || props.updatingTarget || !targetChanged || targetInvalid}
                              data-testid={`workbench-target-save-${row.assetKey}`}
                            >
                              保存
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className={`text-right text-xs ${gapLabel.className}`}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-default">{gapLabel.text}</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="text-xs">目标差值 = 目标权重 - 当前权重</div>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" className="rounded px-1 py-0.5 text-base leading-none">
                                {hfSignalIconV1(row.hfSignal)}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              {row.hfSignal ? (
                                <div className="space-y-1">
                                  <div className="text-xs font-medium">
                                    {row.hfSignal.icon} {row.hfSignal.label}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    信号强度 {row.hfSignal.aggregatedScorePct.toFixed(1)}% · 一致性 {row.hfSignal.convictionPct.toFixed(1)}%
                                  </div>
                                  <div className="text-xs text-muted-foreground">观点偏离度 {row.hfSignal.thesisDriftPct.toFixed(1)}% · {hfTrendLabelV1(row.hfSignal.trend)}</div>
                                  {row.hfSignal.funds.length ? (
                                    <div className="space-y-1">
                                      {row.hfSignal.funds.slice(0, 3).map((fund) => (
                                        <div key={`${fund.fundCode}-${fund.weightPct}`} className="text-xs text-muted-foreground">
                                          {normalizeFundLabelV1(fund.fundName, fund.fundCode)} · 当前仓位 {fund.weightPct.toFixed(1)}% · 变动 {fund.changePct >= 0 ? "+" : ""}{fund.changePct.toFixed(1)}%
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              ) : (
                                <div className="text-xs text-muted-foreground">暂无人因信号</div>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className={`text-right text-xs ${row.fxMissing ? "text-red-500" : "text-muted-foreground"}`}>
                          {fxLabel(row)}
                        </TableCell>
                        <TableCell className="sticky right-0 z-10 bg-background">
                          <div className="flex flex-wrap justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              disabled={Boolean(props.disabled)}
                              onClick={() => props.onToggleInlineInsights(row)}
                            >
                              {expanded ? "收起详情" : "展开详情"}
                            </Button>
                            <ActionButtonV1
                              label={inBasket ? "移出列表" : "加入列表"}
                              disabled={Boolean(props.disabled) || actionBusy || !row.watchEnabled}
                              reason={row.watchEnabled ? "" : "请先加入观察列表。"}
                              onClick={() => void props.onToggleBasket(row, !inBasket)}
                            />
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
                            <ActionButtonV1
                              label="手动校准"
                              className="border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-blue-700"
                              disabled={Boolean(props.disabled)}
                              reason={Boolean(props.disabled) ? "当前有进行中的操作，请稍后再试。" : ""}
                              onClick={() => props.onOpenCalibration(row)}
                            />
                            <ActionButtonV1
                              label="移除观察"
                              className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                              disabled={Boolean(props.disabled) || actionBusy || !row.watchEnabled}
                              reason={row.watchEnabled ? "" : "当前不在观察列表。"}
                              onClick={() => void props.onRemoveFromWatchlist(row)}
                            />
                          </div>
                        </TableCell>
                        </TableRow>

                      {expanded ? (
                        <TableRow>
                          <TableCell colSpan={11} className="bg-muted/20 p-0">
                            <div className="p-3">
                              <InlineInsightsV1
                                loading={Boolean(props.insightLoadingByAssetKey[row.assetKey])}
                                error={props.insightErrorByAssetKey[row.assetKey] || ""}
                                data={props.insightDataByAssetKey[row.assetKey] || null}
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}

                {tableEntries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="py-8 text-center text-sm text-muted-foreground">
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
