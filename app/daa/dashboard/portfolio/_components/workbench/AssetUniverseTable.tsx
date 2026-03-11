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
import { formatCurrency, formatDateTimeV1, formatPercent } from "@/app/daa/dashboard/_components/daaFormatters";
import { DashboardEmptyStateV1, DashboardErrorNoticeV1 } from "@/app/daa/dashboard/_components/DashboardFeedbackV1";
import { cn } from "@/lib/utils";
import type { TradeTicketSideV1 } from "@/src/daa/modules/trade/tradeTypesV1";
import type {
  AssetUniverseViewV1,
  WorkbenchAssetInsightResponseV1,
  WorkbenchLlmFeedbackScoreV1,
} from "@/src/daa/modules/workbench/workbenchTypesV1";

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

export type AssetUniverseViewFilterV1 = "all" | "holdings" | "watchlist" | "basket";
type HoldingGroupKeyV1 = "stock" | "etf" | "bond" | "crypto";

const HOLDING_GROUP_META_V1: Array<{ key: HoldingGroupKeyV1; label: string }> = [
  { key: "stock", label: "股票" },
  { key: "etf", label: "ETF" },
  { key: "bond", label: "债券" },
  { key: "crypto", label: "加密" },
];

function normalizeTargetWeightPctV1(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function formatTargetWeightDraftV1(value: number): string {
  return normalizeTargetWeightPctV1(value).toFixed(2);
}

function isInBasketV1(row: AssetUniverseViewV1): boolean {
  return row.watchEnabled && row.targetWeightHint > 0;
}

function passFilter(row: AssetUniverseViewV1, view: AssetUniverseViewFilterV1): boolean {
  if (view === "holdings") return row.holdingQty > 0;
  if (view === "watchlist") return row.watchEnabled;
  if (view === "basket") return isInBasketV1(row);
  return row.watchEnabled || row.holdingQty > 0;
}

function viewLabelV1(view: AssetUniverseViewFilterV1): string {
  if (view === "holdings") return "持仓视图";
  if (view === "watchlist") return "观察列表";
  if (view === "basket") return "再平衡篮子";
  return "全部资产";
}

function fxLabel(row: AssetUniverseViewV1): string {
  if (row.currency === "") return "-";
  if (row.fxMissing) return "缺失";
  if (row.fxRateToBase == null) return "-";
  return row.fxRateToBase.toFixed(4);
}

function currencySymbolV1(currency: string): string {
  const ccy = String(currency || "").trim().toUpperCase();
  if (ccy === "CNY" || ccy === "RMB") return "¥";
  if (ccy === "HKD") return "HK$";
  if (ccy === "EUR") return "€";
  if (ccy === "USD") return "$";
  if (ccy === "USDC") return "USDC";
  return ccy || "-";
}

function priceLabel(row: AssetUniverseViewV1): string {
  const price = row.lastPrice > 0 ? row.lastPrice : row.holdingPrice;
  if (!(price > 0)) return "-";
  return `${currencySymbolV1(row.currency)} ${price.toFixed(4)}`;
}

function priceStatusTextV1(status: string): string {
  if (status === "fresh") return "最新";
  if (status === "stale") return "价格偏旧";
  if (status === "unsupported") return "不支持自动行情";
  return "无价格";
}

function priceStatusLabel(row: AssetUniverseViewV1): string {
  return priceStatusTextV1(row.priceStatus);
}

function priceStatusToneV1(status: string): "green" | "amber" | "red" | "slate" {
  if (status === "fresh") return "green";
  if (status === "stale") return "amber";
  if (status === "unsupported") return "slate";
  return "red";
}

function priceStatusClass(row: AssetUniverseViewV1): string {
  return priceStatusClassV1(row.priceStatus);
}

function priceStatusClassV1(status: string): string {
  if (status === "fresh") return "text-emerald-300";
  if (status === "stale") return "text-amber-200";
  if (status === "unsupported") return "text-slate-300";
  return "text-rose-200";
}

function priceStatusNoteV1(status: string): string {
  if (status === "fresh") return "已按最新可得行情刷新。";
  if (status === "stale") return "当前展示的是较旧缓存，建议结合最新市场状态判断。";
  if (status === "unsupported") return "该标的不支持自动行情映射。";
  return "当前暂无可用行情。";
}

function marketRegimeToneV1(regime: string | null | undefined) {
  if (regime === "risk_off") return "red" as const;
  if (regime === "risk_on") return "green" as const;
  if (regime === "transitional") return "amber" as const;
  return "slate" as const;
}

function marketRegimeLabelV1(regime: string | null | undefined): string {
  if (regime === "risk_off") return "偏防守";
  if (regime === "risk_on") return "偏进攻";
  if (regime === "transitional") return "过渡";
  return "待计算";
}

function marketIndicatorKeyLabelV1(key: string): string {
  if (key === "vix") return "VIX";
  if (key === "qqq_spy_ratio") return "QQQ/SPY";
  if (key === "fxi_volatility") return "FXI 波动率";
  if (key === "kweb_fxi_ratio") return "KWEB/FXI";
  if (key === "btc_eth_ratio") return "BTC/ETH";
  if (key === "btc_volatility") return "BTC 波动率";
  if (key === "gold_silver_ratio") return "金银比";
  return key;
}

function marketPercentileTextV1(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "近一年位置 N/A";
  return `近一年位置 ${value.toFixed(1)}%`;
}

function formatMarketIndicatorValueV1(value: number | null | undefined, unit?: string): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  if (unit === "%") return `${value.toFixed(1)}%`;
  if (unit === "x") return `${value.toFixed(2)}x`;
  if (Math.abs(value) >= 100) return value.toFixed(1);
  if (Math.abs(value) >= 10) return value.toFixed(2);
  return value.toFixed(3);
}

