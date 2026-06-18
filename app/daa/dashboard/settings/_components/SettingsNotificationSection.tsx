"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCcw, Send } from "lucide-react";
import { toast } from "sonner";

import { formatDateTime } from "@/app/daa/dashboard/_components/daaFormatters";
import { DAA_WORKBENCH_DATA_UPDATED_EVENT } from "@/app/daa/dashboard/workbenchEvents";
import { DaaSurfaceStatusPill } from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";
import {
  listNotificationDeliveries,
  testSecretConnectivity,
  registerTelegramWebhook,
  getTelegramWebhookStatus,
  type StoreNotificationDeliveryEntry,
  type StoreNotificationStatusSummary,
  type TelegramWebhookInfo,
} from "@/src/daa/modules/store/workbenchStoreApiClient";

import {
  CheckboxRow,
  FieldLabel,
  SectionCard,
  SubsectionCard,
  type SettingsConfigSetter,
} from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitives";

const actionButtonClassName =
  "inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--elevated)] px-3 py-2 text-xs font-semibold text-[var(--text)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60";

const secondaryButtonClassName =
  "inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--elevated)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text)] transition-colors hover:border-[var(--primary)] hover:text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60";

function deliveryEventLabel(value: string): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "suggestion_generated") return "建议生成";
  if (normalized === "daily_report") return "每日复核";
  if (normalized === "drift_triggered") return "偏移触发";
  if (normalized === "risk_triggered") return "风控触发";
  if (normalized === "trade_executed") return "交易执行";
  if (normalized === "test_message") return "测试消息";
  return normalized || "未知事件";
}

function triggerSourceLabel(value: string): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "cron_daily_analysis") return "定时分析";
  if (normalized === "cron_cognitive_agent") return "定时复核";
  if (normalized === "cognitive_agent") return "投资助理复核";
  if (normalized === "agent_briefing") return "复核简报";
  if (normalized === "cron_drift_check") return "漂移检查";
  if (normalized === "manual_trade_execution") return "手工成交";
  if (normalized === "decision_trade_execution") return "手工执行建议";
  if (normalized === "rebalance_cycle_execution") return "周期执行";
  if (normalized === "settings_secret_test") return "设置页测试";
  return normalized || "未知来源";
}

function scheduledJobLabel(value: string): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "cron_daily_analysis") return "定时分析";
  if (normalized === "cron_cognitive_agent") return "定时复核";
  if (normalized === "cron_drift_check") return "漂移检查";
  if (normalized === "cron_news_refresh") return "新闻刷新";
  if (normalized === "cron_price_refresh") return "行情刷新";
  if (normalized === "market_cache_refresh" || normalized === "cron_market_cache_refresh") return "市场缓存刷新";
  return normalized || "未知任务";
}

function channelPillTone(input: {
  enabled: boolean;
  configured: boolean;
  lastFailureAt: string | null;
  lastSuccessAt: string | null;
}): "neutral" | "warning" | "success" {
  if (!input.enabled) return "neutral";
  if (!input.configured) return "warning";
  const failureTs = input.lastFailureAt ? Date.parse(input.lastFailureAt) : Number.NaN;
  const successTs = input.lastSuccessAt ? Date.parse(input.lastSuccessAt) : Number.NaN;
  if (Number.isFinite(failureTs) && (!Number.isFinite(successTs) || failureTs >= successTs)) return "warning";
  return "success";
}

function channelPillText(input: {
  enabled: boolean;
  configured: boolean;
  lastFailureAt: string | null;
  lastSuccessAt: string | null;
}): string {
  if (!input.enabled) return "未启用";
  if (!input.configured) return "待补凭证";
  const failureTs = input.lastFailureAt ? Date.parse(input.lastFailureAt) : Number.NaN;
  const successTs = input.lastSuccessAt ? Date.parse(input.lastSuccessAt) : Number.NaN;
  if (Number.isFinite(failureTs) && (!Number.isFinite(successTs) || failureTs >= successTs)) return "最近失败";
  if (input.lastSuccessAt) return "最近成功";
  return "已启用";
}

function telegramAssistantPillTone(input: {
  ready: boolean;
  lastSessionAt: string | null;
}): "neutral" | "warning" | "success" {
  if (input.ready) return "success";
  if (input.lastSessionAt) return "warning";
  return "neutral";
}

