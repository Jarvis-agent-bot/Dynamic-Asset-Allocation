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
    onTarget: "text-[#00c076]",
    slight: "text-[#8a939f]",
    moderate: "text-[#f7b500]",
    significant: "text-[#f84960]",
  }[gapState];

  const gapLabel = {
    onTarget: "接近目标",
    slight: "轻微偏离",
    moderate: "中度偏离",
    significant: "显著偏离",
  }[gapState];
  const gapDirectionLabel = displayGap > 0 ? "高于目标" : displayGap < 0 ? "低于目标" : "贴近目标";

  return (
    <div className="overflow-hidden rounded-[14px] border border-[#1a222a] bg-[#0b0f13]">
      <div className="flex items-center gap-2 border-b border-[#151b22] px-3 py-2.5">
        <Target className="h-4 w-4 text-[#8a939f]" />
        <h3 className="text-sm font-semibold text-[#f3f6f8]">持仓状态</h3>
      </div>

      <div className="space-y-3 p-3">
        {/* 权重对比条 */}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between text-xs">
            <span className="text-[#8a939f]">当前权重</span>
            <span className="font-[var(--font-mono)] text-sm font-semibold text-[#d6dde5]">
              {actualPct.toFixed(2)}%
            </span>
          </div>
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-[#151b22]">
            <div
              className="absolute inset-y-0 left-0 bg-[#a3ff12]"
              style={{ width: `${Math.min(100, Math.max(0, actualPct))}%` }}
            />
            {hasTarget && (
              <div
                className="absolute inset-y-[-3px] w-px bg-[#f3f6f8]"
                style={{ left: `${Math.min(100, Math.max(0, targetPct))}%` }}
                title={`目标权重 ${targetPct.toFixed(2)}%`}
              />
            )}
          </div>
          {hasTarget && (
            <div className="mt-1 flex items-center justify-between text-[10px] text-[#59636f]">
              <span>目标 {targetPct.toFixed(2)}%</span>
              <span className={cn("flex items-center gap-1 font-medium", gapColor)}>
                {displayGap > 0.05 ? <TrendingUp className="h-3 w-3" /> : displayGap < -0.05 ? <TrendingDown className="h-3 w-3" /> : null}
                {gapLabel} · {gapDirectionLabel} {Math.abs(displayGap).toFixed(2)}%
              </span>
            </div>
          )}
        </div>

        {!hasTarget && (
          <div className="rounded-[8px] border border-dashed border-[#252d36] bg-[#050607] px-3 py-2 text-[11px] text-[#8a939f]">
            尚未设置目标权重，可在调仓页设置
          </div>
        )}
      </div>
    </div>
  );
}
