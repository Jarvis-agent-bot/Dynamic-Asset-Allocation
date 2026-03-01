"use client";

import { cn } from "@/lib/utils";

type Tier = "elite" | "steady" | "watch" | "isolated";

const tierConfig: Record<Tier, { label: string; bg: string; text: string }> = {
  elite: { label: "精英", bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-300" },
  steady: { label: "稳健", bg: "bg-sky-100 dark:bg-sky-900/40", text: "text-sky-700 dark:text-sky-300" },
  watch: { label: "观察", bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-300" },
  isolated: { label: "隔离", bg: "bg-red-100 dark:bg-red-900/40", text: "text-red-700 dark:text-red-300" },
};

type TierBadgeProps = {
  tier: Tier;
  className?: string;
};

export default function TierBadge({ tier, className }: TierBadgeProps) {
  const cfg = tierConfig[tier] ?? tierConfig.steady;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", cfg.bg, cfg.text, className)}>
      {cfg.label}
    </span>
  );
}
