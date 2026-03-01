import { requestDataV1 } from "@/src/daa/api/clientV1";

export type StorePositionV1 = {
  id?: string;
  symbol: string;
  market: string;
  currency: string;
  qty: number;
  price: number;
  costBasis?: number | null;
  tags: string[];
  liquidityNotional24h: number;
};

export type StoreStrategyConfigV1 = Record<string, unknown>;

export type StoreEquitySnapshotV1 = {
  ts: string;
  totalEquity: number;
  holdingsValue: number;
  cash: number;
  source: string;
};

export type StoreDataSourceKindV1 = "hf_fund" | "price_feed" | "news_feed" | "fx_feed" | "llm_analysis";

export type StoreDataSourceV1 = {
  id: string;
  kind: StoreDataSourceKindV1;
  configJson: Record<string, unknown>;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type StoreNotificationConfigV1 = {
  enabled: boolean;
  notifyOnDrift: boolean;
  notifyOnRebalance: boolean;
  notifyOnPriceAlert: boolean;
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

export type StoreWatchlistCandidateV1 = {
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

export async function listPositionsV1(): Promise<StorePositionV1[]> {
  const data = await requestDataV1<{ positions: StorePositionV1[] }>("/api/daa/store/positions", {
    method: "GET",
    cache: "no-store",
  });
  return Array.isArray(data.positions) ? data.positions : [];
}

export async function replacePositionsV1(positions: StorePositionV1[]): Promise<StorePositionV1[]> {
  const data = await requestDataV1<{ positions: StorePositionV1[] }>("/api/daa/store/positions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ positions }),
  });
  return Array.isArray(data.positions) ? data.positions : [];
}

export async function getStrategyConfigV1(): Promise<StoreStrategyConfigV1> {
  const data = await requestDataV1<{ config: StoreStrategyConfigV1 }>("/api/daa/store/strategy-config", {
    method: "GET",
    cache: "no-store",
  });
  return data.config && typeof data.config === "object" ? data.config : {};
}

export async function saveStrategyConfigV1(config: StoreStrategyConfigV1): Promise<StoreStrategyConfigV1> {
  const data = await requestDataV1<{ config: StoreStrategyConfigV1 }>("/api/daa/store/strategy-config", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ config }),
  });
  return data.config && typeof data.config === "object" ? data.config : {};
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

export async function listDataSourcesV1(kind?: StoreDataSourceKindV1): Promise<StoreDataSourceV1[]> {
  const qs = kind ? `?kind=${encodeURIComponent(kind)}` : "";
  const data = await requestDataV1<{ dataSources: StoreDataSourceV1[] }>(`/api/daa/store/data-sources${qs}`, {
    method: "GET",
    cache: "no-store",
  });
  return Array.isArray(data.dataSources) ? data.dataSources : [];
}

export async function replaceDataSourcesV1(dataSources: StoreDataSourceV1[]): Promise<StoreDataSourceV1[]> {
  const data = await requestDataV1<{ dataSources: StoreDataSourceV1[] }>("/api/daa/store/data-sources", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dataSources }),
  });
  return Array.isArray(data.dataSources) ? data.dataSources : [];
}

export async function getNotificationConfigV1(): Promise<StoreNotificationConfigV1> {
  const data = await requestDataV1<{ config: StoreNotificationConfigV1 }>("/api/daa/store/notification-config", {
    method: "GET",
    cache: "no-store",
  });
  return data.config;
}

export async function saveNotificationConfigV1(config: StoreNotificationConfigV1): Promise<StoreNotificationConfigV1> {
  const data = await requestDataV1<{ config: StoreNotificationConfigV1 }>("/api/daa/store/notification-config", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ config }),
  });
  return data.config;
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

export async function listWatchlistCandidatesV1(): Promise<StoreWatchlistCandidateV1[]> {
  const data = await requestDataV1<{ candidates: StoreWatchlistCandidateV1[] }>("/api/daa/store/watchlist-candidates", {
    method: "GET",
    cache: "no-store",
  });
  return Array.isArray(data.candidates) ? data.candidates : [];
}

export async function replaceWatchlistCandidatesV1(candidates: StoreWatchlistCandidateV1[]): Promise<StoreWatchlistCandidateV1[]> {
  const data = await requestDataV1<{ candidates: StoreWatchlistCandidateV1[] }>("/api/daa/store/watchlist-candidates", {
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
