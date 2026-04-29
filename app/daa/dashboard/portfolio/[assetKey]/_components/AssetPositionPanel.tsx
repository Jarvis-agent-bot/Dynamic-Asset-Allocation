"use client";

/**
 * 持仓/目标/漂移面板。
 * 集中展示资产的权重状态：当前权重、目标权重、漂移值、漂移方向。
 */

import { Target, TrendingUp, TrendingDown } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AssetUniverseView } from "@/src/daa/modules/workbench/workbenchTypes";

export function AssetPositionPanel({ row }: { row: AssetUniverseView }) {
  const actualPct = row.actualWeightPct ?? 0;
  const targetPct = row.targetWeightPct ?? row.targetWeightHint ?? 0;
  const gap = row.gapPct ?? (targetPct - actualPct);
  const hasTarget = targetPct > 0;
  const displayGap = -gap;

  // 漂移状态
  const absGap = Math.abs(gap);
  const gapState = absGap < 0.05 ? "onTarget"
    : absGap < 2 ? "slight"
    : absGap < 5 ? "moderate"
    : "significant";

  const gapColor = {
    onTarget: "text-emerald-400",
    slight: "text-[var(--muted)]",
    moderate: "text-amber-400",
    significant: "text-red-400",
  }[gapState];

  const gapLabel = {
    onTarget: "接近目标",
    slight: "轻微偏离",
    moderate: "中度偏离",
    significant: "显著偏离",
  }[gapState];
  const gapDirectionLabel = displayGap > 0 ? "高于目标" : displayGap < 0 ? "低于目标" : "贴近目标";

  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-4">
      <div className="mb-3 flex items-center gap-2">
        <Target className="h-4 w-4 text-indigo-300" />
        <h3 className="text-sm font-medium text-[var(--text)]">持仓状态</h3>
      </div>

      <div className="space-y-3">
        {/* 权重对比条 */}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between text-xs">
            <span className="text-[var(--faint)]">当前权重</span>
            <span className="font-[var(--font-mono)] text-sm font-semibold text-[var(--text)]">
              {actualPct.toFixed(2)}%
            </span>
          </div>
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
            <div
              className="absolute inset-y-0 left-0 bg-indigo-400/80"
              style={{ width: `${Math.min(100, Math.max(0, actualPct))}%` }}
            />
            {hasTarget && (
              <div
                className="absolute inset-y-0 w-0.5 bg-[var(--text)]"
                style={{ left: `${Math.min(100, Math.max(0, targetPct))}%` }}
                title={`目标权重 ${targetPct.toFixed(2)}%`}
              />
            )}
          </div>
          {hasTarget && (
            <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--faint)]">
              <span>目标 {targetPct.toFixed(2)}%</span>
              <span className={cn("flex items-center gap-1 font-medium", gapColor)}>
                {displayGap > 0.05 ? <TrendingUp className="h-3 w-3" /> : displayGap < -0.05 ? <TrendingDown className="h-3 w-3" /> : null}
                {gapLabel} · {gapDirectionLabel} {Math.abs(displayGap).toFixed(2)}%
              </span>
            </div>
          )}
        </div>

        {!hasTarget && (
          <div className="rounded-md border border-dashed border-[rgba(255,255,255,0.08)] px-3 py-2 text-[11px] text-[var(--faint)]">
            尚未设置目标权重，可在调仓页设置
          </div>
        )}
      </div>
    </div>
  );
}
