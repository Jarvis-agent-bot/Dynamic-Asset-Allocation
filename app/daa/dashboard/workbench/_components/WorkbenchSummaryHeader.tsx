"use client";

import Link from "next/link";
import { RefreshCcw } from "lucide-react";

import { formatCurrency, formatDateTime } from "@/app/daa/dashboard/_components/daaFormatters";
import {
  DeepLedgerActionButton,
  DeepLedgerEmptyState,
  DeepLedgerStatusPill,
  deepLedgerSubtlePanelClassName,
} from "@/app/daa/dashboard/_components/DeepLedgerUI";
import { cn } from "@/lib/utils";
import type { StoreNotificationStatusSummary } from "@/src/daa/modules/store/storeApi";
import type { DaaCurrentLedgerMeta } from "@/src/daa/store/daaStorePg";

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

function formatMetricValue(value: number, currency: string, loading: boolean): string {
  if (loading) return "—";
  return formatCurrency(value, currency);
}

export function WorkbenchSummaryHeader(props: {
  baseCurrency: string;
  totalEquity: number;
  holdingsValue: number;
  availableCashValue: number;
  frozenCashValue: number;
  ledgerMeta: DaaCurrentLedgerMeta | null;
  notificationStatus: StoreNotificationStatusSummary | null;
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const summaryItems = [
    {
      label: "总权益",
      value: formatMetricValue(props.totalEquity, props.baseCurrency, props.loading),
      hint: "持仓 + 可用现金 + 冻结现金",
    },
    {
      label: "持仓",
      value: formatMetricValue(props.holdingsValue, props.baseCurrency, props.loading),
      hint: "已持有资产当前估值",
    },
    {
      label: "可用现金",
      value: formatMetricValue(props.availableCashValue, props.baseCurrency, props.loading),
      hint: "未冻结，可继续操作",
    },
    {
      label: "冻结现金",
      value: formatMetricValue(props.frozenCashValue, props.baseCurrency, props.loading),
      hint: "待释放或执行中占用",
    },
  ];
  const archivedTotal = (props.ledgerMeta?.archivedCycleCount || 0) + (props.ledgerMeta?.archivedTradeCount || 0) + (props.ledgerMeta?.archivedReportCount || 0);
  const telegramStatus = props.notificationStatus?.channels.telegram;
  const feishuStatus = props.notificationStatus?.channels.feishu;
  const syncTone = props.loading ? "slate" : props.refreshing ? "amber" : "green";
  const syncLabel = props.loading ? "准备中" : props.refreshing ? "同步中" : "数据已同步";

  return (
    <>
      <div className="rounded-[20px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(24,34,54,0.96),rgba(13,19,32,0.98))] px-5 py-4 shadow-[0_22px_48px_rgba(0,0,0,0.24)] sm:px-6">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {summaryItems.map((item) => (
              <div key={item.label} className={cn(deepLedgerSubtlePanelClassName, "px-4 py-3")}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">{item.label}</div>
                <div className="mt-2 font-[var(--font-mono)] text-lg text-[var(--text)]">{item.value}</div>
                <div className="mt-2 text-xs text-[var(--muted)]">{item.hint}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <DeepLedgerStatusPill tone={syncTone}>{syncLabel}</DeepLedgerStatusPill>
            <DeepLedgerActionButton onClick={props.onRefresh} disabled={props.loading || props.refreshing}>
              <RefreshCcw className={cn("h-3.5 w-3.5", props.refreshing ? "animate-spin" : "")} />
              {props.loading ? "准备中…" : props.refreshing ? "刷新中…" : "刷新"}
            </DeepLedgerActionButton>
          </div>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-3">
          <div className={cn(deepLedgerSubtlePanelClassName, "px-4 py-3")}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">当前账本</div>
              <DeepLedgerStatusPill tone="indigo">仅展示当前账本</DeepLedgerStatusPill>
            </div>
            <div className="mt-3 text-sm text-[var(--text)]">
              {props.loading ? "正在同步账本元数据" : props.ledgerMeta?.ledgerStartTs ? formatDateTime(props.ledgerMeta.ledgerStartTs) : "尚未建立账本起点"}
            </div>
            <div className="mt-2 text-xs text-[var(--muted)]">
              期初余额 {props.loading ? "—" : formatCurrency(props.ledgerMeta?.openingBalance || 0, props.baseCurrency)}
            </div>
            <div className="mt-3 text-xs leading-5 text-[var(--faint)]">
              账本重置后，工作台与交易记录只展示这次起点之后的数据，避免历史测试数据继续污染当前判断。
            </div>
          </div>

          <div className={cn(deepLedgerSubtlePanelClassName, "px-4 py-3")}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">历史归档</div>
              <DeepLedgerStatusPill tone={archivedTotal > 0 ? "amber" : "green"}>{archivedTotal > 0 ? "已归档" : "无历史噪音"}</DeepLedgerStatusPill>
            </div>
            <div className="mt-3 grid gap-2 text-sm text-[var(--text)] sm:grid-cols-3">
              <div>归档周期 {props.loading ? "—" : (props.ledgerMeta?.archivedCycleCount || 0).toString()}</div>
              <div>归档订单 {props.loading ? "—" : (props.ledgerMeta?.archivedTradeCount || 0).toString()}</div>
              <div>归档报告 {props.loading ? "—" : (props.ledgerMeta?.archivedReportCount || 0).toString()}</div>
            </div>
            <div className="mt-2 text-xs text-[var(--muted)]">
              {props.loading
                ? "正在读取归档计数，避免在未加载完成前误判为“没有数据”。"
                : archivedTotal > 0
                  ? "如果当前交易页为空，先看这里是否已经把旧测试周期归档了。"
                  : "当前环境还没有需要额外解释的历史归档。"}
            </div>
            <div className="mt-3">
              <Link href="/daa/dashboard/trades" className="inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] transition-all hover:border-[var(--primary)]/32 hover:text-[var(--text)]">
                查看交易记录
              </Link>
            </div>
          </div>

          <div className={cn(deepLedgerSubtlePanelClassName, "px-4 py-3")}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">通知链路</div>
              <DeepLedgerStatusPill tone={props.notificationStatus?.cronConfigured ? "green" : "amber"}>
                {props.notificationStatus?.cronConfigured ? "Cron 已配置" : "Cron 未配置"}
              </DeepLedgerStatusPill>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <DeepLedgerStatusPill tone={telegramStatus ? notificationTone(telegramStatus) : "slate"}>
                Telegram {telegramStatus ? notificationText(telegramStatus) : props.loading ? "加载中" : "未知"}
              </DeepLedgerStatusPill>
              <DeepLedgerStatusPill tone={feishuStatus ? notificationTone(feishuStatus) : "slate"}>
                飞书 {feishuStatus ? notificationText(feishuStatus) : props.loading ? "加载中" : "未知"}
              </DeepLedgerStatusPill>
            </div>
            <div className="mt-3 text-xs leading-5 text-[var(--muted)]">
              {props.loading
                ? "通知状态会在工作台初次同步完成后显示，避免把“未加载”误读成“没有推送”。"
                : telegramStatus?.lastFailureAt || feishuStatus?.lastFailureAt
                  ? `最近异常：${telegramStatus?.lastFailureAt && notificationTone(telegramStatus) === "amber"
                    ? `Telegram ${formatDateTime(telegramStatus.lastFailureAt)}`
                    : feishuStatus?.lastFailureAt
                      ? `飞书 ${formatDateTime(feishuStatus.lastFailureAt)}`
                      : "通知失败"}`
                  : "这里会直接提示凭证缺失、最近失败和是否从未真正投递过。"}
            </div>
            <div className="mt-3">
              <Link href="/daa/dashboard/settings#settings-notification" className="inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] transition-all hover:border-[var(--primary)]/32 hover:text-[var(--text)]">
                前往通知设置
              </Link>
            </div>
          </div>
        </div>
      </div>

      {props.loading ? (
        <DeepLedgerEmptyState title="正在准备工作台…" description="正在同步账户、观察列表与再平衡周期，请稍候。" />
      ) : null}
    </>
  );
}
