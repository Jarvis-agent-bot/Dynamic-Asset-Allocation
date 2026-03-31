"use client";

import { Fragment, useMemo, useState, useCallback } from "react";
import { Info, Loader2, MoreHorizontal, Search, Settings2 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCurrency, formatDateTime, formatPercent } from "@/app/daa/dashboard/_components/daaFormatters";
import { DashboardEmptyState, DashboardErrorNotice } from "@/app/daa/dashboard/_components/DashboardFeedback";
import { cn } from "@/lib/utils";
import type { TradeTicketSide } from "@/src/daa/modules/trade/tradeTypes";
import type {
  AssetUniverseView,
  WorkbenchAssetInsightResponse,
  WorkbenchLlmFeedbackScore,
} from "@/src/daa/modules/workbench/workbenchTypes";

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
} from "../../_components/DaaSurfaceUI";
import { FusionScoreBreakdown } from "./FusionScoreBreakdown";
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

function assetClassLabel(value: string): string {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "EQUITY") return "股票";
  if (normalized === "ETF") return "ETF";
  if (normalized === "BOND") return "债券";
  if (normalized === "COMMODITY") return "商品";
  if (normalized === "CASH") return "现金";
  if (normalized === "CRYPTO") return "加密资产";
  if (normalized === "FUND") return "基金";
  if (normalized === "INDEX") return "指数";
  if (normalized === "OTHER") return "其他";
  return normalized || "未分类";
}

function instrumentTypeLabel(value: string): string {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "STOCK") return "个股";
  if (normalized === "ETF") return "ETF";
  if (normalized === "BOND") return "债券";
  if (normalized === "COMMODITY") return "商品";
  if (normalized === "CASH") return "现金";
  if (normalized === "CRYPTO") return "加密资产";
  if (normalized === "FUND") return "基金";
  if (normalized === "INDEX") return "指数";
  if (normalized === "OTHER") return "其他类型";
  return normalized || "";
}

function regionLabel(value: string): string {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "US") return "美股";
  if (normalized === "HK") return "港股";
  if (normalized === "CN") return "A股";
  if (normalized === "JP") return "日股";
  if (normalized === "EU") return "欧股";
  if (normalized === "CRYPTO" || normalized === "GLOBAL") return "全球";
  if (normalized === "OTHER") return "其他市场";
  return normalized || "未知市场";
}

function exchangeLabel(value: string): string {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "HKEX") return "港交所";
  if (normalized === "SSE") return "上交所";
  if (normalized === "SZSE") return "深交所";
  if (normalized === "NASDAQ" || normalized === "NMS" || normalized === "NGM") return "纳斯达克";
  if (normalized === "NYSE" || normalized === "NYQ") return "纽交所";
  if (normalized === "NYSE ARCA" || normalized === "ARCA" || normalized === "PCX") return "纽交所 Arca";
  if (normalized === "CRYPTO") return "加密市场";
  return String(value || "").trim();
}

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
      description: "先加入观察标的，工作台才会逐步形成组合和调仓范围。",
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

function valuationTemperatureMeta(score: number | null): { text: string; className: string } {
  if (score == null || !Number.isFinite(score)) return { text: "待分析", className: "text-[var(--muted)]" };
  if (score >= 62) return { text: "偏便宜", className: "text-emerald-300" };
  if (score <= 38) return { text: "偏贵", className: "text-rose-300" };
  return { text: "中性", className: "text-[var(--muted)]" };
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

function InsightMetricCard(props: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.62)] px-3 py-2.5 text-xs">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">{props.label}</div>
      <div className="mt-1.5 font-[var(--font-mono)] text-sm text-[var(--text)]">{props.value}</div>
      {props.hint ? <div className="mt-1 text-[11px] leading-5 text-[var(--muted)]">{props.hint}</div> : null}
    </div>
  );
}