function formatSignedPercentV1(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
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

function holdingCostPerUnitV1(row: AssetUniverseViewV1): number {
  if (row.costBasis != null && row.costBasis > 0 && row.holdingQty > 0) return row.costBasis / row.holdingQty;
  return row.holdingPrice > 0 ? row.holdingPrice : 0;
}

function unrealizedPnlPctV1(row: AssetUniverseViewV1): number | null {
  const px = row.lastPrice > 0 ? row.lastPrice : row.holdingPrice;
  const cost = holdingCostPerUnitV1(row);
  if (!(px > 0) || !(cost > 0) || !(row.holdingQty > 0)) return null;
  return ((px - cost) / cost) * 100;
}

function gapLabelV1(gapPct: number | null): { text: string; className: string; barClassName: string } {
  if (gapPct == null) return { text: "-", className: "text-[var(--faint)]", barClassName: "bg-[rgba(148,163,184,0.3)]" };
  if (gapPct > 0.01) {
    return { text: `低配 ${formatPercent(gapPct)}`, className: "text-emerald-300", barClassName: "bg-emerald-400" };
  }
  if (gapPct < -0.01) {
    return { text: `超配 ${formatPercent(Math.abs(gapPct))}`, className: "text-amber-200", barClassName: "bg-amber-300" };
  }
  return { text: "接近目标", className: "text-[var(--muted)]", barClassName: "bg-[var(--primary)]" };
}

function valuationTemperatureMetaV1(score: number | null): { text: string; className: string } {
  if (score == null || !Number.isFinite(score)) return { text: "待分析", className: "text-[var(--muted)]" };
  if (score >= 62) return { text: "偏便宜", className: "text-emerald-300" };
  if (score <= 38) return { text: "偏贵", className: "text-rose-300" };
  return { text: "中性", className: "text-[var(--muted)]" };
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

function InsightMetricCardV1(props: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.62)] px-3 py-2.5 text-xs">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">{props.label}</div>
      <div className="mt-1.5 font-[var(--font-mono)] text-sm text-[var(--text)]">{props.value}</div>
      {props.hint ? <div className="mt-1 text-[11px] leading-5 text-[var(--muted)]">{props.hint}</div> : null}
    </div>
  );
}

