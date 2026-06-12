"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getTradesReadModel } from "@/src/daa/modules/read/readApi";
import type { TradesReadModel } from "@/src/daa/modules/read/readModels";
import type { TradeTicketStatus } from "@/src/daa/modules/trade/tradeTypes";
import { useWorkbenchAutoRefresh } from "./useWorkbenchAutoRefresh";

export type TradeTab = "cycles" | "orders";

const ORDERS_DISPLAY_CAP = 300;
const TRADE_SIDES = ["BUY", "SELL"] as const;
const TRADE_STATUSES: TradeTicketStatus[] = [
  "ready", "submitted", "partially_filled", "executed", "canceled", "rejected",
];
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function maxIso(values: Array<string | null | undefined>): string | null {
  const timestamps = values
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter((value) => Number.isFinite(value));
  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

export type TradeSide = (typeof TRADE_SIDES)[number];

export type TradeFilters = {
  startDate?: string;
  endDate?: string;
  symbol?: string;
  side?: TradeSide;
  status?: TradeTicketStatus;
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
  // 校验 URL 入参，丢弃非法值，避免污染受控控件与请求参数。
  if (start && ISO_DATE_RE.test(start)) filters.startDate = start;
  if (end && ISO_DATE_RE.test(end)) filters.endDate = end;
  if (symbol) filters.symbol = symbol;
  if (side && (TRADE_SIDES as readonly string[]).includes(side)) filters.side = side as TradeSide;
  if (status && (TRADE_STATUSES as string[]).includes(status)) filters.status = status as TradeTicketStatus;
  return filters;
}

export function useTradesModel(input: {
  tradeLimit?: number;
  reportLimit?: number;
} = {}) {
  const tradeLimit = input.tradeLimit;
  const reportLimit = input.reportLimit;
  const [tradesModel, setTradesModel] = useState<TradesReadModel | null>(null);
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

  const requestIdRef = useRef(0);

  const load = useCallback(async (silent = false) => {
    const reqId = ++requestIdRef.current;
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const nextTradesModel = await getTradesReadModel({
        tradeLimit,
        reportLimit,
        ...filters,
      });
      // 丢弃过期请求：快速切换筛选/刷新时，先发后到的旧响应不得覆盖最新结果。
      if (reqId !== requestIdRef.current) return;
      setTradesModel(nextTradesModel);
    } catch (loadError) {
      if (reqId !== requestIdRef.current) return;
      setError(loadError instanceof Error ? loadError.message : "加载交易记录失败");
    } finally {
      if (reqId === requestIdRef.current) {
        if (silent) setRefreshing(false);
        else setLoading(false);
      }
    }
  }, [reportLimit, tradeLimit, filters]);

  useWorkbenchAutoRefresh(load);

  const cycles = useMemo(
    () => [...(tradesModel?.records.cycles || [])].sort(
      (leftCycle, rightCycle) => Date.parse(rightCycle.createdAt) - Date.parse(leftCycle.createdAt),
    ),
    [tradesModel?.records.cycles],
  );
  const totalOrderCount = tradesModel?.records.orders?.length ?? 0;
  const orders = useMemo(
    () => [...(tradesModel?.records.orders || [])].sort(
      (leftOrder, rightOrder) => Date.parse(rightOrder.updatedAt) - Date.parse(leftOrder.updatedAt),
    ).slice(0, ORDERS_DISPLAY_CAP),
    [tradesModel?.records.orders],
  );
  const ordersTruncated = totalOrderCount > ORDERS_DISPLAY_CAP;
  const sortedReports = useMemo(
    () => [...(tradesModel?.reports || [])].sort(
      (leftReport, rightReport) => Date.parse(rightReport.reportCreatedAt) - Date.parse(leftReport.reportCreatedAt),
    ),
    [tradesModel?.reports],
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
    tradesModel,
    baseCurrency: tradesModel?.baseCurrency ?? "USD",
    records: tradesModel?.records ?? { cycles: [], orders: [] },
    reports: tradesModel?.reports ?? [],
    ledgerMeta: tradesModel?.ledgerMeta ?? {
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
    totalOrderCount,
    ordersTruncated,
    ordersDisplayCap: ORDERS_DISPLAY_CAP,
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
