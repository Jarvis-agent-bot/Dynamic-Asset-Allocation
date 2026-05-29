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

export default function StrategyLabPageClient() {
  const state = useStrategyLab();
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <div className="space-y-6 lg:space-y-7">
      <DaaSurfacePageHeader
        eyebrow="策略回测"
        title="策略实验室"
        description="回测你的资产配置策略，对比基准，评估风险调整后收益。"
      />

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
    </div>
  );
}
