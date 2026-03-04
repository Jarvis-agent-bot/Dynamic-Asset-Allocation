"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type DaaAnalystRow,
  type DaaAssetViewRow,
  type DaaCashLedgerEntry,
  type DaaCandidateAssetRow,
  type DaaEquitySnapshot,
  type DaaHfFundTrackRow,
  type DaaFxRateRow,
  type DaaPositionRow,
  type DaaRunHistoryEntry,
  type DaaStrategyConfig,
  DAA_RUNTIME_DATA_EVENT_V1,
  DEFAULT_STRATEGY_CONFIG,
  readUnifiedInputSliceV1,
  writeUnifiedInputSliceV1,
  type UnifiedInputSliceKeyV1,
} from "../../unifiedInputStore";

import { ApiClientErrorV1, getApiErrorMessageV1 } from "@/src/daa/api/clientV1";
import {
  appendCashLedgerEntryV1,
  appendOpLogV1,
  appendEquitySnapshotV1,
  getSystemConfigV2,
  listCashLedgerV1,
  listFxRatesV1,
  listEquitySnapshotsV1,
  listOpLogV1,
  patchSystemConfigV2,
  listRunHistoryV1,
  listCandidateAssetsV1,
  replaceCandidateAssetsV1,
  upsertFxRatesV1,
  type StoreSystemConfigEnvelopeV2,
  type StoreSystemConfigPatchV2,
} from "@/src/daa/modules/store/storeApiV1";
import { getWorkbenchBootstrapV1 } from "@/src/daa/modules/workbench/workbenchApiV1";
import type { AssetUniverseViewV1 } from "@/src/daa/modules/workbench/workbenchTypesV1";
import type { DaaUnifiedRequestV1 } from "@/src/daa/unifiedRebalanceV1";
import {
  applySystemConfigPatchesV2,
  DEFAULT_SYSTEM_CONFIG_V2,
  normalizeSystemConfigV2,
} from "@/src/daa/config/systemConfigV2";
import {
  buildDaaAssetKeyV1,
  parseDaaAssetKeyV1,
} from "@/src/daa/assetKeyV1";

const DAA_DASHBOARD_REFRESH_EVENT_V1 = "daa:dashboard:refresh";
const DAA_DASHBOARD_DATA_UPDATED_EVENT_V1 = "daa:dashboard:data-updated";
export const DAA_DASHBOARD_PERSIST_ERROR_EVENT_V1 = "daa:dashboard:persist-error";

function emitDashboardDataUpdatedV1() {
  try {
    window.dispatchEvent(new CustomEvent(DAA_DASHBOARD_DATA_UPDATED_EVENT_V1, { detail: { ts: Date.now() } }));
  } catch {
    // ignore browser event failures
  }
}

function emitDashboardPersistErrorV1(message: string) {
  const text = String(message || "").trim();
  if (!text) return;
  try {
    window.dispatchEvent(new CustomEvent(DAA_DASHBOARD_PERSIST_ERROR_EVENT_V1, { detail: { message: text, ts: Date.now() } }));
  } catch {
    // ignore browser event failures
  }
}

function cloneV2<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function buildDefaultSystemConfigEnvelopeV2(): StoreSystemConfigEnvelopeV2 {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    config: normalizeSystemConfigV2(DEFAULT_SYSTEM_CONFIG_V2),
  };
}

type SystemConfigPatchJobV2 = {
  seq: number;
  patches: StoreSystemConfigPatchV2[];
  errorPrefix: string;
};

type SystemConfigRuntimeStateV2 = {
  envelope: StoreSystemConfigEnvelopeV2 | null;
  loadingPromise: Promise<StoreSystemConfigEnvelopeV2> | null;
  patchLoopRunning: boolean;
  pendingPatchJobs: SystemConfigPatchJobV2[];
  nextSeq: number;
  listeners: Set<(value: StoreSystemConfigEnvelopeV2 | null) => void>;
};

const SYSTEM_CONFIG_RUNTIME_KEY_V2 = "__daa_system_config_runtime_v2__";

function getSystemConfigRuntimeV2(): SystemConfigRuntimeStateV2 {
  const g = globalThis as any;
  if (!g[SYSTEM_CONFIG_RUNTIME_KEY_V2]) {
    g[SYSTEM_CONFIG_RUNTIME_KEY_V2] = {
      envelope: null,
      loadingPromise: null,
      patchLoopRunning: false,
      pendingPatchJobs: [],
      nextSeq: 0,
      listeners: new Set(),
    } satisfies SystemConfigRuntimeStateV2;
  }
  return g[SYSTEM_CONFIG_RUNTIME_KEY_V2] as SystemConfigRuntimeStateV2;
}

