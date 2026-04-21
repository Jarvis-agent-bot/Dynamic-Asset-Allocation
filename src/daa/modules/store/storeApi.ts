import { requestData } from "@/src/daa/api/client";
import {
  normalizeSystemConfig,
  type DaaSystemConfigPatch,
  type DaaSystemConfig,
} from "@/src/daa/config/systemConfig";
import type { NotificationStatusSummary } from "@/src/daa/notify/notificationStatus";
import type {
  DaaMarketContext,
  DaaMarketIndicatorSnapshot,
} from "@/src/daa/modules/marketContext/marketContextTypes";
import type {
  DaaNotificationChannel,
  DaaNotificationDeliveryLog,
} from "@/src/daa/store/notificationDeliveryLogRepo";

export type StoreCashLedgerEntry = {
  id: string;
  ts: string;
  side: "deposit" | "withdraw";
  amount: number;
  baseCurrency: string;
  entryKind?: string | null;
  accountBaseCurrency?: string | null;
  amountInAccountBase?: number | null;
  fxRateToAccount?: number | null;
  ticketId?: string | null;
  cycleId?: string | null;
  settlementTs?: string | null;
  note?: string | null;
  createdAt?: string;
};

export type StoreCashLedgerApplyInput = {
  side: "deposit" | "withdraw";
  amount: number;
  baseCurrency?: string;
  note?: string;
};

export type StoreCashLedgerApplyResult = {
  entry: StoreCashLedgerEntry;
  account: {
    baseCurrency: string;
    cash: number;
    investableCash: number;
    frozenCash: number;
    totalEquity: number | null;
  };
  equitySnapshot: {
    ts: string;
    totalEquity: number;
    holdingsValue: number;
    cash: number;
    source: string;
  };
};

export type StoreNotificationDeliveryEntry = DaaNotificationDeliveryLog;
export type StoreNotificationStatusSummary = NotificationStatusSummary;

export type StoreSystemConfigEnvelope = {
  version: number;
  updatedAt: string;
  config: DaaSystemConfig;
};

export type StoreSystemConfigPatch = DaaSystemConfigPatch;

export type StoreMarketIndicatorRefreshResult = {
  marketContext: DaaMarketContext | null;
  indicators: DaaMarketIndicatorSnapshot[];
  refreshedCount: number;
  at: string;
};

export async function getSystemConfig(): Promise<StoreSystemConfigEnvelope> {
  const data = await requestData<{ version?: unknown; updatedAt?: unknown; config?: unknown }>("/api/daa/store/system-config", {
    method: "GET",
    cache: "no-store",
  });
  const version = Number(data.version);
  return {
    version: Number.isFinite(version) && version > 0 ? Math.trunc(version) : 1,
    updatedAt: String(data.updatedAt || new Date().toISOString()),
    config: normalizeSystemConfig(data.config ?? {}),
  };
}

export async function patchSystemConfig(input: {
  patches: StoreSystemConfigPatch[];
  baseVersion?: number;
}): Promise<StoreSystemConfigEnvelope> {
  const data = await requestData<{ version?: unknown; updatedAt?: unknown; config?: unknown }>("/api/daa/store/system-config", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      baseVersion: input.baseVersion,
      patches: input.patches,
    }),
  });
  const version = Number(data.version);
  return {
    version: Number.isFinite(version) && version > 0 ? Math.trunc(version) : 1,
    updatedAt: String(data.updatedAt || new Date().toISOString()),
    config: normalizeSystemConfig(data.config ?? {}),
  };
}

export async function saveSystemConfig(input: {
  config: DaaSystemConfig;
  baseVersion?: number;
}): Promise<StoreSystemConfigEnvelope> {
  const data = await requestData<{ version?: unknown; updatedAt?: unknown; config?: unknown }>("/api/daa/store/system-config", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      baseVersion: input.baseVersion,
      config: input.config,
    }),
  });
  const version = Number(data.version);
  return {
    version: Number.isFinite(version) && version > 0 ? Math.trunc(version) : 1,
    updatedAt: String(data.updatedAt || new Date().toISOString()),
    config: normalizeSystemConfig(data.config ?? {}),
  };
}

