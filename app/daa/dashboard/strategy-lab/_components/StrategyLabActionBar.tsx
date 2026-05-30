"use client";

import { History, Play, Save } from "lucide-react";

import { DaaSurfaceActionButton } from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { cn } from "@/lib/utils";
import { resolveStrategyLabApplyMeta } from "./strategyLabApplyMeta";
import { strategyLabel } from "./useStrategyLab";
import type { UseStrategyLabResult } from "./useStrategyLab";

interface StrategyLabActionBarProps {
  state: UseStrategyLabResult;
  historyOpen: boolean;
  onToggleHistory: () => void;
}

export function StrategyLabActionBar({ state, historyOpen, onToggleHistory }: StrategyLabActionBarProps) {
  const { config, canRun, running, applying, runBacktest, applyTargetWeights, history, result } = state;
  const assetCount = config.selectedAssets.length;
  const strategyCount = config.selectedStrategies.length;
  const rangeLabel = `${config.startDate} → ${config.endDate}`;
  const applyMeta = resolveStrategyLabApplyMeta(result, applying);
  const applyStrategyLabel = applyMeta.strategyKey ? strategyLabel(applyMeta.strategyKey) : "当前策略";

  return (
    <div className="sticky top-[64px] z-20 -mx-1 mb-1 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 shadow-[0_18px_40px_rgba(0,0,0,0.25)] backdrop-blur sm:px-4">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
        <span className="rounded-full bg-[var(--elevated)] px-2 py-0.5 font-[var(--font-mono)] text-[11px]">
          {assetCount} 资产 · {strategyCount} 策略
        </span>
        <span className="font-[var(--font-mono)] text-[11px] text-[var(--faint)]">{rangeLabel}</span>
        <span className="text-[11px] text-[var(--faint)]">{config.rebalanceFrequency} · {config.baseCurrency} {config.initialCapital.toLocaleString("en-US")}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {applyMeta.hasTargetWeights && !applyMeta.isSingleStrategy ? (
          <span className="hidden text-[11px] text-[var(--faint)] lg:inline">
            多策略结果仅供比较，暂不支持直接应用权重
          </span>
        ) : null}
        <DaaSurfaceActionButton
          tone="slate"
          onClick={onToggleHistory}
          className={cn("h-8 px-3 text-xs", historyOpen && "border-indigo-300/40 text-[var(--text)]")}
          title="查看回测历史"
        >
          <History className="h-3.5 w-3.5" />
          历史{history.length > 0 ? ` · ${history.length}` : ""}
        </DaaSurfaceActionButton>
        {applyMeta.canApply ? (
          <DaaSurfaceActionButton
            tone="success"
            onClick={() => void applyTargetWeights()}
            disabled={applying}
            className="h-8 px-3 text-xs"
            title={`将当前 ${applyStrategyLabel} 的末期权重应用为目标配置`}
          >
            <Save className="h-3.5 w-3.5" />
            {applying ? "应用中…" : "应用权重"}
          </DaaSurfaceActionButton>
        ) : null}
        <DaaSurfaceActionButton
          tone="primary"
          onClick={() => void runBacktest()}
          disabled={!canRun}
          className="h-8 px-3 text-xs"
        >
          <Play className="h-3.5 w-3.5" />
          {running ? "运行中…" : "运行回测"}
        </DaaSurfaceActionButton>
      </div>
    </div>
  );
}
