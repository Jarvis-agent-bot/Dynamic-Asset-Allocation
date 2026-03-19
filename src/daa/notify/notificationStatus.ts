import { listSecretStatuses } from "@/src/daa/config/secretsManager";
import { listJobExecutionLogs } from "@/src/daa/store/jobExecutionLogRepo";
import {
  listNotificationDeliveryLogs,
  type DaaNotificationChannel,
  type DaaNotificationDeliveryLog,
} from "@/src/daa/store/notificationDeliveryLogRepo";
import { getDaaSystemConfig } from "@/src/daa/store/daaStorePg";

export type NotificationChannelStatusSummary = {
  channel: DaaNotificationChannel;
  enabled: boolean;
  configured: boolean;
  secretStates: Array<{ key: string; configured: boolean }>;
  deliveryEvents: string[];
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastErrorMessage: string | null;
};

export type NotificationStatusSummary = {
  cronConfigured: boolean;
  recentJobs: Array<{
    jobType: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
  }>;
  channels: Record<DaaNotificationChannel, NotificationChannelStatusSummary>;
};

function buildChannelSummary(input: {
  channel: DaaNotificationChannel;
  enabled: boolean;
  secretStates: Array<{ key: string; configured: boolean }>;
  deliveryEvents: string[];
  logs: DaaNotificationDeliveryLog[];
}): NotificationChannelStatusSummary {
  const lastAttempt = input.logs[0] || null;
  const lastSuccess = input.logs.find((item) => item.success) || null;
  const lastFailure = input.logs.find((item) => !item.success) || null;
  return {
    channel: input.channel,
    enabled: input.enabled,
    configured: input.secretStates.every((item) => item.configured),
    secretStates: input.secretStates,
    deliveryEvents: input.deliveryEvents,
    lastAttemptAt: lastAttempt?.createdAt || null,
    lastSuccessAt: lastSuccess?.createdAt || null,
    lastFailureAt: lastFailure?.createdAt || null,
    lastErrorMessage: lastFailure?.errorMessage || null,
  };
}

export async function buildNotificationStatusSummary(): Promise<NotificationStatusSummary> {
  const [system, secrets, jobs, deliveryLogs] = await Promise.all([
    getDaaSystemConfig(),
    listSecretStatuses(),
    listJobExecutionLogs(10),
    listNotificationDeliveryLogs({ limit: 30 }),
  ]);

  const secretConfigured = new Map(secrets.map((item) => [item.key, item.source !== "empty"] as const));
  const telegramLogs = deliveryLogs.filter((item) => item.channel === "telegram");
  const feishuLogs = deliveryLogs.filter((item) => item.channel === "feishu");

  return {
    cronConfigured: Boolean(secretConfigured.get("cron_token")),
    recentJobs: jobs.slice(0, 6).map((item) => ({
      jobType: item.jobType,
      status: item.status,
      startedAt: item.startedAt,
      finishedAt: item.finishedAt,
    })),
    channels: {
      telegram: buildChannelSummary({
        channel: "telegram",
        enabled: Boolean(system.config.notification.telegram.enabled),
        secretStates: [
          { key: "telegram_bot_token", configured: Boolean(secretConfigured.get("telegram_bot_token")) },
          { key: "telegram_chat_id", configured: Boolean(secretConfigured.get("telegram_chat_id")) },
        ],
        deliveryEvents: [
          system.config.notification.telegram.onDriftTrigger ? "偏移触发" : "",
          system.config.notification.telegram.onSuggestionGenerated ? "建议生成" : "",
          system.config.notification.telegram.onTradeExecuted ? "交易执行" : "",
          system.config.notification.telegram.dailyReport ? "每日报告" : "",
        ].filter(Boolean),
        logs: telegramLogs,
      }),
      feishu: buildChannelSummary({
        channel: "feishu",
        enabled: Boolean(system.config.notification.feishu.enabled),
        secretStates: [
          { key: "feishu_webhook_url", configured: Boolean(secretConfigured.get("feishu_webhook_url")) },
        ],
        deliveryEvents: [
          system.config.notification.feishu.onDriftTrigger ? "偏移触发" : "",
          system.config.notification.feishu.onSuggestionGenerated ? "建议生成" : "",
          system.config.notification.feishu.onTradeExecuted ? "交易执行" : "",
          system.config.notification.feishu.dailyReport ? "每日报告" : "",
        ].filter(Boolean),
        logs: feishuLogs,
      }),
    },
  };
}