function notifySystemConfigListenersV2() {
  const st = getSystemConfigRuntimeV2();
  for (const listener of st.listeners) {
    try {
      listener(st.envelope ? cloneV2(st.envelope) : null);
    } catch {
      // ignore listener failures
    }
  }
}

function setSystemConfigEnvelopeV2(next: StoreSystemConfigEnvelopeV2 | null) {
  const st = getSystemConfigRuntimeV2();
  if (!next) {
    st.envelope = null;
  } else {
    st.envelope = {
      version: Math.max(1, Math.trunc(Number(next.version) || 1)),
      updatedAt: String(next.updatedAt || new Date().toISOString()),
      config: normalizeSystemConfigV2(next.config),
    };
  }
  notifySystemConfigListenersV2();
}

function subscribeSystemConfigV2(listener: (value: StoreSystemConfigEnvelopeV2 | null) => void): () => void {
  const st = getSystemConfigRuntimeV2();
  st.listeners.add(listener);
  return () => {
    st.listeners.delete(listener);
  };
}

async function loadSystemConfigV2(force = false): Promise<StoreSystemConfigEnvelopeV2> {
  const st = getSystemConfigRuntimeV2();
  if (!force && st.envelope) {
    return cloneV2(st.envelope);
  }
  if (!force && st.loadingPromise) return st.loadingPromise;

  const promise = getSystemConfigV2()
    .then((row) => {
      setSystemConfigEnvelopeV2(row);
      return row;
    })
    .finally(() => {
      const runtime = getSystemConfigRuntimeV2();
      runtime.loadingPromise = null;
    });

  st.loadingPromise = promise;
  return promise;
}

function normalizePatchListV2(patches: StoreSystemConfigPatchV2[]): StoreSystemConfigPatchV2[] {
  if (!Array.isArray(patches)) return [];
  return patches
    .map((patch) => ({
      path: String(patch?.path || "").trim(),
      value: patch?.value,
    }))
    .filter((patch) => patch.path.length > 0);
}

function applyOptimisticSystemConfigPatchV2(patches: StoreSystemConfigPatchV2[]) {
  const st = getSystemConfigRuntimeV2();
  const current = st.envelope ? cloneV2(st.envelope) : buildDefaultSystemConfigEnvelopeV2();
  const nextConfig = applySystemConfigPatchesV2(current.config, patches);
  setSystemConfigEnvelopeV2({
    ...current,
    updatedAt: new Date().toISOString(),
    config: nextConfig,
  });
}

function isVersionConflictErrorV2(error: unknown): boolean {
  return error instanceof ApiClientErrorV1 && (error.code === "VERSION_CONFLICT" || error.status === 409);
}

async function runSystemConfigPatchJobV2(job: SystemConfigPatchJobV2): Promise<void> {
  const normalizedPatches = normalizePatchListV2(job.patches);
  if (!normalizedPatches.length) return;

  const st = getSystemConfigRuntimeV2();
  const current = st.envelope ? cloneV2(st.envelope) : await loadSystemConfigV2(false);
  applyOptimisticSystemConfigPatchV2(normalizedPatches);

  let baseVersion = current.version;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const saved = await patchSystemConfigV2({
        patches: normalizedPatches,
        baseVersion,
      });
      const runtime = getSystemConfigRuntimeV2();
      const hasNewerPending = runtime.pendingPatchJobs.some((item) => item.seq > job.seq);
      if (hasNewerPending && runtime.envelope) {
        setSystemConfigEnvelopeV2({
          version: saved.version,
          updatedAt: saved.updatedAt,
          config: runtime.envelope.config,
        });
      } else {
        setSystemConfigEnvelopeV2(saved);
      }
      emitDashboardDataUpdatedV1();
      return;
    } catch (error) {
      if (isVersionConflictErrorV2(error) && attempt === 0) {
        const latest = await loadSystemConfigV2(true);
        baseVersion = latest.version;
        continue;
      }
      emitDashboardPersistErrorV1(`${job.errorPrefix}：${getApiErrorMessageV1(error)}`);
      try {
        await loadSystemConfigV2(true);
      } catch {
        // ignore refresh failures
      }
      return;
    }
  }
}

