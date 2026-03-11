"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { getTradesReadModelV1 } from "@/src/daa/modules/read/readApiV1";
import type { TradesReadModelV1 } from "@/src/daa/modules/read/readModelsV1";

const DAA_DASHBOARD_REFRESH_EVENT_V1 = "daa:dashboard:refresh";

export type TradeTabV1 = "cycles" | "orders" | "reports";

function maxIsoV1(values: Array<string | null | undefined>): string | null {
  const timestamps = values
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter((value) => Number.isFinite(value));
  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

export function useTradesModelV1(input: {
  tradeLimit?: number;
  reportLimit?: number;
} = {}) {
  const tradeLimit = input.tradeLimit;
  const reportLimit = input.reportLimit;
  const [data, setData] = useState<TradesReadModelV1 | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [expandedReportCycleId, setExpandedReportCycleId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TradeTabV1>("cycles");

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      setData(await getTradesReadModelV1({ tradeLimit, reportLimit }));
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
    window.addEventListener(DAA_DASHBOARD_REFRESH_EVENT_V1, onRefresh);
    return () => window.removeEventListener(DAA_DASHBOARD_REFRESH_EVENT_V1, onRefresh);
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
  const executedOrderCount = orders.filter((row) => row.status === "executed").length;
  const totalNotional = cycles.reduce((sum, cycle) => sum + (cycle.executionSummary?.totalNotional ?? 0), 0);
  const realizedPnl = sortedReports.reduce((sum, report) => sum + report.pnlAttribution.realizedPnl, 0);
  const latestActivityAt = maxIsoV1([
    cycles[0]?.createdAt,
    orders[0]?.updatedAt,
    sortedReports[0]?.reportCreatedAt,
  ]);

  return {
    records: data?.records ?? { cycles: [], orders: [] },
    reports: data?.reports ?? [],
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
    totalNotional,
    realizedPnl,
    latestActivityAt,
  };
}

export type TradesModelV1 = ReturnType<typeof useTradesModelV1>;
