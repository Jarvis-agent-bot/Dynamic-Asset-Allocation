import { requestData } from "@/src/daa/api/client";
import {
  normalizeSystemConfig,
  type DaaSystemConfigPatch,
  type DaaSystemConfig,
} from "@/src/daa/config/systemConfig";
import type { NotificationStatusSummary } from "@/src/daa/notify/notificationStatus";
import type {
  DaaMarketContext,
  DaaMarketIndicatorKey,
  DaaMarketIndicatorScope,
  DaaMarketIndicatorSnapshot,
} from "@/src/daa/modules/marketContext/marketContextTypes";
import type {
  DaaNotificationChannel,
  DaaNotificationDeliveryLog,
} from "@/src/daa/store/notificationDeliveryLogRepo";
import type { TradeTicket } from "@/src/daa/modules/trade/tradeTypes";

export type StoreEquitySnapshot = {
  ts: string;
  totalEquity: number;
  holdingsValue: number;
  cash: number;
  source: string;
};

export type StoreRunHistoryEntry = {
  id: string;
  ts: string;
  triggerSource: string;
  requestJson: Record<string, unknown>;
  responseJson: Record<string, unknown>;
  summaryJson: Record<string, unknown>;
};

export type StoreOpLogEntry = {
  id: string;
  ts: string;
  level: "info" | "warn" | "error";
  message: string;
  contextJson: Record<string, unknown>;
};

export type StoreCandidateAsset = {
  id?: string;
  symbol: string;
  market: string;
  currency: string;
  enabled: boolean;
  targetWeightHint: number;
  tags: string[];
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type StoreFxRate = {
  id?: string;
  baseCcy: string;
  quoteCcy: string;
  rate: number;
  source: string;
  asOfTs?: string;
  updatedAt?: string;
};

export type PullDailyFxSnapshotResult = {
  pulledAt: string;
  day: string;
  alreadyPulledToday: boolean;
  updatedPairs?: string[];
  skippedPairs?: string[];
  rates: StoreFxRate[];
};

export type StoreMarketCacheHealth = {
  provider: string;
  totalSnapshots: number;
  freshCount: number;
  staleCount: number;
  missingCount: number;
  errorCount: number;
  unsupportedCount: number;
  recentJobSuccessRatePct: number;
  recentJobFailureRatePct: number;
};

export type StoreMarketCacheRefreshResult = {
  requested: number;
  refreshed: number;
  stale: number;
  missing: number;
  at: string;
};

export type StoreMarketIndicatorRefreshResult = {
  marketContext: DaaMarketContext | null;
  indicators: DaaMarketIndicatorSnapshot[];
  refreshedCount: number;
  at: string;
};

export type StoreMarketIndicatorHistoryResult = {
  keys: DaaMarketIndicatorKey[];
  days: number;
  scope?: DaaMarketIndicatorScope | null;
  history: Record<DaaMarketIndicatorKey, DaaMarketIndicatorSnapshot[]>;
  at: string;
};

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
  equitySnapshot: StoreEquitySnapshot;
};

export type StoreNotificationDeliveryEntry = DaaNotificationDeliveryLog;
export type StoreNotificationStatusSummary = NotificationStatusSummary;

export type StoreSystemConfigEnvelope = {
  version: number;
  updatedAt: string;
  config: DaaSystemConfig;
};

export type StoreSystemConfigPatch = DaaSystemConfigPatch;

export type StoreLlmEnvStatus = {
  provider: string;
  endpointConfigured: boolean;
  apiKeyConfigured: boolean;
  modelConfigured: boolean;
  endpointHint: string;
  model: string;
  reachable?: boolean;
  healthCode?: number | null;
  healthMessage?: string;
  checkedAt?: string | null;
};

export type StoreBrokerSessionState = {
  brokerKind: "sim" | "ibkr_paper" | "crypto_paper";
  status: "disconnected" | "pending_login" | "authenticated" | "expiring" | "reauth_required" | "connector_down";
  accountId: string | null;
  loginUrl: string | null;
  message: string | null;
  lastCheckedAt: string | null;
  lastAuthenticatedAt: string | null;
  lastError: string | null;
  sessionMeta: Record<string, unknown> | null;
  updatedAt: string;
};