async function processSystemConfigPatchQueueV2() {
  const st = getSystemConfigRuntimeV2();
  if (st.patchLoopRunning) return;
  st.patchLoopRunning = true;
  try {
    while (st.pendingPatchJobs.length > 0) {
      const job = st.pendingPatchJobs.shift()!;
      await runSystemConfigPatchJobV2(job);
    }
  } finally {
    st.patchLoopRunning = false;
  }
}

function enqueueSystemConfigPatchV2(input: {
  patches: StoreSystemConfigPatchV2[];
  errorPrefix: string;
}) {
  const patches = normalizePatchListV2(input.patches);
  if (!patches.length) return;
  applyOptimisticSystemConfigPatchV2(patches);

  const st = getSystemConfigRuntimeV2();
  st.nextSeq += 1;
  st.pendingPatchJobs.push({
    seq: st.nextSeq,
    patches,
    errorPrefix: input.errorPrefix,
  });
  void processSystemConfigPatchQueueV2();
}

export function useSystemConfigV2() {
  const [envelope, setEnvelope] = useState<StoreSystemConfigEnvelopeV2 | null>(() => {
    const st = getSystemConfigRuntimeV2();
    return st.envelope ? cloneV2(st.envelope) : null;
  });

  useEffect(() => subscribeSystemConfigV2(setEnvelope), []);

  useEffect(() => {
    let cancelled = false;
    void loadSystemConfigV2(false).catch((error) => {
      if (cancelled) return;
      emitDashboardPersistErrorV1(`加载系统配置失败：${getApiErrorMessageV1(error)}`);
    });
    function onRefresh() {
      void loadSystemConfigV2(true).catch((error) => {
        emitDashboardPersistErrorV1(`刷新系统配置失败：${getApiErrorMessageV1(error)}`);
      });
    }
    window.addEventListener(DAA_DASHBOARD_REFRESH_EVENT_V1, onRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener(DAA_DASHBOARD_REFRESH_EVENT_V1, onRefresh);
    };
  }, []);

  const patchConfig = useCallback((patches: StoreSystemConfigPatchV2[], errorPrefix = "保存系统配置失败") => {
    enqueueSystemConfigPatchV2({ patches, errorPrefix });
  }, []);

  const refresh = useCallback(async () => {
    return loadSystemConfigV2(true);
  }, []);

  const stableEnvelope = useMemo(() => {
    if (!envelope) return buildDefaultSystemConfigEnvelopeV2();
    return cloneV2(envelope);
  }, [envelope]);

  return {
    envelope: stableEnvelope,
    ready: Boolean(envelope),
    patchConfig,
    refresh,
  };
}

export function useDaaSlice<T>(key: UnifiedInputSliceKeyV1): [T | null, (v: T | null) => void] {
  const [value, setValue] = useState<T | null>(() => readUnifiedInputSliceV1<T>(key));

  useEffect(() => {
    function onUpdate() {
      setValue(readUnifiedInputSliceV1<T>(key));
    }
    window.addEventListener(DAA_RUNTIME_DATA_EVENT_V1, onUpdate);
    return () => window.removeEventListener(DAA_RUNTIME_DATA_EVENT_V1, onUpdate);
  }, [key]);

  const set = useCallback(
    (v: T | null) => {
      writeUnifiedInputSliceV1(key, v);
      setValue(v);
    },
    [key],
  );

  return [value, set];
}

function mapWorkbenchAssetUniverseToPositionsV1(rows: AssetUniverseViewV1[]): DaaPositionRow[] {
  return rows
    .filter((row) => Number(row.holdingQty) > 0)
    .map((row) => {
      const costBasisRaw = Number(row.costBasis);
      return {
        id: `${row.symbol}__${row.market}`,
        assetKey: row.assetKey,
        symbol: row.symbol,
        market: row.market,
        currency: row.currency,
        qty: Math.max(0, Number(row.holdingQty) || 0),
        price: Number(row.lastPrice) > 0 ? Number(row.lastPrice) : Math.max(0, Number(row.holdingPrice) || 0),
        costBasis: Number.isFinite(costBasisRaw) ? costBasisRaw : undefined,
        tags: Array.isArray(row.holdingTags) ? row.holdingTags.map((tag) => String(tag || "").trim()).filter(Boolean) : [],
      } satisfies DaaPositionRow;
    })
    .sort((a, b) => {
      const symbolCmp = a.symbol.localeCompare(b.symbol);
      if (symbolCmp !== 0) return symbolCmp;
      return a.market.localeCompare(b.market);
    });
}

