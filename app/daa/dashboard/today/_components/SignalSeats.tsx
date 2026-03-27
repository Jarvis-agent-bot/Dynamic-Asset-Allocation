"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { SignalSeatResult, SignalStance } from "@/src/daa/modules/today/todayTypes";

const SEAT_LABELS: Record<string, string> = {
  technical: "技术面",
  valuation: "估值",
  news_macro: "新闻/宏观",
  portfolio_behavior: "持仓行为",
};

const STANCE_CONFIG: Record<
  SignalStance,
  { label: string; icon: typeof TrendingUp; colorClass: string }
> = {
  bullish: {
    label: "看多",
    icon: TrendingUp,
    colorClass: "text-green-600 dark:text-green-400",
  },
  neutral: {
    label: "中性",
    icon: Minus,
    colorClass: "text-muted-foreground",
  },
  bearish: {
    label: "看空",
    icon: TrendingDown,
    colorClass: "text-red-600 dark:text-red-400",
  },
};

type Props = {
  seats: SignalSeatResult[];
};

export default function SignalSeats({ seats }: Props) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-medium text-muted-foreground">信号席位</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {seats.map((seat) => {
          const stanceConfig = STANCE_CONFIG[seat.stance] ?? STANCE_CONFIG.neutral;
          const Icon = stanceConfig.icon;
          return (
            <div
              key={seat.seat}
              className="rounded-lg border bg-card p-3 transition hover:shadow-sm"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {SEAT_LABELS[seat.seat] ?? seat.seat}
                </span>
                <Icon className={`h-4 w-4 ${stanceConfig.colorClass}`} />
              </div>
              <div className={`text-sm font-semibold ${stanceConfig.colorClass}`}>
                {stanceConfig.label}
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                <div className="h-1 flex-1 rounded-full bg-muted">
                  <div
                    className="h-1 rounded-full bg-current opacity-40"
                    style={{ width: `${seat.confidence}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">{seat.confidence}%</span>
              </div>
              <p className="mt-1.5 text-[11px] leading-tight text-muted-foreground line-clamp-2">
                {seat.keyFactor}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
