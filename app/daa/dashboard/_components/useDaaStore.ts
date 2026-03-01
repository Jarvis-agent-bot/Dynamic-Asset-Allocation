"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type DaaAnalystRow,
  type DaaAssetViewRow,
  type DaaEquitySnapshot,
  type DaaHfFundTrackRow,
  type DaaPositionRow,
  type DaaRunHistoryEntry,
  type DaaStrategyConfig,
  DAA_RUNTIME_DATA_EVENT_V1,
  DEFAULT_STRATEGY_CONFIG,
  readUnifiedInputSliceV1,
  writeUnifiedInputSliceV1,
  type UnifiedInputSliceKeyV1,
} from "../../unifiedInputStore";

import { getApiErrorMessageV1 } from "@/src/daa/api/clientV1";
import {
  appendOpLogV1,
  appendEquitySnapshotV1,
  getStrategyConfigV1,
  listDataSourcesV1,
  listEquitySnapshotsV1,
  listOpLogV1,
  listPositionsV1,
  listRunHistoryV1,
  replaceDataSourcesV1,
  replacePositionsV1,
  saveStrategyConfigV1,
} from "@/src/daa/modules/store/storeApiV1";
import type { DaaUnifiedRequestV1 } from "@/src/daa/unifiedRebalanceV1";

const DAA_DASHBOARD_REFRESH_EVENT_V1 = "daa:dashboard:refresh";
const DAA_DASHBOARD_DATA_UPDATED_EVENT_V1 = "daa:dashboard:data-updated";

function emitDashboardDataUpdatedV1() {
  try {
    window.dispatchEvent(new CustomEvent(DAA_DASHBOARD_DATA_UPDATED_EVENT_V1, { detail: { ts: Date.now() } }));
  } catch {
    // ignore browser event failures
  }
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

export function usePositions() {
  const [value, setValue] = useDaaSlice<DaaPositionRow[]>("positions");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const rows = await listPositionsV1();
        if (cancelled) return;
        setValue(rows as DaaPositionRow[]);
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

  const set = useCallback((rows: DaaPositionRow[] | null) => {
    setValue(rows);
    void replacePositionsV1((rows ?? []) as any[]).catch(() => {});
  }, [setValue]);

  return [value, set] as const;
}

export function useAnalysts() {
  return useDaaSlice<DaaAnalystRow[]>("analysts");
}

export function useAssetViews() {
  return useDaaSlice<DaaAssetViewRow[]>("assetViews");
}

export function useHfFundRegistry() {
  const [value, setValue] = useDaaSlice<DaaHfFundTrackRow[]>("hfFundRegistry");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const rows = await listDataSourcesV1("hf_fund");
        if (cancelled) return;
        const source = Array.isArray(rows) ? rows[0] : null;
        const funds = Array.isArray(source?.configJson?.funds) ? source.configJson.funds : [];
        setValue(funds as DaaHfFundTrackRow[]);
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

  const set = useCallback((rows: DaaHfFundTrackRow[] | null) => {
    setValue(rows);
    void replaceDataSourcesV1([
      {
        id: "hf_fund.default",
        kind: "hf_fund",
        enabled: true,
        configJson: { funds: rows ?? [] },
      },
    ] as any[]).catch(() => {});
  }, [setValue]);

  return [value, set] as const;
}

export function useStrategyConfig(): [DaaStrategyConfig, (v: DaaStrategyConfig) => void] {
  const [raw, setRaw] = useDaaSlice<DaaStrategyConfig>("strategyConfig");
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

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const serverConfig = await getStrategyConfigV1();
        if (cancelled) return;
        setRaw((serverConfig && typeof serverConfig === "object") ? serverConfig as DaaStrategyConfig : DEFAULT_STRATEGY_CONFIG);
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
  }, [setRaw]);

  const set = useCallback((v: DaaStrategyConfig) => {
    setRaw(v);
    void saveStrategyConfigV1(v as unknown as Record<string, unknown>).catch(() => {});
  }, [setRaw]);

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

export function appendRunHistory(request: unknown, response: unknown) {
  const current = readUnifiedInputSliceV1<DaaRunHistoryEntry[]>("runHistory") ?? [];
  const entry: DaaRunHistoryEntry = {
    id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ts: new Date().toISOString(),
    request,
    response,
  };
  const next = [entry, ...current].slice(0, 20);
  writeUnifiedInputSliceV1("runHistory", next);
  emitDashboardDataUpdatedV1();
  return entry;
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

export function buildUnifiedRequest(
  positions: DaaPositionRow[],
  analysts: DaaAnalystRow[],
  assetViews: DaaAssetViewRow[],
  config: DaaStrategyConfig,
): DaaUnifiedRequestV1 {
  const snapshots = readUnifiedInputSliceV1<DaaEquitySnapshot[]>("equitySnapshots") ?? [];
  const equityPeak = snapshots.reduce((max, row) => Math.max(max, Number(row.equity) || 0), 0);

  // analysts/assetViews 为兼容输入，主流程人因信号由基金池采集链路注入。
  return {
    account: {
      cash: config.account.cash,
      totalEquity: config.account.totalEquity ?? undefined,
      equityPeak: equityPeak > 0 ? equityPeak : undefined,
    },
    constraints: {
      maxPositionPct: config.constraints.maxPositionPct,
      minNotional: config.constraints.minNotional,
      maxOrderPctOfNav: config.constraints.maxOrderPctOfNav,
      maxOrderPctOfLiquidity: config.constraints.maxOrderPctOfLiquidity,
    },
    policy: {
      baseDriftTriggerPct: config.policy.baseDriftTriggerPct,
      strongTrendDriftTriggerPct: config.policy.strongTrendDriftTriggerPct,
      riskOffConsensusPct: config.policy.riskOffConsensusPct,
      riskOffScalePct: config.policy.riskOffScalePct,
      valueTrapThesisDriftPct: config.policy.valueTrapThesisDriftPct,
      sbIsolationScorePct: config.policy.sbIsolationScorePct,
    },
    targetWeights: { ...config.targetWeights },
    positions: positions.map((p) => ({
      symbol: p.symbol,
      market: p.market,
      currency: p.currency,
      qty: p.qty,
      price: p.price,
      costBasis: p.costBasis,
      tags: p.tags,
      liquidityNotional24h: p.liquidityNotional24h,
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
