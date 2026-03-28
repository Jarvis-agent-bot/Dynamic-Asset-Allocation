"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { SignalSeatResult, SignalStance } from "@/src/daa/modules/today/todayTypes";

// ─── 市场概览（替代原"信号席位"）─────────────────────────────────────────────
// 将 4 个抽象席位整合为一句话总结 + 紧凑的指标行

const STANCE_DISPLAY: Record<SignalStance, { label: string; colorClass: string; icon: typeof TrendingUp }> = {
  bullish: { label: "积极", colorClass: "text-emerald-400", icon: TrendingUp },
  neutral: { label: "中性", colorClass: "text-[var(--muted)]", icon: Minus },
  bearish: { label: "需关注", colorClass: "text-red-400", icon: TrendingDown },
};

const SEAT_LABELS: Record<string, string> = {
  portfolio_momentum: "组合动量",
  allocation_drift: "配置偏移",
  news_macro: "市场环境",
  portfolio_behavior: "持仓健康",
  technical: "技术面",
  valuation: "估值",
};

function summarizeSeats(seats: SignalSeatResult[]): { overallStance: SignalStance; summary: string } {
  if (!seats.length) return { overallStance: "neutral", summary: "暂无市场数据" };

  const bearishSeats = seats.filter((s) => s.stance === "bearish");
  const bullishSeats = seats.filter((s) => s.stance === "bullish");

  // 找出最值得关注的席位（bearish 优先，否则取最高置信度的）
  const highlight = bearishSeats.length > 0
    ? bearishSeats.sort((a, b) => b.confidence - a.confidence)[0]
    : seats.sort((a, b) => b.confidence - a.confidence)[0];

  const highlightLabel = SEAT_LABELS[highlight.seat] || highlight.seat;

  if (bearishSeats.length >= 3) {
    return { overallStance: "bearish", summary: `多数指标偏谨慎，${highlightLabel}需重点关注` };
  }
  if (bearishSeats.length >= 1) {
    return {
      overallStance: "bearish",
      summary: highlight.keyFactor || `${highlightLabel}需关注`,
    };
  }
  if (bullishSeats.length >= 3) {
    return { overallStance: "bullish", summary: "整体市场环境积极" };
  }
  return { overallStance: "neutral", summary: "市场环境平稳，无明显异动" };
}

type Props = {
  seats: SignalSeatResult[];
};

export default function SignalSeats({ seats }: Props) {
  if (!seats.length) return null;

  const { overallStance, summary } = summarizeSeats(seats);
  const display = STANCE_DISPLAY[overallStance];
  const Icon = display.icon;

  return (
    <div className="rounded-[14px] border border-[var(--border)] bg-[rgba(8,12,20,0.42)] px-5 py-4">
      {/* 一句话总结 */}
      <div className="flex items-center gap-2.5">
        <Icon className={`h-4 w-4 shrink-0 ${display.colorClass}`} />
        <div>
          <div className={`text-sm font-medium ${display.colorClass}`}>
            市场概览 · {display.label}
          </div>
          <div className="mt-0.5 text-xs text-[var(--muted)]">{summary}</div>
        </div>
      </div>

      {/* 紧凑指标行 */}
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {seats.map((seat) => {
          const s = STANCE_DISPLAY[seat.stance] ?? STANCE_DISPLAY.neutral;
          const label = SEAT_LABELS[seat.seat] || seat.seat;
          return (
            <div key={seat.seat} className="flex items-center gap-1.5 text-xs">
              <span className="text-[var(--muted)]">{label}</span>
              <span className={`font-medium ${s.colorClass}`}>{s.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
