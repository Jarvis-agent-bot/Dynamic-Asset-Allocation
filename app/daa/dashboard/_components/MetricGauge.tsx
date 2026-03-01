"use client";

import { cn } from "@/lib/utils";

type MetricGaugeProps = {
  label: string;
  value: number;
  max?: number;
  suffix?: string;
  thresholds?: { warning: number; danger: number };
  className?: string;
};

export default function MetricGauge({ label, value, max = 100, suffix = "%", thresholds, className }: MetricGaugeProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;

  let barColor = "bg-sky-500";
  if (thresholds) {
    if (value >= thresholds.danger) barColor = "bg-red-500";
    else if (value >= thresholds.warning) barColor = "bg-amber-500";
  }

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">
          {Number.isFinite(value) ? value.toFixed(1) : "0"}
          {suffix}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
