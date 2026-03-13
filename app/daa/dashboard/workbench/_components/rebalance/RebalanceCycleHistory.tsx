"use client";

import Link from "next/link";

import {
  DeepLedgerPanel,
  DeepLedgerStatusPill,
} from "@/app/daa/dashboard/_components/DeepLedgerUI";
import { formatDateTime } from "@/app/daa/dashboard/_components/daaFormatters";
import { cn } from "@/lib/utils";
import type { RebalanceCycle } from "@/src/daa/modules/workbench/workbenchTypes";

import { cycleStatusLabel, cycleStatusTone, triggerSourceLabel } from "./rebalanceLabels";

export function RebalanceCycleHistory(props: {
  cycles: RebalanceCycle[];
  currentCycleId: string | null;
  onSelectCycle: (cycle: RebalanceCycle) => void;
}) {
  return (
    <DeepLedgerPanel accent="slate" title="历史周期" subtitle="最近 8 个">
      <div className="space-y-2">
        {props.cycles.slice(0, 8).map((cycle) => {
          const active = cycle.cycleId === props.currentCycleId;
          return (
            <button
              key={cycle.cycleId}
              type="button"
              onClick={() => props.onSelectCycle(cycle)}
              className={cn(
                "w-full rounded-[14px] border px-4 py-3 text-left transition-all",
                active
                  ? "border-[var(--primary)]/32 bg-[rgba(56,189,248,0.10)]"
                  : "border-[var(--border)] bg-[rgba(8,12,20,0.42)] hover:border-[var(--border-strong)] hover:bg-[var(--hover)]",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-[var(--font-mono)] text-sm font-semibold text-[var(--text)]">{cycle.cycleId.slice(0, 8)}</div>
                <DeepLedgerStatusPill tone={cycleStatusTone(cycle.status)}>{cycleStatusLabel(cycle.status)}</DeepLedgerStatusPill>
              </div>
              <div className="mt-1.5 text-xs text-[var(--faint)]">{triggerSourceLabel(cycle.triggerSource)} · {formatDateTime(cycle.createdAt)}</div>
            </button>
          );
        })}
        {props.cycles.length === 0 ? (
          <div className="py-4 text-center text-xs text-[var(--faint)]">暂无历史周期</div>
        ) : null}
      </div>
      <div className="mt-3 border-t border-[var(--border)] pt-3">
        <Link href="/daa/dashboard/trades" className="text-xs text-[var(--muted)] underline underline-offset-4 transition-colors hover:text-[var(--text)]">
          查看完整历史 →
        </Link>
      </div>
    </DeepLedgerPanel>
  );
}