export function useWorkbenchPositionsV1() {
  const [value, setValue] = useDaaSlice<DaaPositionRow[]>("positions");

  const load = useCallback(async () => {
    const bootstrap = await getWorkbenchBootstrapV1();
    const mapped = mapWorkbenchAssetUniverseToPositionsV1(bootstrap.assetUniverse ?? []);
    setValue(mapped);
    emitDashboardDataUpdatedV1();
    return mapped;
  }, [setValue]);

  useEffect(() => {
    let cancelled = false;
    async function runLoad() {
      try {
        const bootstrap = await getWorkbenchBootstrapV1();
        if (cancelled) return;
        setValue(mapWorkbenchAssetUniverseToPositionsV1(bootstrap.assetUniverse ?? []));
        emitDashboardDataUpdatedV1();
      } catch {
        // ignore
      }
    }

    function onRefresh() {
      void runLoad();
    }

    void runLoad();
    window.addEventListener(DAA_DASHBOARD_REFRESH_EVENT_V1, onRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener(DAA_DASHBOARD_REFRESH_EVENT_V1, onRefresh);
    };
  }, [setValue]);

  return [value, load] as const;
}

export function useAnalysts() {
  return useDaaSlice<DaaAnalystRow[]>("analysts");
}

export function useAssetViews() {
  return useDaaSlice<DaaAssetViewRow[]>("assetViews");
}

export function useHfFundRegistry() {
  const [value, setValue] = useDaaSlice<DaaHfFundTrackRow[]>("hfFundRegistry");
  const { envelope, patchConfig } = useSystemConfigV2();

  useEffect(() => {
    const rows = Array.isArray(envelope.config.dataSources.hfFund.funds)
      ? envelope.config.dataSources.hfFund.funds
      : [];
    setValue(rows as DaaHfFundTrackRow[]);
  }, [envelope.config.dataSources.hfFund.funds, setValue]);

  const set = useCallback((rows: DaaHfFundTrackRow[] | null) => {
    const next = rows ?? [];
    setValue(next);
    patchConfig(
      [
        {
          path: "/dataSources/hfFund/funds",
          value: next,
        },
      ],
      "保存基金池失败",
    );
  }, [patchConfig, setValue]);

  return [value, set] as const;
}

export function useCandidateAssets() {
  const [value, setValue] = useDaaSlice<DaaCandidateAssetRow[]>("candidateAssets");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const rows = await listCandidateAssetsV1();
        if (cancelled) return;
        setValue(rows as DaaCandidateAssetRow[]);
        emitDashboardDataUpdatedV1();
      } catch {
        // ignore
      }
    }
    function onRefresh() {
      void load();
    }
    void load();
    window.addEventListener(DAA_DASHBOARD_REFRESH_EVENT_V1, onRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener(DAA_DASHBOARD_REFRESH_EVENT_V1, onRefresh);
    };
  }, [setValue]);

  const set = useCallback((rows: DaaCandidateAssetRow[] | null) => {
    const previous = readUnifiedInputSliceV1<DaaCandidateAssetRow[]>("candidateAssets");
    setValue(rows);
    void replaceCandidateAssetsV1((rows ?? []) as any[])
      .then(() => {
        emitDashboardDataUpdatedV1();
      })
      .catch((error) => {
        setValue(previous ?? null);
        emitDashboardPersistErrorV1(`保存候选资产失败：${getApiErrorMessageV1(error)}`);
      });
  }, [setValue]);

  return [value, set] as const;
}

export function useFxRates() {
  const [value, setValue] = useDaaSlice<DaaFxRateRow[]>("fxRates");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const rows = await listFxRatesV1();
        if (cancelled) return;
        setValue(rows as DaaFxRateRow[]);
        emitDashboardDataUpdatedV1();
      } catch {
        // ignore
      }
    }
    function onRefresh() {
      void load();
    }
    void load();
    window.addEventListener(DAA_DASHBOARD_REFRESH_EVENT_V1, onRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener(DAA_DASHBOARD_REFRESH_EVENT_V1, onRefresh);
    };
  }, [setValue]);

  const set = useCallback((rows: DaaFxRateRow[] | null) => {
    const previous = readUnifiedInputSliceV1<DaaFxRateRow[]>("fxRates");
    setValue(rows);
    void upsertFxRatesV1((rows ?? []) as any[])
      .then(() => {
        emitDashboardDataUpdatedV1();
      })
      .catch((error) => {
        setValue(previous ?? null);
        emitDashboardPersistErrorV1(`保存汇率失败：${getApiErrorMessageV1(error)}`);
      });
  }, [setValue]);

  return [value, set] as const;
}

