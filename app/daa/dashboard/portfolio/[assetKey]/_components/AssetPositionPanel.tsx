"use client";

/**
 * 持仓/目标/漂移面板。
 * 集中展示资产的权重状态：当前权重、目标权重、漂移值、漂移方向。
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2, Save, Target, TrendingUp, TrendingDown } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AssetUniverseView } from "@/src/daa/modules/workbench/workbenchTypes";

export function AssetPositionPanel({
  row,
  onUpdateTargetWeight,
  updating = false,
}: {
  row: AssetUniverseView;
  onUpdateTargetWeight?: (targetWeightPct: number) => Promise<void> | void;
  updating?: boolean;
}) {
  const actualPct = row.actualWeightPct ?? 0;
  const targetPct = row.targetWeightPct ?? (row.targetWeightHint ?? 0) * 100;
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
    onTarget: "text-emerald-600",
    slight: "text-slate-500",
    moderate: "text-amber-600",
    significant: "text-red-600",
  }[gapState];

  const gapLabel = {
    onTarget: "接近目标",
    slight: "轻微偏离",
    moderate: "中度偏离",
    significant: "显著偏离",
  }[gapState];
  const gapDirectionLabel = displayGap > 0 ? "高于目标" : displayGap < 0 ? "低于目标" : "贴近目标";
  const [draft, setDraft] = useState(() => targetPct.toFixed(2));
  const parsedDraft = Number(draft);
  const validDraft = Number.isFinite(parsedDraft) && parsedDraft >= 0 && parsedDraft <= 100;
  const dirty = validDraft && Math.abs(parsedDraft - targetPct) >= 0.005;

  useEffect(() => {
    setDraft(targetPct.toFixed(2));
  }, [row.assetKey, targetPct]);

  const quickTargets = useMemo(() => {
    const base = [0, 2, 5, 10];
    if (targetPct > 10) base.push(Number(targetPct.toFixed(2)));
    return [...new Set(base)].sort((a, b) => a - b);
  }, [targetPct]);

  async function handleSubmit() {
    if (!onUpdateTargetWeight || !validDraft || updating) return;
    await onUpdateTargetWeight(parsedDraft);
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5">
        <Target className="h-4 w-4 text-[var(--primary)]" />
        <h3 className="text-sm font-semibold text-[var(--text)]">持仓与目标</h3>
      </div>

      <div className="space-y-3 p-3">
        {/* 权重对比条 */}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between text-xs">
            <span className="text-slate-500">当前权重</span>
            <span className="font-[var(--font-mono)] text-sm font-semibold text-slate-800">
              {actualPct.toFixed(2)}%
            </span>
          </div>
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="absolute inset-y-0 left-0 bg-[var(--primary)]"
              style={{ width: `${Math.min(100, Math.max(0, actualPct))}%` }}
            />
            {hasTarget && (
              <div
                className="absolute inset-y-[-3px] w-px bg-slate-900"
                style={{ left: `${Math.min(100, Math.max(0, targetPct))}%` }}
                title={`目标权重 ${targetPct.toFixed(2)}%`}
              />
            )}
          </div>
          {hasTarget && (
            <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
              <span>目标 {targetPct.toFixed(2)}%</span>
              <span className={cn("flex items-center gap-1 font-medium", gapColor)}>
                {displayGap > 0.05 ? <TrendingUp className="h-3 w-3" /> : displayGap < -0.05 ? <TrendingDown className="h-3 w-3" /> : null}
                {gapLabel} · {gapDirectionLabel} {Math.abs(displayGap).toFixed(2)}%
              </span>
            </div>
          )}
        </div>

        {!hasTarget && (
          <div className="rounded-[8px] border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
            尚未设置目标权重。保存后会写入目标配置，并参与调仓偏离计算。
          </div>
        )}

        {onUpdateTargetWeight ? (
          <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold text-[var(--text)]">手动目标权重</div>
                <div className="mt-0.5 text-[11px] leading-4 text-[var(--muted)]">
                  直接覆盖该资产 targetWeightHint，不必等待 AI 输出。
                </div>
              </div>
              <span className="font-[var(--font-mono)] text-[11px] text-[var(--faint)]">0-100%</span>
            </div>
            <div className="flex gap-2">
              <div className="flex h-10 min-w-0 flex-1 items-center rounded-[8px] border border-[var(--border-strong)] bg-[var(--card)] px-3 focus-within:border-[var(--primary)] focus-within:ring-2 focus-within:ring-[var(--primary-bg)]">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void handleSubmit();
                  }}
                  className="min-w-0 flex-1 bg-transparent font-[var(--font-mono)] text-sm text-[var(--text)] outline-none"
                  aria-label="手动目标权重"
                />
                <span className="ml-2 text-xs text-[var(--muted)]">%</span>
              </div>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={!dirty || updating}
                className={cn(
                  "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[8px] border px-3 text-xs font-semibold transition-colors",
                  dirty && !updating
                    ? "border-[var(--primary-border)] bg-[var(--primary)] text-white hover:opacity-90"
                    : "cursor-not-allowed border-[var(--border)] bg-[var(--elevated)] text-[var(--faint)]",
                )}
              >
                {updating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                保存
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {quickTargets.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDraft(value.toFixed(2))}
                  className="h-7 rounded-[7px] border border-[var(--border)] bg-[var(--card)] px-2 font-[var(--font-mono)] text-[11px] text-[var(--muted)] transition-colors hover:border-[var(--primary-border)] hover:text-[var(--primary)]"
                >
                  {value.toFixed(value % 1 === 0 ? 0 : 2)}%
                </button>
              ))}
            </div>
            {!validDraft ? (
              <div className="mt-2 text-[11px] text-[var(--danger)]">请输入 0 到 100 之间的百分比。</div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
