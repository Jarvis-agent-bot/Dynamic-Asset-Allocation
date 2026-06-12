"use client";

import {
  DaaSurfacePanel,
  DaaSurfaceStatusPill,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { cn } from "@/lib/utils";

import { riskItemStatusLabel, riskItemTone, riskOverallTone, riskRuleLabel, riskStatusLabel } from "./rebalanceLabels";
import type { PreTradeRiskCheck } from "@/src/daa/modules/rebalance/rebalanceTypes";

export function RebalanceRiskAlerts(props: {
  currentRiskCheck: PreTradeRiskCheck;
}) {
  if (props.currentRiskCheck.overallStatus === "pass") return null;

  return (
    <DaaSurfacePanel
      accent={riskOverallTone(props.currentRiskCheck.overallStatus)}
      title="执行前风控"
      subtitle={`按当前勾选结果计算；状态：${riskStatusLabel(props.currentRiskCheck.overallStatus)}（告警可执行，阻断不可执行）`}
      action={<DaaSurfaceStatusPill tone={riskOverallTone(props.currentRiskCheck.overallStatus)}>{riskStatusLabel(props.currentRiskCheck.overallStatus)}</DaaSurfaceStatusPill>}
    >
      <div className="divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]">
        {props.currentRiskCheck.items.filter((item) => item.status !== "pass").map((item) => (
          <div
            key={item.rule}
            className={cn(
              "px-4 py-3",
              item.status === "block"
                ? "bg-[var(--danger-bg)]"
                : "bg-[var(--amber-bg)]",
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <DaaSurfaceStatusPill tone={riskItemTone(item.status)}>{riskItemStatusLabel(item.status)}</DaaSurfaceStatusPill>
              <span className="text-sm font-semibold text-[var(--text)]">{riskRuleLabel(item.rule)}</span>
            </div>
            <div className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.message}</div>
            <div className="mt-3 font-[var(--font-mono)] text-xs text-[var(--faint)]">当前值 {item.current.toFixed(2)} · 阈值 {item.limit.toFixed(2)}</div>
          </div>
        ))}
      </div>
    </DaaSurfacePanel>
  );
}