export function useStrategyConfig(): [DaaStrategyConfig, (v: DaaStrategyConfig) => void] {
  const [raw, setRaw] = useDaaSlice<DaaStrategyConfig>("strategyConfig");
  const { envelope, patchConfig } = useSystemConfigV2();

  useEffect(() => {
    const strategy = envelope.config.strategy as unknown as DaaStrategyConfig;
    setRaw(strategy);
  }, [envelope.config.strategy, setRaw]);

  const config = useMemo(() => {
    if (!raw) return DEFAULT_STRATEGY_CONFIG;
    return {
      ...DEFAULT_STRATEGY_CONFIG,
      ...raw,
      account: { ...DEFAULT_STRATEGY_CONFIG.account, ...(raw.account || {}) },
      constraints: { ...DEFAULT_STRATEGY_CONFIG.constraints, ...(raw.constraints || {}) },
      policy: { ...DEFAULT_STRATEGY_CONFIG.policy, ...(raw.policy || {}) },
      risk: { ...DEFAULT_STRATEGY_CONFIG.risk, ...((raw as any).risk || {}) },
      targetWeights: { ...DEFAULT_STRATEGY_CONFIG.targetWeights, ...(raw.targetWeights || {}) },
    };
  }, [raw]);

  const set = useCallback((v: DaaStrategyConfig) => {
    setRaw(v);
    patchConfig([{ path: "/strategy", value: v }], "保存策略配置失败");
  }, [patchConfig, setRaw]);

  return [config as DaaStrategyConfig, set];
}

export function useLastRunResult() {
  return useDaaSlice<unknown>("lastRunResult");
}

export function useSyncLog() {
  return useDaaSlice<string[]>("syncLog");
}

export function useRunHistory() {
  const [value, setValue] = useDaaSlice<DaaRunHistoryEntry[]>("runHistory");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const rows = await listRunHistoryV1(50);
        if (cancelled) return;
        setValue(
          rows.map((row) => ({
            id: String(row.id || ""),
            ts: String(row.ts || new Date().toISOString()),
            request: row.requestJson || {},
            response: row.responseJson || {},
          })),
        );
        emitDashboardDataUpdatedV1();
      } catch {
        // ignore
      }
    }
    function onRefresh() {
      void load();
    }
    void load();
    window.addEventListener(DAA_DASHBOARD_REFRESH_EVENT_V1, onRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener(DAA_DASHBOARD_REFRESH_EVENT_V1, onRefresh);
    };
  }, [setValue]);

  return [value, setValue] as const;
}

export function useEquitySnapshots() {
  const [value, setValue] = useDaaSlice<DaaEquitySnapshot[]>("equitySnapshots");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const snapshots = await listEquitySnapshotsV1(200);
        if (cancelled) return;
        setValue(
          snapshots.map((row: any) => ({
            ts: String(row.ts || new Date().toISOString()),
            equity: Number(row.totalEquity || 0),
            holdingsValue: Number(row.holdingsValue || 0),
            cash: Number(row.cash || 0),
            source: String(row.source || "refresh") as DaaEquitySnapshot["source"],
          })) as DaaEquitySnapshot[],
        );
        emitDashboardDataUpdatedV1();
      } catch {
        // ignore
      }
    }
    function onRefresh() {
      void load();
    }
    void load();
    window.addEventListener(DAA_DASHBOARD_REFRESH_EVENT_V1, onRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener(DAA_DASHBOARD_REFRESH_EVENT_V1, onRefresh);
    };
  }, [setValue]);

  return [value, setValue] as const;
}

