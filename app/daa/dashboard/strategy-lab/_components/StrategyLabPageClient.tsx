"use client";

import { useState } from "react";

import { WorkbenchEmptyState, WorkbenchErrorNotice } from "@/app/daa/dashboard/_components/WorkbenchFeedback";
import { SectionErrorBoundary } from "@/app/daa/dashboard/_components/SectionErrorBoundary";
import {
  DaaSurfaceEmptyState,
  DaaSurfacePageHeader,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { StrategyLabActionBar } from "./StrategyLabActionBar";
import { StrategyLabConfigPanels } from "./StrategyLabConfigPanels";
import { StrategyLabHistoryDrawer } from "./StrategyLabHistoryDrawer";
import { StrategyLabResultsView } from "./StrategyLabResultsView";
import { useStrategyLab } from "./useStrategyLab";
import { BreakoutLabView } from "./BreakoutLabView";
import type { StrategyLabDateDefaults } from "./strategyLabDateDefaults";
import type { StrategyLabInitialData } from "./strategyLabInitialData";

type StrategyWorkbenchMode = "rebalance" | "breakout";

function ModeTab({
  active,
  onClick,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-[var(--radius-md)] border px-4 py-3 text-left transition ${
        active
          ? "border-[var(--success-border)] bg-[var(--success-bg)]"
          : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)]"
      }`}
    >
      <div className={`text-sm font-medium ${active ? "text-[var(--success)]" : "text-[var(--text)]"}`}>{title}</div>
      <div className="mt-0.5 text-xs text-[var(--muted)]">{subtitle}</div>
    </button>
  );
}

export default function StrategyLabPageClient({
  dateDefaults,
  initialData,
}: {
  dateDefaults: StrategyLabDateDefaults;
  initialData: StrategyLabInitialData | null;
}) {
  const state = useStrategyLab(dateDefaults, initialData);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activeWorkbenchMode, setActiveWorkbenchMode] = useState<StrategyWorkbenchMode>("rebalance");

  return (
    <div className="space-y-5">
      <DaaSurfacePageHeader
        eyebrow="策略回测"
        title="策略测试台"
        description="回测配置和择时策略。"
      />

      <div className="flex gap-3">
        <ModeTab
          active={activeWorkbenchMode === "rebalance"}
          onClick={() => setActiveWorkbenchMode("rebalance")}
          title="组合再平衡"
          subtitle="多资产权重 · 定期再平衡"
        />
        <ModeTab
          active={activeWorkbenchMode === "breakout"}
          onClick={() => setActiveWorkbenchMode("breakout")}
          title="放量突破（单标的择时）"
          subtitle="进出场 · 止损止盈"
        />
      </div>

      {activeWorkbenchMode === "breakout" ? (
        <SectionErrorBoundary sectionName="放量突破回测">
          <BreakoutLabView dateDefaults={dateDefaults} initialData={initialData} />
        </SectionErrorBoundary>
      ) : (
        <>
          <StrategyLabActionBar
            state={state}
            historyOpen={historyOpen}
            onToggleHistory={() => setHistoryOpen((v) => !v)}
          />

          <WorkbenchErrorNotice title="回测失败" description={state.error} />

          <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
            <StrategyLabConfigPanels state={state} />

            <div className="space-y-5">
              {state.running ? (
                <WorkbenchEmptyState
                  title="回测运行中…"
                  description="正在回放价格和交易规则。"
                  className="px-4 py-4"
                />
              ) : null}

              {state.result && !state.running ? (
                <SectionErrorBoundary sectionName="回测结果">
                  <StrategyLabResultsView state={state} />
                </SectionErrorBoundary>
              ) : null}

              {!state.result && !state.running ? (
                <DaaSurfaceEmptyState
                  title="等待回测"
                  description="选择参数后运行。"
                  className="px-4 py-4"
                />
              ) : null}
            </div>
          </div>

          <StrategyLabHistoryDrawer state={state} open={historyOpen} onClose={() => setHistoryOpen(false)} />
        </>
      )}
    </div>
  );
}
