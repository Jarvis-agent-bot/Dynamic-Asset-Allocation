"use client";

import { Fragment, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { Loader2, MoreHorizontal, Search, Settings2 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCurrency, formatDateTime, formatPercent } from "@/app/daa/dashboard/_components/daaFormatters";
import { cn } from "@/lib/utils";
import type { TradeTicketSide } from "@/src/daa/modules/trade/tradeTypes";
import type { AssetUniverseView } from "@/src/daa/modules/workbench/workbenchTypes";

import {
  DaaSurfaceActionButton,
  DaaSurfaceEmptyState,
  DaaSurfaceFilterChip,
  DaaSurfaceMiniStat,
  DaaSurfacePanel,
  DaaSurfaceStatusPill,
  daaSurfaceSearchShellClassName,
  daaSurfaceTableHeadClassName,
  daaSurfaceTableShellClassName,
} from "../_components/DaaSurfaceUI";
import { marketRegimeLabel, marketRegimeTone } from "./rebalance";

type AssetUniverseViewFilter = "all" | "holdings" | "watchlist" | "basket";
type HoldingGroupKey = "stock" | "etf" | "bond" | "crypto";

const HOLDING_GROUP_META_: Array<{ key: HoldingGroupKey; label: string }> = [
  { key: "stock", label: "股票" },
  { key: "etf", label: "ETF" },
  { key: "bond", label: "债券" },
  { key: "crypto", label: "加密" },
];

function normalizeTargetWeightPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function formatTargetWeightDraft(value: number): string {
  return normalizeTargetWeightPct(value).toFixed(2);
}

function isInBasket(row: AssetUniverseView): boolean {
  return row.watchEnabled && row.targetWeightHint > 0;
}

function passFilter(row: AssetUniverseView, view: AssetUniverseViewFilter): boolean {
  if (view === "holdings") return row.holdingQty > 0;
  if (view === "watchlist") return row.watchEnabled;
  if (view === "basket") return isInBasket(row);
  return row.watchEnabled || row.holdingQty > 0;
}

function viewLabel(view: AssetUniverseViewFilter): string {
  if (view === "holdings") return "当前持仓";
  if (view === "watchlist") return "观察列表";
  if (view === "basket") return "调仓范围";
  return "全部标的";
}

function rowStatusTone(input: { holdingQty: number; watchEnabled: boolean; inBasket: boolean }): "green" | "cyan" | "indigo" | "slate" {
  if (input.inBasket) return "indigo";
  if (input.holdingQty > 0) return "green";
  if (input.watchEnabled) return "cyan";
  return "slate";
}

function rowStatusLabel(input: { holdingQty: number; watchEnabled: boolean; inBasket: boolean }): string {
  if (input.inBasket && input.holdingQty > 0) return "已持仓，待调仓";
  if (input.inBasket) return "观察中，待建仓";
  if (input.holdingQty > 0 && input.watchEnabled) return "已持仓，已观察";
  if (input.holdingQty > 0) return "已持仓";
  if (input.watchEnabled) return "观察中";
  return "未跟踪";
}

function rowMarketLine(row: AssetUniverseView): string {
  const parts = [row.market, row.currency];
  if (row.yfinanceSymbol && row.yfinanceSymbol !== row.symbol) {
    parts.push(`映射 ${row.yfinanceSymbol}`);
  }
  return parts.join(" · ");
}

import {
  assetClassLabel,
  instrumentTypeLabel,
  regionLabel,
  exchangeLabel,
} from "@/app/daa/dashboard/_components/assetLabels";

function rowTypeSummary(row: AssetUniverseView): string {
  return `${assetClassLabel(row.assetClass)} · ${regionLabel(row.region || row.market)}`;
}

function rowTypeDetail(row: AssetUniverseView): string {
  const details: string[] = [];
  const primaryType = assetClassLabel(row.assetClass);
  const secondaryType = instrumentTypeLabel(row.instrumentType);
  const exchange = exchangeLabel(row.exchange);
  const exchangeUpper = exchange.toUpperCase();
  const marketUpper = String(row.market || "").trim().toUpperCase();
  const regionUpper = String(row.region || "").trim().toUpperCase();

  if (secondaryType && secondaryType !== primaryType) {
    details.push(secondaryType);
  }
  if (exchange && exchangeUpper !== marketUpper && exchangeUpper !== regionUpper) {
    details.push(exchange);
  }
  if (details.length <= 0 && secondaryType) {
    details.push(secondaryType);
  }
  return details.join(" · ") || "类型待补充";
}

function rowTagSummary(row: AssetUniverseView): string | null {
  const merged = [...row.watchTags, ...row.holdingTags]
    .map((tag) => String(tag || "").trim())
    .filter(Boolean);
  const unique = Array.from(new Set(merged));
  if (unique.length === 0) return null;
  return unique.slice(0, 3).join(" / ");
}

function viewDescription(view: AssetUniverseViewFilter): string {
  if (view === "holdings") return "这里只展示已经持有的资产，便于继续调仓或直接买卖。";
  if (view === "watchlist") return "先加入候选资产，再设目标仓位；这里只改目标，不会直接下单。";
  if (view === "basket") return "这里只看目标大于 0 的标的，便于集中处理调仓范围。";
  return "把持仓和观察标的一起放在这里统一处理。";
}

function emptyStateMeta(input: {
  view: AssetUniverseViewFilter;
  hasKeyword: boolean;
  watchlistCount: number;
  basketCount: number;
}): { title: string; description: string } {
  if (input.hasKeyword) {
    return {
      title: "当前筛选条件下暂无资产",
      description: "可以清空搜索关键词，或切换到其他视图继续查看。",
    };
  }
  if (input.view === "holdings" && input.watchlistCount > 0) {
    return {
      title: "当前还没有正式持仓",
      description: "已有观察标的，切到「观察列表」继续设置目标或发起首笔买入。",
    };
  }
  if (input.view === "watchlist") {
    return {
      title: "观察列表还是空的",
      description: "先用观察池工具或搜索功能加入候选标的。",
    };
  }
  if (input.view === "basket" && input.watchlistCount > 0) {
    return {
      title: "还没有进入调仓范围的标的",
      description: "给观察标的设置大于 0 的目标仓位后，这里才会出现。",
    };
  }
  if (input.view === "all" && input.basketCount <= 0 && input.watchlistCount <= 0) {
    return {
      title: "当前还没有可操作资产",
      description: "先加入观察标的，系统才会逐步形成组合和调仓范围。",
    };
  }
  return {
    title: "当前筛选条件下暂无资产",
    description: "可以切换到其他视图继续检查持仓与观察池。",
  };
}

function fxLabel(row: AssetUniverseView): string {
  if (row.currency === "") return "-";
  if (row.fxMissing) return "缺失";
  if (row.fxRateToBase == null) return "-";
  return row.fxRateToBase.toFixed(4);
}

function currencySymbol(currency: string): string {
  const ccy = String(currency || "").trim().toUpperCase();
  if (ccy === "CNY" || ccy === "RMB") return "¥";
  if (ccy === "HKD") return "HK$";
  if (ccy === "EUR") return "€";
  if (ccy === "USD") return "$";
  if (ccy === "USDC") return "USDC";
  return ccy || "-";
}

function priceLabel(row: AssetUniverseView): string {
  const price = row.lastPrice > 0 ? row.lastPrice : row.holdingPrice;
  if (!(price > 0)) return "-";
  return `${currencySymbol(row.currency)} ${price.toFixed(4)}`;
}

function priceStatusText(status: string): string {
  if (status === "fresh") return "最新";
  if (status === "stale") return "价格偏旧";
  if (status === "unsupported") return "不支持自动行情";
  return "无价格";
}

function priceStatusLabel(row: AssetUniverseView): string {
  return priceStatusText(row.priceStatus);
}

function priceStatusTone(status: string): "green" | "amber" | "red" | "slate" {
  if (status === "fresh") return "green";
  if (status === "stale") return "amber";
  if (status === "unsupported") return "slate";
  return "red";
}

function priceStatusClass(status: string): string {
  if (status === "fresh") return "text-emerald-300";
  if (status === "stale") return "text-amber-200";
  if (status === "unsupported") return "text-slate-300";
  return "text-rose-200";
}

function priceStatusNote(status: string): string {
  if (status === "fresh") return "已按最新可得行情刷新。";
  if (status === "stale") return "当前展示的是较旧缓存，建议结合最新市场状态判断。";
  if (status === "unsupported") return "该标的不支持自动行情映射。";
  return "当前暂无可用行情。";
}

function marketIndicatorKeyLabel(key: string): string {
  if (key === "vix") return "VIX";
  if (key === "qqq_spy_ratio") return "QQQ/SPY";
  if (key === "fxi_volatility") return "FXI 波动率";
  if (key === "kweb_fxi_ratio") return "KWEB/FXI";
  if (key === "btc_eth_ratio") return "BTC/ETH";
  if (key === "btc_volatility") return "BTC 波动率";
  if (key === "gold_silver_ratio") return "金银比";
  return key;
}

function marketPercentileText(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "近一年位置 N/A";
  return `近一年位置 ${value.toFixed(1)}%`;
}

function formatMarketIndicatorValue(value: number | null | undefined, unit?: string): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  if (unit === "%") return `${value.toFixed(1)}%`;
  if (unit === "x") return `${value.toFixed(2)}x`;
  if (Math.abs(value) >= 100) return value.toFixed(1);
  if (Math.abs(value) >= 10) return value.toFixed(2);
  return value.toFixed(3);
}

