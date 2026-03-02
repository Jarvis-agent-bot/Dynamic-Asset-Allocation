import { requestDataV1 } from "@/src/daa/api/clientV1";
import { normalizeCurrencyAliasV2 } from "@/src/daa/config/currencyV2";
import {
  normalizeSystemConfigV2,
  type DaaSystemConfigPatchV2,
  type DaaSystemConfigV2,
} from "@/src/daa/config/systemConfigV2";

export type StorePositionV1 = {
  id?: string;
  symbol: string;
  market: string;
  currency: string;
  qty: number;
  price: number;
  costBasis?: number | null;
  tags: string[];
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

function toPlainObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toText(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.trunc(parsed));
}

function toSymbolList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const set = new Set<string>();
  for (const item of value) {
    const symbol = String(item ?? "").trim().toUpperCase();
    if (symbol) set.add(symbol);
  }
  return [...set];
}

function toFxPairList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const set = new Set<string>();
  for (const item of value) {
    const token = String(item ?? "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "")
      .replace(/-/g, "/");
    if (!/^[A-Z]{3}\/[A-Z]{3}$/.test(token)) continue;
    const [base, quote] = token.split("/");
    set.add(`${normalizeCurrencyAliasV2(base)}/${normalizeCurrencyAliasV2(quote)}`);
  }
  return [...set];
}

function mapSystemConfigToLegacyDataSources(config: DaaSystemConfigV2): StoreDataSourceV1[] {
  const now = new Date().toISOString();
  return [
    {
      id: config.dataSources.hfFund.id,
      kind: "hf_fund",
      enabled: config.dataSources.hfFund.enabled,
      configJson: {
        funds: config.dataSources.hfFund.funds,
        marketScope: config.dataSources.hfFund.marketScope,
      },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: config.dataSources.priceFeed.id,
      kind: "price_feed",
      enabled: config.dataSources.priceFeed.enabled,
      configJson: {
        provider: config.dataSources.priceFeed.provider,
        intervalMinutes: config.dataSources.priceFeed.intervalMinutes,
        symbols: config.dataSources.priceFeed.symbols,
      },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: config.dataSources.newsFeed.id,
      kind: "news_feed",
      enabled: config.dataSources.newsFeed.enabled,
      configJson: {
        provider: config.dataSources.newsFeed.provider,
        query: config.dataSources.newsFeed.query,
        symbols: config.dataSources.newsFeed.symbols,
        fusionWeights: config.dataSources.newsFeed.fusionWeights,
      },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: config.dataSources.fxFeed.id,
      kind: "fx_feed",
      enabled: config.dataSources.fxFeed.enabled,
      configJson: {
        provider: config.dataSources.fxFeed.provider,
        baseCurrency: config.dataSources.fxFeed.baseCurrency,
        pairs: config.dataSources.fxFeed.pairs,
      },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: config.dataSources.llmAnalysis.id,
      kind: "llm_analysis",
      enabled: config.dataSources.llmAnalysis.enabled,
      configJson: {
        provider: config.dataSources.llmAnalysis.provider,
        model: config.dataSources.llmAnalysis.model,
        timeoutMs: config.dataSources.llmAnalysis.timeoutMs,
        enabledInDecision: config.dataSources.llmAnalysis.enabledInDecision,
      },
      createdAt: now,
      updatedAt: now,
    },
  ];
}

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
  const envelope = await getSystemConfigV2();
  return toPlainObject(envelope.config.strategy);
}

export async function saveStrategyConfigV1(config: StoreStrategyConfigV1): Promise<StoreStrategyConfigV1> {
  const current = await getSystemConfigV2();
  const saved = await patchSystemConfigV2({
    baseVersion: current.version,
    patches: [{ path: "/strategy", value: toPlainObject(config) }],
  });
  return toPlainObject(saved.config.strategy);
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
  const envelope = await getSystemConfigV2();
  const all = mapSystemConfigToLegacyDataSources(envelope.config);
  if (!kind) return all;
  return all.filter((row) => row.kind === kind);
}

