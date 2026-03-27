"use client";

import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Clock, Database } from "lucide-react";

import {
  DaaSurfaceStatusPill,
  daaSurfaceSubtlePanelClassName,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { cn } from "@/lib/utils";

export function WorkbenchActionCenter(props: {
  assetRows: Array<{ symbol: string; assetKey: string; gapPct: number | null; watchEnabled: boolean; targetWeightHint: number }>;
  currentCycle: { status: string; cycleId: string } | null;
  marketDataHealth: { status: string; staleCount: number; missingCount: number } | null;
  warnings: string[];
  driftThreshold?: number;
}) {
  const threshold = props.driftThreshold ?? 0.05;

  const alerts = useMemo(() => {
    const result: Array<{ key: string; tone: "amber" | "cyan"; icon: React.ReactNode; label: string }> = [];

    // 漂移告警
    const driftCount = props.assetRows.filter(
      (r) => r.watchEnabled && r.targetWeightHint > 0 && r.gapPct != null && Math.abs(r.gapPct) > threshold,
    ).length;
    if (driftCount > 0) {
      result.push({
        key: "drift",
        tone: "amber",
        icon: <AlertTriangle className="h-3 w-3" />,
        label: `${driftCount} 个资产偏移超阈值`,
      });
    }

    // 待审阅周期
    const cycleStatus = props.currentCycle?.status;
    if (cycleStatus === "generated" || cycleStatus === "reviewing") {
      result.push({
        key: "cycle",
        tone: "cyan",
        icon: <Clock className="h-3 w-3" />,
        label: cycleStatus === "generated" ? "有新提案待审阅" : "审阅进行中",
      });
    }

    // 数据健康
    const stale = props.marketDataHealth?.staleCount ?? 0;
    const missing = props.marketDataHealth?.missingCount ?? 0;
    if (stale > 0 || missing > 0) {
      const parts: string[] = [];
      if (stale > 0) parts.push(`${stale} 条陈旧`);
      if (missing > 0) parts.push(`${missing} 条缺失`);
      result.push({
        key: "data",
        tone: "amber",
        icon: <Database className="h-3 w-3" />,
        label: `市场数据：${parts.join("、")}`,
      });
    }

    // bootstrap 警告
    for (const w of props.warnings) {
      result.push({
        key: `warn-${w.slice(0, 20)}`,
        tone: "amber",
        icon: <AlertTriangle className="h-3 w-3" />,
        label: w,
      });
    }

    return result;
  }, [props.assetRows, props.currentCycle, props.marketDataHealth, props.warnings, threshold]);

  return (
    <div className={cn(daaSurfaceSubtlePanelClassName, "px-4 py-3 sm:px-5")}>
      {alerts.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
          <span>组合运行正常，无需操作</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 overflow-x-auto">
          {alerts.map((alert) => (
            <DaaSurfaceStatusPill key={alert.key} tone={alert.tone} className="shrink-0">
              {alert.icon}
              <span className="ml-1">{alert.label}</span>
            </DaaSurfaceStatusPill>
          ))}
        </div>
      )}
    </div>
  );
}