export function useCashLedger() {
  const [value, setValue] = useDaaSlice<DaaCashLedgerEntry[]>("cashLedger");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const rows = await listCashLedgerV1(100);
        if (cancelled) return;
        setValue(
          rows.map((row) => ({
            id: String(row.id || ""),
            ts: String(row.ts || new Date().toISOString()),
            side: row.side === "withdraw" ? "withdraw" : "deposit",
            amount: Number(row.amount || 0),
            baseCurrency: String(row.baseCurrency || "USD").toUpperCase(),
            note: row.note ?? null,
          })),
        );
        emitDashboardDataUpdatedV1();
      } catch {
        // ignore
      }
    }
    function onRefresh() {
      void load();
    }
    void load();
    window.addEventListener(DAA_DASHBOARD_REFRESH_EVENT_V1, onRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener(DAA_DASHBOARD_REFRESH_EVENT_V1, onRefresh);
    };
  }, [setValue]);

  return [value, setValue] as const;
}

export async function appendCashLedgerEntry(input: {
  side: "deposit" | "withdraw";
  amount: number;
  baseCurrency?: string;
  note?: string;
}) {
  const result = await appendCashLedgerEntryV1(input);
  emitDashboardDataUpdatedV1();
  return result;
}

export function useOpLog() {
  const [value, setValue] = useDaaSlice<string[]>("opLog");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const rows = await listOpLogV1(100);
        if (cancelled) return;
        const formatted = rows.map((row) => {
          const prefix = row.level === "error" ? "ERROR" : row.level === "warn" ? "WARN" : "INFO";
          const ts = new Date(row.ts).toLocaleTimeString();
          return `[${ts}] [${prefix}] ${row.message}`;
        });
        setValue(formatted);
        emitDashboardDataUpdatedV1();
      } catch {
        // ignore
      }
    }
    function onRefresh() {
      void load();
    }
    void load();
    window.addEventListener(DAA_DASHBOARD_REFRESH_EVENT_V1, onRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener(DAA_DASHBOARD_REFRESH_EVENT_V1, onRefresh);
    };
  }, [setValue]);

  return [value, setValue] as const;
}

export function appendEquitySnapshot(equity: number, holdingsValue: number, cash: number, source: DaaEquitySnapshot["source"]) {
  const current = readUnifiedInputSliceV1<DaaEquitySnapshot[]>("equitySnapshots") ?? [];
  const snap: DaaEquitySnapshot = { ts: new Date().toISOString(), equity, holdingsValue, cash, source };
  const next = [...current, snap].slice(-100);
  writeUnifiedInputSliceV1("equitySnapshots", next);
  void appendEquitySnapshotV1({
    ts: snap.ts,
    totalEquity: snap.equity,
    holdingsValue: snap.holdingsValue,
    cash: snap.cash,
    source: snap.source,
  }).catch(() => {});
  return snap;
}

export function hasTodaySnapshot(): boolean {
  const snaps = readUnifiedInputSliceV1<DaaEquitySnapshot[]>("equitySnapshots") ?? [];
  if (!snaps.length) return false;
  const today = new Date().toISOString().slice(0, 10);
  return snaps.some((s) => s.ts.slice(0, 10) === today);
}

export function appendOpLog(msg: string) {
  const current = readUnifiedInputSliceV1<string[]>("opLog") ?? [];
  const ts = new Date().toLocaleTimeString();
  const next = [`[${ts}] ${msg}`, ...current].slice(0, 50);
  writeUnifiedInputSliceV1("opLog", next);
  void appendOpLogV1({ level: "info", message: msg, contextJson: {} }).then(() => {
    emitDashboardDataUpdatedV1();
  }).catch(() => {});
}

export function toUserErrorMessage(error: unknown): string {
  return getApiErrorMessageV1(error);
}

function buildUnifiedTargetWeightsV1(
  configTargetWeights: Record<string, number>,
): Record<string, number> {
  const weights: Record<string, number> = {};

  for (const [rawKey, rawValue] of Object.entries(configTargetWeights ?? {})) {
    const value = Number(rawValue);
    const keyText = String(rawKey || "").trim().toUpperCase();
    if (!keyText) {
      throw new Error("目标权重键不能为空，请使用 assetKey（如 US::SPY）");
    }
    if (!Number.isFinite(value)) {
      throw new Error(`目标权重 ${keyText} 必须是有限数字`);
    }
    if (value < 0) {
      throw new Error(`目标权重 ${keyText} 不能为负数`);
    }
    if (value === 0) continue;

    const parsedAssetKey = parseDaaAssetKeyV1(keyText);
    if (!parsedAssetKey) {
      throw new Error(`目标权重键 ${keyText} 不是合法 assetKey，请改为 MARKET::SYMBOL`);
    }
    const assetKey = buildDaaAssetKeyV1(parsedAssetKey.symbol, parsedAssetKey.market);
    if (!assetKey) {
      throw new Error(`目标权重键 ${keyText} 无法规范化为 assetKey`);
    }
    weights[assetKey] = (weights[assetKey] ?? 0) + value;
  }

  return weights;
}