export type StoreBrokerOrderSyncResult = {
  kind: "sim" | "ibkr_paper" | "crypto_paper";
  scope: "open" | "recent" | "ticket";
  orderCount: number;
  updatedCount: number;
  positionCount: number;
  tickets: TradeTicket[];
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

export async function getLlmEnvStatus(): Promise<StoreLlmEnvStatus> {
  return requestData<StoreLlmEnvStatus>("/api/daa/workbench/llm/env-status", {
    method: "GET",
    cache: "no-store",
  });
}

export async function getBrokerSessionState(): Promise<StoreBrokerSessionState> {
  return requestData<StoreBrokerSessionState>("/api/daa/broker/session", {
    method: "GET",
    cache: "no-store",
  });
}

export async function startBrokerSession(): Promise<StoreBrokerSessionState> {
  return requestData<StoreBrokerSessionState>("/api/daa/broker/session/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
}

export async function logoutBrokerSession(): Promise<StoreBrokerSessionState> {
  return requestData<StoreBrokerSessionState>("/api/daa/broker/session/logout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
}

export async function syncBrokerOrdersNow(input: {
  scope?: "open" | "recent" | "ticket";
  ticketId?: string | null;
  limit?: number;
} = {}): Promise<StoreBrokerOrderSyncResult> {
  return requestData<StoreBrokerOrderSyncResult>("/api/daa/broker/orders/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
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

export async function listEquitySnapshots(limit = 200): Promise<StoreEquitySnapshot[]> {
  const data = await requestData<{ snapshots: StoreEquitySnapshot[] }>(
    `/api/daa/store/equity-snapshots?limit=${Math.max(1, Math.trunc(limit))}`,
    { method: "GET", cache: "no-store" },
  );
  return Array.isArray(data.snapshots) ? data.snapshots : [];
}

export async function appendEquitySnapshot(snapshot: Partial<StoreEquitySnapshot>): Promise<StoreEquitySnapshot> {
  const data = await requestData<{ snapshot: StoreEquitySnapshot }>("/api/daa/store/equity-snapshots", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ snapshot }),
  });
  return data.snapshot;
}

export async function listRunHistory(limit = 50): Promise<StoreRunHistoryEntry[]> {
  const data = await requestData<{ entries: StoreRunHistoryEntry[] }>(
    `/api/daa/store/run-history?limit=${Math.max(1, Math.trunc(limit))}`,
    { method: "GET", cache: "no-store" },
  );
  return Array.isArray(data.entries) ? data.entries : [];
}

export async function appendRunHistory(input: {
  requestJson: Record<string, unknown>;
  responseJson: Record<string, unknown>;
  summaryJson?: Record<string, unknown>;
  triggerSource?: string;
}): Promise<StoreRunHistoryEntry> {
  const data = await requestData<{ entry: StoreRunHistoryEntry }>("/api/daa/store/run-history", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return data.entry;
}

export async function listOpLog(limit = 100): Promise<StoreOpLogEntry[]> {
  const data = await requestData<{ entries: StoreOpLogEntry[] }>(
    `/api/daa/store/op-log?limit=${Math.max(1, Math.trunc(limit))}`,
    { method: "GET", cache: "no-store" },
  );
  return Array.isArray(data.entries) ? data.entries : [];
}

export async function appendOpLog(input: {
  level?: "info" | "warn" | "error";
  message: string;
  contextJson?: Record<string, unknown>;
}): Promise<StoreOpLogEntry> {
  const data = await requestData<{ entry: StoreOpLogEntry }>("/api/daa/store/op-log", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return data.entry;
}

export async function listCandidateAssets(): Promise<StoreCandidateAsset[]> {
  const data = await requestData<{ candidates: StoreCandidateAsset[] }>("/api/daa/store/candidate-assets", {
    method: "GET",
    cache: "no-store",
  });
  return Array.isArray(data.candidates) ? data.candidates : [];
}

export async function replaceCandidateAssets(candidates: StoreCandidateAsset[]): Promise<StoreCandidateAsset[]> {
  const data = await requestData<{ candidates: StoreCandidateAsset[] }>("/api/daa/store/candidate-assets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ candidates }),
  });
  return Array.isArray(data.candidates) ? data.candidates : [];
}

export async function listFxRates(): Promise<StoreFxRate[]> {
  const data = await requestData<{ rates: StoreFxRate[] }>("/api/daa/store/fx-rates", {
    method: "GET",
    cache: "no-store",
  });
  return Array.isArray(data.rates) ? data.rates : [];
}

export async function upsertFxRates(rates: StoreFxRate[]): Promise<StoreFxRate[]> {
  const data = await requestData<{ rates: StoreFxRate[] }>("/api/daa/store/fx-rates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rates }),
  });
  return Array.isArray(data.rates) ? data.rates : [];
}

export async function pullDailyFxSnapshot(input: {
  pairs: string[];
  baseCurrency: string;
}): Promise<PullDailyFxSnapshotResult> {
  return requestData<PullDailyFxSnapshotResult>("/api/daa/market/yfinance/fx-snapshot", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function getMarketCacheHealth(provider = "yfinance"): Promise<StoreMarketCacheHealth> {
  return requestData<StoreMarketCacheHealth>(`/api/daa/store/market-cache/health?provider=${encodeURIComponent(provider)}`, {
    method: "GET",
    cache: "no-store",
  });
}

export async function refreshMarketCache(input: {
  assets?: Array<{ symbol: string; market?: string; currency?: string }>;
  timeoutMs?: number;
  concurrency?: number;
  includeFeatured?: boolean;
} = {}): Promise<StoreMarketCacheRefreshResult> {
  return requestData<StoreMarketCacheRefreshResult>("/api/daa/store/market-cache/refresh", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function listCashLedger(limit = 100): Promise<StoreCashLedgerEntry[]> {
  const data = await requestData<{ entries: StoreCashLedgerEntry[] }>(
    `/api/daa/store/cash-ledger?limit=${Math.max(1, Math.trunc(limit))}`,
    { method: "GET", cache: "no-store" },
  );
  return Array.isArray(data.entries) ? data.entries : [];
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
// Market Indicators
// ─────────────────────────────────────────────────────────────────────────────

export async function listMarketIndicatorHistory(input: {
  keys: DaaMarketIndicatorKey[];
  days?: number;
  scope?: DaaMarketIndicatorScope;
}): Promise<StoreMarketIndicatorHistoryResult> {
  const qs = new URLSearchParams();
  qs.set("keys", input.keys.join(","));
  qs.set("days", String(Math.max(1, Math.min(365, Math.trunc(input.days || 90)))));
  if (input.scope) qs.set("scope", input.scope);
  return requestData<StoreMarketIndicatorHistoryResult>(`/api/daa/store/market-indicators/history?${qs.toString()}`, {
    method: "GET",
    cache: "no-store",
  });
}
