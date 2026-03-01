"use client";

import type { ComponentType } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: string | number;
  sub?: string;
  Icon?: ComponentType<{ className?: string }>;
  variant?: "default" | "success" | "warning" | "danger";
};

const variantClasses: Record<NonNullable<StatCardProps["variant"]>, string> = {
  default: "border-border",
  success: "border-emerald-200 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/20",
  warning: "border-amber-200 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20",
  danger: "border-red-200 bg-red-50/40 dark:border-red-800 dark:bg-red-950/20",
};

const iconVariantClasses: Record<NonNullable<StatCardProps["variant"]>, string> = {
  default: "text-muted-foreground",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  danger: "text-red-600 dark:text-red-400",
};

export default function StatCard({ label, value, sub, Icon, variant = "default" }: StatCardProps) {
  return (
    <Card className={cn("transition-colors", variantClasses[variant])}>
      <CardContent className="flex items-center gap-2.5 px-3 py-3">
        {Icon ? (
          <div className={cn("shrink-0", iconVariantClasses[variant])}>
            <Icon className="h-4 w-4" />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] text-muted-foreground">{label}</div>
          <div className="truncate text-sm font-semibold leading-tight">{value}</div>
          {sub ? <div className="truncate text-[11px] text-muted-foreground">{sub}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}
