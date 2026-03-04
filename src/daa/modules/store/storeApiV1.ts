import { requestDataV1 } from "@/src/daa/api/clientV1";
import {
  normalizeSystemConfigV2,
  type DaaSystemConfigPatchV2,
  type DaaSystemConfigV2,
} from "@/src/daa/config/systemConfigV2";

export type StoreEquitySnapshotV1 = {
  ts: string;
  totalEquity: number;
  holdingsValue: number;
  cash: number;
  source: string;
};

export type StoreRunHistoryEntryV1 = {
  id: string;
  ts: string;
  triggerSource: string;
  requestJson: Record<string, unknown>;
  responseJson: Record<string, unknown>;
  summaryJson: Record<string, unknown>;
};

export type StoreOpLogEntryV1 = {
  id: string;
  ts: string;
  level: "info" | "warn" | "error";
  message: string;
  contextJson: Record<string, unknown>;
};

export type StoreCandidateAssetV1 = {
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

export type StoreFxRateV1 = {
  id?: string;
  baseCcy: string;
  quoteCcy: string;
  rate: number;
  source: string;
  asOfTs?: string;
  updatedAt?: string;
};

export type PullDailyFxSnapshotResultV1 = {
  pulledAt: string;
  day: string;
  alreadyPulledToday: boolean;
  updatedPairs?: string[];
  skippedPairs?: string[];
  rates: StoreFxRateV1[];
};

export type StoreCashLedgerEntryV1 = {
  id: string;
  ts: string;
  side: "deposit" | "withdraw";
  amount: number;
  baseCurrency: string;
  note?: string | null;
  createdAt?: string;
};

export type StoreCashLedgerApplyInputV1 = {
  side: "deposit" | "withdraw";
  amount: number;
  baseCurrency?: string;
  note?: string;
};

export type StoreCashLedgerApplyResultV1 = {
  entry: StoreCashLedgerEntryV1;
  account: {
    baseCurrency: string;
    cash: number;
    investableCash: number;
    frozenCash: number;
    totalEquity: number | null;
  };
  equitySnapshot: StoreEquitySnapshotV1;
};

export type StoreSystemConfigEnvelopeV2 = {
  version: number;
  updatedAt: string;
  config: DaaSystemConfigV2;
};

export type StoreSystemConfigPatchV2 = DaaSystemConfigPatchV2;

export type StoreLlmEnvStatusV1 = {
  provider: string;
  endpointConfigured: boolean;
  apiKeyConfigured: boolean;
  modelConfigured: boolean;
  endpointHint: string;
  model: string;
};

export async function getSystemConfigV2(): Promise<StoreSystemConfigEnvelopeV2> {
  const data = await requestDataV1<{ version?: unknown; updatedAt?: unknown; config?: unknown }>("/api/daa/store/system-config", {
    method: "GET",
    cache: "no-store",
  });
  const version = Number(data.version);
  return {
    version: Number.isFinite(version) && version > 0 ? Math.trunc(version) : 1,
    updatedAt: String(data.updatedAt || new Date().toISOString()),
    config: normalizeSystemConfigV2(data.config ?? {}),
  };
}

export async function getLlmEnvStatusV1(): Promise<StoreLlmEnvStatusV1> {
  return requestDataV1<StoreLlmEnvStatusV1>("/api/daa/workbench/llm/env-status", {
    method: "GET",
    cache: "no-store",
  });
}

export async function patchSystemConfigV2(input: {
  patches: StoreSystemConfigPatchV2[];
  baseVersion?: number;
}): Promise<StoreSystemConfigEnvelopeV2> {
  const data = await requestDataV1<{ version?: unknown; updatedAt?: unknown; config?: unknown }>("/api/daa/store/system-config", {
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
    config: normalizeSystemConfigV2(data.config ?? {}),
  };
}

export async function saveSystemConfigV2(input: {
  config: DaaSystemConfigV2;
  baseVersion?: number;
}): Promise<StoreSystemConfigEnvelopeV2> {
  const data = await requestDataV1<{ version?: unknown; updatedAt?: unknown; config?: unknown }>("/api/daa/store/system-config", {
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
    config: normalizeSystemConfigV2(data.config ?? {}),
  };
}

export async function listEquitySnapshotsV1(limit = 200): Promise<StoreEquitySnapshotV1[]> {
  const data = await requestDataV1<{ snapshots: StoreEquitySnapshotV1[] }>(
    `/api/daa/store/equity-snapshots?limit=${Math.max(1, Math.trunc(limit))}`,
    { method: "GET", cache: "no-store" },
  );
  return Array.isArray(data.snapshots) ? data.snapshots : [];
}

export async function appendEquitySnapshotV1(snapshot: Partial<StoreEquitySnapshotV1>): Promise<StoreEquitySnapshotV1> {
  const data = await requestDataV1<{ snapshot: StoreEquitySnapshotV1 }>("/api/daa/store/equity-snapshots", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ snapshot }),
  });
  return data.snapshot;
}