export async function appendCashLedgerEntry(input: StoreCashLedgerApplyInput): Promise<StoreCashLedgerApplyResult> {
  return requestData<StoreCashLedgerApplyResult>("/api/daa/store/cash-ledger", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function listNotificationDeliveries(input: {
  limit?: number;
  channel?: DaaNotificationChannel | null;
} = {}): Promise<{
  entries: StoreNotificationDeliveryEntry[];
  summary: StoreNotificationStatusSummary;
}> {
  const qs = new URLSearchParams();
  qs.set("limit", String(Math.max(1, Math.min(100, Math.trunc(Number(input.limit) || 10)))));
  if (input.channel) qs.set("channel", input.channel);
  return requestData<{
    entries: StoreNotificationDeliveryEntry[];
    summary: StoreNotificationStatusSummary;
  }>(`/api/daa/store/notification-deliveries?${qs.toString()}`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function refreshMarketIndicators(): Promise<StoreMarketIndicatorRefreshResult> {
  return requestData<StoreMarketIndicatorRefreshResult>("/api/daa/store/market-indicators/refresh", {
    method: "POST",
    headers: { "content-type": "application/json" },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Secrets
// ─────────────────────────────────────────────────────────────────────────────

export type StoreSecretStatus = {
  key: string;
  label: string;
  group: string;
  masked: string;
  source: "env" | "db" | "empty";
  sensitive: boolean;
  readOnly: boolean;
  updatedAt: string | null;
};

export type StoreSecretTestResult = {
  key: string;
  success: boolean;
  message: string;
  latencyMs: number;
};

export type StoreSecretTestMode = "connectivity" | "deliver";

export async function listSecrets(): Promise<StoreSecretStatus[]> {
  const data = await requestData<{ secrets: StoreSecretStatus[] }>("/api/daa/store/secrets", {
    method: "GET",
    cache: "no-store",
  });
  return Array.isArray(data.secrets) ? data.secrets : [];
}

export async function writeSecretValue(key: string, value: string): Promise<StoreSecretStatus[]> {
  const data = await requestData<{ secrets: StoreSecretStatus[] }>("/api/daa/store/secrets", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
  return Array.isArray(data.secrets) ? data.secrets : [];
}

export async function deleteSecretValue(key: string): Promise<StoreSecretStatus[]> {
  const data = await requestData<{ secrets: StoreSecretStatus[] }>("/api/daa/store/secrets", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key }),
  });
  return Array.isArray(data.secrets) ? data.secrets : [];
}

export async function testSecretConnectivity(
  key: string,
  mode: StoreSecretTestMode = "connectivity",
): Promise<StoreSecretTestResult> {
  const data = await requestData<{ result: StoreSecretTestResult }>("/api/daa/store/secrets/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key, mode }),
  });
  return data.result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Telegram Webhook
// ─────────────────────────────────────────────────────────────────────────────

export type TelegramWebhookInfo = {
  url: string;
  hasCustomCertificate: boolean;
  pendingUpdateCount: number;
  lastErrorDate: number | null;
  lastErrorMessage: string | null;
  botUsername: string | null;
};

export type TelegramWebhookRegisterResult = {
  success: boolean;
  botUsername: string;
  webhookUrl: string;
  allowlist: string;
  info: TelegramWebhookInfo;
  message: string;
};

export async function registerTelegramWebhook(allowlist?: string): Promise<TelegramWebhookRegisterResult> {
  return requestData<TelegramWebhookRegisterResult>("/api/daa/store/secrets/telegram-webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "register", allowlist }),
  });
}

export async function getTelegramWebhookStatus(): Promise<TelegramWebhookInfo> {
  return requestData<TelegramWebhookInfo>("/api/daa/store/secrets/telegram-webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "status" }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Target weights
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 将目标权重写入系统配置 — 覆盖 strategy.targetWeights。
 * 先读取当前版本再 patch，处理版本冲突。
 */
export async function applyTargetWeights(
  weights: Record<string, number>,
): Promise<StoreSystemConfigEnvelope> {
  const current = await getSystemConfig();
  return patchSystemConfig({
    baseVersion: current.version,
    patches: [{ path: "strategy.targetWeights", value: weights }],
  });
}