function formatSignedPercent(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function disabledReason(input: {
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

function hfSignalIcon(signal: AssetUniverseView["hfSignal"]): string {
  if (!signal) return "⚪";
  return signal.icon;
}

function hfTrendLabel(trend: "adding" | "trimming" | "neutral" | "none"): string {
  if (trend === "adding") return "整体偏增持";
  if (trend === "trimming") return "整体偏减持";
  if (trend === "neutral") return "整体变化不大";
  return "暂无趋势";
}

function hfSignalButtonLabel(signal: AssetUniverseView["hfSignal"]): string {
  if (!signal) return "暂无人因";
  if (signal.level === "bullish") return "人因偏多";
  if (signal.level === "bearish") return "人因偏空";
  if (signal.level === "neutral") return "人因中性";
  return "暂无人因";
}

function normalizeFundLabel(fundName: string, fundCode: string): string {
  const name = String(fundName || "").trim();
  if (name) return name;
  const code = String(fundCode || "").trim();
  if (!code) return "未知来源基金";
  const matched = /(\d{6})/.exec(code);
  if (matched) return `基金代码 ${matched[1]}`;
  return `来源 ${code.replace(/[_-]/g, " ").trim()}`;
}

function localValuation(row: AssetUniverseView): number {
  const price = row.lastPrice > 0 ? row.lastPrice : row.holdingPrice;
  if (!(price > 0) || !(row.holdingQty > 0)) return 0;
  return price * row.holdingQty;
}

function holdingCostPerUnit(row: AssetUniverseView): number {
  if (row.costBasis != null && row.costBasis > 0 && row.holdingQty > 0) return row.costBasis / row.holdingQty;
  return row.holdingPrice > 0 ? row.holdingPrice : 0;
}

function unrealizedPnlPct(row: AssetUniverseView): number | null {
  const px = row.lastPrice > 0 ? row.lastPrice : row.holdingPrice;
  const cost = holdingCostPerUnit(row);
  if (!(px > 0) || !(cost > 0) || !(row.holdingQty > 0)) return null;
  return ((px - cost) / cost) * 100;
}

function gapLabel(gapPct: number | null): { text: string; className: string; barClassName: string } {
  if (gapPct == null) return { text: "-", className: "text-[var(--faint)]", barClassName: "bg-[rgba(148,163,184,0.3)]" };
  if (gapPct > 0.01) {
    return { text: `低配 ${formatPercent(gapPct)}`, className: "text-emerald-300", barClassName: "bg-emerald-400" };
  }
  if (gapPct < -0.01) {
    return { text: `超配 ${formatPercent(Math.abs(gapPct))}`, className: "text-amber-200", barClassName: "bg-amber-300" };
  }
  return { text: "接近目标", className: "text-[var(--muted)]", barClassName: "bg-[var(--primary)]" };
}

function holdingGroupKey(row: AssetUniverseView): HoldingGroupKey {
  const assetClass = String(row.assetClass || "").toUpperCase();
  const instrumentType = String(row.instrumentType || "").toUpperCase();
  const market = String(row.market || "").toUpperCase();
  if (assetClass.includes("CRYPTO") || instrumentType.includes("CRYPTO") || market === "CRYPTO") return "crypto";
  if (assetClass.includes("BOND") || instrumentType.includes("BOND") || instrumentType.includes("FIXED")) return "bond";
  if (assetClass.includes("ETF") || instrumentType.includes("ETF") || instrumentType.includes("FUND")) return "etf";
  return "stock";
}

function ActionButton(props: {
  label: string;
  disabled: boolean;
  reason: string;
  tone?: "success" | "warning" | "slate" | "danger";
  className?: string;
  testId?: string;
  onClick?: () => void;
}) {
  const button = (
    <DaaSurfaceActionButton
      tone={props.tone || "slate"}
      className={cn("h-8 rounded-full px-3 text-xs", props.className)}
      data-testid={props.testId}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.label}
    </DaaSurfaceActionButton>
  );
  if (!props.disabled || !props.reason) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{button}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs border-[var(--border)] bg-[rgba(8,12,20,0.98)] text-[var(--text)]">
        {props.reason}
      </TooltipContent>
    </Tooltip>
  );
}


/* ─────────────────────────────────────────────────────────────────────────────
 * WeightGapCell — inline-edit target weight + gap bar (merged column 5)
 * ─────────────────────────────────────────────────────────────────────────── */

function WeightGapCell(props: {
  row: AssetUniverseView;
  editing: boolean;
  editingValue: string;
  disabled?: boolean;
  updatingTarget?: boolean;
  onStartEdit: () => void;
  onChangeEditValue: (value: string) => void;
  onSave: () => void;
}) {
  const { row } = props;
  const rowGapInfo = gapLabel(row.gapPct);
  const gapBarWidth = row.gapPct == null ? 0 : Math.min(100, Math.max(8, Math.abs(row.gapPct) * 1000));

  return (
    <td className="px-3 py-3 text-right align-top">
      <div className="text-xs text-[var(--muted)]">实际 {formatPercent(row.actualWeightPct)}</div>
      <div
        className="mt-0.5 group cursor-pointer"
        onClick={() => { if (!props.editing) props.onStartEdit(); }}
      >
        {props.editing ? (
          <input
            autoFocus
            type="number"
            min="0"
            step="0.01"
            value={props.editingValue}
            onChange={(e) => props.onChangeEditValue(e.target.value)}
            onBlur={props.onSave}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); props.onSave(); }
              if (e.key === "Escape") { e.preventDefault(); props.onSave(); }
            }}
            className="w-20 bg-transparent text-right text-xs outline-none border-b border-[var(--primary)] font-[var(--font-mono)] text-[var(--text)]"
            disabled={props.disabled || props.updatingTarget}
            data-testid={`workbench-target-${row.assetKey}`}
          />
        ) : (
          <span className="text-xs text-[var(--text)] group-hover:text-[var(--primary)] transition-colors">
            目标 {formatPercent(row.targetWeightPct)}
          </span>
        )}
      </div>
      {/* gap bar */}
      <div className="mt-1.5">
        <span className="h-1 w-16 overflow-hidden rounded-full bg-[rgba(255,255,255,0.08)] block">
          <span className={cn("block h-full rounded-full", rowGapInfo.barClassName)} style={{ width: `${gapBarWidth}%` }} />
        </span>
        <span className={cn("text-[10px] mt-0.5 block", rowGapInfo.className)}>{rowGapInfo.text}</span>
      </div>
    </td>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Mobile card layout — renders below the md breakpoint
 * ─────────────────────────────────────────────────────────────────────────── */