function InlineInsightsV1(props: {
  loading: boolean;
  error: string;
  data: WorkbenchAssetInsightResponseV1 | null;
  feedbackContextId: string | null;
  feedbackSubmitting: boolean;
  feedbackScore: WorkbenchLlmFeedbackScoreV1 | null;
  onSubmitFeedback: (input: {
    contextId: string;
    type: "insight";
    score: WorkbenchLlmFeedbackScoreV1;
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
    return <DashboardErrorNoticeV1 title="洞察加载失败" description={props.error} className="rounded-[16px]" />;
  }
  if (!props.data) {
    return (
      <DashboardEmptyStateV1
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
              {currencySymbolV1(priceSnapshot.currency)} {priceSnapshot.price > 0 ? priceSnapshot.price.toFixed(4) : "-"}
            </div>
            <div className={cn("mt-2 text-sm", priceStatusClassV1(priceSnapshot.priceStatus))}>
              {priceStatusTextV1(priceSnapshot.priceStatus)} · {priceStatusNoteV1(priceSnapshot.priceStatus)}
            </div>
            <div className="mt-1 text-xs text-[var(--muted)]">行情更新时间：{formatDateTimeV1(priceSnapshot.priceUpdatedAt)}</div>
            <div className="mt-1 text-xs text-[var(--muted)]">来源：{priceSnapshot.priceSource || "-"}</div>
          </div>
          <DeepLedgerStatusPill tone={priceStatusToneV1(priceSnapshot.priceStatus)}>
            {priceStatusTextV1(priceSnapshot.priceStatus)}
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
                    <InsightMetricCardV1 label="人因" value={opportunity.scores.human.toFixed(1)} />
                    <InsightMetricCardV1 label="新闻" value={opportunity.scores.news.toFixed(1)} />
                    <InsightMetricCardV1 label="技术" value={opportunity.scores.technical.toFixed(1)} />
                    <InsightMetricCardV1 label="估值" value={opportunity.scores.valuation.toFixed(1)} />
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
                  <InsightMetricCardV1 key={`${item.key}-${item.label}`} label={item.label} value={`${item.value}${item.unit || ""}`} hint={item.description} />
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
                  <InsightMetricCardV1 key={`${item.key}-${item.label}`} label={item.label} value={`${item.value}${item.unit || ""}`} hint={item.description} />
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
                    <div className="font-[var(--font-mono)] text-base text-[var(--text)]">{marketRegimeLabelV1(displayMarketContext.regime)}</div>
                    <DeepLedgerStatusPill tone={marketRegimeToneV1(displayMarketContext.regime)}>{marketRegimeLabelV1(displayMarketContext.regime)}</DeepLedgerStatusPill>
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
                    const trend30d = formatSignedPercentV1(indicator.trend30dPct);
                    return (
                      <div key={indicator.key} className="rounded-[14px] border border-[rgba(129,140,248,0.18)] bg-[rgba(8,12,20,0.46)] px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-[var(--text)]">{indicator.label}</div>
                          <DeepLedgerStatusPill tone={marketRegimeToneV1(indicator.stance === "neutral" ? null : indicator.stance)}>
                            {indicator.stance === "neutral" ? "中性" : marketRegimeLabelV1(indicator.stance)}
                          </DeepLedgerStatusPill>
                        </div>
                        <div className="mt-3 font-[var(--font-mono)] text-base text-[var(--text)]">{formatMarketIndicatorValueV1(indicator.rawValue, indicator.unit)}</div>
                        <div className="mt-1 text-xs text-[var(--muted)]">
                          {marketPercentileTextV1(indicator.percentile252)}
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
                      <DeepLedgerStatusPill key={key} tone="slate">{marketIndicatorKeyLabelV1(key)}</DeepLedgerStatusPill>
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
                    <div className="mt-1 text-xs text-[var(--muted)]">{formatDateTimeV1(item.ts)}</div>
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
                  <DeepLedgerStatusPill tone={marketRegimeToneV1(marketContext?.regime || null)}>
                    规则环境 {marketRegimeLabelV1(marketContext?.regime || null)}
                  </DeepLedgerStatusPill>
                  <DeepLedgerStatusPill tone={marketRegimeToneV1(aiMarketRegime)}>
                    AI 分析环境 {marketRegimeLabelV1(aiMarketRegime)}
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
                  <DeepLedgerStatusPill tone="slate">生成于 {formatDateTimeV1(llm.generatedAt)}</DeepLedgerStatusPill>
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
  onSubmitLlmFeedback: (input: {
    contextId: string;
    type: "insight";
    score: WorkbenchLlmFeedbackScoreV1;
  }) => void;
  llmFeedbackSubmittingByContext: Record<string, boolean>;
  llmFeedbackScoreByContext: Record<string, WorkbenchLlmFeedbackScoreV1>;
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
  }, [filteredRows, props.view]);

  function draftTargetValue(row: AssetUniverseViewV1): string {
    if (targetDrafts[row.assetKey] != null) return targetDrafts[row.assetKey];
    return formatTargetWeightDraftV1(row.targetWeightPct);
  }

  async function handleSaveTarget(row: AssetUniverseViewV1) {
    const raw = draftTargetValue(row);
    const next = Number(raw);
    if (!Number.isFinite(next) || next < 0) return;
    await props.onUpdateTargetWeight(row, normalizeTargetWeightPctV1(next));
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
      action={<DeepLedgerStatusPill tone={props.view === "holdings" ? "cyan" : "amber"}>{viewLabelV1(props.view)}</DeepLedgerStatusPill>}
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
        <div className="rounded-[18px] border border-[var(--border)] bg-[linear-gradient(135deg,rgba(15,23,38,0.98),rgba(9,14,24,0.94))] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="font-[var(--font-display)] text-[28px] leading-none tracking-[-0.03em] text-[var(--text)]">
                {viewLabelV1(props.view)}
              </div>
              <div className="mt-3 max-w-2xl text-[13px] leading-6 text-[var(--muted)]">
                先把标的加入观察列表，再维护研究目标；目标大于 0 即进入再平衡篮子，但这里只改目标，不会直接下单。
              </div>
            </div>
            <DeepLedgerActionButton
              tone="slate"
              className="h-9 rounded-full px-4 text-xs"
              onClick={() => void props.onNormalizeTargetWeights()}
              disabled={props.disabled || props.updatingTarget}
            >
              {props.updatingTarget ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
{props.updatingTarget ? "处理中..." : "研究目标归一到 100%"}
            </DeepLedgerActionButton>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
          <DeepLedgerMiniStat label="持仓资产" value={props.counts.holdings} tone="cyan" />
          <DeepLedgerMiniStat label="观察资产" value={props.counts.watchlist} tone="amber" />
          <DeepLedgerMiniStat label="再平衡篮子" value={props.counts.basket} tone="indigo" />
          <div className="rounded-[16px] border border-[var(--border)] bg-[rgba(8,12,20,0.74)] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">搜索定位</div>
              {hasKeyword ? <DeepLedgerStatusPill tone="indigo">筛选中</DeepLedgerStatusPill> : null}
            </div>
            <div className={cn(deepLedgerSearchShellClassName, "mt-2 h-9")}>
              <Search className="h-3.5 w-3.5 text-[var(--faint)]" />
              <input
                name="asset-search-keyword"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                className="h-9 w-full bg-transparent text-xs text-[var(--text)] outline-none placeholder:text-[var(--faint)]"
                placeholder="搜索代码/市场/行情标识"
              />
            </div>
            <div className="mt-2 flex min-h-5 items-center justify-end text-[11px]">
              {hasKeyword ? (
                <DeepLedgerActionButton tone="slate" className="h-7 rounded-full px-2.5 text-[11px]" onClick={() => setKeyword("")}>
                  清空搜索
                </DeepLedgerActionButton>
              ) : (
                <span className="text-[11px] text-[var(--faint)]">支持代码、市场、行情标识模糊过滤</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className={cn(deepLedgerTableShellClassName, "overflow-x-auto")}>
        <div className="border-b border-[var(--border)] bg-[rgba(255,255,255,0.02)] px-4 py-2.5 text-[11px] text-[var(--faint)]">
          左侧信息区可横向浏览，右侧操作区固定；建议先看偏离和汇率折算，再决定买入或卖出。
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
                <th className={deepLedgerTableHeadClassName}>类别 / 标签</th>
                <th className={cn(deepLedgerTableHeadClassName, "text-right")}>持仓 / 成本</th>
                <th className={cn(deepLedgerTableHeadClassName, "text-right")}>价格 / 刷新</th>
                <th className={cn(deepLedgerTableHeadClassName, "text-right")}>本币估值</th>
                <th className={cn(deepLedgerTableHeadClassName, "text-right")}>实际 / 浮盈亏</th>
                <th className={cn(deepLedgerTableHeadClassName, "text-right")}>研究目标</th>
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
                const targetChanged = Number.isFinite(targetDraftNum) && Math.abs(targetDraftNum - normalizeTargetWeightPctV1(row.targetWeightPct)) > 1e-6;
                const targetInvalid = !Number.isFinite(targetDraftNum) || targetDraftNum < 0;
                const buyDisabled = props.disabled || !(price > 0);
                const sellDisabled = props.disabled || !(price > 0) || !(row.holdingQty > 0);
                const actionBusy = props.actioningAssetKey === row.assetKey;
                const inBasket = isInBasketV1(row);
                const expanded = Boolean(props.expandedInsightKeys[row.assetKey]);
                const localValuation = localValuationV1(row);
                const gapLabel = gapLabelV1(row.gapPct);
                const gapBarWidth = row.gapPct == null ? 0 : Math.min(100, Math.max(8, Math.abs(row.gapPct) * 1000));
                const unrealizedPnlPct = unrealizedPnlPctV1(row);
                const valuationScore = props.insightDataByAssetKey[row.assetKey]?.valuation?.scorePct ?? null;
                const valuationTemp = valuationTemperatureMetaV1(valuationScore);

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
                            {row.holdingQty > 0 ? <DeepLedgerStatusPill tone="green">持仓</DeepLedgerStatusPill> : null}
                            {row.watchEnabled ? <DeepLedgerStatusPill tone="cyan">观察</DeepLedgerStatusPill> : null}
                            {inBasket ? <DeepLedgerStatusPill tone="indigo">再平衡</DeepLedgerStatusPill> : null}
                          </div>
                          <div className="mt-1 truncate text-[10px] uppercase tracking-[0.14em] text-[var(--faint)]">
                            {row.market} · {row.currency} · 行情 {row.yfinanceSymbol || "-"}
                          </div>
                          {row.notes ? <div className="mt-2 truncate text-[11px] leading-5 text-[var(--muted)]">{row.notes}</div> : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-[11px] text-[var(--muted)]">
                        <div className="truncate">{row.assetClass} · {row.region}</div>
                        <div className="mt-1 text-[11px] text-[var(--faint)]">{row.instrumentType || row.exchange || "类型待补充"}</div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {row.watchTags.slice(0, 2).map((tag) => <DeepLedgerStatusPill key={`${row.assetKey}-watch-${tag}`} tone="slate">{tag}</DeepLedgerStatusPill>)}
                          {row.holdingTags.slice(0, 1).map((tag) => <DeepLedgerStatusPill key={`${row.assetKey}-holding-${tag}`} tone="slate">{tag}</DeepLedgerStatusPill>)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right align-top font-[var(--font-mono)] text-[13px] text-[var(--text)]">
                        <div>{row.holdingQty.toFixed(4)}</div>
                        {row.holdingQty > 0 ? (
                          <div className="mt-1 text-[11px] text-[var(--muted)]">
                            成本 {currencySymbolV1(row.currency)} {holdingCostPerUnitV1(row).toFixed(4)}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right align-top font-[var(--font-mono)] text-[13px] text-[var(--text)]">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="inline-flex cursor-default flex-col items-end">
                              <div>{priceLabel(row)}</div>
                              <div className="mt-1"><DeepLedgerStatusPill tone={priceStatusToneV1(row.priceStatus)}>{priceStatusLabel(row)}</DeepLedgerStatusPill></div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs border-[var(--border)] bg-[rgba(8,12,20,0.98)] text-[var(--text)]">
                            <div className="text-xs font-medium">行情更新时间：{formatDateTimeV1(row.priceUpdatedAt)}</div>
                            <div className="mt-1 text-xs text-[var(--muted)]">系统最近一次成功拉取并写入本地行情的时间。</div>
                            <div className="mt-1 text-xs text-[var(--muted)]">来源：{row.priceSource || "-"}</div>
                          </TooltipContent>
                        </Tooltip>
                      </td>
                      <td className="px-4 py-3 text-right align-top font-[var(--font-mono)] text-sm text-[var(--text)]">
                        {localValuation > 0 ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-default">{formatCurrency(localValuation, row.currency)}</span>
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
                        {unrealizedPnlPct != null ? (
                          <div className={cn("mt-1 text-[11px]", unrealizedPnlPct >= 0 ? "text-emerald-300" : "text-rose-300")}>
                            浮盈亏 {unrealizedPnlPct.toFixed(2)}%
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
                              <span className={cn("text-xs font-semibold", gapLabel.className)}>{gapLabel.text}</span>
                              <span className="h-1.5 w-20 overflow-hidden rounded-full bg-[rgba(255,255,255,0.08)]">
                                <span className={cn("block h-full rounded-full", gapLabel.barClassName)} style={{ width: `${gapBarWidth}%` }} />
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
                              <span className="text-base leading-none">{hfSignalIconV1(row.hfSignal)}</span>
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
                                  观点偏离度 {row.hfSignal.thesisDriftPct.toFixed(1)}% · {hfTrendLabelV1(row.hfSignal.trend)}
                                </div>
                                {row.hfSignal.funds.length ? (
                                  <div className="space-y-1">
                                    {row.hfSignal.funds.slice(0, 3).map((fund) => (
                                      <div key={`${fund.fundCode}-${fund.weightPct}`} className="text-xs text-[var(--muted)]">
                                        {normalizeFundLabelV1(fund.fundName, fund.fundCode)} · 当前仓位 {fund.weightPct.toFixed(1)}% · 变动 {fund.changePct >= 0 ? "+" : ""}{fund.changePct.toFixed(1)}%
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
                          <ActionButtonV1
                            label="买入"
                            testId={`workbench-buy-${row.assetKey}`}
                            disabled={buyDisabled}
                            reason={buyReason}
                            tone="success"
                            className="w-full justify-center"
                            onClick={() => props.onAddToExecution(row, "BUY")}
                          />
                          <ActionButtonV1
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
                          <InlineInsightsV1
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