function telegramAssistantPillText(input: {
  ready: boolean;
  lastSessionAt: string | null;
}): string {
  if (input.ready) return "已就绪";
  if (input.lastSessionAt) return "曾有会话";
  return "未就绪";
}

function formatSummaryTime(value: string | null | undefined): string {
  return value ? formatDateTime(value) : "暂无";
}

function formatDerivedDailySchedule(scheduledTimeUtc: string): {
  title: string;
  hint: string;
} {
  const matched = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(scheduledTimeUtc || "").trim());
  if (!matched) {
    return {
      title: "未识别自动分析时间",
      hint: "请先在“策略与风控”里填写合法的 UTC 时间（HH:MM），通知和每日复核会跟随这一时间窗口。",
    };
  }
  const hour = Number(matched[1]);
  const minute = Number(matched[2]);
  const scheduledHour = minute > 0 ? (hour + 1) % 24 : hour;
  const pad = (value: number) => String(value).padStart(2, "0");
  const beijingHour = (scheduledHour + 8) % 24;
  const rawLabel = `自动分析时间 ${pad(hour)}:${pad(minute)} UTC`;
  if (minute > 0) {
    return {
      title: `${rawLabel}，当前按 UTC ${pad(scheduledHour)}:00（北京 ${pad(beijingHour)}:00）后的首次轮询执行`,
      hint: "系统当前按整点调度轮询，所以分钟部分会向后归入下一个整点窗口；通知与每日复核共用这一调度口径。",
    };
  }
  return {
    title: `${rawLabel}，当前按 UTC ${pad(scheduledHour)}:00（北京 ${pad(beijingHour)}:00）执行`,
    hint: "通知建议生成与每日复核跟随同一套自动分析时间，不再单独维护第二套通知时间。",
  };
}