type MobileTableEntry =
  | { type: "group"; key: HoldingGroupKey; label: string; totalValue: number; totalWeightPct: number; count: number }
  | { type: "item"; row: AssetUniverseView };

function MobileAssetCard(props: {
  row: AssetUniverseView;
  baseCurrency: string;
  disabled?: boolean;
  actioningAssetKey?: string | null;
  onAddToExecution: (row: AssetUniverseView, side: TradeTicketSide) => void;
  onToggleBasket: (row: AssetUniverseView, nextInBasket: boolean) => Promise<void>;
  onRemoveFromWatchlist: (row: AssetUniverseView) => Promise<void>;
  onOpenCalibration: (row: AssetUniverseView) => void;
  onViewChart: (row: AssetUniverseView) => void;
}) {
  const { row } = props;
  const price = row.lastPrice > 0 ? row.lastPrice : row.holdingPrice;
  const inBasket = isInBasket(row);
  const buyDisabled = Boolean(props.disabled) || !(price > 0);
  const sellDisabled = Boolean(props.disabled) || !(price > 0) || !(row.holdingQty > 0);
  const actionBusy = props.actioningAssetKey === row.assetKey;
  const rowValuation = localValuation(row);
  const rowGapInfo = gapLabel(row.gapPct);
  const rowPnlPct = unrealizedPnlPct(row);

  const buyReason = disabledReason({ disabled: buyDisabled, disabledGlobal: Boolean(props.disabled), price, requireHolding: false, holdingQty: row.holdingQty });
  const sellReason = disabledReason({ disabled: sellDisabled, disabledGlobal: Boolean(props.disabled), price, requireHolding: true, holdingQty: row.holdingQty });

  return (
    <div className="rounded-[16px] border border-[var(--border)] bg-[rgba(8,12,20,0.82)]">
      {/* ── Header: symbol + status ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tracking-[-0.01em] text-[var(--text)]">{row.symbol}</span>
          <DaaSurfaceStatusPill tone={rowStatusTone({ holdingQty: row.holdingQty, watchEnabled: row.watchEnabled, inBasket })}>
            {rowStatusLabel({ holdingQty: row.holdingQty, watchEnabled: row.watchEnabled, inBasket })}
          </DaaSurfaceStatusPill>
        </div>
        <DaaSurfaceStatusPill tone={priceStatusTone(row.priceStatus)}>
          {priceStatusLabel(row)}
        </DaaSurfaceStatusPill>
      </div>
      <div className="px-4 pb-3 text-[10px] uppercase tracking-[0.14em] text-[var(--faint)]">
        {rowTypeSummary(row)} · {row.market} · {row.currency}
      </div>

      {/* ── Metrics grid ── */}
      <div className="grid grid-cols-2 gap-px border-t border-[var(--border)] bg-[var(--border)]">
        <MobileMetricCell label="持仓" value={row.holdingQty.toFixed(4)} />
        <MobileMetricCell label="价格" value={priceLabel(row)} />
        <MobileMetricCell label="成本" value={row.holdingQty > 0 ? `${currencySymbol(row.currency)} ${holdingCostPerUnit(row).toFixed(4)}` : "-"} />
        <MobileMetricCell label="市值" value={rowValuation > 0 ? formatCurrency(rowValuation, row.currency) : "-"} />
        <MobileMetricCell label="目标" value={row.targetWeightPct > 0 ? `${formatTargetWeightDraft(row.targetWeightPct)}%` : "-"} />
        <MobileMetricCell label="偏离" value={rowGapInfo.text} valueClassName={rowGapInfo.className} />
        <MobileMetricCell
          label="浮盈亏"
          value={rowPnlPct != null ? `${rowPnlPct >= 0 ? "+" : ""}${rowPnlPct.toFixed(1)}%` : "-"}
          valueClassName={rowPnlPct != null ? (rowPnlPct >= 0 ? "text-emerald-300" : "text-rose-300") : undefined}
        />
        <MobileMetricCell label="汇率" value={fxLabel(row)} valueClassName={row.fxMissing ? "text-rose-200" : undefined} />
      </div>

      {/* ── Actions row ── */}
      <div className="flex items-center gap-2 border-t border-[var(--border)] px-4 py-3">
        <ActionButton label="买入" disabled={buyDisabled} reason={buyReason} tone="success" className="flex-1 justify-center" onClick={() => props.onAddToExecution(row, "BUY")} />
        <ActionButton label="卖出" disabled={sellDisabled} reason={sellReason} tone="warning" className="flex-1 justify-center" onClick={() => props.onAddToExecution(row, "SELL")} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <DaaSurfaceActionButton tone="slate" className="h-8 rounded-full px-3 text-[11px]" disabled={Boolean(props.disabled)}>
              <MoreHorizontal className="h-3.5 w-3.5" />
              更多
            </DaaSurfaceActionButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 border-[var(--border)] bg-[rgba(8,12,20,0.98)] text-[var(--text)]">
            <DropdownMenuLabel className="text-xs text-[var(--faint)]">低频操作</DropdownMenuLabel>
            <DropdownMenuItem asChild className="text-xs focus:bg-[rgba(56,189,248,0.12)] focus:text-[var(--text)]">
              <Link href={`/daa/dashboard/portfolio/${encodeURIComponent(row.assetKey)}`}>查看详情（Agent 观点 + 新闻）</Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => props.onViewChart(row)} className="text-xs focus:bg-[rgba(56,189,248,0.12)] focus:text-[var(--text)]">
              K 线图表
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => void props.onToggleBasket(row, !inBasket)}
              disabled={actionBusy || !row.watchEnabled}
              className="text-xs focus:bg-[rgba(56,189,248,0.12)] focus:text-[var(--text)]"
            >
              {inBasket ? "移出再平衡列表" : "加入再平衡列表"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => props.onOpenCalibration(row)}
              className="text-xs text-[var(--primary)] focus:bg-[rgba(56,189,248,0.12)] focus:text-[var(--primary)]"
            >
              手动校准持仓
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-[var(--border)]" />
            <DropdownMenuItem
              onClick={() => void props.onRemoveFromWatchlist(row)}
              disabled={actionBusy || !row.watchEnabled}
              className="text-xs text-rose-200 focus:bg-[rgba(248,113,113,0.1)] focus:text-rose-200"
            >
              移除观察
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

    </div>
  );
}