export async function listRunHistoryV1(limit = 50): Promise<StoreRunHistoryEntryV1[]> {
  const data = await requestDataV1<{ entries: StoreRunHistoryEntryV1[] }>(
    `/api/daa/store/run-history?limit=${Math.max(1, Math.trunc(limit))}`,
    { method: "GET", cache: "no-store" },
  );
  return Array.isArray(data.entries) ? data.entries : [];
}

export async function appendRunHistoryV1(input: {
  requestJson: Record<string, unknown>;
  responseJson: Record<string, unknown>;
  summaryJson?: Record<string, unknown>;
  triggerSource?: string;
}): Promise<StoreRunHistoryEntryV1> {
  const data = await requestDataV1<{ entry: StoreRunHistoryEntryV1 }>("/api/daa/store/run-history", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return data.entry;
}

export async function listOpLogV1(limit = 100): Promise<StoreOpLogEntryV1[]> {
  const data = await requestDataV1<{ entries: StoreOpLogEntryV1[] }>(
    `/api/daa/store/op-log?limit=${Math.max(1, Math.trunc(limit))}`,
    { method: "GET", cache: "no-store" },
  );
  return Array.isArray(data.entries) ? data.entries : [];
}

export async function appendOpLogV1(input: {
  level?: "info" | "warn" | "error";
  message: string;
  contextJson?: Record<string, unknown>;
}): Promise<StoreOpLogEntryV1> {
  const data = await requestDataV1<{ entry: StoreOpLogEntryV1 }>("/api/daa/store/op-log", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return data.entry;
}

export async function listCandidateAssetsV1(): Promise<StoreCandidateAssetV1[]> {
  const data = await requestDataV1<{ candidates: StoreCandidateAssetV1[] }>("/api/daa/store/candidate-assets", {
    method: "GET",
    cache: "no-store",
  });
  return Array.isArray(data.candidates) ? data.candidates : [];
}

export async function replaceCandidateAssetsV1(candidates: StoreCandidateAssetV1[]): Promise<StoreCandidateAssetV1[]> {
  const data = await requestDataV1<{ candidates: StoreCandidateAssetV1[] }>("/api/daa/store/candidate-assets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ candidates }),
  });
  return Array.isArray(data.candidates) ? data.candidates : [];
}

export async function listFxRatesV1(): Promise<StoreFxRateV1[]> {
  const data = await requestDataV1<{ rates: StoreFxRateV1[] }>("/api/daa/store/fx-rates", {
    method: "GET",
    cache: "no-store",
  });
  return Array.isArray(data.rates) ? data.rates : [];
}

export async function upsertFxRatesV1(rates: StoreFxRateV1[]): Promise<StoreFxRateV1[]> {
  const data = await requestDataV1<{ rates: StoreFxRateV1[] }>("/api/daa/store/fx-rates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rates }),
  });
  return Array.isArray(data.rates) ? data.rates : [];
}

export async function pullDailyFxSnapshotV1(input: {
  pairs: string[];
  baseCurrency: string;
}): Promise<PullDailyFxSnapshotResultV1> {
  return requestDataV1<PullDailyFxSnapshotResultV1>("/api/daa/market/yfinance/fx-snapshot", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function listCashLedgerV1(limit = 100): Promise<StoreCashLedgerEntryV1[]> {
  const data = await requestDataV1<{ entries: StoreCashLedgerEntryV1[] }>(
    `/api/daa/store/cash-ledger?limit=${Math.max(1, Math.trunc(limit))}`,
    { method: "GET", cache: "no-store" },
  );
  return Array.isArray(data.entries) ? data.entries : [];
}

export async function appendCashLedgerEntryV1(input: StoreCashLedgerApplyInputV1): Promise<StoreCashLedgerApplyResultV1> {
  return requestDataV1<StoreCashLedgerApplyResultV1>("/api/daa/store/cash-ledger", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}
