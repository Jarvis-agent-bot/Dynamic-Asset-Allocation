"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type DaaAnalystRow,
  type DaaAssetViewRow,
  type DaaEquitySnapshot,
  type DaaHfFundTrackRow,
  type DaaFxRateRow,
  type DaaPositionRow,
  type DaaRunHistoryEntry,
  type DaaStrategyConfig,
  type DaaWatchlistCandidateRow,
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
  listFxRatesV1,
  listDataSourcesV1,
  listEquitySnapshotsV1,
  listOpLogV1,
  listPositionsV1,
  listRunHistoryV1,
  listWatchlistCandidatesV1,
  replaceDataSourcesV1,
  replaceWatchlistCandidatesV1,
  replacePositionsV1,
  saveStrategyConfigV1,
  upsertFxRatesV1,
} from "@/src/daa/modules/store/storeApiV1";
import type { DaaUnifiedRequestV1 } from "@/src/daa/unifiedRebalanceV1";

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
    const previous = readUnifiedInputSliceV1<DaaPositionRow[]>("positions");
    setValue(rows);
    void replacePositionsV1((rows ?? []) as any[])
      .then(() => {
        emitDashboardDataUpdatedV1();
      })
      .catch((error) => {
        setValue(previous ?? null);
        emitDashboardPersistErrorV1(`保存持仓失败：${getApiErrorMessageV1(error)}`);
      });
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
    const previous = readUnifiedInputSliceV1<DaaHfFundTrackRow[]>("hfFundRegistry");
    setValue(rows);
    void replaceDataSourcesV1([
      {
        id: "hf_fund.default",
        kind: "hf_fund",
        enabled: true,
        configJson: { funds: rows ?? [] },
      },
    ] as any[])
      .then(() => {
        emitDashboardDataUpdatedV1();
      })
      .catch((error) => {
        setValue(previous ?? null);
        emitDashboardPersistErrorV1(`保存基金池失败：${getApiErrorMessageV1(error)}`);
      });
  }, [setValue]);

  return [value, set] as const;
}

export function useWatchlistCandidates() {
  const [value, setValue] = useDaaSlice<DaaWatchlistCandidateRow[]>("watchlistCandidates");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const rows = await listWatchlistCandidatesV1();
        if (cancelled) return;
        setValue(rows as DaaWatchlistCandidateRow[]);
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

  const set = useCallback((rows: DaaWatchlistCandidateRow[] | null) => {
    const previous = readUnifiedInputSliceV1<DaaWatchlistCandidateRow[]>("watchlistCandidates");
    setValue(rows);
    void replaceWatchlistCandidatesV1((rows ?? []) as any[])
      .then(() => {
        emitDashboardDataUpdatedV1();
      })
      .catch((error) => {
        setValue(previous ?? null);
        emitDashboardPersistErrorV1(`保存候选池失败：${getApiErrorMessageV1(error)}`);
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
    const previous = readUnifiedInputSliceV1<DaaStrategyConfig>("strategyConfig");
    setRaw(v);
    void saveStrategyConfigV1(v as unknown as Record<string, unknown>)
      .then(() => {
        emitDashboardDataUpdatedV1();
      })
      .catch((error) => {
        setRaw(previous ?? null);
        emitDashboardPersistErrorV1(`保存策略配置失败：${getApiErrorMessageV1(error)}`);
      });
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
  const watchlistCandidates = readUnifiedInputSliceV1<DaaWatchlistCandidateRow[]>("watchlistCandidates") ?? [];
  const fxRates = readUnifiedInputSliceV1<DaaFxRateRow[]>("fxRates") ?? [];
  const equityPeak = snapshots.reduce((max, row) => Math.max(max, Number(row.equity) || 0), 0);
  const cash = Math.max(0, Number(config.account.cash) || 0);
  const frozenCash = Math.max(0, Number(config.account.frozenCash) || 0);
  const investableRaw = Number(config.account.investableCash);
  const investableCash = Number.isFinite(investableRaw) && investableRaw > 0
    ? Math.max(0, Math.min(cash, investableRaw))
    : Math.max(0, cash - frozenCash);

  // analysts/assetViews 为兼容输入，主流程人因信号由基金池采集链路注入。
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
    watchlistCandidates: watchlistCandidates.map((item) => ({
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
