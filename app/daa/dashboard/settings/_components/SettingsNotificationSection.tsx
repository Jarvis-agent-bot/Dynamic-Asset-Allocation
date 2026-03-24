"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { RefreshCcw, Send } from "lucide-react";
import { toast } from "sonner";

import { formatDateTime } from "@/app/daa/dashboard/_components/daaFormatters";
import { DAA_DASHBOARD_DATA_UPDATED_EVENT } from "@/app/daa/dashboard/dashboardEvents";
import { DaaSurfaceStatusPill } from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import type { DaaSystemConfig } from "@/src/daa/config/systemConfig";
import {
  listNotificationDeliveries,
  testSecretConnectivity,
  type StoreNotificationDeliveryEntry,
  type StoreNotificationStatusSummary,
} from "@/src/daa/modules/store/storeApi";

import {
  CheckboxRow,
  FieldLabel,
  SectionCard,
  SubsectionCard,
  settingsGridCols2Style,
  type SettingsConfigSetter,
} from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitives";

const statusTileStyle: CSSProperties = {
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "rgba(255,255,255,0.02)",
  padding: 14,
};

const actionButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 12px",
  borderRadius: 999,
  border: "1px solid var(--border-strong)",
  background: "var(--elevated)",
  color: "var(--text)",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
};

const secondaryButtonStyle: CSSProperties = {
  ...actionButtonStyle,
  padding: "7px 11px",
  fontSize: 11,
};

function deliveryEventLabel(value: string): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "suggestion_generated") return "建议生成";
  if (normalized === "daily_report") return "每日报告";
  if (normalized === "drift_triggered") return "偏移触发";
  if (normalized === "trade_executed") return "交易执行";
  if (normalized === "test_message") return "测试消息";
  return normalized || "未知事件";
}

function triggerSourceLabel(value: string): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "cron_daily_analysis") return "定时分析";
  if (normalized === "cron_drift_check") return "漂移检查";
  if (normalized === "manual_trade_execution") return "手工成交";
  if (normalized === "decision_trade_execution") return "手工执行建议";
  if (normalized === "rebalance_cycle_execution") return "周期执行";
  if (normalized === "settings_secret_test") return "设置页测试";
  return normalized || "未知来源";
}

function channelPillTone(input: {
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
}): "slate" | "amber" | "green" {
  if (input.ready) return "green";
  if (input.lastSessionAt) return "amber";
  return "slate";
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

function formatDerivedDailySchedule(analysisTimeUtc: string): {
  title: string;
  hint: string;
} {
  const matched = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(analysisTimeUtc || "").trim());
  if (!matched) {
    return {
      title: "未识别自动分析时间",
      hint: "请先在“再平衡策略”里填写合法的 UTC 时间（HH:MM），通知和每日报告会跟随这一时间窗口。",
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
      hint: "系统当前是按整点 cron 轮询，所以分钟部分会向后归入下一个整点窗口；通知与每日报告共用这一调度口径。",
    };
  }
  return {
    title: `${rawLabel}，当前按 UTC ${pad(scheduledHour)}:00（北京 ${pad(beijingHour)}:00）执行`,
    hint: "通知建议生成与每日报告跟随同一套自动分析时间，不再单独维护第二套通知时间。",
  };
}

function RunningStatusTile(props: {
  title: string;
  value: string;
  detail: string;
  meta?: string;
  pill?: React.ReactNode;
}) {
  return (
    <div style={statusTileStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--faint)" }}>{props.title}</div>
        {props.pill}
      </div>
      <div style={{ marginTop: 10, fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{props.value}</div>
      <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.6, color: "var(--muted)" }}>{props.detail}</div>
      {props.meta ? (
        <div style={{ marginTop: 6, fontSize: 11, lineHeight: 1.6, color: "var(--faint)" }}>{props.meta}</div>
      ) : null}
    </div>
  );
}

