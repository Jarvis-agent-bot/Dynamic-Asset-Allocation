"use client";

import { Dialog } from "@/components/ui/dialog";
import { DaaSurfaceDialogShell, DaaSurfaceStatusPill } from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { signalActionLabel } from "@/app/daa/dashboard/_shared/rebalance/rebalanceLabels";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FusionScores = {
  human: number;
  news: number;
  technical: number;
  valuation: number;
  penalty: number;
};

export type FusionScoreBreakdownProps = {
  symbol: string;
  scores: FusionScores | null;
  finalScore: number;
  confidence: number;
  action: string;
  macroCyclePhase?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SIGNAL_META: Array<{
  key: keyof Omit<FusionScores, "penalty">;
  label: string;
  color: string;
  weight: number;
}> = [
  { key: "human", label: "人因信号", color: "var(--primary)", weight: 0.35 },
  { key: "technical", label: "技术信号", color: "var(--indigo)", weight: 0.25 },
  { key: "news", label: "新闻信号", color: "var(--amber)", weight: 0.2 },
  { key: "valuation", label: "估值信号", color: "var(--success)", weight: 0.2 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function inferActionLabel(
  score: number,
  confidence: number,
): { label: string; tone: "green" | "amber" | "red" } {
  if (score >= 72 && confidence >= 58) return { label: "建仓/加仓", tone: "green" };
  if (score >= 56 && confidence >= 42) return { label: "观察", tone: "amber" };
  return { label: "减仓/回避", tone: "red" };
}

function macroCycleLabel(phase: string | null | undefined): string | null {
  if (!phase) return null;
  const map: Record<string, string> = {
    recovery: "复苏",
    overheating: "过热",
    stagflation: "滞胀",
    deflation: "衰退",
  };
  return map[phase] ?? phase;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SignalBar({
  label,
  score,
  weight,
  color,
}: {
  label: string;
  score: number;
  weight: number;
  color: string;
}) {
  const contribution = score * weight;
  const barWidth = Math.min(100, Math.max(2, score));

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-[var(--text)]">{label}</span>
        <span className="font-[var(--font-mono)] text-[var(--muted)]">
          {score.toFixed(1)} x {(weight * 100).toFixed(0)}% = {contribution.toFixed(1)}
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${barWidth}%`, background: color }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function FusionScoreBreakdown({
  symbol,
  scores,
  finalScore,
  confidence,
  action,
  macroCyclePhase,
  open,
  onOpenChange,
}: FusionScoreBreakdownProps) {
  const actionMeta = inferActionLabel(finalScore, confidence);
  const macroLabel = macroCycleLabel(macroCyclePhase);

  // Compute subtotal from weighted signals
  const subtotal = scores
    ? SIGNAL_META.reduce((sum, s) => sum + scores[s.key] * s.weight, 0)
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DaaSurfaceDialogShell
        accent="indigo"
        title={`信号融合分解 — ${symbol}`}
        description="展示各维度信号得分、加权计算过程和最终行动推断。"
      >
        {scores ? (
          <div className="space-y-6">
            {/* Section: 加权分解 */}
            <div className="space-y-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">
                加权分解
              </div>
              {SIGNAL_META.map((s) => (
                <SignalBar
                  key={s.key}
                  label={s.label}
                  score={scores[s.key]}
                  weight={s.weight}
                  color={s.color}
                />
              ))}
              <div className="flex items-center justify-between border-t border-[var(--border)] pt-2 text-xs">
                <span className="font-medium text-[var(--muted)]">加权小计</span>
                <span className="font-[var(--font-mono)] text-[var(--text)]">
                  {subtotal.toFixed(1)}
                </span>
              </div>
            </div>

            {/* Section: 调整项 */}
            {(scores.penalty > 0 || macroLabel) ? (
              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">
                  调整项
                </div>
                {scores.penalty > 0 ? (
                  <div className="flex items-center justify-between rounded-[var(--radius-lg)] border border-rose-400/20 bg-rose-500/8 px-4 py-2.5 text-sm">
                    <span className="flex items-center gap-2 text-rose-200">
                      <span>&#9888;</span>
                      冲突惩罚
                    </span>
                    <span className="font-[var(--font-mono)] text-rose-300">
                      -{scores.penalty.toFixed(1)}
                    </span>
                  </div>
                ) : null}
                {macroLabel ? (
                  <div className="flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--primary)]/20 bg-[rgba(56,189,248,0.06)] px-4 py-2.5 text-sm">
                    <span className="flex items-center gap-2 text-[var(--primary)]">
                      <span>&#128202;</span>
                      宏观调整（{macroLabel}）
                    </span>
                    <span className="font-[var(--font-mono)] text-[var(--muted)]">
                      已体现在最终评分
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Final score */}
            <div className="flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[rgba(8,12,20,0.72)] px-4 py-3">
              <span className="text-sm font-semibold text-[var(--text)]">最终评分</span>
              <span className="font-[var(--font-mono)] text-[22px] font-bold text-[var(--text)]">
                {finalScore.toFixed(1)}
              </span>
            </div>

            {/* Confidence */}
            <div className="flex items-center justify-between px-1 text-xs text-[var(--muted)]">
              <span>一致性（置信度）</span>
              <span className="font-[var(--font-mono)]">{confidence.toFixed(1)}%</span>
            </div>

            {/* Section: 行动推断 */}
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--faint)]">
                行动推断
              </div>
              <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[rgba(8,12,20,0.58)] px-4 py-3">
                <DaaSurfaceStatusPill tone={actionMeta.tone}>
                  {actionMeta.label}
                </DaaSurfaceStatusPill>
                <span className="text-xs text-[var(--muted)]">
                  信号建议：{signalActionLabel(action)}
                </span>
              </div>
              <div className="text-[11px] leading-5 text-[var(--muted)]">
                评分 &ge;72 且一致性 &ge;58 → 建仓/加仓 &middot;
                评分 &ge;56 且一致性 &ge;42 → 观察 &middot;
                其余 → 减仓/回避
              </div>
            </div>
          </div>
        ) : (
          <div className="py-10 text-center text-sm text-[var(--muted)]">
            当前资产暂无信号评分数据。
          </div>
        )}
      </DaaSurfaceDialogShell>
    </Dialog>
  );
}
