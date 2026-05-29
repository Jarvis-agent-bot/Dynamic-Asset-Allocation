"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { getTradesReadModel } from "@/src/daa/modules/read/readApi";
import type { TradesReadModel } from "@/src/daa/modules/read/readModels";
import { useDashboardAutoRefresh } from "./useDashboardAutoRefresh";

export type TradeTab = "cycles" | "orders";

function maxIso(values: Array<string | null | undefined>): string | null {
  const timestamps = values
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter((value) => Number.isFinite(value));
  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

export type TradeFilters = {
  startDate?: string;
  endDate?: string;
  symbol?: string;
  side?: string;
  status?: string;
};

function readFiltersFromUrl(): TradeFilters {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const filters: TradeFilters = {};
  const start = params.get("start") ?? params.get("startDate");
  const end = params.get("end") ?? params.get("endDate");
  const symbol = params.get("symbol");
  const side = params.get("side");
  const status = params.get("status");
  if (start) filters.startDate = start;
  if (end) filters.endDate = end;
  if (symbol) filters.symbol = symbol;
  if (side) filters.side = side;
  if (status) filters.status = status;
  return filters;
}

export function useTradesModel(input: {
  tradeLimit?: number;
  reportLimit?: number;
} = {}) {
  const tradeLimit = input.tradeLimit;
  const reportLimit = input.reportLimit;
  const [data, setData] = useState<TradesReadModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [expandedReportCycleId, setExpandedReportCycleId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TradeTab>("cycles");
  const [filters, setFilters] = useState<TradeFilters>(() => readFiltersFromUrl());

  // 同步 filters 到 URL（只在浏览器中）
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    for (const key of ["start", "end", "symbol", "side", "status"]) params.delete(key);
    if (filters.startDate) params.set("start", filters.startDate);
    if (filters.endDate) params.set("end", filters.endDate);
    if (filters.symbol) params.set("symbol", filters.symbol);
    if (filters.side) params.set("side", filters.side);
    if (filters.status) params.set("status", filters.status);
    const query = params.toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    if (nextUrl !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(null, "", nextUrl);
    }
  }, [filters]);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      setData(await getTradesReadModel({
        tradeLimit,
        reportLimit,
        ...filters,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载交易记录失败");
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }, [reportLimit, tradeLimit, filters]);

  useDashboardAutoRefresh(load);

  const cycles = useMemo(
    () => [...(data?.records.cycles || [])].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [data?.records.cycles],
  );
  const orders = useMemo(
    () => [...(data?.records.orders || [])].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 300),
    [data?.records.orders],
  );
  const sortedReports = useMemo(
    () => [...(data?.reports || [])].sort((a, b) => Date.parse(b.reportCreatedAt) - Date.parse(a.reportCreatedAt)),
    [data?.reports],
  );

  const completedCycleCount = cycles.filter((cycle) => cycle.status === "completed").length;
  const executedOrders = orders.filter((row) => row.status === "executed");
  const executedOrderCount = executedOrders.length;
  const executedOrderNotional = executedOrders.reduce((sum, row) => sum + Math.max(0, row.notionalInBase || row.grossNotional || 0), 0);
  const cycleExecutedNotional = executedOrders
    .filter((row) => Boolean(row.cycleId))
    .reduce((sum, row) => sum + Math.max(0, row.notionalInBase || row.grossNotional || 0), 0);
  const manualExecutedNotional = Math.max(0, executedOrderNotional - cycleExecutedNotional);
  const totalNotional = cycles.reduce((sum, cycle) => sum + (cycle.executionSummary?.totalNotional ?? 0), 0);
  const realizedPnl = sortedReports.reduce((sum, report) => sum + report.pnlAttribution.realizedPnl, 0);
  const latestActivityAt = maxIso([
    cycles[0]?.createdAt,
    orders[0]?.updatedAt,
    sortedReports[0]?.reportCreatedAt,
  ]);

  return {
    baseCurrency: data?.baseCurrency ?? "USD",
    records: data?.records ?? { cycles: [], orders: [] },
    reports: data?.reports ?? [],
    ledgerMeta: data?.ledgerMeta ?? {
      ledgerStartTs: null,
      openingBalance: 0,
      archivedCycleCount: 0,
      archivedTradeCount: 0,
      archivedReportCount: 0,
    },
    loading,
    refreshing,
    error,
    expandedReportCycleId,
    setExpandedReportCycleId,
    activeTab,
    setActiveTab,
    load,
    cycles,
    orders,
    sortedReports,
    completedCycleCount,
    executedOrderCount,
    executedOrderNotional,
    cycleExecutedNotional,
    manualExecutedNotional,
    totalNotional,
    realizedPnl,
    latestActivityAt,
    filters,
    setFilters,
  };
}

export type TradesModel = ReturnType<typeof useTradesModel>;
