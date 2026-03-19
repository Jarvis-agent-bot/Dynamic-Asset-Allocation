"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { getTradesReadModel } from "@/src/daa/modules/read/readApi";
import type { TradesReadModel } from "@/src/daa/modules/read/readModels";

const DAA_DASHBOARD_REFRESH_EVENT_ = "daa:dashboard:refresh";

export type TradeTab = "cycles" | "orders" | "reports";

function maxIso(values: Array<string | null | undefined>): string | null {
  const timestamps = values
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter((value) => Number.isFinite(value));
  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps)).toISOString();
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

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      setData(await getTradesReadModel({ tradeLimit, reportLimit }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载交易记录失败");
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }, [reportLimit, tradeLimit]);

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    function onRefresh() {
      void load(true);
    }
    window.addEventListener(DAA_DASHBOARD_REFRESH_EVENT_, onRefresh);
    return () => window.removeEventListener(DAA_DASHBOARD_REFRESH_EVENT_, onRefresh);
  }, [load]);

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
  };
}

export type TradesModel = ReturnType<typeof useTradesModel>;
