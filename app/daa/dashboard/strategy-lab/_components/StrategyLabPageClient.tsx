"use client";

import { useState } from "react";

import { DashboardEmptyState, DashboardErrorNotice } from "@/app/daa/dashboard/_components/DashboardFeedback";
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

type LabMode = "rebalance" | "breakout";

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
      className={`flex-1 rounded-lg border px-4 py-3 text-left transition ${
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
  const [mode, setMode] = useState<LabMode>("rebalance");

  return (
    <div className="space-y-6 lg:space-y-7">
      <DaaSurfacePageHeader
        eyebrow="策略回测"
        title="策略实验室"
        description="回测资产配置策略或单标的择时策略，对比基准，评估风险调整后收益。"
      />

      <div className="flex gap-3">
        <ModeTab
          active={mode === "rebalance"}
          onClick={() => setMode("rebalance")}
          title="组合再平衡"
          subtitle="多资产权重 · 定期再平衡（等权/动量/风险平价…）"
        />
        <ModeTab
          active={mode === "breakout"}
          onClick={() => setMode("breakout")}
          title="放量突破（单标的择时）"
          subtitle="逐只信号进出场 · 止损止盈 · 组合资金模拟"
        />
      </div>

      {mode === "breakout" ? (
        <BreakoutLabView dateDefaults={dateDefaults} />
      ) : (
        <>
          <StrategyLabActionBar
            state={state}
            historyOpen={historyOpen}
            onToggleHistory={() => setHistoryOpen((v) => !v)}
          />

          <DashboardErrorNotice title="回测失败" description={state.error} />

          <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
            <StrategyLabConfigPanels state={state} />

            <div className="space-y-5">
              {state.running ? (
                <DashboardEmptyState
                  title="回测运行中…"
                  description="正在获取价格数据并执行策略模拟，请稍候。"
                  className="px-5 py-16"
                />
              ) : null}

              {state.result && !state.running ? (
                <StrategyLabResultsView state={state} />
              ) : null}

              {!state.result && !state.running ? (
                <DaaSurfaceEmptyState
                  title="等待回测"
                  description="在左侧面板选择资产和策略，设置回测参数后点击上方「运行回测」开始。"
                  className="px-5 py-20"
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
