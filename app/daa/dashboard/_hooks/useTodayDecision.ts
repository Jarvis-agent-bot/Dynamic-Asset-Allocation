"use client";

import { useCallback, useEffect, useState } from "react";
import type { TodayReadModel } from "@/src/daa/modules/today/todayTypes";

/** useTodayDecision 返回值类型 */
export type TodayDecisionState = {
  model: TodayReadModel | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  handleRefresh: () => Promise<void>;
  handleDecision: (
    assetKey: string,
    conclusion: string,
    userAction: string,
    llmReason?: string,
  ) => Promise<void>;
};

/**
 * 获取并管理 /today 决策数据的共享 hook。
 * 支持首次加载、刷新（PUT）和记录决策（POST）。
 */
export function useTodayDecision(): TodayDecisionState {
  const [model, setModel] = useState<TodayReadModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/daa/today");
      const json = await res.json();
      if (json.ok) {
        setModel(json.data);
        setError(null);
      } else {
        setError(json.error?.message ?? "决策数据加载失败");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "网络错误");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/daa/today", { method: "PUT" });
      const json = await res.json();
      if (json.ok) {
        setModel(json.data);
        setError(null);
      }
    } catch {
      // 刷新失败不覆盖已有数据
    } finally {
      setRefreshing(false);
    }
  }, []);

  const handleDecision = useCallback(
    async (assetKey: string, conclusion: string, userAction: string, llmReason?: string) => {
      try {
        await fetch("/api/daa/today", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assetKey, conclusion, userAction, llmReason }),
        });
        await fetchData();
      } catch {
        // 决策记录失败不阻塞 UI
      }
    },
    [fetchData],
  );

  useEffect(() => { fetchData(); }, [fetchData]);

  return { model, loading, refreshing, error, handleRefresh, handleDecision };
}
