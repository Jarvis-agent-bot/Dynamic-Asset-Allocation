"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { ApiClientError, getApiErrorMessage } from "@/src/daa/api/client";
import { getWorkbenchReadModel } from "@/src/daa/modules/read/readApi";
import type { WorkbenchReadModel } from "@/src/daa/modules/read/readModels";
import type { PreTradeRiskCheck, RebalanceCycle } from "@/src/daa/modules/workbench/workbenchTypes";
import { useDashboardAutoRefresh } from "./useDashboardAutoRefresh";
import { usePriceStream, type PriceUpdate } from "./usePriceStream";

export type WorkbenchTab = "positions" | "watchlist" | "analysis" | "rebalance" | "cash";

export function normalizeWorkbenchTab(input: string): WorkbenchTab {
  if (input === "positions" || input === "watchlist" || input === "analysis" || input === "rebalance" || input === "cash") return input;
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
  const [data, setData] = useState<WorkbenchReadModel | null>(null);
  const [currentCycle, setCurrentCycle] = useState<RebalanceCycle | null>(null);
  const [riskCheck, setRiskCheck] = useState<PreTradeRiskCheck | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const currentCycleIdRef = useRef<string | null>(null);
  const autoSelectedPortfolioTabRef = useRef(false);

  useEffect(() => {
    currentCycleIdRef.current = currentCycle?.cycleId || null;
  }, [currentCycle?.cycleId]);

  const bootstrap = data?.bootstrap ?? null;
  const cycles = data?.cycles ?? [];
  const snapshots = data?.snapshots ?? [];
  const cashLedger = data?.cashLedger ?? [];
  const signals = data?.signals ?? [];
  const allocationSummary = data?.allocationSummary ?? null;
  const equityDelta = data?.equityDelta ?? null;
  const ledgerMeta = data?.ledgerMeta ?? null;
  const notificationStatus = data?.notificationStatus ?? null;

  const setCycles = useCallback<Dispatch<SetStateAction<RebalanceCycle[]>>>((nextValue) => {
    setData((prev) => {
      if (!prev) return prev;
      const nextCycles = typeof nextValue === "function" ? nextValue(prev.cycles) : nextValue;
      return {
        ...prev,
        cycles: nextCycles,
        bootstrap: {
          ...prev.bootstrap,
          latestCycle: nextCycles[0] || prev.bootstrap.latestCycle || null,
        },
      };
    });
  }, []);

  useEffect(() => {
    if (input.initialTab) return;
    if (autoSelectedPortfolioTabRef.current) return;
    if (activeTab !== "positions") return;
    if ((allocationSummary?.holdingCount || 0) > 0) return;
    if ((allocationSummary?.watchlistCount || 0) <= 0) return;
    autoSelectedPortfolioTabRef.current = true;
    setActiveTab("watchlist");
  }, [activeTab, allocationSummary?.holdingCount, allocationSummary?.watchlistCount, input.initialTab]);

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

      setData(nextData);
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


  useDashboardAutoRefresh(loadBootstrap);

  // --- SSE 实时价格流 ---
  const assetKeys = useMemo(() => {
    const rows = bootstrap?.assetUniverse || [];
    return rows.map((r: { assetKey?: string }) => r.assetKey || "").filter(Boolean);
  }, [bootstrap?.assetUniverse]);

  const priceStream = usePriceStream(assetKeys);

  // 将流式价格合并到 bootstrap（不修改原始 data，仅在渲染层覆盖）
  const livePrices: Map<string, PriceUpdate> = priceStream.prices;
  const priceStreamConnected = priceStream.connected;
  const priceStreamLastUpdate = priceStream.lastUpdate;

  return {
    activeTab,
    setActiveTab,
    data,
    bootstrap,
    cycles,
    snapshots,
    cashLedger,
    signals,
    allocationSummary,
    equityDelta,
    ledgerMeta,
    notificationStatus,
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
    // 实时价格流
    livePrices,
    priceStreamConnected,
    priceStreamLastUpdate,
  };
}
