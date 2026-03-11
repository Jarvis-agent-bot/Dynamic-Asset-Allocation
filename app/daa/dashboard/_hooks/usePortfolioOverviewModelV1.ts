"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { getOverviewReadModelV1 } from "@/src/daa/modules/read/readApiV1";
import {
  MARKET_INDICATOR_KEYS_BY_SCOPE_V1,
  MARKET_SCOPE_KEY_ORDER_V1,
} from "@/src/daa/modules/marketContext/marketIndicatorCatalogV1";
import type { DaaMarketIndicatorKeyV1, DaaMarketIndicatorScopeV1 } from "@/src/daa/modules/marketContext/marketContextTypesV1";
import {
  appendCashLedgerEntryV1,
  listMarketIndicatorHistoryV1,
  refreshMarketIndicatorsV1,
  type StoreCashLedgerEntryV1,
  type StoreEquitySnapshotV1,
} from "@/src/daa/modules/store/storeApiV1";
import type { WorkbenchBootstrapV1 } from "@/src/daa/modules/workbench/workbenchTypesV1";

const DAA_DASHBOARD_REFRESH_EVENT_V1 = "daa:dashboard:refresh";

function normalizeCashCurrency(value: string): string {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "RMB" || raw === "CNH") return "CNY";
  return raw || "USD";
}

function dailyPnlFromSnapshots(snapshots: StoreEquitySnapshotV1[], fallbackTotalEquity: number): number {
  if (!snapshots.length) return 0;
  const sorted = [...snapshots].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const latest = sorted[sorted.length - 1]?.totalEquity ?? fallbackTotalEquity;
  const previous = sorted.length >= 2 ? sorted[sorted.length - 2]?.totalEquity ?? latest : latest;
  return latest - previous;
}