function MobileMetricCell(props: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="bg-[rgba(8,12,20,0.82)] px-4 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--faint)]">{props.label}</div>
      <div className={cn("mt-1 font-[var(--font-mono)] text-xs text-[var(--text)]", props.valueClassName)}>{props.value}</div>
    </div>
  );
}

function MobileAssetCardList(props: {
  tableEntries: MobileTableEntry[];
  baseCurrency: string;
  view: AssetUniverseViewFilter;
  counts: { all: number; holdings: number; watchlist: number; basket: number };
  disabled?: boolean;
  updatingTarget?: boolean;
  actioningAssetKey?: string | null;
  onAddToExecution: (row: AssetUniverseView, side: TradeTicketSide) => void;
  onToggleBasket: (row: AssetUniverseView, nextInBasket: boolean) => Promise<void>;
  onRemoveFromWatchlist: (row: AssetUniverseView) => Promise<void>;
  onOpenCalibration: (row: AssetUniverseView) => void;
  onViewChart: (row: AssetUniverseView) => void;
  hasKeyword: boolean;
  onClearKeyword: () => void;
}) {
  if (props.tableEntries.length === 0) {
    const emptyMeta = emptyStateMeta({
      view: props.view,
      hasKeyword: props.hasKeyword,
      watchlistCount: props.counts.watchlist,
      basketCount: props.counts.basket,
    });
    return (
      <DaaSurfaceEmptyState
        title={emptyMeta.title}
        description={emptyMeta.description}
        action={props.hasKeyword ? <DaaSurfaceActionButton tone="slate" onClick={props.onClearKeyword}>清空搜索</DaaSurfaceActionButton> : null}
        className="border-0 bg-transparent px-0 py-6"
      />
    );
  }

  return (
    <TooltipProvider delayDuration={120}>
      <div className="space-y-3">
        {props.tableEntries.map((entry) => {
          if (entry.type === "group") {
            return (
              <div key={`mgroup-${entry.key}`} className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-[var(--border)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-xs">
                <span className="font-semibold text-[var(--text)]">{entry.label}（{entry.count}）</span>
                <span className="text-[var(--muted)]">
                  市值 {formatCurrency(entry.totalValue, props.baseCurrency)} · 占总权益 {formatPercent(entry.totalWeightPct)}
                </span>
              </div>
            );
          }
          const row = entry.row;
          return (
            <MobileAssetCard
              key={`m-${row.assetKey}`}
              row={row}
              baseCurrency={props.baseCurrency}
              disabled={props.disabled}
              actioningAssetKey={props.actioningAssetKey}
              onAddToExecution={props.onAddToExecution}
              onToggleBasket={props.onToggleBasket}
              onRemoveFromWatchlist={props.onRemoveFromWatchlist}
              onOpenCalibration={props.onOpenCalibration}
              onViewChart={props.onViewChart}
            />
          );
        })}
      </div>
    </TooltipProvider>
  );
}

export default function AssetUniverseTable(props: {
  rows: AssetUniverseView[];
  baseCurrency: string;
  counts: {
    all: number;
    holdings: number;
    watchlist: number;
    basket: number;
  };
  view: AssetUniverseViewFilter;
  onAddToExecution: (row: AssetUniverseView, side: TradeTicketSide) => void;
  onUpdateTargetWeight: (row: AssetUniverseView, targetWeightPct: number) => Promise<void>;
  onNormalizeTargetWeights: () => Promise<void>;
  onToggleBasket: (row: AssetUniverseView, nextInBasket: boolean) => Promise<void>;
  onRemoveFromWatchlist: (row: AssetUniverseView) => Promise<void>;
  onOpenCalibration: (row: AssetUniverseView) => void;
  onViewChart?: (row: AssetUniverseView) => void;
  actioningAssetKey?: string | null;
  disabled?: boolean;
  updatingTarget?: boolean;
}) {
  const [keyword, setKeyword] = useState("");
  const [targetDrafts, setTargetDrafts] = useState<Record<string, string>>({});
  const [editingTargetKey, setEditingTargetKey] = useState<string | null>(null);
  const hasKeyword = keyword.trim().length > 0;

  // --- Item 20: Watchlist tag filter ---
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const row of props.rows) {
      if (row.watchEnabled && row.watchTags) {
        for (const t of row.watchTags) tags.add(t);
      }
    }
    return Array.from(tags).sort();
  }, [props.rows]);

  // --- Item 27: Sector/asset class filter ---
  const [activeSector, setActiveSector] = useState<string | null>(null);

  const allSectors = useMemo(() => {
    const sectors = new Set<string>();
    for (const row of props.rows) {
      if (passFilter(row, props.view)) {
        const label = assetClassLabel(row.assetClass);
        if (label) sectors.add(label);
      }
    }
    return Array.from(sectors).sort();
  }, [props.rows, props.view]);

  // --- Item 28: Column visibility ---
  const COLUMN_DEFS: Array<{ id: string; label: string; alwaysVisible?: boolean }> = [
    { id: "symbol", label: "标的", alwaysVisible: true },
    { id: "holdings", label: "持仓" },
    { id: "price", label: "现价" },
    { id: "valuation", label: "市值" },
    { id: "weight", label: "权重 / 偏离" },
    { id: "pnl", label: "盈亏" },
    { id: "actions", label: "操作", alwaysVisible: true },
  ];

  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => {
    try {
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem("daa:table:visibleColumns");
        if (saved) return new Set(JSON.parse(saved) as string[]);
      }
    } catch { /* ignore */ }
    return new Set(COLUMN_DEFS.map((c) => c.id));
  });
  const [columnConfigOpen, setColumnConfigOpen] = useState(false);

  const toggleColumn = useCallback((id: string) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem("daa:table:visibleColumns", JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const isColumnVisible = useCallback((id: string) => visibleColumns.has(id), [visibleColumns]);

  const filteredRows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return props.rows.filter((row) => {
      if (!passFilter(row, props.view)) return false;
      if (kw) {
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
        if (!text.includes(kw)) return false;
      }
      // Tag filter (Item 20)
      if (activeTag && row.watchEnabled) {
        if (!row.watchTags.includes(activeTag)) return false;
      } else if (activeTag && !row.watchEnabled) {
        return false;
      }
      // Sector filter (Item 27)
      if (activeSector) {
        if (assetClassLabel(row.assetClass) !== activeSector) return false;
      }
      return true;
    });
  }, [keyword, props.rows, props.view, activeTag, activeSector]);

  const tableEntries = useMemo(() => {
    if (props.view !== "holdings") {
      return filteredRows.map((row) => ({ type: "item" as const, row }));
    }

    const grouped = new Map<HoldingGroupKey, {
      rows: AssetUniverseView[];
      totalValue: number;
      totalWeightPct: number;
    }>();
    for (const row of filteredRows) {
      const key = holdingGroupKey(row);
      const current = grouped.get(key) || { rows: [], totalValue: 0, totalWeightPct: 0 };
      current.rows.push(row);
      current.totalValue += Math.max(0, row.valuationBase ?? 0);
      current.totalWeightPct += Math.max(0, row.actualWeightPct ?? 0);
      grouped.set(key, current);
    }

    const out: Array<
      | { type: "group"; key: HoldingGroupKey; label: string; totalValue: number; totalWeightPct: number; count: number }
      | { type: "item"; row: AssetUniverseView }
    > = [];
    for (const meta of HOLDING_GROUP_META_) {
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
  }, [filteredRows, props.view]);

  function draftTargetValue(row: AssetUniverseView): string {
    if (targetDrafts[row.assetKey] != null) return targetDrafts[row.assetKey];
    return formatTargetWeightDraft(row.targetWeightPct);
  }

  async function handleSaveTarget(row: AssetUniverseView) {
    const raw = draftTargetValue(row);
    const next = Number(raw);
    if (!Number.isFinite(next) || next < 0) {
      setEditingTargetKey(null);
      return;
    }
    await props.onUpdateTargetWeight(row, normalizeTargetWeightPct(next));
    setTargetDrafts((prev) => {
      const nextState = { ...prev };
      delete nextState[row.assetKey];
      return nextState;
    });
    setEditingTargetKey(null);
  }

  function handleStartEditTarget(row: AssetUniverseView) {
    setEditingTargetKey(row.assetKey);
    // 初始化 draft 为当前目标值
    if (targetDrafts[row.assetKey] == null) {
      setTargetDrafts((prev) => ({ ...prev, [row.assetKey]: formatTargetWeightDraft(row.targetWeightPct) }));
    }
  }

  return (
    <DaaSurfacePanel
      title="观察与再平衡"
      accent={props.view === "holdings" ? "cyan" : "amber"}
      bodyClassName="space-y-5"
      action={<DaaSurfaceStatusPill tone={props.view === "holdings" ? "cyan" : "amber"}>当前 {filteredRows.length} 个标的</DaaSurfaceStatusPill>}
    >
      {/* ─── 紧凑工具栏（过滤 + 权重补齐）─── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className={cn(daaSurfaceSearchShellClassName, "h-9 flex-1 min-w-[200px]")}>
          <label htmlFor="asset-search-keyword" className="sr-only">过滤列表</label>
          <Search className="h-3.5 w-3.5 text-[var(--faint)]" />
          <input
            id="asset-search-keyword"
            name="asset-search-keyword"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            className="h-9 w-full bg-transparent text-xs text-[var(--text)] outline-none placeholder:text-[var(--faint)]"
            placeholder="过滤已有标的（代码、市场）"
          />
          {hasKeyword ? (
            <DaaSurfaceActionButton tone="slate" className="h-7 shrink-0 rounded-full px-2.5 text-[11px]" onClick={() => setKeyword("")}>
              清空
            </DaaSurfaceActionButton>
          ) : null}
        </div>
        <DaaSurfaceActionButton
          tone="slate"
          className="h-9 shrink-0 rounded-full px-4 text-xs"
          onClick={() => void props.onNormalizeTargetWeights()}
          disabled={props.disabled || props.updatingTarget}
        >
          {props.updatingTarget ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {props.updatingTarget ? "处理中..." : "权重补齐 100%"}
        </DaaSurfaceActionButton>

        {/* Item 28: 列配置 */}
        <div className="relative">
          <button
            onClick={() => setColumnConfigOpen(!columnConfigOpen)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] transition-colors hover:text-[var(--text)]"
            title="列配置"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
          {columnConfigOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setColumnConfigOpen(false)} />
              <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-[12px] border border-[var(--border)] bg-[rgba(13,19,32,0.98)] p-2 shadow-lg">
                <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--faint)]">显示列</div>
                {COLUMN_DEFS.filter((c) => !c.alwaysVisible).map((col) => (
                  <label key={col.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-[var(--muted)] hover:bg-[rgba(255,255,255,0.04)]">
                    <input
                      type="checkbox"
                      checked={isColumnVisible(col.id)}
                      onChange={() => toggleColumn(col.id)}
                      className="accent-[var(--primary)]"
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Item 27: 资产类别筛选 */}
      {allSectors.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <DaaSurfaceFilterChip active={!activeSector} onClick={() => setActiveSector(null)}>
            全部类别
          </DaaSurfaceFilterChip>
          {allSectors.map((sector) => (
            <DaaSurfaceFilterChip
              key={sector}
              active={activeSector === sector}
              onClick={() => setActiveSector(activeSector === sector ? null : sector)}
            >
              {sector}
            </DaaSurfaceFilterChip>
          ))}
        </div>
      )}

      {/* Item 20: 观察列表标签筛选 */}
      {props.view === "watchlist" && allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <DaaSurfaceFilterChip active={!activeTag} onClick={() => setActiveTag(null)}>
            全部标签
          </DaaSurfaceFilterChip>
          {allTags.map((tag) => (
            <DaaSurfaceFilterChip
              key={tag}
              active={activeTag === tag}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
            >
              {tag}
            </DaaSurfaceFilterChip>
          ))}
        </div>
      )}

      {/* ───── Mobile card layout (< md) ───── */}
      <div className="md:hidden">
        <MobileAssetCardList
          tableEntries={tableEntries}
          baseCurrency={props.baseCurrency}
          view={props.view}
          counts={props.counts}
          disabled={props.disabled}
          updatingTarget={props.updatingTarget}
          actioningAssetKey={props.actioningAssetKey}
          onAddToExecution={props.onAddToExecution}
          onToggleBasket={props.onToggleBasket}
          onRemoveFromWatchlist={props.onRemoveFromWatchlist}
          onOpenCalibration={props.onOpenCalibration}
          onViewChart={props.onViewChart ?? (() => {})}
          hasKeyword={hasKeyword}
          onClearKeyword={() => setKeyword("")}
        />
      </div>

      {/* ───── Desktop table layout (>= md) ───── */}
      <div className={cn(daaSurfaceTableShellClassName, "hidden overflow-x-auto md:block")}>
        <div className="border-b border-[var(--border)] bg-[rgba(255,255,255,0.02)] px-4 py-2.5 text-[11px] text-[var(--faint)]">
          7 列精简视图，点击目标权重可直接编辑；详细类型、汇率等信息请展开详情查看。
        </div>
        <TooltipProvider delayDuration={120}>
          <table className="w-full border-collapse" style={{ minWidth: `${240 + (isColumnVisible("holdings") ? 120 : 0) + (isColumnVisible("price") ? 130 : 0) + (isColumnVisible("valuation") ? 130 : 0) + (isColumnVisible("weight") ? 150 : 0) + (isColumnVisible("pnl") ? 120 : 0) + 100}px` }}>
            <colgroup>
              <col className="w-[240px]" />
              {isColumnVisible("holdings") && <col className="w-[120px]" />}
              {isColumnVisible("price") && <col className="w-[130px]" />}
              {isColumnVisible("valuation") && <col className="w-[130px]" />}
              {isColumnVisible("weight") && <col className="w-[150px]" />}
              {isColumnVisible("pnl") && <col className="w-[120px]" />}
              <col className="w-[100px]" />
            </colgroup>
            <thead>
              <tr>
                <th className={daaSurfaceTableHeadClassName}>标的</th>
                {isColumnVisible("holdings") && <th className={cn(daaSurfaceTableHeadClassName, "text-right")}>持仓</th>}
                {isColumnVisible("price") && <th className={cn(daaSurfaceTableHeadClassName, "text-right")}>现价</th>}
                {isColumnVisible("valuation") && <th className={cn(daaSurfaceTableHeadClassName, "text-right")}>市值</th>}
                {isColumnVisible("weight") && <th className={cn(daaSurfaceTableHeadClassName, "text-right")}>权重 / 偏离</th>}
                {isColumnVisible("pnl") && <th className={cn(daaSurfaceTableHeadClassName, "text-right")}>盈亏</th>}
                <th className="sticky right-0 z-20 border-b border-[var(--border)] bg-[rgba(7,10,18,0.98)] px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">操作</th>
              </tr>
            </thead>
            <tbody>
              {tableEntries.map((entry) => {
                const visibleColCount = 2 + (isColumnVisible("holdings") ? 1 : 0) + (isColumnVisible("price") ? 1 : 0) + (isColumnVisible("valuation") ? 1 : 0) + (isColumnVisible("weight") ? 1 : 0) + (isColumnVisible("pnl") ? 1 : 0);
                if (entry.type === "group") {
                  return (
                    <tr key={`group-${entry.key}`} className="border-b border-[var(--border)]/70 bg-[rgba(255,255,255,0.03)]">
                      <td colSpan={visibleColCount} className="px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-[var(--text)]">{entry.label}（{entry.count}）</span>
                          <span className="text-[var(--muted)]">
                            市值 {formatCurrency(entry.totalValue, props.baseCurrency)} · 占总权益 {formatPercent(entry.totalWeightPct)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                }

                const row = entry.row;
                const price = row.lastPrice > 0 ? row.lastPrice : row.holdingPrice;
                const buyDisabled = props.disabled || !(price > 0);
                const sellDisabled = props.disabled || !(price > 0) || !(row.holdingQty > 0);
                const actionBusy = props.actioningAssetKey === row.assetKey;
                const inBasket = isInBasket(row);
                const rowValuation = localValuation(row);
                const rowPnlPct = unrealizedPnlPct(row);
                const tagSummary = rowTagSummary(row);

                const buyReason = disabledReason({
                  disabled: buyDisabled,
                  disabledGlobal: Boolean(props.disabled),
                  price,
                  requireHolding: false,
                  holdingQty: row.holdingQty,
                });
                const sellReason = disabledReason({
                  disabled: sellDisabled,
                  disabledGlobal: Boolean(props.disabled),
                  price,
                  requireHolding: true,
                  holdingQty: row.holdingQty,
                });

                const isEditingTarget = editingTargetKey === row.assetKey;

                return (
                  <Fragment key={row.assetKey}>
                    <tr className="border-b border-[var(--border)]/70 text-[12px] transition-colors hover:bg-[rgba(56,189,248,0.04)]">
                      {/* Column 1: 标的 — symbol + status pill + market line + type tooltip */}
                      <td className="px-3 py-3 align-top">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="max-w-[230px] cursor-default">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="font-semibold tracking-[-0.01em] text-[var(--text)]">{row.symbol}</div>
                                <DaaSurfaceStatusPill tone={rowStatusTone({ holdingQty: row.holdingQty, watchEnabled: row.watchEnabled, inBasket })}>
                                  {rowStatusLabel({ holdingQty: row.holdingQty, watchEnabled: row.watchEnabled, inBasket })}
                                </DaaSurfaceStatusPill>
                              </div>
                              <div className="mt-1 truncate text-[10px] uppercase tracking-[0.14em] text-[var(--faint)]">
                                {rowMarketLine(row)}
                              </div>
                              {row.notes ? <div className="mt-1.5 truncate text-[11px] leading-5 text-[var(--muted)]">{row.notes}</div> : null}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs border-[var(--border)] bg-[rgba(8,12,20,0.98)] text-[var(--text)]">
                            <div className="space-y-1 text-xs">
                              <div className="font-medium">{rowTypeSummary(row)}</div>
                              <div className="text-[var(--muted)]">{rowTypeDetail(row)}</div>
                              <div className="text-[var(--muted)]">交易所: {exchangeLabel(row.exchange) || "-"}</div>
                              <div className="text-[var(--muted)]">区域: {regionLabel(row.region || row.market)}</div>
                              {tagSummary ? <div className="text-[var(--muted)]">标签: {tagSummary}</div> : null}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </td>
                      {/* Column 2: 持仓 — qty + cost per unit */}
                      {isColumnVisible("holdings") && (
                      <td className="px-3 py-3 text-right align-top font-[var(--font-mono)] text-[13px] text-[var(--text)]">
                        <div>{row.holdingQty.toFixed(4)}</div>
                        {row.holdingQty > 0 ? (
                          <div className="mt-1 text-[11px] text-[var(--muted)]">
                            成本 {currencySymbol(row.currency)} {holdingCostPerUnit(row).toFixed(4)}
                          </div>
                        ) : null}
                      </td>
                      )}
                      {/* Column 3: 现价 — price + status pill */}
                      {isColumnVisible("price") && (
                      <td className="px-3 py-3 text-right align-top font-[var(--font-mono)] text-[13px] text-[var(--text)]">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="inline-flex cursor-default flex-col items-end">
                              <div>{priceLabel(row)}</div>
                              <div className="mt-1"><DaaSurfaceStatusPill tone={priceStatusTone(row.priceStatus)}>{priceStatusLabel(row)}</DaaSurfaceStatusPill></div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs border-[var(--border)] bg-[rgba(8,12,20,0.98)] text-[var(--text)]">
                            <div className="text-xs font-medium">行情更新时间：{formatDateTime(row.priceUpdatedAt)}</div>
                            <div className="mt-1 text-xs text-[var(--muted)]">系统最近一次成功拉取并写入本地行情的时间。</div>
                            <div className="mt-1 text-xs text-[var(--muted)]">来源：{row.priceSource || "-"}</div>
                          </TooltipContent>
                        </Tooltip>
                      </td>
                      )}
                      {/* Column 4: 市值 — local valuation + base currency tooltip */}
                      {isColumnVisible("valuation") && (
                      <td className="px-3 py-3 text-right align-top font-[var(--font-mono)] text-sm text-[var(--text)]">
                        {rowValuation > 0 ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-default">{formatCurrency(rowValuation, row.currency)}</span>
                            </TooltipTrigger>
                            <TooltipContent className="border-[var(--border)] bg-[rgba(8,12,20,0.98)] text-[var(--text)]">
                              {row.valuationBase != null ? (
                                <div className="text-xs">折算约 {formatCurrency(row.valuationBase, props.baseCurrency)}</div>
                              ) : (
                                <div className="text-xs text-[var(--muted)]">暂无基准币折算值</div>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        ) : "-"}
                      </td>
                      )}
                      {/* Column 5: 权重/偏离 — merged actual + target (inline edit) + gap bar */}
                      {isColumnVisible("weight") && (
                      <WeightGapCell
                        row={row}
                        editing={isEditingTarget}
                        editingValue={draftTargetValue(row)}
                        disabled={props.disabled}
                        updatingTarget={props.updatingTarget}
                        onStartEdit={() => handleStartEditTarget(row)}
                        onChangeEditValue={(value) => {
                          setTargetDrafts((prev) => ({ ...prev, [row.assetKey]: value }));
                        }}
                        onSave={() => void handleSaveTarget(row)}
                      />
                      )}
                      {/* Column 6: 盈亏 — unrealized PnL % + valuation temperature */}
                      {isColumnVisible("pnl") && (
                      <td className="px-3 py-3 text-right align-top">
                        {rowPnlPct != null ? (
                          <div className={cn("font-[var(--font-mono)] text-xs font-semibold", rowPnlPct >= 0 ? "text-emerald-300" : "text-rose-300")}>
                            {rowPnlPct >= 0 ? "+" : ""}{rowPnlPct.toFixed(2)}%
                          </div>
                        ) : (
                          <div className="text-xs text-[var(--faint)]">-</div>
                        )}
                      </td>
                      )}
                      {/* Column 7: 操作 (sticky) — trade dropdown + more menu */}
                      <td className="sticky right-0 z-10 bg-[rgba(7,10,18,0.98)] px-3 py-3 text-right align-top">
                        <div className="flex items-center justify-end gap-1.5">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <DaaSurfaceActionButton tone="primary" className="h-7 rounded-full px-3 text-[11px]">
                                交易
                              </DaaSurfaceActionButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-36 border-[var(--border)] bg-[rgba(8,12,20,0.98)] text-[var(--text)]">
                              <DropdownMenuItem
                                onClick={() => props.onAddToExecution(row, "BUY")}
                                disabled={buyDisabled}
                                className="text-xs focus:bg-[rgba(56,189,248,0.12)] focus:text-[var(--text)]"
                              >
                                买入
                                {buyReason ? <span className="ml-auto text-[10px] text-[var(--faint)]">不可用</span> : null}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => props.onAddToExecution(row, "SELL")}
                                disabled={sellDisabled}
                                className="text-xs focus:bg-[rgba(56,189,248,0.12)] focus:text-[var(--text)]"
                              >
                                卖出
                                {sellReason ? <span className="ml-auto text-[10px] text-[var(--faint)]">不可用</span> : null}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--text)] transition-colors"
                                disabled={Boolean(props.disabled)}
                              >
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48 border-[var(--border)] bg-[rgba(8,12,20,0.98)] text-[var(--text)]">
                              <DropdownMenuLabel className="text-xs text-[var(--faint)]">低频操作</DropdownMenuLabel>
                              <DropdownMenuItem asChild className="text-xs focus:bg-[rgba(56,189,248,0.12)] focus:text-[var(--text)]">
                                <Link href={`/daa/dashboard/portfolio/${encodeURIComponent(row.assetKey)}`}>查看详情（Agent 观点 + 新闻）</Link>
                              </DropdownMenuItem>
                              {props.onViewChart && (
                                <DropdownMenuItem onClick={() => props.onViewChart?.(row)} className="text-xs focus:bg-[rgba(56,189,248,0.12)] focus:text-[var(--text)]">
                                  K 线图表
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={() => void props.onToggleBasket(row, !inBasket)}
                                disabled={actionBusy || !row.watchEnabled}
                                className="text-xs focus:bg-[rgba(56,189,248,0.12)] focus:text-[var(--text)]"
                              >
                                {inBasket ? "移出再平衡列表" : "加入再平衡列表"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => props.onOpenCalibration(row)}
                                className="text-xs text-[var(--primary)] focus:bg-[rgba(56,189,248,0.12)] focus:text-[var(--primary)]"
                              >
                                手动校准持仓
                              </DropdownMenuItem>
                              <DropdownMenuSeparator className="bg-[var(--border)]" />
                              <DropdownMenuItem
                                onClick={() => void props.onRemoveFromWatchlist(row)}
                                disabled={actionBusy || !row.watchEnabled}
                                className="text-xs text-rose-200 focus:bg-[rgba(248,113,113,0.1)] focus:text-rose-200"
                              >
                                移除观察
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                );
              })}

              {tableEntries.length === 0 ? (
                <tr>
                  <td colSpan={2 + (isColumnVisible("holdings") ? 1 : 0) + (isColumnVisible("price") ? 1 : 0) + (isColumnVisible("valuation") ? 1 : 0) + (isColumnVisible("weight") ? 1 : 0) + (isColumnVisible("pnl") ? 1 : 0)} className="px-4 py-10 text-center">
                    {(() => {
                      const emptyMeta = emptyStateMeta({
                        view: props.view,
                        hasKeyword,
                        watchlistCount: props.counts.watchlist,
                        basketCount: props.counts.basket,
                      });
                      return (
                    <DaaSurfaceEmptyState
                      title={emptyMeta.title}
                      description={emptyMeta.description}
                      action={hasKeyword ? <DaaSurfaceActionButton tone="slate" onClick={() => setKeyword("")}>清空搜索</DaaSurfaceActionButton> : null}
                      className="border-0 bg-transparent px-0 py-0"
                    />
                      );
                    })()}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </TooltipProvider>
      </div>
    </DaaSurfacePanel>
  );
}