export async function replaceDataSourcesV1(dataSources: StoreDataSourceV1[]): Promise<StoreDataSourceV1[]> {
  const current = await getSystemConfigV2();
  const next = normalizeSystemConfigV2(current.config);

  for (const source of dataSources) {
    const configJson = toPlainObject(source.configJson);
    if (source.kind === "hf_fund") {
      next.dataSources.hfFund.id = toText(source.id, next.dataSources.hfFund.id);
      next.dataSources.hfFund.enabled = Boolean(source.enabled);
      if (Array.isArray(configJson.funds)) {
        next.dataSources.hfFund.funds = configJson.funds as DaaSystemConfigV2["dataSources"]["hfFund"]["funds"];
      }
      if (Array.isArray(configJson.marketScope)) {
        next.dataSources.hfFund.marketScope = toSymbolList(configJson.marketScope);
      }
      continue;
    }

    if (source.kind === "price_feed") {
      next.dataSources.priceFeed.id = toText(source.id, next.dataSources.priceFeed.id);
      next.dataSources.priceFeed.enabled = Boolean(source.enabled);
      next.dataSources.priceFeed.provider = toText(configJson.provider, next.dataSources.priceFeed.provider);
      next.dataSources.priceFeed.intervalMinutes = toPositiveInt(configJson.intervalMinutes, next.dataSources.priceFeed.intervalMinutes);
      const symbols = toSymbolList(configJson.symbols);
      if (symbols.length) next.dataSources.priceFeed.symbols = symbols;
      continue;
    }

    if (source.kind === "news_feed") {
      next.dataSources.newsFeed.id = toText(source.id, next.dataSources.newsFeed.id);
      next.dataSources.newsFeed.enabled = Boolean(source.enabled);
      next.dataSources.newsFeed.provider = toText(configJson.provider, next.dataSources.newsFeed.provider);
      next.dataSources.newsFeed.query = toText(configJson.query, next.dataSources.newsFeed.query);
      next.dataSources.newsFeed.symbols = toSymbolList(configJson.symbols);
      if (configJson.fusionWeights && typeof configJson.fusionWeights === "object" && !Array.isArray(configJson.fusionWeights)) {
        const weights = configJson.fusionWeights as Record<string, unknown>;
        next.dataSources.newsFeed.fusionWeights = {
          human: Number(weights.human ?? next.dataSources.newsFeed.fusionWeights.human) || next.dataSources.newsFeed.fusionWeights.human,
          news: Number(weights.news ?? next.dataSources.newsFeed.fusionWeights.news) || next.dataSources.newsFeed.fusionWeights.news,
          technical: Number(weights.technical ?? next.dataSources.newsFeed.fusionWeights.technical) || next.dataSources.newsFeed.fusionWeights.technical,
        };
      }
      continue;
    }

    if (source.kind === "fx_feed") {
      next.dataSources.fxFeed.id = toText(source.id, next.dataSources.fxFeed.id);
      next.dataSources.fxFeed.enabled = Boolean(source.enabled);
      next.dataSources.fxFeed.provider = toText(configJson.provider, next.dataSources.fxFeed.provider);
      next.dataSources.fxFeed.baseCurrency = normalizeCurrencyAliasV2(configJson.baseCurrency, next.dataSources.fxFeed.baseCurrency) as DaaSystemConfigV2["dataSources"]["fxFeed"]["baseCurrency"];
      const pairs = toFxPairList(configJson.pairs);
      if (pairs.length) next.dataSources.fxFeed.pairs = pairs;
      continue;
    }

    if (source.kind === "llm_analysis") {
      next.dataSources.llmAnalysis.id = toText(source.id, next.dataSources.llmAnalysis.id);
      next.dataSources.llmAnalysis.enabled = Boolean(source.enabled);
      next.dataSources.llmAnalysis.provider = toText(configJson.provider, next.dataSources.llmAnalysis.provider);
      next.dataSources.llmAnalysis.model = toText(configJson.model, next.dataSources.llmAnalysis.model);
      next.dataSources.llmAnalysis.timeoutMs = toPositiveInt(configJson.timeoutMs, next.dataSources.llmAnalysis.timeoutMs);
      next.dataSources.llmAnalysis.enabledInDecision = Boolean(configJson.enabledInDecision);
    }
  }

  const saved = await saveSystemConfigV2({ config: next, baseVersion: current.version });
  return mapSystemConfigToLegacyDataSources(saved.config);
}

export async function getNotificationConfigV1(): Promise<StoreNotificationConfigV1> {
  const envelope = await getSystemConfigV2();
  return {
    enabled: Boolean(envelope.config.notification.enabled),
    notifyOnDrift: envelope.config.notification.notifyOnDrift !== false,
    notifyOnRebalance: envelope.config.notification.notifyOnRebalance !== false,
    notifyOnPriceAlert: Boolean(envelope.config.notification.notifyOnPriceAlert),
  };
}

export async function saveNotificationConfigV1(config: StoreNotificationConfigV1): Promise<StoreNotificationConfigV1> {
  const current = await getSystemConfigV2();
  const saved = await patchSystemConfigV2({
    baseVersion: current.version,
    patches: [{ path: "/notification", value: config }],
  });
  return {
    enabled: Boolean(saved.config.notification.enabled),
    notifyOnDrift: saved.config.notification.notifyOnDrift !== false,
    notifyOnRebalance: saved.config.notification.notifyOnRebalance !== false,
    notifyOnPriceAlert: Boolean(saved.config.notification.notifyOnPriceAlert),
  };
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
