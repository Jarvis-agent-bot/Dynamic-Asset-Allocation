"use client";

import { useCallback, useEffect, useState } from "react";
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
  loadUnifiedInputStateV1,
  patchUnifiedInputStateV1,
  type UnifiedInputSliceKeyV1,
  readUnifiedInputSliceV1,
  writeUnifiedInputSliceV1,
} from "../../unifiedInputStore";

import type { DaaUnifiedRequestV1 } from "@/src/daa/unifiedRebalanceV1";

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
  return useDaaSlice<DaaPositionRow[]>("positions");
}

export function useAnalysts() {
  return useDaaSlice<DaaAnalystRow[]>("analysts");
}

export function useAssetViews() {
  return useDaaSlice<DaaAssetViewRow[]>("assetViews");
}

export function useHfFundRegistry() {
  return useDaaSlice<DaaHfFundTrackRow[]>("hfFundRegistry");
}

export function useStrategyConfig(): [DaaStrategyConfig, (v: DaaStrategyConfig) => void] {
  const [raw, setRaw] = useDaaSlice<DaaStrategyConfig>("strategyConfig");
  const config = raw ?? DEFAULT_STRATEGY_CONFIG;
  const set = useCallback(
    (v: DaaStrategyConfig) => setRaw(v),
    [setRaw],
  );
  return [config, set];
}

export function useLastRunResult() {
  return useDaaSlice<unknown>("lastRunResult");
}

export function useSyncLog() {
  return useDaaSlice<string[]>("syncLog");
}

export function useRunHistory() {
  return useDaaSlice<DaaRunHistoryEntry[]>("runHistory");
}

export function useEquitySnapshots() {
  return useDaaSlice<DaaEquitySnapshot[]>("equitySnapshots");
}

export function useOpLog() {
  return useDaaSlice<string[]>("opLog");
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
  return entry;
}

export function appendEquitySnapshot(equity: number, holdingsValue: number, cash: number, source: DaaEquitySnapshot["source"]) {
  const current = readUnifiedInputSliceV1<DaaEquitySnapshot[]>("equitySnapshots") ?? [];
  const snap: DaaEquitySnapshot = { ts: new Date().toISOString(), equity, holdingsValue, cash, source };
  const next = [...current, snap].slice(-100);
  writeUnifiedInputSliceV1("equitySnapshots", next);
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
}

export function buildUnifiedRequest(
  positions: DaaPositionRow[],
  analysts: DaaAnalystRow[],
  assetViews: DaaAssetViewRow[],
  config: DaaStrategyConfig,
): DaaUnifiedRequestV1 {
  // analysts/assetViews 为兼容输入，主流程人因信号由基金池采集链路注入。
  return {
    account: {
      cash: config.account.cash,
      totalEquity: config.account.totalEquity ?? undefined,
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
      tags: p.tags,
      liquidityNotional24h: p.liquidityNotional24h,
    })),
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

export function migrateFromDraftIfNeeded() {
  const state = loadUnifiedInputStateV1();
  if (state.positions && state.positions.length > 0) return;

  const draft = state.unifiedRequestDraft as DaaUnifiedRequestV1 | null;
  if (!draft) return;

  const patch: Record<string, unknown> = {};

  if (Array.isArray(draft.positions) && draft.positions.length > 0) {
    patch.positions = draft.positions.map((p) => ({
      symbol: String(p.symbol ?? "").trim().toUpperCase(),
      market: String((p as any).market ?? "US").trim().toUpperCase(),
      currency: String((p as any).currency ?? "USD").trim().toUpperCase(),
      qty: Number(p.qty) || 0,
      price: Number(p.price) || 0,
      tags: Array.isArray((p as any).tags) ? (p as any).tags : [],
      liquidityNotional24h: Number((p as any).liquidityNotional24h) || 0,
    }));
  }

  if (Array.isArray(draft.analysts) && draft.analysts.length > 0) {
    patch.analysts = draft.analysts;
  }

  if (Array.isArray(draft.assetViews) && draft.assetViews.length > 0) {
    patch.assetViews = draft.assetViews;
  }

  if (draft.targetWeights && typeof draft.targetWeights === "object") {
    const defaultCfg = { ...DEFAULT_STRATEGY_CONFIG };
    defaultCfg.targetWeights = draft.targetWeights as Record<string, number>;
    if (draft.account?.cash) defaultCfg.account.cash = Number(draft.account.cash) || 0;
    if ((draft as any).constraints) {
      Object.assign(defaultCfg.constraints, (draft as any).constraints);
    }
    if ((draft as any).policy) {
      Object.assign(defaultCfg.policy, (draft as any).policy);
    }
    patch.strategyConfig = defaultCfg;
  }

  if (Object.keys(patch).length > 0) {
    patchUnifiedInputStateV1(patch);
  }
}