function ChannelConfigCard(props: {
  title: string;
  description: string;
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  onDriftChange: (value: boolean) => void;
  onSuggestionChange: (value: boolean) => void;
  onTradeChange: (value: boolean) => void;
  onDailyReportChange: (value: boolean) => void;
  driftEnabled: boolean;
  suggestionEnabled: boolean;
  tradeEnabled: boolean;
  dailyReportEnabled: boolean;
  summary: StoreNotificationStatusSummary["channels"]["telegram"] | StoreNotificationStatusSummary["channels"]["feishu"] | null;
  telegramAssistant?: StoreNotificationStatusSummary["telegramAssistant"] | null;
  statusLoading: boolean;
  onSendTest: () => void;
  testing: boolean;
  testDisabledReason?: string | null;
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
    <SubsectionCard
      title={props.title}
      description={props.description}
    >
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <DaaSurfaceStatusPill tone={props.summary ? channelPillTone(props.summary) : "slate"}>
          {props.statusLoading ? "加载中" : props.summary ? channelPillText(props.summary) : "状态未知"}
        </DaaSurfaceStatusPill>
        <div style={{ fontSize: 11, color: "var(--faint)" }}>{eventsText}</div>
      </div>

      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", marginBottom: 14 }}>
        <div style={statusTileStyle}>
          <div style={{ fontSize: 11, color: "var(--faint)" }}>凭证状态</div>
          <div style={{ marginTop: 8, fontSize: 13, color: "var(--text)" }}>
            {props.statusLoading ? "加载中" : props.summary?.configured ? "已配置完整" : "缺少凭证"}
          </div>
          <div style={{ marginTop: 4, fontSize: 11, color: "var(--muted)" }}>
            {props.statusLoading
              ? "正在读取凭证状态"
              : props.summary?.secretStates?.length
              ? props.summary.secretStates.map((item) => `${item.key} ${item.configured ? "已配置" : "缺失"}`).join(" · ")
              : "暂无凭证状态"}
          </div>
        </div>
        <div style={statusTileStyle}>
          <div style={{ fontSize: 11, color: "var(--faint)" }}>最近投递</div>
          <div style={{ marginTop: 8, fontSize: 13, color: "var(--text)" }}>{props.statusLoading ? "加载中" : formatSummaryTime(props.summary?.lastAttemptAt)}</div>
          <div style={{ marginTop: 4, fontSize: 11, color: "var(--muted)" }}>
            {props.statusLoading ? "正在读取最近一次投递结果" : props.summary?.lastErrorMessage || "这里会显示最近一次失败原因或最近成功时间。"}
          </div>
        </div>
        {props.telegramAssistant ? (
          <div style={statusTileStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <div style={{ fontSize: 11, color: "var(--faint)" }}>对话助手</div>
              <DaaSurfaceStatusPill tone={telegramAssistantPillTone(props.telegramAssistant)}>
                {telegramAssistantPillText(props.telegramAssistant)}
              </DaaSurfaceStatusPill>
            </div>
            <div style={{ marginTop: 8, fontSize: 13, color: "var(--text)" }}>
              {props.statusLoading
                ? "加载中"
                : props.telegramAssistant.ready
                  ? "Web 与 Telegram 共用上下文"
                  : "还不能稳定接收入站消息"}
            </div>
            <div style={{ marginTop: 4, fontSize: 11, color: "var(--muted)" }}>
              {props.statusLoading
                ? "正在读取对话助手状态"
                : props.telegramAssistant.ready
                  ? `最近会话：${formatSummaryTime(props.telegramAssistant.lastSessionAt)}`
                  : props.telegramAssistant.secretStates.map((item) => `${item.key} ${item.configured ? "已配置" : "缺失"}`).join(" · ")}
            </div>
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>触发事件</div>
        <button
          type="button"
          onClick={props.onSendTest}
          disabled={testDisabled}
          title={effectiveDisabledReason || "发送测试消息"}
          style={{ ...secondaryButtonStyle, opacity: testDisabled ? 0.6 : 1, cursor: testDisabled ? "not-allowed" : "pointer" }}
        >
          <Send size={13} />
          {props.testing ? "发送中…" : effectiveDisabledReason ? "暂不可用" : "发送测试消息"}
        </button>
      </div>
      {effectiveDisabledReason ? (
        <div style={{ marginBottom: 12, fontSize: 11, lineHeight: 1.7, color: "var(--faint)" }}>
          {effectiveDisabledReason}
        </div>
      ) : null}

      <div style={settingsGridCols2Style}>
        <CheckboxRow checked={props.enabled} onChange={props.onEnabledChange}>
          启用 {props.title} 通知
        </CheckboxRow>
        <CheckboxRow checked={props.driftEnabled} onChange={props.onDriftChange}>
          偏移触发时通知
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
    window.addEventListener(DAA_DASHBOARD_DATA_UPDATED_EVENT, onSaved);
    return () => window.removeEventListener(DAA_DASHBOARD_DATA_UPDATED_EVENT, onSaved);
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
  const dailySchedule = formatDerivedDailySchedule(config.rebalanceStrategy.analysisTimeUtc);
  const telegramSummary = summary?.channels.telegram || null;
  const telegramAssistant = summary?.telegramAssistant || null;
  const feishuSummary = summary?.channels.feishu || null;
  const statusLoading = loading && !summary && !statusError;

  return (
    <section id="settings-notification" className="scroll-mt-28">
      <SectionCard
        title="通知"
        description="先看真实运行态，再改待保存开关，避免把“当前生效”和“草稿修改”混在一起。"
      >
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12 }}>
            <div style={{ maxWidth: 720 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>真实运行态</div>
              <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.7, color: "var(--muted)" }}>
                这里只看已经生效的配置、凭证和最近投递结果；你在本页勾选的改动，保存前不会影响这里。
              </div>
            </div>
            <button
              type="button"
              onClick={() => void loadStatus(true)}
              disabled={loading || refreshing}
              style={{ ...actionButtonStyle, opacity: loading || refreshing ? 0.6 : 1 }}
            >
              <RefreshCcw size={14} className={refreshing ? "animate-spin" : ""} />
              {refreshing ? "刷新中…" : "刷新运行状态"}
            </button>
          </div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <RunningStatusTile
              title="Cron"
              value={statusLoading ? "加载中" : summary?.cronConfigured ? "已就绪" : "待配置"}
              detail={statusLoading ? "正在读取定时任务状态" : summary?.cronConfigured ? "定时任务鉴权已配置" : "定时任务鉴权缺失"}
              meta={statusLoading ? "这里只展示已生效的运行状态。" : latestJob ? `最近任务：${latestJob.jobType} · ${latestJob.status} · ${formatSummaryTime(latestJob.startedAt)}` : "当前还没有 job 执行记录。"}
              pill={<DaaSurfaceStatusPill tone={statusLoading ? "slate" : summary?.cronConfigured ? "green" : "amber"}>{statusLoading ? "加载中" : summary?.cronConfigured ? "已配置" : "未配置"}</DaaSurfaceStatusPill>}
            />
            <RunningStatusTile
              title="Telegram 通知"
              value={statusLoading ? "加载中" : telegramSummary?.configured ? "凭证完整" : "凭证不完整"}
              detail={statusLoading ? "正在读取 Telegram 状态" : telegramSummary?.enabled ? "运行中" : "当前关闭"}
              meta={statusLoading ? "会在读取完成后显示最近一次投递结果。" : telegramSummary?.lastErrorMessage || `最近投递：${formatSummaryTime(telegramSummary?.lastAttemptAt)}`}
              pill={<DaaSurfaceStatusPill tone={statusLoading ? "slate" : telegramSummary ? channelPillTone(telegramSummary) : "slate"}>{statusLoading ? "加载中" : telegramSummary ? channelPillText(telegramSummary) : "未知"}</DaaSurfaceStatusPill>}
            />
            <RunningStatusTile
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
              pill={<DaaSurfaceStatusPill tone={statusLoading || !telegramAssistant ? "slate" : telegramAssistantPillTone(telegramAssistant)}>{statusLoading || !telegramAssistant ? "加载中" : telegramAssistantPillText(telegramAssistant)}</DaaSurfaceStatusPill>}
            />
            <RunningStatusTile
              title="飞书通知"
              value={statusLoading ? "加载中" : feishuSummary?.configured ? "凭证完整" : "凭证不完整"}
              detail={statusLoading ? "正在读取飞书状态" : feishuSummary?.enabled ? "运行中（仅出站 webhook）" : "当前关闭"}
              meta={statusLoading ? "会在读取完成后显示最近一次投递结果。" : feishuSummary?.lastErrorMessage || `最近投递：${formatSummaryTime(feishuSummary?.lastAttemptAt)} · 当前未接飞书入站对话`}
              pill={<DaaSurfaceStatusPill tone={statusLoading ? "slate" : feishuSummary ? channelPillTone(feishuSummary) : "slate"}>{statusLoading ? "加载中" : feishuSummary ? channelPillText(feishuSummary) : "未知"}</DaaSurfaceStatusPill>}
            />
          </div>

          {statusError ? (
            <div style={{ borderRadius: 12, border: "1px solid rgba(248,113,113,0.28)", background: "rgba(127,29,29,0.18)", padding: 12, fontSize: 12, color: "#fecaca" }}>
              {statusError}
            </div>
          ) : null}

          <div style={{ marginTop: 4 }}>
            <FieldLabel>当前自动分析时间</FieldLabel>
            <div style={{ ...statusTileStyle, maxWidth: 520 }}>
              <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 600 }}>
                {dailySchedule.title}
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: "var(--faint)", lineHeight: 1.7 }}>
                {dailySchedule.hint}
              </div>
            </div>
            <div style={{ marginTop: 5, fontSize: 11, color: "var(--faint)" }}>
              如需调整，请回到“再平衡策略”修改自动分析时间；保存后会在下一次 cron 窗口生效。
            </div>
          </div>

          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
            <ChannelConfigCard
              title="Telegram"
              description="这里负责出站通知；下方额外显示入站对话助手是否真正可用。"
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
              suggestionEnabled={config.notification.telegram.onSuggestionGenerated}
              tradeEnabled={config.notification.telegram.onTradeExecuted}
              dailyReportEnabled={config.notification.telegram.dailyReport}
              summary={telegramSummary}
              telegramAssistant={telegramAssistant}
              statusLoading={statusLoading}
              onSendTest={() => void handleSendTest("telegram")}
              testing={testingChannel === "telegram"}
              testDisabledReason={telegramSummary?.configured ? null : "请先在“凭证”区保存 Telegram Bot Token 与 Chat ID，再发送测试消息。"}
            />

            <ChannelConfigCard
              title="飞书"
              description="当前只支持出站 webhook 广播；若要做飞书对话，需要补 App Bot 的入站事件、鉴权和回消息链路。"
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
              suggestionEnabled={config.notification.feishu.onSuggestionGenerated}
              tradeEnabled={config.notification.feishu.onTradeExecuted}
              dailyReportEnabled={config.notification.feishu.dailyReport}
              summary={feishuSummary}
              statusLoading={statusLoading}
              onSendTest={() => void handleSendTest("feishu")}
              testing={testingChannel === "feishu"}
              testDisabledReason={feishuSummary?.configured ? null : "请先在“凭证”区保存飞书 Webhook，再发送测试消息。"}
            />
          </div>

          <SubsectionCard
            title="最近通知投递"
            description="这里只看真实发出去的结果，不看表单勾选。"
          >
            {loading ? (
              <div style={{ padding: "12px 0", fontSize: 12, color: "var(--muted)" }}>加载通知投递记录…</div>
            ) : entries.length > 0 ? (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr>
                      {["时间", "渠道", "事件", "结果", "来源", "说明"].map((label) => (
                        <th
                          key={label}
                          style={{
                            textAlign: "left",
                            padding: "10px 8px",
                            borderBottom: "1px solid var(--border)",
                            color: "var(--faint)",
                            fontSize: 11,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                          }}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr key={entry.id}>
                        <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--border)", color: "var(--text)" }}>{formatDateTime(entry.createdAt)}</td>
                        <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--border)", color: "var(--muted)" }}>{entry.channel === "telegram" ? "Telegram" : "飞书"}</td>
                        <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--border)", color: "var(--muted)" }}>{deliveryEventLabel(entry.eventType)}</td>
                        <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--border)" }}>
                          <DaaSurfaceStatusPill tone={entry.success ? "green" : "amber"}>{entry.success ? "成功" : "失败"}</DaaSurfaceStatusPill>
                        </td>
                        <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--border)", color: "var(--muted)" }}>{triggerSourceLabel(entry.triggerSource)}</td>
                        <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--border)", color: "var(--muted)", lineHeight: 1.6 }}>
                          {entry.errorMessage || entry.recipientHint || "已完成投递"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: "12px 0", fontSize: 12, lineHeight: 1.8, color: "var(--muted)" }}>
                当前还没有通知投递记录。若你已经启用了开关但这里仍为空，优先检查凭证是否已保存、页面配置是否已保存，以及 `cron_token` 是否存在。
              </div>
            )}
          </SubsectionCard>
        </div>
      </SectionCard>
    </section>
  );
}
