"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { getOverviewReadModel } from "@/src/daa/modules/read/readApi";
import {
  MARKET_INDICATOR_KEYS_BY_SCOPE_,
  MARKET_SCOPE_KEY_ORDER_,
} from "@/src/daa/modules/marketContext/marketIndicatorCatalog";
import type { DaaMarketIndicatorKey, DaaMarketIndicatorScope } from "@/src/daa/modules/marketContext/marketContextTypes";
import {
  listMarketIndicatorHistory,
  refreshMarketIndicators,
  type StoreCashLedgerEntry,
  type StoreEquitySnapshot,
} from "@/src/daa/modules/store/storeApi";
import type { WorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchTypes";

const DAA_DASHBOARD_REFRESH_EVENT_ = "daa:dashboard:refresh";

function dailyPnlFromSnapshots(snapshots: StoreEquitySnapshot[], fallbackTotalEquity: number): number {
  if (!snapshots.length) return 0;
  const sorted = [...snapshots].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const latest = sorted[sorted.length - 1]?.totalEquity ?? fallbackTotalEquity;
  const previous = sorted.length >= 2 ? sorted[sorted.length - 2]?.totalEquity ?? latest : latest;
  return latest - previous;
}

function shortDateLabel(value: string): string {
  const iso = String(value || "").trim();
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function buildMarketHistoryChartData(
  history: Record<DaaMarketIndicatorKey, Array<{ generatedAt: string; rawValue: number | null }>>,
  keys: DaaMarketIndicatorKey[],
): Array<Record<string, number | string | null>> {
  const map = new Map<string, Record<string, number | string | null>>();
  for (const key of keys) {
    for (const row of history[key] || []) {
      const dateKey = shortDateLabel(row.generatedAt);
      const current = map.get(dateKey) || { day: dateKey, label: dateKey, date: dateKey };
      current[key] = row.rawValue == null ? null : Number(row.rawValue);
      map.set(dateKey, current);
    }
  }
  return [...map.values()];
}

export function usePortfolioOverviewModel() {
  const [bootstrap, setBootstrap] = useState<WorkbenchBootstrap | null>(null);
  const [snapshots, setSnapshots] = useState<StoreEquitySnapshot[]>([]);
  const [cashLedger, setCashLedger] = useState<StoreCashLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [marketHistoryRange, setMarketHistoryRange] = useState<30 | 90>(30);
  const [selectedMarketScope, setSelectedMarketScope] = useState<DaaMarketIndicatorScope>("us_equity");
  const [marketHistoryLoading, setMarketHistoryLoading] = useState(true);
  const [marketHistoryRefreshing, setMarketHistoryRefreshing] = useState(false);
  const [marketHistoryError, setMarketHistoryError] = useState("");
  const [marketHistoryData, setMarketHistoryData] = useState<Array<Record<string, number | string | null>>>([]);
  const [marketContextRefreshing, setMarketContextRefreshing] = useState(false);

  const marketScopes = useMemo(
    () => MARKET_SCOPE_KEY_ORDER_.filter((scope) => Boolean(bootstrap?.marketContext?.scopes?.some((item) => item.scope === scope))),
    [bootstrap],
  );
  const selectedScope = marketScopes.includes(selectedMarketScope)
    ? selectedMarketScope
    : (marketScopes[0] || "us_equity");
  const selectedScopeContext = bootstrap?.marketContext?.scopes?.find((item) => item.scope === selectedScope) || null;
  const selectedScopeKeys = MARKET_INDICATOR_KEYS_BY_SCOPE_[selectedScope] || [];

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const result = await getOverviewReadModel();
      setBootstrap(result.bootstrap);
      setSnapshots(result.snapshots);
      setCashLedger(result.cashLedger);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载总览失败");
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  const loadMarketHistory = useCallback(async (days: 30 | 90, scope: DaaMarketIndicatorScope, silent = false) => {
    if (silent) setMarketHistoryRefreshing(true);
    else setMarketHistoryLoading(true);
    setMarketHistoryError("");
    try {
      const keys = MARKET_INDICATOR_KEYS_BY_SCOPE_[scope] || [];
      const result = await listMarketIndicatorHistory({ keys, days, scope });
      setMarketHistoryData(buildMarketHistoryChartData(result.history, keys));
    } catch (e) {
      setMarketHistoryError(e instanceof Error ? e.message : "加载市场历史失败");
    } finally {
      if (silent) setMarketHistoryRefreshing(false);
      else setMarketHistoryLoading(false);
    }
  }, []);

  const handleRefreshMarketContext = useCallback(async () => {
    setMarketContextRefreshing(true);
    try {
      const result = await refreshMarketIndicators();
      toast.success(`市场状态层已刷新，更新 ${result.refreshedCount} 项指标`);
      await Promise.all([
        load(true),
        loadMarketHistory(marketHistoryRange, selectedScope, true),
      ]);
    } catch (e) {
      const message = e instanceof Error ? e.message : "刷新市场状态层失败";
      toast.error(message);
    } finally {
      setMarketContextRefreshing(false);
    }
  }, [load, loadMarketHistory, marketHistoryRange, selectedScope]);


  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    void loadMarketHistory(marketHistoryRange, selectedScope, false);
  }, [loadMarketHistory, marketHistoryRange, selectedScope]);

  useEffect(() => {
    function onRefresh() {
      void Promise.all([
        load(true),
        loadMarketHistory(marketHistoryRange, selectedScope, true),
      ]);
    }
    window.addEventListener(DAA_DASHBOARD_REFRESH_EVENT_, onRefresh);
    return () => window.removeEventListener(DAA_DASHBOARD_REFRESH_EVENT_, onRefresh);
  }, [load, loadMarketHistory, marketHistoryRange, selectedScope]);

  useEffect(() => {
    if (marketScopes.length > 0 && !marketScopes.includes(selectedMarketScope)) {
      setSelectedMarketScope(marketScopes[0]);
    }
  }, [marketScopes, selectedMarketScope]);

  const baseCurrency = bootstrap?.baseCurrency || "USD";
  const totalEquity = bootstrap?.account.totalEquity ?? 0;
  const holdingsValue = useMemo(
    () => (bootstrap?.assetUniverse || []).filter((row) => row.holdingQty > 0).reduce((sum, row) => sum + (row.valuationBase || 0), 0),
    [bootstrap],
  );
  const cashValue = bootstrap?.account.cash ?? 0;
  const dailyPnl = dailyPnlFromSnapshots(snapshots, totalEquity);
  const holdingCount = useMemo(
    () => (bootstrap?.assetUniverse || []).filter((row) => row.holdingQty > 0).length,
    [bootstrap],
  );

  const trendData = useMemo(() => {
    if (!snapshots.length) return [];
    return [...snapshots]
      .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
      .slice(-90)
      .map((row) => ({
        date: row.ts.slice(5, 10),
        totalEquity: row.totalEquity,
        holdings: row.holdingsValue,
        cash: row.cash,
      }));
  }, [snapshots]);

  const allocationData = useMemo(() => {
    if (!bootstrap) return [];
    const rows = bootstrap.assetUniverse
      .filter((row) => row.holdingQty > 0 && (row.valuationBase || 0) > 0)
      .sort((a, b) => (b.valuationBase || 0) - (a.valuationBase || 0));
    const top = rows.slice(0, 5).map((row) => ({ name: row.symbol, value: row.valuationBase || 0 }));
    const topSum = top.reduce((sum, row) => sum + row.value, 0);
    const other = Math.max(0, holdingsValue - topSum);
    return [
      ...top,
      ...(other > 0 ? [{ name: "其他", value: other }] : []),
      ...(cashValue > 0 ? [{ name: "现金", value: cashValue }] : []),
    ];
  }, [bootstrap, holdingsValue, cashValue]);
  const allocationTotal = allocationData.reduce((sum, row) => sum + Math.max(0, Number(row.value || 0)), 0);

  return {
    bootstrap,
    snapshots,
    cashLedger,
    loading,
    refreshing,
    error,
    marketHistoryRange,
    setMarketHistoryRange,
    selectedMarketScope,
    setSelectedMarketScope,
    marketHistoryLoading,
    marketHistoryRefreshing,
    marketHistoryError,
    marketHistoryData,
    marketContextRefreshing,
    marketScopes,
    selectedScope,
    selectedScopeContext,
    selectedScopeKeys,
    load,
    loadMarketHistory,
    handleRefreshMarketContext,
    baseCurrency,
    totalEquity,
    holdingsValue,
    cashValue,
    dailyPnl,
    holdingCount,
    trendData,
    allocationData,
    allocationTotal,
  };
}

export type PortfolioOverviewModel = ReturnType<typeof usePortfolioOverviewModel>;
