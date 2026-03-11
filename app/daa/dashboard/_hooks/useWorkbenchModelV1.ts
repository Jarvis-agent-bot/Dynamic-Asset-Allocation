"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiClientErrorV1, getApiErrorMessageV1 } from "@/src/daa/api/clientV1";
import { getWorkbenchReadModelV1 } from "@/src/daa/modules/read/readApiV1";
import type { PreTradeRiskCheckV1, RebalanceCycleV1, WorkbenchBootstrapV1 } from "@/src/daa/modules/workbench/workbenchTypesV1";

const DAA_DASHBOARD_REFRESH_EVENT_V1 = "daa:dashboard:refresh";

export type WorkbenchTabV1 = "positions" | "watchlist" | "discovery" | "rebalance";

export function normalizeWorkbenchTabV1(input: string): WorkbenchTabV1 {
  if (input === "positions" || input === "watchlist" || input === "discovery" || input === "rebalance") return input;
  return "positions";
}

function toWorkbenchErrorMessage(error: unknown): string {
  if (error instanceof ApiClientErrorV1 && error.code === "DB_ERROR") {
    return "工作台数据服务暂时不可用，请稍后重试。";
  }
  return getApiErrorMessageV1(error);
}

export function useWorkbenchModelV1(input: {
  initialTab?: string;
  syncPrices?: boolean;
  autoRiskCycle?: boolean;
} = {}) {
  const [activeTab, setActiveTab] = useState<WorkbenchTabV1>(() => normalizeWorkbenchTabV1(String(input.initialTab || "")));
  const [bootstrap, setBootstrap] = useState<WorkbenchBootstrapV1 | null>(null);
  const [cycles, setCycles] = useState<RebalanceCycleV1[]>([]);
  const [currentCycle, setCurrentCycle] = useState<RebalanceCycleV1 | null>(null);
  const [riskCheck, setRiskCheck] = useState<PreTradeRiskCheckV1 | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const currentCycleIdRef = useRef<string | null>(null);

  useEffect(() => {
    currentCycleIdRef.current = currentCycle?.cycleId || null;
  }, [currentCycle?.cycleId]);

  const loadBootstrap = useCallback(async (silent = false, preferredCycleId?: string | null) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError("");
    setAuthRequired(false);
    try {
      const nextData = await getWorkbenchReadModelV1({
        syncPrices: input.syncPrices,
        autoRiskCycle: input.autoRiskCycle,
      });
      const nextBootstrap = nextData.bootstrap;
      const nextCycles = nextData.cycles || [];
      const latestCycle = nextCycles[0] || nextBootstrap.latestCycle || null;
      const preferredId = preferredCycleId || currentCycleIdRef.current;
      const preferredCycle = preferredId
        ? nextCycles.find((item) => item.cycleId === preferredId) || (nextBootstrap.latestCycle?.cycleId === preferredId ? nextBootstrap.latestCycle : null)
        : null;
      const nextCurrentCycle = preferredCycle || latestCycle;

      setBootstrap(nextBootstrap);
      setCycles(nextCycles);
      setCurrentCycle(nextCurrentCycle);
      setRiskCheck(nextCurrentCycle?.riskCheck || null);
    } catch (err) {
      const message = toWorkbenchErrorMessage(err);
      setError(message);
      setAuthRequired(/unauthorized/i.test(message));
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }, [input.autoRiskCycle, input.syncPrices]);


  useEffect(() => {
    void loadBootstrap(false);
  }, [loadBootstrap]);

  useEffect(() => {
    function onRefresh() {
      void loadBootstrap(true);
    }
    window.addEventListener(DAA_DASHBOARD_REFRESH_EVENT_V1, onRefresh);
    return () => window.removeEventListener(DAA_DASHBOARD_REFRESH_EVENT_V1, onRefresh);
  }, [loadBootstrap]);

  return {
    activeTab,
    setActiveTab,
    bootstrap,
    cycles,
    setCycles,
    currentCycle,
    setCurrentCycle,
    riskCheck,
    setRiskCheck,
    loading,
    refreshing,
    error,
    authRequired,
    loadBootstrap,
  };
}

export type WorkbenchModelV1 = ReturnType<typeof useWorkbenchModelV1>;