function shortDateLabelV1(value: string): string {
  const iso = String(value || "").trim();
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function buildMarketHistoryChartDataV1(
  history: Record<DaaMarketIndicatorKeyV1, Array<{ generatedAt: string; rawValue: number | null }>>,
  keys: DaaMarketIndicatorKeyV1[],
): Array<Record<string, number | string | null>> {
  const map = new Map<string, Record<string, number | string | null>>();
  for (const key of keys) {
    for (const row of history[key] || []) {
      const dateKey = shortDateLabelV1(row.generatedAt);
      const current = map.get(dateKey) || { day: dateKey, label: dateKey, date: dateKey };
      current[key] = row.rawValue == null ? null : Number(row.rawValue);
      map.set(dateKey, current);
    }
  }
  return [...map.values()];
}

export function usePortfolioOverviewModelV1() {
  const [bootstrap, setBootstrap] = useState<WorkbenchBootstrapV1 | null>(null);
  const [snapshots, setSnapshots] = useState<StoreEquitySnapshotV1[]>([]);
  const [cashLedger, setCashLedger] = useState<StoreCashLedgerEntryV1[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [cashDialogSide, setCashDialogSide] = useState<"deposit" | "withdraw" | null>(null);
  const [cashAmount, setCashAmount] = useState("");
  const [cashCurrency, setCashCurrency] = useState("USD");
  const [cashNote, setCashNote] = useState("");
  const [cashSubmitting, setCashSubmitting] = useState(false);
  const [marketHistoryRange, setMarketHistoryRange] = useState<30 | 90>(30);
  const [selectedMarketScope, setSelectedMarketScope] = useState<DaaMarketIndicatorScopeV1>("us_equity");
  const [marketHistoryLoading, setMarketHistoryLoading] = useState(true);
  const [marketHistoryRefreshing, setMarketHistoryRefreshing] = useState(false);
  const [marketHistoryError, setMarketHistoryError] = useState("");
  const [marketHistoryData, setMarketHistoryData] = useState<Array<Record<string, number | string | null>>>([]);
  const [marketContextRefreshing, setMarketContextRefreshing] = useState(false);

  const marketScopes = useMemo(
    () => MARKET_SCOPE_KEY_ORDER_V1.filter((scope) => Boolean(bootstrap?.marketContext?.scopes?.some((item) => item.scope === scope))),
    [bootstrap],
  );
  const selectedScope = marketScopes.includes(selectedMarketScope)
    ? selectedMarketScope
    : (marketScopes[0] || "us_equity");
  const selectedScopeContext = bootstrap?.marketContext?.scopes?.find((item) => item.scope === selectedScope) || null;
  const selectedScopeKeys = MARKET_INDICATOR_KEYS_BY_SCOPE_V1[selectedScope] || [];

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const result = await getOverviewReadModelV1();
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

  const loadMarketHistory = useCallback(async (days: 30 | 90, scope: DaaMarketIndicatorScopeV1, silent = false) => {
    if (silent) setMarketHistoryRefreshing(true);
    else setMarketHistoryLoading(true);
    setMarketHistoryError("");
    try {
      const keys = MARKET_INDICATOR_KEYS_BY_SCOPE_V1[scope] || [];
      const result = await listMarketIndicatorHistoryV1({ keys, days, scope });
      setMarketHistoryData(buildMarketHistoryChartDataV1(result.history, keys));
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
      const result = await refreshMarketIndicatorsV1();
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

  const closeCashDialog = useCallback(() => {
    const baseCurrency = bootstrap?.baseCurrency || "USD";
    setCashDialogSide(null);
    setCashAmount("");
    setCashCurrency(baseCurrency === "CNY" ? "RMB" : baseCurrency);
    setCashNote("");
  }, [bootstrap]);

  const handleSubmitCashLedger = useCallback(async () => {
    if (!cashDialogSide || cashSubmitting) return;
    const amount = Number(cashAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("请输入大于 0 的金额");
      return;
    }

    setCashSubmitting(true);
    try {
      const baseCurrency = bootstrap?.baseCurrency || "USD";
      await appendCashLedgerEntryV1({
        side: cashDialogSide,
        amount,
        baseCurrency: cashCurrency,
        note: cashNote.trim() || undefined,
      });
      toast.success(cashDialogSide === "deposit" ? "入金已记录" : "出金已记录");
      closeCashDialog();
      setCashCurrency(baseCurrency === "CNY" ? "RMB" : baseCurrency);
      await load(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "现金流水提交失败");
    } finally {
      setCashSubmitting(false);
    }
  }, [bootstrap, cashAmount, cashCurrency, cashDialogSide, cashNote, cashSubmitting, closeCashDialog, load]);

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
    window.addEventListener(DAA_DASHBOARD_REFRESH_EVENT_V1, onRefresh);
    return () => window.removeEventListener(DAA_DASHBOARD_REFRESH_EVENT_V1, onRefresh);
  }, [load, loadMarketHistory, marketHistoryRange, selectedScope]);

  useEffect(() => {
    if (marketScopes.length > 0 && !marketScopes.includes(selectedMarketScope)) {
      setSelectedMarketScope(marketScopes[0]);
    }
  }, [marketScopes, selectedMarketScope]);

  const cashDialogOpen = cashDialogSide != null;
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

  useEffect(() => {
    if (cashDialogOpen) setCashCurrency(baseCurrency === "CNY" ? "RMB" : baseCurrency);
  }, [cashDialogOpen, baseCurrency]);

  return {
    bootstrap,
    snapshots,
    cashLedger,
    loading,
    refreshing,
    error,
    cashDialogSide,
    setCashDialogSide,
    cashAmount,
    setCashAmount,
    cashCurrency,
    setCashCurrency,
    cashNote,
    setCashNote,
    cashSubmitting,
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
    cashDialogOpen,
    baseCurrency,
    totalEquity,
    holdingsValue,
    cashValue,
    dailyPnl,
    holdingCount,
    trendData,
    allocationData,
    allocationTotal,
    handleSubmitCashLedger,
    closeCashDialog,
    normalizeCashCurrency,
  };
}

export type PortfolioOverviewModelV1 = ReturnType<typeof usePortfolioOverviewModelV1>;
