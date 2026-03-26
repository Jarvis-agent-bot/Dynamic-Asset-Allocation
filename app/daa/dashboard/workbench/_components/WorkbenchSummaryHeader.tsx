"use client";

import Link from "next/link";
import { RefreshCcw } from "lucide-react";

import { formatCurrency, formatDateTime, formatPercent } from "@/app/daa/dashboard/_components/daaFormatters";
import {
  DaaSurfaceActionButton,
  DaaSurfaceEmptyState,
  DaaSurfaceStatusPill,
  daaSurfaceSubtlePanelClassName,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { cn } from "@/lib/utils";
import type { StoreNotificationStatusSummary } from "@/src/daa/modules/store/storeApi";
import type { DaaCurrentLedgerMeta } from "@/src/daa/store/daaStorePg";
import type { EquityDelta } from "@/src/daa/modules/read/readModels";
import type { WorkbenchAccountBreakdownItem, WorkbenchMarketDataHealth } from "@/src/daa/modules/workbench/workbenchTypes";

function notificationTone(input: {
  enabled: boolean;
  configured: boolean;
  lastFailureAt: string | null;
  lastSuccessAt: string | null;
}): "slate" | "amber" | "green" {
  if (!input.enabled) return "slate";
  if (!input.configured) return "amber";
  const failureTs = input.lastFailureAt ? Date.parse(input.lastFailureAt) : Number.NaN;
  const successTs = input.lastSuccessAt ? Date.parse(input.lastSuccessAt) : Number.NaN;
  if (Number.isFinite(failureTs) && (!Number.isFinite(successTs) || failureTs >= successTs)) return "amber";
  return "green";
}

function notificationText(input: {
  enabled: boolean;
  configured: boolean;
  lastFailureAt: string | null;
  lastSuccessAt: string | null;
}): string {
  if (!input.enabled) return "关闭";
  if (!input.configured) return "待配置";
  const failureTs = input.lastFailureAt ? Date.parse(input.lastFailureAt) : Number.NaN;
  const successTs = input.lastSuccessAt ? Date.parse(input.lastSuccessAt) : Number.NaN;
  if (Number.isFinite(failureTs) && (!Number.isFinite(successTs) || failureTs >= successTs)) return "最近失败";
  if (input.lastSuccessAt) return "最近成功";
  return "已启用";
}

function telegramAssistantTone(input: {
  ready: boolean;
  lastSessionAt: string | null;
}): "slate" | "amber" | "green" {
  if (input.ready) return "green";
  if (input.lastSessionAt) return "amber";
  return "slate";
}

function telegramAssistantText(input: {
  ready: boolean;
  lastSessionAt: string | null;
}): string {
  if (input.ready) return "已就绪";
  if (input.lastSessionAt) return "未完成配置";
  return "待配置";
}

function MetricValue({ value, currency, loading }: { value: number; currency: string; loading: boolean }) {
  if (loading) {
    return <span className="inline-block h-5 w-24 animate-pulse rounded-[8px] bg-[var(--border)]" />;
  }
  return <>{formatCurrency(value, currency)}</>;
}

function buildMarketDataDetail(health: WorkbenchMarketDataHealth | null | undefined): string {
  if (!health) return "当前未读取到市场数据健康摘要。";

  const parts: string[] = [`近 24 小时失败率 ${health.recentJobFailureRatePct.toFixed(1)}%`];
  parts.push(`可直接使用 ${health.freshCount}`);
  if (health.staleCount > 0) parts.push(`需要复核 ${health.staleCount}`);
  if (health.missingCount > 0) parts.push(`暂缺 ${health.missingCount}`);
  if (health.message) parts.push(health.message);
  return parts.join(" · ");
}

export function WorkbenchSummaryHeader(props: {
  baseCurrency: string;
  totalEquity: number;
  holdingsValue: number;
  availableCashValue: number;
  frozenCashValue: number;
  cashMutationsAllowed?: boolean;
  readOnlyReason?: string | null;
  accountBreakdown?: WorkbenchAccountBreakdownItem[];
  equityDelta?: EquityDelta | null;
  ledgerMeta: DaaCurrentLedgerMeta | null;
  marketDataHealth?: WorkbenchMarketDataHealth | null;
  notificationStatus: StoreNotificationStatusSummary | null;
  loading: boolean;
  refreshing: boolean;
  priceStreamConnected?: boolean;
  onRefresh: () => void;
}) {
  const summaryItems = [
    {
      label: "总权益",
      value: <MetricValue value={props.totalEquity} currency={props.baseCurrency} loading={props.loading} />,
      hint: "持仓市值 + 可用现金 + 冻结现金",
    },
    {
      label: "持仓市值",
      value: <MetricValue value={props.holdingsValue} currency={props.baseCurrency} loading={props.loading} />,
      hint: "当前持仓按最新价格估算",
    },
    {
      label: "可用现金",
      value: <MetricValue value={props.availableCashValue} currency={props.baseCurrency} loading={props.loading} />,
      hint: "未冻结，可继续操作",
    },
    {
      label: "冻结现金",
      value: <MetricValue value={props.frozenCashValue} currency={props.baseCurrency} loading={props.loading} />,
      hint: "待释放或执行中占用",
    },
  ];
  const telegramStatus = props.notificationStatus?.channels.telegram;
  const telegramAssistant = props.notificationStatus?.telegramAssistant;
  const feishuStatus = props.notificationStatus?.channels.feishu;
  const syncTone = props.loading ? "slate" : props.refreshing ? "amber" : "green";
  const syncLabel = props.loading ? "准备中" : props.refreshing ? "同步中" : "数据已同步";
  const accountModeLabel = "本地模拟";
  const accountModeTone = "slate" as const;
  const marketDataTone = props.marketDataHealth?.status === "down" ? "amber" : props.marketDataHealth?.status === "degraded" ? "amber" : "green";
  const marketDataLabel = props.marketDataHealth?.status === "down" ? "不可用" : props.marketDataHealth?.status === "degraded" ? "已降级" : "正常";
  const accountBreakdown = props.accountBreakdown || [];
  const accountDetailTone = accountBreakdown.length > 1 ? "cyan" : props.cashMutationsAllowed === false ? "amber" : "slate";
  const accountDetailLabel = accountBreakdown.length > 1 ? "本地分账户" : props.cashMutationsAllowed === false ? "余额只读" : "本地可编辑";

  return (
    <>
      <div className="rounded-[20px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(24,34,54,0.96),rgba(13,19,32,0.98))] px-5 py-4 shadow-[0_22px_48px_rgba(0,0,0,0.24)] sm:px-6">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {summaryItems.map((item) => (
              <div key={item.label} className={cn(daaSurfaceSubtlePanelClassName, "px-4 py-3")}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">{item.label}</div>
                <div className="mt-2 font-[var(--font-mono)] text-lg tabular-nums text-[var(--text)]">{item.value}</div>
                {item.label === "总权益" && props.equityDelta?.dayChange != null && (
                  <div className={`mt-1 text-xs ${props.equityDelta.dayChange >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    今日 {props.equityDelta.dayChange >= 0 ? "+" : "-"}{formatCurrency(Math.abs(props.equityDelta.dayChange), props.baseCurrency)}
                    {" "}{props.equityDelta.dayChange >= 0 ? "\u25B2" : "\u25BC"} {formatPercent(Math.abs(props.equityDelta.dayChangePct ?? 0))}
                  </div>
                )}
                {item.label === "总权益" && props.equityDelta?.weekChange != null && (
                  <div className={`mt-0.5 text-xs ${props.equityDelta.weekChange >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    本周 {props.equityDelta.weekChange >= 0 ? "+" : "-"}{formatCurrency(Math.abs(props.equityDelta.weekChange), props.baseCurrency)}
                    {" "}{props.equityDelta.weekChange >= 0 ? "\u25B2" : "\u25BC"} {formatPercent(Math.abs(props.equityDelta.weekChangePct ?? 0))}
                  </div>
                )}
                <div className="mt-2 text-xs text-[var(--muted)]">{item.hint}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <DaaSurfaceStatusPill tone={accountModeTone}>{accountModeLabel}</DaaSurfaceStatusPill>
            <DaaSurfaceStatusPill tone={syncTone}>{syncLabel}</DaaSurfaceStatusPill>
            {props.priceStreamConnected != null && (
              <DaaSurfaceStatusPill tone={props.priceStreamConnected ? "green" : "slate"}>
                {props.priceStreamConnected ? "实时" : "离线"}
              </DaaSurfaceStatusPill>
            )}
            <DaaSurfaceActionButton onClick={props.onRefresh} disabled={props.loading || props.refreshing}>
              <RefreshCcw className={cn("h-3.5 w-3.5", props.refreshing ? "animate-spin" : "")} />
              {props.loading ? "准备中…" : props.refreshing ? "刷新中…" : "刷新"}
            </DaaSurfaceActionButton>
          </div>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-3">
          <div className={cn(daaSurfaceSubtlePanelClassName, "px-4 py-3")}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">账户来源</div>
              <DaaSurfaceStatusPill tone={accountDetailTone}>{accountDetailLabel}</DaaSurfaceStatusPill>
            </div>
            <div className="mt-3 text-sm text-[var(--text)]">
              {props.loading ? "正在同步账户快照" : accountModeLabel}
            </div>
            <div className="mt-3 space-y-2">
              {props.loading ? (
                <div className="text-xs text-[var(--muted)]">正在读取账户来源详情。</div>
              ) : accountBreakdown.length > 0 ? (
                accountBreakdown.slice(0, 3).map((item) => (
                  <div key={`${item.venueKind}:${item.accountId || "default"}`} className="flex items-center justify-between gap-3 text-xs text-[var(--muted)]">
                    <span>{item.label}{item.accountId ? ` · ${item.accountId}` : ""}</span>
                    <span className="font-[var(--font-mono)] text-[var(--text)]">{formatCurrency(item.cash, item.baseCurrency)}</span>
                  </div>
                ))
              ) : (
                <div className="text-xs text-[var(--muted)]">
                  {`当前账本起点 ${formatDateTime(props.ledgerMeta?.ledgerStartTs || "") || "-"}`}
                </div>
              )}
            </div>
            <div className="mt-3 text-xs leading-5 text-[var(--faint)]">
              {props.readOnlyReason || "工作台与交易记录统一按当前账本窗口统计；不同执行通道的拆分只用于解释资金分布。"}
            </div>
            <div className="mt-3">
              <Link href="/daa/dashboard/trades" className="inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] transition-colors hover:border-[var(--primary)]/32 hover:text-[var(--text)]">
                查看交易记录
              </Link>
            </div>
          </div>

          <div className={cn(daaSurfaceSubtlePanelClassName, "px-4 py-3")}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">市场数据</div>
              <DaaSurfaceStatusPill tone={marketDataTone}>{marketDataLabel}</DaaSurfaceStatusPill>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <DaaSurfaceStatusPill tone="green">
                最新 {props.marketDataHealth?.freshCount ?? 0}
              </DaaSurfaceStatusPill>
              <DaaSurfaceStatusPill tone={(props.marketDataHealth?.staleCount || 0) > 0 ? "amber" : "slate"}>
                陈旧 {props.marketDataHealth?.staleCount ?? 0}
              </DaaSurfaceStatusPill>
              <DaaSurfaceStatusPill tone={(props.marketDataHealth?.missingCount || 0) > 0 ? "amber" : "slate"}>
                缺失 {props.marketDataHealth?.missingCount ?? 0}
              </DaaSurfaceStatusPill>
            </div>
            <div className="mt-3 text-xs leading-5 text-[var(--muted)]">
              {props.loading
                ? "市场数据健康会在首次同步后显示。"
                : buildMarketDataDetail(props.marketDataHealth)}
            </div>
            <div className="mt-3">
              <Link href="/daa/dashboard/settings#settings-data" className="inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] transition-colors hover:border-[var(--primary)]/32 hover:text-[var(--text)]">
                查看数据源设置
              </Link>
            </div>
          </div>

          <div className={cn(daaSurfaceSubtlePanelClassName, "px-4 py-3")}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">通知状态</div>
              <DaaSurfaceStatusPill tone={props.notificationStatus?.cronConfigured ? "green" : "amber"}>
                {props.notificationStatus?.cronConfigured ? "Cron 正常" : "Cron 待配置"}
              </DaaSurfaceStatusPill>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <DaaSurfaceStatusPill tone={telegramStatus ? notificationTone(telegramStatus) : "slate"}>
                Telegram 通知 {telegramStatus ? notificationText(telegramStatus) : props.loading ? "加载中" : "未知"}
              </DaaSurfaceStatusPill>
              <DaaSurfaceStatusPill tone={telegramAssistant ? telegramAssistantTone(telegramAssistant) : "slate"}>
                Telegram 对话 {telegramAssistant ? telegramAssistantText(telegramAssistant) : props.loading ? "加载中" : "未知"}
              </DaaSurfaceStatusPill>
              <DaaSurfaceStatusPill tone={feishuStatus ? notificationTone(feishuStatus) : "slate"}>
                飞书通知 {feishuStatus ? notificationText(feishuStatus) : props.loading ? "加载中" : "未知"}
              </DaaSurfaceStatusPill>
            </div>
            <div className="mt-3 text-xs leading-5 text-[var(--muted)]">
              {props.loading
                ? "通知与对话状态会在首次同步后显示。"
                : telegramAssistant?.lastSessionAt
                  ? `最近 Telegram 会话：${formatDateTime(telegramAssistant.lastSessionAt)}`
                  : telegramAssistant?.ready
                    ? "Telegram 对话入口已就绪，但当前还没有会话记录。"
                    : "Telegram 入站对话尚未就绪；飞书当前只接了出站通知 webhook，请到通知设置页补齐凭证。"}
            </div>
            <div className="mt-3">
              <Link href="/daa/dashboard/settings#settings-notification" className="inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] transition-colors hover:border-[var(--primary)]/32 hover:text-[var(--text)]">
                前往通知设置
              </Link>
            </div>
          </div>
        </div>
      </div>

      {props.loading ? (
        <DaaSurfaceEmptyState title="正在准备工作台…" description="正在同步账户、观察列表与再平衡周期，请稍候。" />
      ) : null}
    </>
  );
}
