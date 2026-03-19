"use client";

import { Fragment, useMemo, useState } from "react";
import { Loader2, MoreHorizontal, Search } from "lucide-react";

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
  DeepLedgerActionButton,
  DeepLedgerEmptyState,
  DeepLedgerMiniStat,
  DeepLedgerPanel,
  DeepLedgerStatusPill,
  deepLedgerDenseFieldClassName,
  deepLedgerSearchShellClassName,
  deepLedgerTableHeadClassName,
  deepLedgerTableShellClassName,
} from "../../../_components/DeepLedgerUI";

export type AssetUniverseViewFilter = "all" | "holdings" | "watchlist" | "basket";
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

function rowTagSummary(row: AssetUniverseView): string | null {
  const merged = [...row.watchTags, ...row.holdingTags]
    .map((tag) => String(tag || "").trim())
    .filter(Boolean);
  const unique = Array.from(new Set(merged));
  if (unique.length === 0) return null;
  return unique.slice(0, 3).join(" / ");
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

function marketRegimeTone(regime: string | null | undefined) {
  if (regime === "risk_off") return "red" as const;
  if (regime === "risk_on") return "green" as const;
  if (regime === "transitional") return "amber" as const;
  return "slate" as const;
}

function marketRegimeLabel(regime: string | null | undefined): string {
  if (regime === "risk_off") return "偏防守";
  if (regime === "risk_on") return "偏进攻";
  if (regime === "transitional") return "过渡";
  return "待计算";
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
    <DeepLedgerActionButton
      tone={props.tone || "slate"}
      className={cn("h-8 rounded-full px-3 text-xs", props.className)}
      data-testid={props.testId}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.label}
    </DeepLedgerActionButton>
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
          <DeepLedgerStatusPill tone={priceStatusTone(priceSnapshot.priceStatus)}>
            {priceStatusText(priceSnapshot.priceStatus)}
          </DeepLedgerStatusPill>
        </div>
      ) : null}

      <Tabs defaultValue="opportunity" className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-6 rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.72)] p-1">
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
              className="rounded-[10px] px-2 py-2 text-xs text-[var(--muted)] data-[state=active]:bg-[rgba(56,189,248,0.12)] data-[state=active]:text-[var(--text)]"
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
                  <DeepLedgerStatusPill tone="cyan">{opportunity.actionLabelZh}</DeepLedgerStatusPill>
                  <DeepLedgerStatusPill tone="indigo">强度 {opportunity.finalScorePct.toFixed(1)}%</DeepLedgerStatusPill>
                  <DeepLedgerStatusPill tone="slate">一致性 {opportunity.confidencePct.toFixed(1)}%</DeepLedgerStatusPill>
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
              <DeepLedgerEmptyState
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
                <DeepLedgerStatusPill tone="cyan">动量 {technical.momentumRegime}</DeepLedgerStatusPill>
                <DeepLedgerStatusPill tone="indigo">评分 {technical.scorePct.toFixed(1)}%</DeepLedgerStatusPill>
                <DeepLedgerStatusPill tone="slate">置信 {technical.confidencePct.toFixed(1)}%</DeepLedgerStatusPill>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {[...technical.common, ...technical.specific].slice(0, 8).map((item) => (
                  <InsightMetricCard key={`${item.key}-${item.label}`} label={item.label} value={`${item.value}${item.unit || ""}`} hint={item.description} />
                ))}
              </div>
            </div>
          ) : (
            <DeepLedgerEmptyState
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
                <DeepLedgerStatusPill tone="amber">估值 {valuation.temperature === "cheap" ? "偏便宜" : valuation.temperature === "expensive" ? "偏贵" : "中性"}</DeepLedgerStatusPill>
                <DeepLedgerStatusPill tone="indigo">评分 {valuation.scorePct.toFixed(1)}%</DeepLedgerStatusPill>
                <DeepLedgerStatusPill tone="slate">置信 {valuation.confidencePct.toFixed(1)}%</DeepLedgerStatusPill>
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
            <DeepLedgerEmptyState
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
                    <DeepLedgerStatusPill tone={marketRegimeTone(displayMarketContext.regime)}>{marketRegimeLabel(displayMarketContext.regime)}</DeepLedgerStatusPill>
                  </div>
                </div>
                <div className="rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.58)] px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">市场风险分</div>
                  <div className="mt-3 font-[var(--font-mono)] text-base text-[var(--text)]">{displayMarketContext.riskOffScorePct.toFixed(1)}%</div>
                  <div className="mt-1 text-xs text-[var(--muted)]">置信度 {displayMarketContext.confidencePct.toFixed(1)}%</div>
                </div>
                <div className="rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.58)] px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">买入执行系数</div>
                  <div className="mt-3 font-[var(--font-mono)] text-base text-[var(--text)]">普通 {Math.round(displayMarketContext.buyScale * 100)}%</div>
                  <div className="mt-1 text-xs text-[var(--muted)]">高波动资产 {Math.round(displayMarketContext.highRiskBuyScale * 100)}%</div>
                </div>
              </div>

              <div className="rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.56)] px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">相关指标</div>
                  {marketAttribution?.relevantKeys?.length ? <DeepLedgerStatusPill tone="indigo">{displayMarketLabel}</DeepLedgerStatusPill> : null}
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {(marketIndicators.length > 0 ? marketIndicators : displayMarketContext.indicators).map((indicator) => {
                    const trend30d = formatSignedPercent(indicator.trend30dPct);
                    return (
                      <div key={indicator.key} className="rounded-[14px] border border-[rgba(129,140,248,0.18)] bg-[rgba(8,12,20,0.46)] px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-[var(--text)]">{indicator.label}</div>
                          <DeepLedgerStatusPill tone={marketRegimeTone(indicator.stance === "neutral" ? null : indicator.stance)}>
                            {indicator.stance === "neutral" ? "中性" : marketRegimeLabel(indicator.stance)}
                          </DeepLedgerStatusPill>
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
                      <DeepLedgerStatusPill key={key} tone="slate">{marketIndicatorKeyLabel(key)}</DeepLedgerStatusPill>
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
            <DeepLedgerEmptyState
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
                <DeepLedgerStatusPill tone="cyan">新闻评分 {news.scorePct.toFixed(1)}%</DeepLedgerStatusPill>
                <DeepLedgerStatusPill tone="slate">置信 {news.confidencePct.toFixed(1)}%</DeepLedgerStatusPill>
                <DeepLedgerStatusPill tone="indigo">证据 {news.evidenceCount}</DeepLedgerStatusPill>
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
            <DeepLedgerEmptyState
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
                  <DeepLedgerStatusPill tone={marketRegimeTone(marketContext?.regime || null)}>
                    规则环境 {marketRegimeLabel(marketContext?.regime || null)}
                  </DeepLedgerStatusPill>
                  <DeepLedgerStatusPill tone={marketRegimeTone(aiMarketRegime)}>
                    AI 分析环境 {marketRegimeLabel(aiMarketRegime)}
                  </DeepLedgerStatusPill>
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
                  <DeepLedgerStatusPill tone="indigo">分析模型 {llm.provider}/{llm.model}</DeepLedgerStatusPill>
                  <DeepLedgerStatusPill tone="slate">生成于 {formatDateTime(llm.generatedAt)}</DeepLedgerStatusPill>
                </div>
                <div className="rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.58)] px-4 py-3 text-[var(--text)]">{llm.summary}</div>
                {props.feedbackContextId ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <DeepLedgerActionButton
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
                    </DeepLedgerActionButton>
                    <DeepLedgerActionButton
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
                    </DeepLedgerActionButton>
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
              <DeepLedgerEmptyState
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
  const hasKeyword = keyword.trim().length > 0;

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
    if (!Number.isFinite(next) || next < 0) return;
    await props.onUpdateTargetWeight(row, normalizeTargetWeightPct(next));
    setTargetDrafts((prev) => {
      const nextState = { ...prev };
      delete nextState[row.assetKey];
      return nextState;
    });
  }

  return (
    <DeepLedgerPanel
      title="观察与再平衡"
      accent={props.view === "holdings" ? "cyan" : "amber"}
      bodyClassName="space-y-5"
      action={<DeepLedgerStatusPill tone={props.view === "holdings" ? "cyan" : "amber"}>当前 {filteredRows.length} 个标的</DeepLedgerStatusPill>}
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
        <div className="rounded-[18px] border border-[var(--border)] bg-[linear-gradient(135deg,rgba(15,23,38,0.98),rgba(9,14,24,0.94))] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-[var(--font-display)] text-[28px] leading-none tracking-[-0.03em] text-[var(--text)]">
                {viewLabel(props.view)}
              </div>
              <div className="mt-3 max-w-2xl text-[13px] leading-6 text-[var(--muted)]">
                先把标的加入观察列表，再填写目标仓位；目标大于 0 就会进入调仓范围，但这里只改目标，不会直接下单。
              </div>
            </div>
            <DeepLedgerActionButton
              tone="slate"
              className="h-9 rounded-full px-4 text-xs"
              onClick={() => void props.onNormalizeTargetWeights()}
              disabled={props.disabled || props.updatingTarget}
            >
              {props.updatingTarget ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
{props.updatingTarget ? "处理中..." : "目标仓位补齐到 100%"}
            </DeepLedgerActionButton>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
          <DeepLedgerMiniStat label="持仓资产" value={props.counts.holdings} tone="cyan" />
          <DeepLedgerMiniStat label="观察资产" value={props.counts.watchlist} tone="amber" />
          <DeepLedgerMiniStat label="再平衡篮子" value={props.counts.basket} tone="indigo" />
          <div className="rounded-[16px] border border-[var(--border)] bg-[rgba(8,12,20,0.74)] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">搜索标的</div>
              {hasKeyword ? <DeepLedgerStatusPill tone="indigo">筛选中</DeepLedgerStatusPill> : null}
            </div>
            <div className={cn(deepLedgerSearchShellClassName, "mt-2 h-9")}>
              <Search className="h-3.5 w-3.5 text-[var(--faint)]" />
              <input
                name="asset-search-keyword"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                className="h-9 w-full bg-transparent text-xs text-[var(--text)] outline-none placeholder:text-[var(--faint)]"
                placeholder="搜索代码、市场或行情映射"
              />
            </div>
            <div className="mt-2 flex min-h-5 items-center justify-end text-[11px]">
              {hasKeyword ? (
                <DeepLedgerActionButton tone="slate" className="h-7 rounded-full px-2.5 text-[11px]" onClick={() => setKeyword("")}>
                  清空搜索
                </DeepLedgerActionButton>
              ) : (
                <span className="text-[11px] text-[var(--faint)]">支持代码、市场、行情映射模糊过滤</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className={cn(deepLedgerTableShellClassName, "overflow-x-auto")}>
        <div className="border-b border-[var(--border)] bg-[rgba(255,255,255,0.02)] px-4 py-2.5 text-[11px] text-[var(--faint)]">
          表格较宽，右侧买卖区固定；建议先看偏离和汇率，再决定操作。
        </div>
        <TooltipProvider delayDuration={120}>
          <table className="min-w-[1320px] w-full border-collapse">
            <colgroup>
              <col className="w-[280px]" />
              <col className="w-[170px]" />
              <col className="w-[140px]" />
              <col className="w-[130px]" />
              <col className="w-[160px]" />
              <col className="w-[150px]" />
              <col className="w-[170px]" />
              <col className="w-[130px]" />
              <col className="w-[240px]" />
              <col className="w-[90px]" />
              <col className="w-[168px]" />
            </colgroup>
            <thead>
              <tr>
                <th className={deepLedgerTableHeadClassName}>标的 / 定位</th>
                <th className={deepLedgerTableHeadClassName}>类型 / 补充</th>
                <th className={cn(deepLedgerTableHeadClassName, "text-right")}>持仓 / 成本</th>
                <th className={cn(deepLedgerTableHeadClassName, "text-right")}>价格 / 刷新</th>
                <th className={cn(deepLedgerTableHeadClassName, "text-right")}>本币估值</th>
                <th className={cn(deepLedgerTableHeadClassName, "text-right")}>实际 / 浮盈亏</th>
                <th className={cn(deepLedgerTableHeadClassName, "text-right")}>目标仓位</th>
                <th className={cn(deepLedgerTableHeadClassName, "text-right")}>偏离</th>
                <th className={deepLedgerTableHeadClassName}>人因 / 观点</th>
                <th className={cn(deepLedgerTableHeadClassName, "text-right")}>汇率</th>
                <th className="sticky right-0 z-20 border-b border-[var(--border)] bg-[rgba(7,10,18,0.98)] px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--faint)]">操作区</th>
              </tr>
            </thead>
            <tbody>
              {tableEntries.map((entry) => {
                if (entry.type === "group") {
                  return (
                    <tr key={`group-${entry.key}`} className="border-b border-[var(--border)]/70 bg-[rgba(255,255,255,0.03)]">
                      <td colSpan={11} className="px-4 py-3">
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
                const targetDraft = draftTargetValue(row);
                const targetDraftNum = Number(targetDraft);
                const targetChanged = Number.isFinite(targetDraftNum) && Math.abs(targetDraftNum - normalizeTargetWeightPct(row.targetWeightPct)) > 1e-6;
                const targetInvalid = !Number.isFinite(targetDraftNum) || targetDraftNum < 0;
                const buyDisabled = props.disabled || !(price > 0);
                const sellDisabled = props.disabled || !(price > 0) || !(row.holdingQty > 0);
                const actionBusy = props.actioningAssetKey === row.assetKey;
                const inBasket = isInBasket(row);
                const expanded = Boolean(props.expandedInsightKeys[row.assetKey]);
                const rowValuation = localValuation(row);
                const rowGapLabel = gapLabel(row.gapPct);
                const gapBarWidth = row.gapPct == null ? 0 : Math.min(100, Math.max(8, Math.abs(row.gapPct) * 1000));
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

                return (
                  <Fragment key={row.assetKey}>
                    <tr className="border-b border-[var(--border)]/70 text-[12px] transition-colors hover:bg-[rgba(56,189,248,0.04)]">
                      <td className="px-4 py-3 align-top">
                        <div className="max-w-[320px]">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-semibold tracking-[-0.01em] text-[var(--text)]">{row.symbol}</div>
                            <DeepLedgerStatusPill tone={rowStatusTone({ holdingQty: row.holdingQty, watchEnabled: row.watchEnabled, inBasket })}>
                              {rowStatusLabel({ holdingQty: row.holdingQty, watchEnabled: row.watchEnabled, inBasket })}
                            </DeepLedgerStatusPill>
                          </div>
                          <div className="mt-1 truncate text-[10px] uppercase tracking-[0.14em] text-[var(--faint)]">
                            {rowMarketLine(row)}
                          </div>
                          {row.notes ? <div className="mt-2 truncate text-[11px] leading-5 text-[var(--muted)]">{row.notes}</div> : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-[11px] text-[var(--muted)]">
                        <div className="truncate">{row.assetClass} · {row.region}</div>
                        <div className="mt-1 text-[11px] text-[var(--faint)]">{row.instrumentType || row.exchange || "类型待补充"}</div>
                        {tagSummary ? <div className="mt-2 text-[11px] text-[var(--faint)]">标签：{tagSummary}</div> : null}
                      </td>
                      <td className="px-4 py-3 text-right align-top font-[var(--font-mono)] text-[13px] text-[var(--text)]">
                        <div>{row.holdingQty.toFixed(4)}</div>
                        {row.holdingQty > 0 ? (
                          <div className="mt-1 text-[11px] text-[var(--muted)]">
                            成本 {currencySymbol(row.currency)} {holdingCostPerUnit(row).toFixed(4)}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right align-top font-[var(--font-mono)] text-[13px] text-[var(--text)]">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="inline-flex cursor-default flex-col items-end">
                              <div>{priceLabel(row)}</div>
                              <div className="mt-1"><DeepLedgerStatusPill tone={priceStatusTone(row.priceStatus)}>{priceStatusLabel(row)}</DeepLedgerStatusPill></div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs border-[var(--border)] bg-[rgba(8,12,20,0.98)] text-[var(--text)]">
                            <div className="text-xs font-medium">行情更新时间：{formatDateTime(row.priceUpdatedAt)}</div>
                            <div className="mt-1 text-xs text-[var(--muted)]">系统最近一次成功拉取并写入本地行情的时间。</div>
                            <div className="mt-1 text-xs text-[var(--muted)]">来源：{row.priceSource || "-"}</div>
                          </TooltipContent>
                        </Tooltip>
                      </td>
                      <td className="px-4 py-3 text-right align-top font-[var(--font-mono)] text-sm text-[var(--text)]">
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
                      <td className="px-4 py-3 text-right align-top">
                        <div className="font-[var(--font-mono)] text-sm text-[var(--text)]">{formatPercent(row.actualWeightPct)}</div>
                        {rowPnlPct != null ? (
                          <div className={cn("mt-1 text-[11px]", rowPnlPct >= 0 ? "text-emerald-300" : "text-rose-300")}>
                            浮盈亏 {rowPnlPct.toFixed(2)}%
                          </div>
                        ) : null}
                        <div className={cn("mt-1 text-[11px]", valuationTemp.className)}>估值温度 {valuationTemp.text}</div>
                      </td>
                      <td className="px-4 py-3 text-right align-top">
                        <div className="flex justify-end gap-2">
                          <input
                            name={`target-weight-${row.assetKey}`}
                            value={targetDraft}
                            onChange={(event) => {
                              const value = event.target.value;
                              setTargetDrafts((prev) => ({ ...prev, [row.assetKey]: value }));
                            }}
                            className={cn(deepLedgerDenseFieldClassName, "w-24 text-right font-[var(--font-mono)] text-[12px]")}
                            type="number"
                            min="0"
                            step="0.01"
                            disabled={props.disabled || props.updatingTarget}
                            data-testid={`workbench-target-${row.assetKey}`}
                          />
                          <DeepLedgerActionButton
                            tone="slate"
                            className="h-9 min-w-[64px] rounded-[12px] px-3 text-[11px]"
                            onClick={() => void handleSaveTarget(row)}
                            disabled={props.disabled || props.updatingTarget || !targetChanged || targetInvalid}
                            data-testid={`workbench-target-save-${row.assetKey}`}
                          >
                            保存
                          </DeepLedgerActionButton>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right align-top">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="inline-flex cursor-default flex-col items-end gap-2">
                              <span className={cn("text-xs font-semibold", rowGapLabel.className)}>{rowGapLabel.text}</span>
                              <span className="h-1.5 w-20 overflow-hidden rounded-full bg-[rgba(255,255,255,0.08)]">
                                <span className={cn("block h-full rounded-full", rowGapLabel.barClassName)} style={{ width: `${gapBarWidth}%` }} />
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="border-[var(--border)] bg-[rgba(8,12,20,0.98)] text-[var(--text)]">
                            <div className="text-xs">目标差值 = 目标权重 - 当前权重</div>
                          </TooltipContent>
                        </Tooltip>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[rgba(255,255,255,0.03)] px-3 py-1.5 text-xs text-[var(--text)]"
                            >
                              <span className="text-base leading-none">{hfSignalIcon(row.hfSignal)}</span>
                              <span>{row.hfSignal?.label || "暂无人因"}</span>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs border-[var(--border)] bg-[rgba(8,12,20,0.98)] text-[var(--text)]">
                            {row.hfSignal ? (
                              <div className="space-y-1.5">
                                <div className="text-xs font-medium">{row.hfSignal.icon} {row.hfSignal.label}</div>
                                <div className="text-xs text-[var(--muted)]">
                                  信号强度 {row.hfSignal.aggregatedScorePct.toFixed(1)}% · 一致性 {row.hfSignal.convictionPct.toFixed(1)}%
                                </div>
                                <div className="text-xs text-[var(--muted)]">
                                  观点偏离度 {row.hfSignal.thesisDriftPct.toFixed(1)}% · {hfTrendLabel(row.hfSignal.trend)}
                                </div>
                                {row.hfSignal.funds.length ? (
                                  <div className="space-y-1">
                                    {row.hfSignal.funds.slice(0, 3).map((fund) => (
                                      <div key={`${fund.fundCode}-${fund.weightPct}`} className="text-xs text-[var(--muted)]">
                                        {normalizeFundLabel(fund.fundName, fund.fundCode)} · 当前仓位 {fund.weightPct.toFixed(1)}% · 变动 {fund.changePct >= 0 ? "+" : ""}{fund.changePct.toFixed(1)}%
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            ) : (
                              <div className="text-xs text-[var(--muted)]">暂无人因信号</div>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </td>
                      <td className={cn("px-4 py-3 text-right align-top font-[var(--font-mono)] text-xs", row.fxMissing ? "text-rose-200" : "text-[var(--muted)]")}>
                        {fxLabel(row)}
                      </td>
                      <td className="sticky right-0 z-10 bg-[rgba(7,10,18,0.98)] px-4 py-3 text-right align-top">
                        <div className="flex w-[136px] flex-col gap-2 ml-auto">
                          <ActionButton
                            label="买入"
                            testId={`workbench-buy-${row.assetKey}`}
                            disabled={buyDisabled}
                            reason={buyReason}
                            tone="success"
                            className="w-full justify-center"
                            onClick={() => props.onAddToExecution(row, "BUY")}
                          />
                          <ActionButton
                            label="卖出"
                            testId={`workbench-sell-${row.assetKey}`}
                            disabled={sellDisabled}
                            reason={sellReason}
                            tone="warning"
                            className="w-full justify-center"
                            onClick={() => props.onAddToExecution(row, "SELL")}
                          />
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <DeepLedgerActionButton
                                tone="slate"
                                className="h-8 w-full justify-center rounded-full px-3 text-[11px]"
                                disabled={Boolean(props.disabled)}
                              >
                                <MoreHorizontal className="h-3.5 w-3.5" />
                                更多
                              </DeepLedgerActionButton>
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
                        <td colSpan={11} className="px-4 py-4">
                          <InlineInsights
                            loading={Boolean(props.insightLoadingByAssetKey[row.assetKey])}
                            error={props.insightErrorByAssetKey[row.assetKey] || ""}
                            data={props.insightDataByAssetKey[row.assetKey] || null}
                            feedbackContextId={feedbackContextId}
                            feedbackSubmitting={Boolean(props.llmFeedbackSubmittingByContext[feedbackContextId || ""])}
                            feedbackScore={feedbackContextId ? props.llmFeedbackScoreByContext[feedbackContextId] || null : null}
                            onSubmitFeedback={props.onSubmitLlmFeedback}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}

              {tableEntries.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center">
                    <DeepLedgerEmptyState
                      title="当前筛选条件下暂无资产"
                      description="可以清空搜索关键词，或切换到其他视图继续检查持仓与观察池。"
                      action={hasKeyword ? <DeepLedgerActionButton tone="slate" onClick={() => setKeyword("")}>清空搜索</DeepLedgerActionButton> : null}
                      className="border-0 bg-transparent px-0 py-0"
                    />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </TooltipProvider>
      </div>
    </DeepLedgerPanel>
  );
}
