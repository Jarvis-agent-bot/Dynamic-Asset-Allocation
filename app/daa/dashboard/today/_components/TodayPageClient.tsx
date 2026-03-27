"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ArrowRight } from "lucide-react";
import Link from "next/link";

import type { TodayReadModel } from "@/src/daa/modules/today/todayTypes";
import ConclusionCard from "./ConclusionCard";
import SignalSeats from "./SignalSeats";
import ActionCard from "./ActionCard";
import PortfolioHealthBar from "./PortfolioHealthBar";

export default function TodayPageClient() {
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
        setError(json.error?.message ?? "加载失败");
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
        // 刷新决策列表
        await fetchData();
      } catch {
        // swallow
      }
    },
    [fetchData],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
        正在加载投委会数据…
      </div>
    );
  }

  if (error && !model) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
        <p className="text-destructive">{error}</p>
        <button
          onClick={fetchData}
          className="mt-3 text-sm text-muted-foreground underline hover:text-foreground"
        >
          重试
        </button>
      </div>
    );
  }

  if (!model) return null;

  const { decisionContext, llmOutput, portfolioHealth } = model;
  const actionItems = llmOutput.actionItems ?? [];

  return (
    <div className="space-y-6">
      {/* 结论卡 + 刷新 */}
      <div className="flex items-start justify-between gap-4">
        <ConclusionCard llmOutput={llmOutput} isStale={model.isStale} />
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="mt-1 flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs
                     text-muted-foreground transition hover:bg-muted disabled:opacity-50"
          title="手动刷新 AI 分析"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          刷新
        </button>
      </div>

      {/* 信号席位 */}
      <SignalSeats seats={decisionContext.signalSeats} />

      {/* Action Cards */}
      {actionItems.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-medium text-muted-foreground">
            需要关注 ({actionItems.length})
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {actionItems.map((item) => (
              <ActionCard
                key={item.assetKey}
                item={item}
                overallConclusion={llmOutput.conclusion}
                onDecision={handleDecision}
              />
            ))}
          </div>
        </section>
      )}

      {/* 组合健康 */}
      <PortfolioHealthBar health={portfolioHealth} />

      {/* 跳转详细工作台 */}
      <div className="pt-2">
        <Link
          href="/daa/dashboard/workbench"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground
                     transition hover:text-foreground"
        >
          进入详细工作台
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