function InlineInsights(props: {
  loading: boolean;
  error: string;
  data: WorkbenchAssetInsightResponse | null;
  feedbackContextId: string | null;
  feedbackSubmitting: boolean;
  feedbackScore: WorkbenchLlmFeedbackScore | null;
  onSubmitFeedback: (input: {
    contextId: string;
    type: "insight";
    score: WorkbenchLlmFeedbackScore;
  }) => void;
  onOpenFusionBreakdown?: () => void;
}) {
  if (props.loading) {
    return (
      <div className="flex items-center gap-2 rounded-[16px] border border-[var(--border)] bg-[rgba(8,12,20,0.62)] px-4 py-4 text-sm text-[var(--muted)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        正在加载洞察...
      </div>
    );
  }
  if (props.error) {
    return <DashboardErrorNotice title="洞察加载失败" description={props.error} className="rounded-[16px]" />;
  }
  if (!props.data) {
    return (
      <DashboardEmptyState
        title="暂无洞察"
        description="当前资产还没有生成洞察，可先刷新数据或切换其他标的。"
        className="px-4 py-5 text-left"
      />
    );
  }

  const opportunity = props.data.opportunity;
  const technical = props.data.technical;
  const news = props.data.news;
  const valuation = props.data.valuation;
  const llm = props.data.llmAnalysis;
  const priceSnapshot = props.data.priceSnapshot;
  const marketContext = props.data.marketContext;
  const marketAttribution = props.data.marketAttribution;
  const marketScopeContext = marketAttribution?.scope
    ? (marketContext?.scopes || []).find((item) => item.scope === marketAttribution.scope) || null
    : null;
  const displayMarketContext = marketScopeContext || marketContext;
  const displayMarketLabel = marketScopeContext?.label || marketAttribution?.scopeLabel || "组合摘要";
  const marketIndicatorMap = new Map(((displayMarketContext?.indicators || marketContext?.indicators) || []).map((item) => [item.key, item]));
  const marketIndicators = marketAttribution?.relevantKeys?.length
    ? marketAttribution.relevantKeys.flatMap((key) => {
        const indicator = marketIndicatorMap.get(key);
        return indicator ? [indicator] : [];
      })
    : (marketContext?.indicators || []);
  const aiMarketFacts = (
    llm?.marketFacts && llm.marketFacts.length > 0
      ? llm.marketFacts
      : (marketAttribution?.explanation?.length ? marketAttribution.explanation : (displayMarketContext?.reasons || marketContext?.reasons || []))
  ).slice(0, 3);
  const aiMarketRegime = llm?.marketRegime || displayMarketContext?.regime || marketContext?.regime || null;
  const valuationMetrics = (() => {
    if (!valuation) return [] as Array<{ key: string; label: string; value: string | number; unit?: string; description?: string }>;
    const seen = new Set<string>();
    const merged = [...valuation.common, ...valuation.specific];
    const out: typeof merged = [];
    for (const item of merged) {
      const dedupKey = `${String(item.key || "").trim().toLowerCase()}::${String(item.label || "").trim().toLowerCase()}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      out.push(item);
    }
    return out.slice(0, 8);
  })();

  return (
    <div className="space-y-4 rounded-[18px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(11,16,27,0.96),rgba(7,10,18,0.98))] p-4 sm:p-5">
      {priceSnapshot ? (
        <div className="grid gap-3 rounded-[16px] border border-[var(--border)] bg-[rgba(8,12,20,0.72)] p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">行情快照</div>
            <div className="mt-2 font-[var(--font-display)] text-[24px] leading-none tracking-[-0.03em] text-[var(--text)]">
              {currencySymbol(priceSnapshot.currency)} {priceSnapshot.price > 0 ? priceSnapshot.price.toFixed(4) : "-"}
            </div>
            <div className={cn("mt-2 text-sm", priceStatusClass(priceSnapshot.priceStatus))}>
              {priceStatusText(priceSnapshot.priceStatus)} · {priceStatusNote(priceSnapshot.priceStatus)}
            </div>
            <div className="mt-1 text-xs text-[var(--muted)]">行情更新时间：{formatDateTime(priceSnapshot.priceUpdatedAt)}</div>
            <div className="mt-1 text-xs text-[var(--muted)]">来源：{priceSnapshot.priceSource || "-"}</div>
          </div>
          <DaaSurfaceStatusPill tone={priceStatusTone(priceSnapshot.priceStatus)}>
            {priceStatusText(priceSnapshot.priceStatus)}
          </DaaSurfaceStatusPill>
        </div>
      ) : null}

      <Tabs defaultValue="opportunity" className="w-full">
        <TabsList className="flex h-auto w-full flex-wrap gap-1 rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.72)] p-1">
          {[
            ["opportunity", "机会"],
            ["technical", "技术"],
            ["valuation", "估值"],
            ["market", "市场"],
            ["news", "新闻"],
            ["llm", "AI 解读"],
          ].map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="flex-1 min-w-0 rounded-[10px] px-2 py-2 text-xs text-[var(--muted)] data-[state=active]:bg-[rgba(56,189,248,0.12)] data-[state=active]:text-[var(--text)]"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="opportunity" className="mt-4">
          <div className="space-y-3 text-sm text-[var(--muted)]">
            {opportunity ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <DaaSurfaceStatusPill tone="cyan">{opportunity.actionLabelZh}</DaaSurfaceStatusPill>
                  <DaaSurfaceStatusPill tone="indigo">强度 {opportunity.finalScorePct.toFixed(1)}%</DaaSurfaceStatusPill>
                  <DaaSurfaceStatusPill tone="slate">一致性 {opportunity.confidencePct.toFixed(1)}%</DaaSurfaceStatusPill>
                  {props.onOpenFusionBreakdown && opportunity.scores ? (
                    <button
                      type="button"
                      onClick={props.onOpenFusionBreakdown}
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[rgba(255,255,255,0.03)] px-2 py-1 text-[11px] text-[var(--muted)] transition-colors hover:border-[var(--primary)]/30 hover:text-[var(--primary)]"
                      title="查看融合分解"
                    >
                      <Info className="h-3 w-3" />
                      分解
                    </button>
                  ) : null}
                </div>
                {opportunity.scores ? (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <InsightMetricCard label="人因" value={opportunity.scores.human.toFixed(1)} />
                    <InsightMetricCard label="新闻" value={opportunity.scores.news.toFixed(1)} />
                    <InsightMetricCard label="技术" value={opportunity.scores.technical.toFixed(1)} />
                    <InsightMetricCard label="估值" value={opportunity.scores.valuation.toFixed(1)} />
                  </div>
                ) : null}
                <div className="rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.58)] px-4 py-3">{opportunity.reasonZh}</div>
                <div className="rounded-[14px] border border-amber-400/18 bg-amber-500/8 px-4 py-3 text-amber-100">{opportunity.riskZh}</div>
                {props.data.riskHints.length ? (
                  <div className="space-y-2 rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.56)] px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">风险提示</div>
                    <ul className="space-y-1.5 text-sm">
                      {props.data.riskHints.map((hint, idx) => (
                        <li key={`risk-hint-${idx}`} className="flex gap-2">
                          <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-[var(--amber)]" />
                          <span>{hint}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : (
              <DaaSurfaceEmptyState
                title="暂无机会评分"
                description="当前资产尚未形成完整的机会判断，建议等待数据刷新或展开其他洞察页签查看上下文。"
                className="border-0 bg-transparent px-0 py-2 text-left"
              />
            )}
          </div>
        </TabsContent>

        <TabsContent value="technical" className="mt-4">
          {technical ? (
            <div className="space-y-3 text-sm text-[var(--muted)]">
              <div className="flex flex-wrap items-center gap-2">
                <DaaSurfaceStatusPill tone="cyan">动量 {technical.momentumRegime}</DaaSurfaceStatusPill>
                <DaaSurfaceStatusPill tone="indigo">评分 {technical.scorePct.toFixed(1)}%</DaaSurfaceStatusPill>
                <DaaSurfaceStatusPill tone="slate">置信 {technical.confidencePct.toFixed(1)}%</DaaSurfaceStatusPill>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {[...technical.common, ...technical.specific].slice(0, 8).map((item) => (
                  <InsightMetricCard key={`${item.key}-${item.label}`} label={item.label} value={`${item.value}${item.unit || ""}`} hint={item.description} />
                ))}
              </div>
            </div>
          ) : (
            <DaaSurfaceEmptyState
              title="暂无技术面数据"
              description="技术指标尚未生成，通常是行情缓存刷新未完成或该资产暂无可计算信号。"
              className="border-0 bg-transparent px-0 py-2 text-left"
            />
          )}
        </TabsContent>

        <TabsContent value="valuation" className="mt-4">
          {valuation ? (
            <div className="space-y-3 text-sm text-[var(--muted)]">
              <div className="flex flex-wrap items-center gap-2">
                <DaaSurfaceStatusPill tone="amber">估值 {valuation.temperature === "cheap" ? "偏便宜" : valuation.temperature === "expensive" ? "偏贵" : "中性"}</DaaSurfaceStatusPill>
                <DaaSurfaceStatusPill tone="indigo">评分 {valuation.scorePct.toFixed(1)}%</DaaSurfaceStatusPill>
                <DaaSurfaceStatusPill tone="slate">置信 {valuation.confidencePct.toFixed(1)}%</DaaSurfaceStatusPill>
              </div>
              {valuation.reasons.length ? (
                <div className="rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.58)] px-4 py-3">{valuation.reasons.slice(0, 3).join("；")}</div>
              ) : null}
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {valuationMetrics.map((item) => (
                  <InsightMetricCard key={`${item.key}-${item.label}`} label={item.label} value={`${item.value}${item.unit || ""}`} hint={item.description} />
                ))}
              </div>
              {valuation.relative ? (
                <div className="rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.58)] px-4 py-3 text-sm">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">{valuation.relative.label}</div>
                  <div className="mt-2 font-[var(--font-mono)] text-base text-[var(--text)]">
                    {valuation.relative.value == null ? "-" : valuation.relative.value.toFixed(4)}
                  </div>
                  <div className="mt-1 text-xs text-[var(--muted)]">
                    {valuation.relative.percentile == null ? "-" : `相对位置 ${valuation.relative.percentile.toFixed(1)}%`}
                    {valuation.relative.trendPct == null ? "" : ` · 变化 ${valuation.relative.trendPct.toFixed(2)}%`}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <DaaSurfaceEmptyState
              title="暂无估值信号"
              description="估值数据暂不可用，建议结合技术面、新闻面以及实际持仓权重综合判断。"
              className="border-0 bg-transparent px-0 py-2 text-left"
            />
          )}
        </TabsContent>

        <TabsContent value="market" className="mt-4">
          {displayMarketContext ? (
            <div className="space-y-4 text-sm text-[var(--muted)]">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.58)] px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">{displayMarketLabel === "组合摘要" ? "组合摘要环境" : `${displayMarketLabel}环境`}</div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="font-[var(--font-mono)] text-base text-[var(--text)]">{marketRegimeLabel(displayMarketContext.regime)}</div>
                    <DaaSurfaceStatusPill tone={marketRegimeTone(displayMarketContext.regime)}>{marketRegimeLabel(displayMarketContext.regime)}</DaaSurfaceStatusPill>
                  </div>
                </div>
                <div className="rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.58)] px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">市场风险分</div>
                  <div className="mt-3 font-[var(--font-mono)] text-base text-[var(--text)]">{displayMarketContext.riskOffScorePct.toFixed(1)}%</div>
                  <div className="mt-1 text-xs text-[var(--muted)]">置信度 {displayMarketContext.confidencePct.toFixed(1)}%</div>
                </div>
                <div className="rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.58)] px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">建议仓位比例</div>
                  <div className="mt-3 font-[var(--font-mono)] text-base text-[var(--text)]">常规标的 {Math.round(displayMarketContext.buyScale * 100)}%</div>
                  <div className="mt-1 text-xs text-[var(--muted)]">高波动标的 {Math.round(displayMarketContext.highRiskBuyScale * 100)}%</div>
                </div>
              </div>

              <div className="rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.56)] px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">相关指标</div>
                  {marketAttribution?.relevantKeys?.length ? <DaaSurfaceStatusPill tone="indigo">{displayMarketLabel}</DaaSurfaceStatusPill> : null}
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {(marketIndicators.length > 0 ? marketIndicators : displayMarketContext.indicators).map((indicator) => {
                    const trend30d = formatSignedPercent(indicator.trend30dPct);
                    return (
                      <div key={indicator.key} className="rounded-[14px] border border-[rgba(129,140,248,0.18)] bg-[rgba(8,12,20,0.46)] px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-[var(--text)]">{indicator.label}</div>
                          <DaaSurfaceStatusPill tone={marketRegimeTone(indicator.stance === "neutral" ? null : indicator.stance)}>
                            {indicator.stance === "neutral" ? "中性" : marketRegimeLabel(indicator.stance)}
                          </DaaSurfaceStatusPill>
                        </div>
                        <div className="mt-3 font-[var(--font-mono)] text-base text-[var(--text)]">{formatMarketIndicatorValue(indicator.rawValue, indicator.unit)}</div>
                        <div className="mt-1 text-xs text-[var(--muted)]">
                          {marketPercentileText(indicator.percentile252)}
                          {trend30d ? ` · 30日 ${trend30d}` : ""}
                        </div>
                        <div className="mt-3 text-xs leading-6 text-[var(--muted)]">{indicator.reason}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.56)] px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">相关键位</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(marketAttribution?.relevantKeys?.length
                      ? marketAttribution.relevantKeys
                      : (marketIndicators.length > 0 ? marketIndicators.map((item) => item.key) : displayMarketContext.indicators.map((item) => item.key))
                    ).map((key) => (
                      <DaaSurfaceStatusPill key={key} tone="slate">{marketIndicatorKeyLabel(key)}</DaaSurfaceStatusPill>
                    ))}
                  </div>
                </div>
                <div className="rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.56)] px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">影响说明</div>
                  <ul className="mt-3 space-y-1.5 text-sm text-[var(--text)]">
                    {(marketAttribution?.explanation?.length ? marketAttribution.explanation : displayMarketContext.reasons).slice(0, 4).map((item, idx) => (
                      <li key={`market-exp-${idx}`} className="flex gap-2">
                        <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-[var(--indigo)]" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <DaaSurfaceEmptyState
              title="暂无市场上下文"
              description="市场状态层还没有可用快照，稍后刷新后可查看该资产受哪些市场指标影响。"
              className="border-0 bg-transparent px-0 py-2 text-left"
            />
          )}
        </TabsContent>

        <TabsContent value="news" className="mt-4">
          {news ? (
            <div className="space-y-3 text-sm text-[var(--muted)]">
              <div className="flex flex-wrap items-center gap-2">
                <DaaSurfaceStatusPill tone="cyan">新闻评分 {news.scorePct.toFixed(1)}%</DaaSurfaceStatusPill>
                <DaaSurfaceStatusPill tone="slate">置信 {news.confidencePct.toFixed(1)}%</DaaSurfaceStatusPill>
                <DaaSurfaceStatusPill tone="indigo">证据 {news.evidenceCount}</DaaSurfaceStatusPill>
              </div>
              {news.aiSummary?.summary ? (
                <div className="rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.58)] px-4 py-3">{news.aiSummary.summary}</div>
              ) : null}
              <div className="space-y-2">
                {(news.items || []).slice(0, 3).map((item) => (
                  <a
                    key={item.link || item.title}
                    href={item.link}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.54)] px-4 py-3 text-sm text-[var(--text)] transition-colors hover:border-[var(--primary)]/35 hover:text-[var(--primary)]"
                  >
                    <div className="font-medium">{item.title}</div>
                    <div className="mt-1 text-xs text-[var(--muted)]">{formatDateTime(item.ts)}</div>
                  </a>
                ))}
              </div>
            </div>
          ) : (
            <DaaSurfaceEmptyState
              title="暂无新闻洞察"
              description="可以稍后重试，或者先关注其他页签中已经就绪的结构化信号。"
              className="border-0 bg-transparent px-0 py-2 text-left"
            />
          )}
        </TabsContent>

        <TabsContent value="llm" className="mt-4">
          <div className="space-y-4 text-sm text-[var(--muted)]">
            {(marketContext || aiMarketFacts.length > 0) ? (
              <div className="rounded-[14px] border border-[rgba(129,140,248,0.18)] bg-[rgba(8,12,20,0.56)] px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">AI 依据</div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <DaaSurfaceStatusPill tone={marketRegimeTone(marketContext?.regime || null)}>
                    规则环境 {marketRegimeLabel(marketContext?.regime || null)}
                  </DaaSurfaceStatusPill>
                  <DaaSurfaceStatusPill tone={marketRegimeTone(aiMarketRegime)}>
                    AI 分析环境 {marketRegimeLabel(aiMarketRegime)}
                  </DaaSurfaceStatusPill>
                </div>
                {aiMarketFacts.length > 0 ? (
                  <ul className="mt-3 space-y-1.5 text-sm text-[var(--text)]">
                    {aiMarketFacts.map((item, idx) => (
                      <li key={`ai-market-${idx}`} className="flex gap-2">
                        <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-[var(--indigo)]" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-3 text-xs text-[var(--muted)]">当前暂无可用市场依据。</div>
                )}
              </div>
            ) : null}

            {llm && llm.status === "ok" ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <DaaSurfaceStatusPill tone="indigo">分析模型 {llm.provider}/{llm.model}</DaaSurfaceStatusPill>
                  <DaaSurfaceStatusPill tone="slate">生成于 {formatDateTime(llm.generatedAt)}</DaaSurfaceStatusPill>
                </div>
                <div className="rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.58)] px-4 py-3 text-[var(--text)]">{llm.summary}</div>
                {props.feedbackContextId ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <DaaSurfaceActionButton
                      tone={props.feedbackScore === "up" ? "success" : "slate"}
                      className="h-8 rounded-full px-3 text-xs"
                      disabled={props.feedbackSubmitting}
                      onClick={() => props.onSubmitFeedback({
                        contextId: props.feedbackContextId as string,
                        type: "insight",
                        score: "up",
                      })}
                    >
                      有用
                    </DaaSurfaceActionButton>
                    <DaaSurfaceActionButton
                      tone={props.feedbackScore === "down" ? "danger" : "slate"}
                      className="h-8 rounded-full px-3 text-xs"
                      disabled={props.feedbackSubmitting}
                      onClick={() => props.onSubmitFeedback({
                        contextId: props.feedbackContextId as string,
                        type: "insight",
                        score: "down",
                      })}
                    >
                      无用
                    </DaaSurfaceActionButton>
                    <span className="text-xs text-[var(--muted)]">
                      {props.feedbackSubmitting ? "提交中..." : props.feedbackScore ? "已记录反馈" : "请反馈本次 AI 解读质量"}
                    </span>
                  </div>
                ) : null}
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.56)] px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">机会</div>
                    <ul className="mt-2 space-y-1.5 text-sm text-[var(--text)]">
                      {llm.opportunityNotes.slice(0, 4).map((note, idx) => (
                        <li key={`op-${idx}`} className="flex gap-2">
                          <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
                          <span>{note}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.56)] px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">风险</div>
                    <ul className="mt-2 space-y-1.5 text-sm text-[var(--text)]">
                      {llm.riskNotes.slice(0, 4).map((note, idx) => (
                        <li key={`risk-${idx}`} className="flex gap-2">
                          <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-[var(--amber)]" />
                          <span>{note}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </>
            ) : (
              <DaaSurfaceEmptyState
                title="暂无 AI 解读"
                description="如果其他页签已有结构化信号，可以先据此判断；AI 解读生成后会同步展示在这里。"
                className="border-0 bg-transparent px-0 py-2 text-left"
              />
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
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
  insightData: WorkbenchAssetInsightResponse | null;
  expanded: boolean;
  insightLoading: boolean;
  insightError: string;
  llmFeedbackSubmittingByContext: Record<string, boolean>;
  llmFeedbackScoreByContext: Record<string, WorkbenchLlmFeedbackScore>;
  onAddToExecution: (row: AssetUniverseView, side: TradeTicketSide) => void;
  onToggleBasket: (row: AssetUniverseView, nextInBasket: boolean) => Promise<void>;
  onRemoveFromWatchlist: (row: AssetUniverseView) => Promise<void>;
  onOpenCalibration: (row: AssetUniverseView) => void;
  onToggleInlineInsights: (row: AssetUniverseView) => void;
  onSubmitLlmFeedback: (input: { contextId: string; type: "insight"; score: WorkbenchLlmFeedbackScore }) => void;
  onOpenFusionBreakdown: (assetKey: string) => void;
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

  const feedbackContextId = props.insightData?.llmAnalysis?.status === "ok"
    ? `insight:${row.assetKey}:${props.insightData?.llmAnalysis?.generatedAt || props.insightData?.generatedAt || ""}`
    : null;

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
            <DropdownMenuItem onClick={() => props.onToggleInlineInsights(row)} className="text-xs focus:bg-[rgba(56,189,248,0.12)] focus:text-[var(--text)]">
              {props.expanded ? "收起详情" : "展开详情"}
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

      {/* ── Inline insights (expanded) ── */}
      {props.expanded ? (
        <div className="border-t border-[var(--border)] px-4 py-4">
          <InlineInsights
            loading={props.insightLoading}
            error={props.insightError}
            data={props.insightData}
            feedbackContextId={feedbackContextId}
            feedbackSubmitting={Boolean(props.llmFeedbackSubmittingByContext[feedbackContextId || ""])}
            feedbackScore={feedbackContextId ? props.llmFeedbackScoreByContext[feedbackContextId] || null : null}
            onSubmitFeedback={props.onSubmitLlmFeedback}
            onOpenFusionBreakdown={() => props.onOpenFusionBreakdown(row.assetKey)}
          />
        </div>
      ) : null}
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
  insightDataByAssetKey: Record<string, WorkbenchAssetInsightResponse>;
  expandedInsightKeys: Record<string, boolean>;
  insightLoadingByAssetKey: Record<string, boolean>;
  insightErrorByAssetKey: Record<string, string>;
  llmFeedbackSubmittingByContext: Record<string, boolean>;
  llmFeedbackScoreByContext: Record<string, WorkbenchLlmFeedbackScore>;
  onAddToExecution: (row: AssetUniverseView, side: TradeTicketSide) => void;
  onToggleBasket: (row: AssetUniverseView, nextInBasket: boolean) => Promise<void>;
  onRemoveFromWatchlist: (row: AssetUniverseView) => Promise<void>;
  onOpenCalibration: (row: AssetUniverseView) => void;
  onToggleInlineInsights: (row: AssetUniverseView) => void;
  onSubmitLlmFeedback: (input: { contextId: string; type: "insight"; score: WorkbenchLlmFeedbackScore }) => void;
  onOpenFusionBreakdown: (assetKey: string) => void;
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
              insightData={props.insightDataByAssetKey[row.assetKey] || null}
              expanded={Boolean(props.expandedInsightKeys[row.assetKey])}
              insightLoading={Boolean(props.insightLoadingByAssetKey[row.assetKey])}
              insightError={props.insightErrorByAssetKey[row.assetKey] || ""}
              llmFeedbackSubmittingByContext={props.llmFeedbackSubmittingByContext}
              llmFeedbackScoreByContext={props.llmFeedbackScoreByContext}
              onAddToExecution={props.onAddToExecution}
              onToggleBasket={props.onToggleBasket}
              onRemoveFromWatchlist={props.onRemoveFromWatchlist}
              onOpenCalibration={props.onOpenCalibration}
              onToggleInlineInsights={props.onToggleInlineInsights}
              onSubmitLlmFeedback={props.onSubmitLlmFeedback}
              onOpenFusionBreakdown={props.onOpenFusionBreakdown}
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
  expandedInsightKeys: Record<string, boolean>;
  insightLoadingByAssetKey: Record<string, boolean>;
  insightErrorByAssetKey: Record<string, string>;
  insightDataByAssetKey: Record<string, WorkbenchAssetInsightResponse>;
  onToggleInlineInsights: (row: AssetUniverseView) => void;
  onSubmitLlmFeedback: (input: {
    contextId: string;
    type: "insight";
    score: WorkbenchLlmFeedbackScore;
  }) => void;
  llmFeedbackSubmittingByContext: Record<string, boolean>;
  llmFeedbackScoreByContext: Record<string, WorkbenchLlmFeedbackScore>;
  actioningAssetKey?: string | null;
  disabled?: boolean;
  updatingTarget?: boolean;
}) {
  const [keyword, setKeyword] = useState("");
  const [targetDrafts, setTargetDrafts] = useState<Record<string, string>>({});
  const [editingTargetKey, setEditingTargetKey] = useState<string | null>(null);
  const [fusionBreakdownKey, setFusionBreakdownKey] = useState<string | null>(null);
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

  const fusionBreakdownData = useMemo(() => {
    if (!fusionBreakdownKey) return null;
    const insight = props.insightDataByAssetKey[fusionBreakdownKey];
    if (!insight?.opportunity) return null;
    return {
      symbol: insight.symbol,
      scores: insight.opportunity.scores ?? null,
      finalScore: insight.opportunity.finalScorePct,
      confidence: insight.opportunity.confidencePct,
      action: insight.opportunity.action,
    };
  }, [fusionBreakdownKey, props.insightDataByAssetKey]);

  const handleOpenFusionBreakdown = useCallback((assetKey: string) => {
    setFusionBreakdownKey(assetKey);
  }, []);

  const handleCloseFusionBreakdown = useCallback((open: boolean) => {
    if (!open) setFusionBreakdownKey(null);
  }, []);

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
          insightDataByAssetKey={props.insightDataByAssetKey}
          expandedInsightKeys={props.expandedInsightKeys}
          insightLoadingByAssetKey={props.insightLoadingByAssetKey}
          insightErrorByAssetKey={props.insightErrorByAssetKey}
          llmFeedbackSubmittingByContext={props.llmFeedbackSubmittingByContext}
          llmFeedbackScoreByContext={props.llmFeedbackScoreByContext}
          onAddToExecution={props.onAddToExecution}
          onToggleBasket={props.onToggleBasket}
          onRemoveFromWatchlist={props.onRemoveFromWatchlist}
          onOpenCalibration={props.onOpenCalibration}
          onToggleInlineInsights={props.onToggleInlineInsights}
          onSubmitLlmFeedback={props.onSubmitLlmFeedback}
          onOpenFusionBreakdown={handleOpenFusionBreakdown}
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
                const expanded = Boolean(props.expandedInsightKeys[row.assetKey]);
                const rowValuation = localValuation(row);
                const rowPnlPct = unrealizedPnlPct(row);
                const valuationScore = props.insightDataByAssetKey[row.assetKey]?.valuation?.scorePct ?? null;
                const valuationTemp = valuationTemperatureMeta(valuationScore);
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

                const feedbackContextId = props.insightDataByAssetKey[row.assetKey]?.llmAnalysis?.status === "ok"
                  ? `insight:${row.assetKey}:${props.insightDataByAssetKey[row.assetKey]?.llmAnalysis?.generatedAt || props.insightDataByAssetKey[row.assetKey]?.generatedAt || ""}`
                  : null;

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
                        <div className={cn("mt-1 text-[10px]", valuationTemp.className)}>{valuationTemp.text}</div>
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
                              <DropdownMenuItem onClick={() => props.onToggleInlineInsights(row)} className="text-xs focus:bg-[rgba(56,189,248,0.12)] focus:text-[var(--text)]">
                                {expanded ? "收起详情" : "展开详情"}
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
                      </td>
                    </tr>

                    {expanded ? (
                      <tr className="border-b border-[var(--border)]/70 bg-[rgba(8,12,20,0.86)]">
                        <td colSpan={visibleColCount} className="px-4 py-4">
                          {/* 快速信息条 */}
                          <div className="flex flex-wrap gap-4 border-b border-[var(--border)] px-4 py-2.5 text-xs mb-4 -mx-4 -mt-4 rounded-t-[4px]">
                            <span className="text-[var(--faint)]">类型: {rowTypeSummary(row)} · {rowTypeDetail(row)}</span>
                            <span className={cn("", row.fxMissing ? "text-rose-200" : "text-[var(--faint)]")}>汇率: {fxLabel(row)}</span>
                            <span className={cn("", valuationTemp.className)}>估值温度: {valuationTemp.text}</span>
                            <span className="text-[var(--faint)]">{hfSignalButtonLabel(row.hfSignal)}</span>
                          </div>
                          <InlineInsights
                            loading={Boolean(props.insightLoadingByAssetKey[row.assetKey])}
                            error={props.insightErrorByAssetKey[row.assetKey] || ""}
                            data={props.insightDataByAssetKey[row.assetKey] || null}
                            feedbackContextId={feedbackContextId}
                            feedbackSubmitting={Boolean(props.llmFeedbackSubmittingByContext[feedbackContextId || ""])}
                            feedbackScore={feedbackContextId ? props.llmFeedbackScoreByContext[feedbackContextId] || null : null}
                            onSubmitFeedback={props.onSubmitLlmFeedback}
                            onOpenFusionBreakdown={() => handleOpenFusionBreakdown(row.assetKey)}
                          />
                        </td>
                      </tr>
                    ) : null}
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

      {/* Fusion score breakdown dialog */}
      <FusionScoreBreakdown
        symbol={fusionBreakdownData?.symbol ?? ""}
        scores={fusionBreakdownData?.scores ?? null}
        finalScore={fusionBreakdownData?.finalScore ?? 0}
        confidence={fusionBreakdownData?.confidence ?? 0}
        action={fusionBreakdownData?.action ?? ""}
        open={fusionBreakdownKey !== null && fusionBreakdownData !== null}
        onOpenChange={handleCloseFusionBreakdown}
      />
    </DaaSurfacePanel>
  );
}