function RunningStatusTile(props: {
  title: string;
  value: string;
  detail: string;
  meta?: string;
  pill?: React.ReactNode;
  index: number;
}) {
  const borderClass = [
    props.index % 2 === 0 ? "border-r border-[var(--border)]" : "",
    props.index < 2 ? "border-b border-[var(--border)]" : "",
    props.index % 4 === 3 ? "lg:border-r-0" : "lg:border-r lg:border-[var(--border)]",
    "lg:border-b-0",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={`min-w-0 bg-[var(--card)] px-3 py-2.5 ${borderClass}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-[11px] font-semibold uppercase tracking-normal text-[var(--faint)]">{props.title}</div>
        {props.pill}
      </div>
      <div className="mt-2 truncate text-sm font-semibold text-[var(--text)]">{props.value}</div>
      <div className="mt-1 text-xs leading-5 text-[var(--muted)]">{props.detail}</div>
      {props.meta ? (
        <div className="mt-1 line-clamp-2 text-[11px] leading-5 text-[var(--faint)]">{props.meta}</div>
      ) : null}
    </div>
  );
}

function ChannelStatusTile(props: {
  title: string;
  value: string;
  detail: string;
  pill?: React.ReactNode;
  index: number;
  total: number;
}) {
  const borderClass = [
    props.index === 0 ? "border-b border-[var(--border)] sm:border-b-0 sm:border-r" : "",
    props.index === 1 && props.total > 2 ? "border-b border-[var(--border)] sm:border-b-0 lg:border-r" : "",
    props.index === 2 ? "lg:border-r-0" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={`min-w-0 bg-[var(--card)] px-3 py-2.5 ${borderClass}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-[11px] font-semibold uppercase tracking-normal text-[var(--faint)]">{props.title}</div>
        {props.pill}
      </div>
      <div className="mt-1.5 truncate text-[13px] font-medium text-[var(--text)]">{props.value}</div>
      <div className="mt-1 line-clamp-2 text-[11px] leading-5 text-[var(--muted)]">{props.detail}</div>
    </div>
  );
}

function ChannelConfigCard(props: {
  title: string;
  description?: string;
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  onDriftChange: (value: boolean) => void;
  onRiskChange: (value: boolean) => void;
  onSuggestionChange: (value: boolean) => void;
  onTradeChange: (value: boolean) => void;
  onDailyReportChange: (value: boolean) => void;
  driftEnabled: boolean;
  riskEnabled: boolean;
  suggestionEnabled: boolean;
  tradeEnabled: boolean;
  dailyReportEnabled: boolean;
  summary: StoreNotificationStatusSummary["channels"]["telegram"] | StoreNotificationStatusSummary["channels"]["feishu"] | null;
  telegramAssistant?: StoreNotificationStatusSummary["telegramAssistant"] | null;
  statusLoading: boolean;
  onSendTest: () => void;
  testing: boolean;
  testDisabledReason?: string | null;
  /** Telegram only: webhook 注册 */
  webhookInfo?: TelegramWebhookInfo | null;
  webhookRegistering?: boolean;
  onRegisterWebhook?: () => void;
}) {
  const eventsText = props.statusLoading
    ? "已生效触发：读取中"
    : props.summary?.deliveryEvents?.length
      ? `已生效触发：${props.summary.deliveryEvents.join(" / ")}`
      : "已生效触发：当前未开启";
  const effectiveDisabledReason = props.statusLoading
    ? "正在读取已保存状态，请稍后再试。"
    : props.testDisabledReason || null;
  const testDisabled = props.testing || Boolean(effectiveDisabledReason);

  return (
    <SubsectionCard title={props.title} description={props.description}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <DaaSurfaceStatusPill tone={props.summary ? channelPillTone(props.summary) : "neutral"}>
          {props.statusLoading ? "加载中" : props.summary ? channelPillText(props.summary) : "状态未知"}
        </DaaSurfaceStatusPill>
        <div className="text-[11px] text-[var(--faint)]">{eventsText}</div>
      </div>

      <div className={`mb-3 grid overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] sm:grid-cols-2 ${props.telegramAssistant ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
        <ChannelStatusTile
          index={0}
          total={props.telegramAssistant ? 3 : 2}
          title="凭证状态"
          value={props.statusLoading ? "加载中" : props.summary?.configured ? "已配置完整" : "缺少凭证"}
          detail={
            props.statusLoading
              ? "正在读取凭证状态"
              : props.summary?.secretStates?.length
                ? props.summary.secretStates.map((item) => `${item.key} ${item.configured ? "已配置" : "缺失"}`).join(" · ")
                : "暂无凭证状态"
          }
        />
        <ChannelStatusTile
          index={1}
          total={props.telegramAssistant ? 3 : 2}
          title="最近投递"
          value={props.statusLoading ? "加载中" : formatSummaryTime(props.summary?.lastAttemptAt)}
          detail={props.statusLoading ? "正在读取最近一次投递结果" : props.summary?.lastErrorMessage || "这里会显示最近一次失败原因或最近成功时间。"}
        />
        {props.telegramAssistant ? (
          <ChannelStatusTile
            index={2}
            total={3}
            title="对话助手"
            pill={(
              <DaaSurfaceStatusPill tone={telegramAssistantPillTone(props.telegramAssistant)}>
                {telegramAssistantPillText(props.telegramAssistant)}
              </DaaSurfaceStatusPill>
            )}
            value={
              props.statusLoading
                ? "加载中"
                : props.telegramAssistant.ready
                  ? "Web 与 Telegram 共用上下文"
                  : "还不能稳定接收入站消息"
            }
            detail={
              props.statusLoading
                ? "正在读取对话助手状态"
                : props.telegramAssistant.ready
                  ? `最近会话：${formatSummaryTime(props.telegramAssistant.lastSessionAt)}`
                  : props.telegramAssistant.secretStates.map((item) => `${item.key} ${item.configured ? "已配置" : "缺失"}`).join(" · ")
            }
          />
        ) : null}
      </div>

      {props.onRegisterWebhook ? (
        <div className="mb-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-normal text-[var(--faint)]">Webhook</div>
            <DaaSurfaceStatusPill tone={props.webhookInfo?.url ? "success" : "warning"}>
              {props.webhookInfo?.url ? "已注册" : "未注册"}
            </DaaSurfaceStatusPill>
          </div>
          {props.webhookInfo?.url ? (
            <div className="mt-2 space-y-0.5 text-[11px] leading-5 text-[var(--muted)]">
              <div className="break-all">URL: {props.webhookInfo.url}</div>
              <div>Bot: @{props.webhookInfo.botUsername || "unknown"}</div>
              {props.webhookInfo.pendingUpdateCount > 0 ? (
                <div>待处理消息: {props.webhookInfo.pendingUpdateCount}</div>
              ) : null}
              {props.webhookInfo.lastErrorMessage ? (
                <div className="text-[var(--danger)]">错误: {props.webhookInfo.lastErrorMessage}</div>
              ) : null}
            </div>
          ) : (
            <div className="mt-2 text-xs leading-5 text-[var(--muted)]">
              Webhook 未注册，对话助手无法接收消息。点击下方按钮一键完成注册。
            </div>
          )}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={props.onRegisterWebhook}
              disabled={props.webhookRegistering}
              className={secondaryButtonClassName}
            >
              {props.webhookRegistering ? "注册中…" : props.webhookInfo?.url ? "重新注册 Webhook" : "注册 Webhook"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-xs font-semibold text-[var(--text)]">触发事件</div>
        <button
          type="button"
          onClick={props.onSendTest}
          disabled={testDisabled}
          title={effectiveDisabledReason || "发送测试消息"}
          className={secondaryButtonClassName}
        >
          <Send size={13} />
          {props.testing ? "发送中…" : effectiveDisabledReason ? "暂不可用" : "发送测试消息"}
        </button>
      </div>
      {effectiveDisabledReason ? (
        <div className="mb-3 text-[11px] leading-5 text-[var(--faint)]">
          {effectiveDisabledReason}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <CheckboxRow checked={props.enabled} onChange={props.onEnabledChange}>
          启用 {props.title} 通知
        </CheckboxRow>
        <CheckboxRow checked={props.driftEnabled} onChange={props.onDriftChange}>
          偏移触发时通知
        </CheckboxRow>
        <CheckboxRow checked={props.riskEnabled} onChange={props.onRiskChange}>
          风控触发时通知
        </CheckboxRow>
        <CheckboxRow checked={props.suggestionEnabled} onChange={props.onSuggestionChange}>
          再平衡建议生成时通知
        </CheckboxRow>
        <CheckboxRow checked={props.tradeEnabled} onChange={props.onTradeChange}>
          交易执行时通知
        </CheckboxRow>
        <CheckboxRow checked={props.dailyReportEnabled} onChange={props.onDailyReportChange}>
          每日分析报告
        </CheckboxRow>
      </div>
    </SubsectionCard>
  );
}

export function SettingsNotificationSection(props: {
  config: DaaSystemConfig;
  setConfig: SettingsConfigSetter;
}) {
  const { config, setConfig } = props;
  const [summary, setSummary] = useState<StoreNotificationStatusSummary | null>(null);
  const [entries, setEntries] = useState<StoreNotificationDeliveryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [testingChannel, setTestingChannel] = useState<"telegram" | "feishu" | null>(null);
  const [webhookInfo, setWebhookInfo] = useState<TelegramWebhookInfo | null>(null);
  const [webhookRegistering, setWebhookRegistering] = useState(false);

  const loadStatus = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setStatusError("");
    try {
      const data = await listNotificationDeliveries({ limit: 8 });
      setEntries(data.entries || []);
      setSummary(data.summary || null);
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "通知状态加载失败");
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus(false);
  }, [loadStatus]);

  useEffect(() => {
    function onSaved() {
      void loadStatus(true);
    }
    window.addEventListener(DAA_WORKBENCH_DATA_UPDATED_EVENT, onSaved);
    return () => window.removeEventListener(DAA_WORKBENCH_DATA_UPDATED_EVENT, onSaved);
  }, [loadStatus]);

  // Webhook 状态加载
  const loadWebhookInfo = useCallback(async () => {
    try {
      const info = await getTelegramWebhookStatus();
      setWebhookInfo(info);
    } catch { /* 忽略 — 可能 bot token 未配置 */ }
  }, []);

  useEffect(() => {
    void loadWebhookInfo();
  }, [loadWebhookInfo]);

  const handleRegisterWebhook = useCallback(async () => {
    setWebhookRegistering(true);
    try {
      const result = await registerTelegramWebhook();
      if (result.success) {
        toast.success(`Webhook 已注册到 @${result.botUsername}`);
        setWebhookInfo(result.info);
        await loadStatus(true);
      } else {
        toast.error("Webhook 注册失败");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Webhook 注册失败");
    } finally {
      setWebhookRegistering(false);
    }
  }, [loadStatus]);

  const handleSendTest = useCallback(async (channel: "telegram" | "feishu") => {
    const key = channel === "telegram" ? "telegram_bot_token" : "feishu_webhook_url";
    setTestingChannel(channel);
    try {
      const result = await testSecretConnectivity(key, "deliver");
      if (result.success) toast.success(result.message);
      else toast.error(result.message);
      await loadStatus(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "测试消息发送失败");
    } finally {
      setTestingChannel(null);
    }
  }, [loadStatus]);

  const latestJob = summary?.recentJobs?.[0] || null;
  const dailySchedule = formatDerivedDailySchedule(config.policy.review.scheduledTimeUtc);
  const telegramSummary = summary?.channels.telegram || null;
  const telegramAssistant = summary?.telegramAssistant || null;
  const feishuSummary = summary?.channels.feishu || null;
  const statusLoading = loading && !summary && !statusError;

  return (
    <SectionCard title="通知">
        <div className="grid gap-4">
          <div className="flex flex-wrap justify-between gap-3">
            <div className="max-w-[720px]">
              <div className="text-[13px] font-semibold text-[var(--text)]">真实运行态</div>
              <div className="mt-1.5 text-xs leading-6 text-[var(--muted)]">
                这里只看已经生效的配置、凭证和最近投递结果；你在本页勾选的改动，保存前不会影响这里。
              </div>
            </div>
            <button
              type="button"
              onClick={() => void loadStatus(true)}
              disabled={loading || refreshing}
              className={actionButtonClassName}
            >
              <RefreshCcw size={14} className={refreshing ? "animate-spin" : ""} />
              {refreshing ? "刷新中…" : "刷新运行状态"}
            </button>
          </div>

          <div className="grid overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] sm:grid-cols-2 lg:grid-cols-4">
            <RunningStatusTile
              index={0}
              title="自动调度"
              value={statusLoading ? "加载中" : summary?.cronConfigured ? "已就绪" : "待配置"}
              detail={statusLoading ? "正在读取自动调度状态" : summary?.cronConfigured ? "调度鉴权已配置" : "调度鉴权缺失"}
              meta={statusLoading ? "这里只展示已生效的运行状态。" : latestJob ? `最近任务：${scheduledJobLabel(latestJob.jobType)} · ${latestJob.status} · ${formatSummaryTime(latestJob.startedAt)}` : "当前还没有调度执行记录。"}
              pill={<DaaSurfaceStatusPill tone={statusLoading ? "neutral" : summary?.cronConfigured ? "success" : "warning"}>{statusLoading ? "加载中" : summary?.cronConfigured ? "已配置" : "未配置"}</DaaSurfaceStatusPill>}
            />
            <RunningStatusTile
              index={1}
              title="Telegram 通知"
              value={statusLoading ? "加载中" : telegramSummary?.configured ? "凭证完整" : "凭证不完整"}
              detail={statusLoading ? "正在读取 Telegram 状态" : telegramSummary?.enabled ? "运行中" : "当前关闭"}
              meta={statusLoading ? "会在读取完成后显示最近一次投递结果。" : telegramSummary?.lastErrorMessage || `最近投递：${formatSummaryTime(telegramSummary?.lastAttemptAt)}`}
              pill={<DaaSurfaceStatusPill tone={statusLoading ? "neutral" : telegramSummary ? channelPillTone(telegramSummary) : "neutral"}>{statusLoading ? "加载中" : telegramSummary ? channelPillText(telegramSummary) : "未知"}</DaaSurfaceStatusPill>}
            />
            <RunningStatusTile
              index={2}
              title="Telegram 对话"
              value={statusLoading ? "加载中" : telegramAssistant?.ready ? "已就绪" : "待补配置"}
              detail={statusLoading ? "正在读取 Telegram 对话状态" : telegramAssistant?.ready ? "入站消息、上下文和待确认执行已经接通" : "当前还不能稳定接收入站消息"}
              meta={statusLoading
                ? "会在读取完成后显示最近一次对话。"
                : telegramAssistant?.lastSessionAt
                  ? `最近会话：${formatSummaryTime(telegramAssistant.lastSessionAt)} · ${telegramAssistant.participantId || telegramAssistant.title || "Telegram"}`
                  : telegramAssistant?.secretStates?.length
                    ? telegramAssistant.secretStates.map((item) => `${item.key} ${item.configured ? "已配置" : "缺失"}`).join(" · ")
                    : "当前还没有 Telegram 对话记录。"}
              pill={<DaaSurfaceStatusPill tone={statusLoading || !telegramAssistant ? "neutral" : telegramAssistantPillTone(telegramAssistant)}>{statusLoading || !telegramAssistant ? "加载中" : telegramAssistantPillText(telegramAssistant)}</DaaSurfaceStatusPill>}
            />
            <RunningStatusTile
              index={3}
              title="飞书通知"
              value={statusLoading ? "加载中" : feishuSummary?.configured ? "凭证完整" : "凭证不完整"}
              detail={statusLoading ? "正在读取飞书状态" : feishuSummary?.enabled ? "运行中（仅出站 webhook）" : "当前关闭"}
              meta={statusLoading ? "会在读取完成后显示最近一次投递结果。" : feishuSummary?.lastErrorMessage || `最近投递：${formatSummaryTime(feishuSummary?.lastAttemptAt)} · 当前未接飞书入站对话`}
              pill={<DaaSurfaceStatusPill tone={statusLoading ? "neutral" : feishuSummary ? channelPillTone(feishuSummary) : "neutral"}>{statusLoading ? "加载中" : feishuSummary ? channelPillText(feishuSummary) : "未知"}</DaaSurfaceStatusPill>}
            />
          </div>

          {statusError ? (
            <div className="rounded-[var(--radius-md)] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2.5 text-xs text-[var(--danger)]">
              {statusError}
            </div>
          ) : null}

          <div className="mt-1">
            <FieldLabel>当前自动分析时间</FieldLabel>
            <div className="max-w-[520px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3">
              <div className="text-[13px] font-semibold text-[var(--text)]">
                {dailySchedule.title}
              </div>
              <div className="mt-1.5 text-[11px] leading-5 text-[var(--faint)]">
                {dailySchedule.hint}
              </div>
            </div>
            <div className="mt-1.5 text-[11px] text-[var(--faint)]">
              如需调整，请回到“策略与风控”修改自动分析时间；保存后会在下一次调度窗口生效。
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <ChannelConfigCard
              title="Telegram"
              enabled={config.notification.telegram.enabled}
              onEnabledChange={(value) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        notification: {
                          ...prev.notification,
                          telegram: {
                            ...prev.notification.telegram,
                            enabled: value,
                          },
                        },
                      }
                    : prev,
                )
              }
              onDriftChange={(value) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        notification: {
                          ...prev.notification,
                          telegram: {
                            ...prev.notification.telegram,
                            onDriftTrigger: value,
                          },
                        },
                      }
                    : prev,
                )
              }
              onRiskChange={(value) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        notification: {
                          ...prev.notification,
                          telegram: {
                            ...prev.notification.telegram,
                            onRiskTriggered: value,
                          },
                        },
                      }
                    : prev,
                )
              }
              onSuggestionChange={(value) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        notification: {
                          ...prev.notification,
                          telegram: {
                            ...prev.notification.telegram,
                            onSuggestionGenerated: value,
                          },
                        },
                      }
                    : prev,
                )
              }
              onTradeChange={(value) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        notification: {
                          ...prev.notification,
                          telegram: {
                            ...prev.notification.telegram,
                            onTradeExecuted: value,
                          },
                        },
                      }
                    : prev,
                )
              }
              onDailyReportChange={(value) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        notification: {
                          ...prev.notification,
                          telegram: {
                            ...prev.notification.telegram,
                            dailyReport: value,
                          },
                        },
                      }
                    : prev,
                )
              }
              driftEnabled={config.notification.telegram.onDriftTrigger}
              riskEnabled={config.notification.telegram.onRiskTriggered}
              suggestionEnabled={config.notification.telegram.onSuggestionGenerated}
              tradeEnabled={config.notification.telegram.onTradeExecuted}
              dailyReportEnabled={config.notification.telegram.dailyReport}
              summary={telegramSummary}
              telegramAssistant={telegramAssistant}
              statusLoading={statusLoading}
              onSendTest={() => void handleSendTest("telegram")}
              testing={testingChannel === "telegram"}
              testDisabledReason={telegramSummary?.configured ? null : "请先在凭证区保存 Telegram Bot Token 与 Chat ID，再发送测试消息。"}
              webhookInfo={webhookInfo}
              webhookRegistering={webhookRegistering}
              onRegisterWebhook={handleRegisterWebhook}
            />

            <ChannelConfigCard
              title="飞书"
              enabled={config.notification.feishu.enabled}
              onEnabledChange={(value) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        notification: {
                          ...prev.notification,
                          feishu: {
                            ...prev.notification.feishu,
                            enabled: value,
                          },
                        },
                      }
                    : prev,
                )
              }
              onDriftChange={(value) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        notification: {
                          ...prev.notification,
                          feishu: {
                            ...prev.notification.feishu,
                            onDriftTrigger: value,
                          },
                        },
                      }
                    : prev,
                )
              }
              onRiskChange={(value) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        notification: {
                          ...prev.notification,
                          feishu: {
                            ...prev.notification.feishu,
                            onRiskTriggered: value,
                          },
                        },
                      }
                    : prev,
                )
              }
              onSuggestionChange={(value) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        notification: {
                          ...prev.notification,
                          feishu: {
                            ...prev.notification.feishu,
                            onSuggestionGenerated: value,
                          },
                        },
                      }
                    : prev,
                )
              }
              onTradeChange={(value) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        notification: {
                          ...prev.notification,
                          feishu: {
                            ...prev.notification.feishu,
                            onTradeExecuted: value,
                          },
                        },
                      }
                    : prev,
                )
              }
              onDailyReportChange={(value) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        notification: {
                          ...prev.notification,
                          feishu: {
                            ...prev.notification.feishu,
                            dailyReport: value,
                          },
                        },
                      }
                    : prev,
                )
              }
              driftEnabled={config.notification.feishu.onDriftTrigger}
              riskEnabled={config.notification.feishu.onRiskTriggered}
              suggestionEnabled={config.notification.feishu.onSuggestionGenerated}
              tradeEnabled={config.notification.feishu.onTradeExecuted}
              dailyReportEnabled={config.notification.feishu.dailyReport}
              summary={feishuSummary}
              statusLoading={statusLoading}
              onSendTest={() => void handleSendTest("feishu")}
              testing={testingChannel === "feishu"}
              testDisabledReason={feishuSummary?.configured ? null : "请先在凭证区保存飞书 Webhook，再发送测试消息。"}
            />
          </div>

          <SubsectionCard title="最近通知投递">
            {loading ? (
              <div className="py-3 text-xs text-[var(--muted)]">加载通知投递记录…</div>
            ) : entries.length > 0 ? (
              <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border)]">
                <table className="w-full border-collapse bg-[var(--surface)] text-xs">
                  <thead>
                    <tr>
                      {["时间", "渠道", "事件", "结果", "来源", "说明"].map((label) => (
                        <th
                          key={label}
                          className="border-b border-[var(--border)] px-2 py-2.5 text-left text-[11px] font-semibold uppercase tracking-normal text-[var(--faint)]"
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr key={entry.id}>
                        <td className="border-b border-[var(--border)] px-2 py-3 text-[var(--text)]">{formatDateTime(entry.createdAt)}</td>
                        <td className="border-b border-[var(--border)] px-2 py-3 text-[var(--muted)]">{entry.channel === "telegram" ? "Telegram" : "飞书"}</td>
                        <td className="border-b border-[var(--border)] px-2 py-3 text-[var(--muted)]">{deliveryEventLabel(entry.eventType)}</td>
                        <td className="border-b border-[var(--border)] px-2 py-3">
                          <DaaSurfaceStatusPill tone={entry.success ? "success" : "warning"}>{entry.success ? "成功" : "失败"}</DaaSurfaceStatusPill>
                        </td>
                        <td className="border-b border-[var(--border)] px-2 py-3 text-[var(--muted)]">{triggerSourceLabel(entry.triggerSource)}</td>
                        <td className="border-b border-[var(--border)] px-2 py-3 leading-5 text-[var(--muted)]">
                          {entry.errorMessage || entry.recipientHint || "已完成投递"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-3 text-xs leading-6 text-[var(--muted)]">
                当前还没有通知投递记录。若你已经启用了开关但这里仍为空，优先检查凭证是否已保存、页面配置是否已保存，以及调度密钥是否存在。
              </div>
            )}
          </SubsectionCard>
        </div>
      </SectionCard>
  );
}
