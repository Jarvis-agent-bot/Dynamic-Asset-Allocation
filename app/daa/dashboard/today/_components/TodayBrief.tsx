"use client";

import { RefreshCw } from "lucide-react";

import type { TodayReadModel, TodayConclusion } from "@/src/daa/modules/today/todayTypes";

import ConclusionCard from "./ConclusionCard";
import SignalSeats from "./SignalSeats";
import ActionCard from "./ActionCard";

export function TodayBrief(props: {
  model: TodayReadModel | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  onRefresh: () => void;
  onDecision: (assetKey: string, conclusion: string, userAction: string, llmReason?: string) => Promise<void>;
}) {
  const { model } = props;

  if (props.loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
        正在加载决策摘要…
      </div>
    );
  }

  if (props.error) {
    return (
      <div className="rounded-[16px] border border-[var(--border)] bg-[rgba(8,12,20,0.42)] px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm text-[var(--muted)]">AI 决策分析暂不可用</div>
            <div className="mt-1 text-xs text-[var(--faint)]">可通过侧边栏直接操作持仓和调仓</div>
          </div>
          <button
            onClick={() => { void props.onRefresh(); }}
            className="shrink-0 rounded-full border border-[var(--border-strong)] px-3 py-1.5 text-xs text-[var(--muted)] transition-colors hover:text-[var(--text)]"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!model) return null;

  const actionItems = model.llmOutput.actionItems ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <ConclusionCard llmOutput={model.llmOutput} isStale={model.isStale} />
        <button
          onClick={props.onRefresh}
          disabled={props.refreshing}
          className="mt-1 flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs
                     text-muted-foreground transition hover:bg-muted disabled:opacity-50"
          title="手动刷新 AI 分析"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${props.refreshing ? "animate-spin" : ""}`} />
          刷新
        </button>
      </div>

      <SignalSeats seats={model.decisionContext.signalSeats} />

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
                overallConclusion={model.llmOutput.conclusion}
                onDecision={props.onDecision}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
