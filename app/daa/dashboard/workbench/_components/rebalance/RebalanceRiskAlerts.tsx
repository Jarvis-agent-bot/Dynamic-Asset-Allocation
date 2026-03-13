"use client";

import {
  DeepLedgerPanel,
  DeepLedgerStatusPill,
  type DeepLedgerTone,
} from "@/app/daa/dashboard/_components/DeepLedgerUI";
import { cn } from "@/lib/utils";
import type { PreTradeRiskCheck } from "@/src/daa/modules/workbench/workbenchTypes";

import { riskItemStatusLabel, riskItemTone, riskOverallTone, riskRuleLabel, riskStatusLabel } from "./rebalanceLabels";

export function RebalanceRiskAlerts(props: {
  currentRiskCheck: PreTradeRiskCheck;
}) {
  if (props.currentRiskCheck.overallStatus === "pass") return null;

  return (
    <DeepLedgerPanel
      accent={riskOverallTone(props.currentRiskCheck.overallStatus)}
      title="风控提示"
      subtitle={`状态：${riskStatusLabel(props.currentRiskCheck.overallStatus)}（告警可执行，阻断不可执行）`}
      action={<DeepLedgerStatusPill tone={riskOverallTone(props.currentRiskCheck.overallStatus)}>{riskStatusLabel(props.currentRiskCheck.overallStatus)}</DeepLedgerStatusPill>}
    >
      <div className="grid gap-3 lg:grid-cols-2">
        {props.currentRiskCheck.items.filter((item) => item.status !== "pass").map((item) => (
          <div
            key={item.rule}
            className={cn(
              "rounded-[16px] border px-4 py-3",
              item.status === "block"
                ? "border-rose-400/24 bg-rose-500/10"
                : "border-amber-400/24 bg-amber-500/10",
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <DeepLedgerStatusPill tone={riskItemTone(item.status)}>{riskItemStatusLabel(item.status)}</DeepLedgerStatusPill>
              <span className="text-sm font-semibold text-[var(--text)]">{riskRuleLabel(item.rule)}</span>
            </div>
            <div className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.message}</div>
            <div className="mt-3 font-[var(--font-mono)] text-xs text-[var(--faint)]">当前值 {item.current.toFixed(2)} · 阈值 {item.limit.toFixed(2)}</div>
          </div>
        ))}
      </div>
    </DeepLedgerPanel>
  );
}