export function buildUnifiedRequest(
  positions: DaaPositionRow[],
  analysts: DaaAnalystRow[],
  assetViews: DaaAssetViewRow[],
  config: DaaStrategyConfig,
): DaaUnifiedRequestV1 {
  const snapshots = readUnifiedInputSliceV1<DaaEquitySnapshot[]>("equitySnapshots") ?? [];
  const candidateAssets = readUnifiedInputSliceV1<DaaCandidateAssetRow[]>("candidateAssets") ?? [];
  const fxRates = readUnifiedInputSliceV1<DaaFxRateRow[]>("fxRates") ?? [];
  const equityPeak = snapshots.reduce((max, row) => Math.max(max, Number(row.equity) || 0), 0);
  const cash = Math.max(0, Number(config.account.cash) || 0);
  const frozenCash = Math.max(0, Number(config.account.frozenCash) || 0);
  const investableRaw = Number(config.account.investableCash);
  const investableCash = Number.isFinite(investableRaw) && investableRaw > 0
    ? Math.max(0, Math.min(cash, investableRaw))
    : Math.max(0, cash - frozenCash);

  return {
    account: {
      baseCurrency: config.account.baseCurrency || "USD",
      cash,
      investableCash,
      frozenCash,
      totalEquity: config.account.totalEquity ?? undefined,
      equityPeak: equityPeak > 0 ? equityPeak : undefined,
    },
    constraints: {
      maxPositionPct: config.constraints.maxPositionPct,
      minNotional: config.constraints.minNotional,
      maxOrderPctOfNav: config.constraints.maxOrderPctOfNav,
    },
    policy: {
      baseDriftTriggerPct: config.policy.baseDriftTriggerPct,
      strongTrendDriftTriggerPct: config.policy.strongTrendDriftTriggerPct,
      riskOffConsensusPct: config.policy.riskOffConsensusPct,
      riskOffScalePct: config.policy.riskOffScalePct,
      valueTrapThesisDriftPct: config.policy.valueTrapThesisDriftPct,
      sbIsolationScorePct: config.policy.sbIsolationScorePct,
    },
    targetWeights: buildUnifiedTargetWeightsV1(config.targetWeights),
    positions: positions.map((p) => ({
      symbol: p.symbol,
      market: p.market,
      currency: p.currency,
      qty: p.qty,
      price: p.price,
      costBasis: p.costBasis,
      tags: p.tags,
    })),
    candidateAssets: candidateAssets.map((item) => ({
      symbol: item.symbol,
      market: item.market,
      currency: item.currency,
      enabled: item.enabled,
      targetWeightHint: item.targetWeightHint,
      tags: item.tags,
      notes: item.notes || undefined,
    })),
    fxRates: fxRates.map((item) => ({
      baseCcy: item.baseCcy,
      quoteCcy: item.quoteCcy,
      rate: item.rate,
      source: item.source,
      asOfTs: item.asOfTs,
    })),
    risk: {
      maxDrawdownPct: config.risk.maxDrawdownPct,
      perAssetStopLossPct: config.risk.perAssetStopLossPct,
      maxConcentrationPct: config.risk.maxConcentrationPct,
      correlationCapPct: config.risk.correlationCapPct,
      maxTotalRiskExposurePct: config.risk.maxTotalRiskExposurePct,
    },
    analysts: analysts.map((a) => ({
      analystId: a.analystId,
      accuracyPct: a.accuracyPct,
      riskControlPct: a.riskControlPct,
      disciplinePct: a.disciplinePct,
      transparencyPct: a.transparencyPct,
      stance: a.stance,
      styleCluster: a.styleCluster,
    })),
    assetViews: assetViews.map((v) => ({
      symbol: v.symbol,
      analystId: v.analystId,
      convictionPct: v.convictionPct,
      thesisDriftPct: v.thesisDriftPct,
      momentumRegime: v.momentumRegime,
    })),
  };
}
