"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiClientError, getApiErrorMessage } from "@/src/daa/api/client";
import { getWorkbenchReadModel } from "@/src/daa/modules/read/readApi";
import type { PreTradeRiskCheck, RebalanceCycle, WorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchTypes";

const DAA_DASHBOARD_REFRESH_EVENT_ = "daa:dashboard:refresh";

export type WorkbenchTab = "positions" | "watchlist" | "discovery" | "rebalance" | "cash";

export function normalizeWorkbenchTab(input: string): WorkbenchTab {
  if (input === "positions" || input === "watchlist" || input === "discovery" || input === "rebalance" || input === "cash") return input;
  return "positions";
}

function toWorkbenchErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError && error.code === "DB_ERROR") {
    return "工作台数据服务暂时不可用，请稍后重试。";
  }
  return getApiErrorMessage(error);
}

export function useWorkbenchModel(input: {
  initialTab?: string;
  syncPrices?: boolean;
  autoRiskCycle?: boolean;
} = {}) {
  const [activeTab, setActiveTab] = useState<WorkbenchTab>(() => normalizeWorkbenchTab(String(input.initialTab || "")));
  const [bootstrap, setBootstrap] = useState<WorkbenchBootstrap | null>(null);
  const [cycles, setCycles] = useState<RebalanceCycle[]>([]);
  const [currentCycle, setCurrentCycle] = useState<RebalanceCycle | null>(null);
  const [riskCheck, setRiskCheck] = useState<PreTradeRiskCheck | null>(null);
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
      const nextData = await getWorkbenchReadModel({
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
    window.addEventListener(DAA_DASHBOARD_REFRESH_EVENT_, onRefresh);
    return () => window.removeEventListener(DAA_DASHBOARD_REFRESH_EVENT_, onRefresh);
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

export type WorkbenchModel = ReturnType<typeof useWorkbenchModel>;
