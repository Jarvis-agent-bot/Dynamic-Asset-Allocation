"use client";

import { useMemo } from "react";

import {
  DaaSurfaceMiniStat,
  DaaSurfacePanel,
  type DaaSurfaceTone,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { formatPercent } from "@/app/daa/dashboard/_components/daaFormatters";
import type { DaaStoreEquitySnapshot } from "@/src/daa/store/storeTypes";
import type {
  RebalanceCycle,
  WorkbenchBootstrap,
} from "@/src/daa/modules/workbench/workbenchTypes";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeHHI(
  holdings: Array<{ actualWeightPct: number; holdingQty: number }>,
): number {
  const weights = holdings
    .filter((h) => h.holdingQty > 0 && h.actualWeightPct > 0)
    .map((h) => h.actualWeightPct / 100);
  if (weights.length === 0) return 0;
  return weights.reduce((sum, w) => sum + w * w, 0);
}

function hhiLabel(hhi: number): string {
  if (hhi >= 0.25) return "高度集中";
  if (hhi >= 0.15) return "中度集中";
  if (hhi >= 0.06) return "适度分散";
  return "充分分散";
}

function hhiTone(hhi: number): DaaSurfaceTone {
  if (hhi >= 0.25) return "red";
  if (hhi >= 0.15) return "amber";
  return "green";
}

/** 5-dot gauge: filled dots = severity 0..5 */
function HHIGauge({ hhi }: { hhi: number }) {
  const filled = hhi >= 0.25 ? 5 : hhi >= 0.2 ? 4 : hhi >= 0.15 ? 3 : hhi >= 0.1 ? 2 : hhi >= 0.04 ? 1 : 0;
  return (
    <span className="inline-flex items-center gap-1">
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className="inline-block h-2 w-2 rounded-full"
          style={{
            background: i < filled ? "var(--amber)" : "rgba(148,163,184,0.22)",
          }}
        />
      ))}
    </span>
  );
}

function maxSinglePosition(
  holdings: Array<{ symbol: string; actualWeightPct: number; holdingQty: number }>,
): { symbol: string; weightPct: number } {
  let best = { symbol: "-", weightPct: 0 };
  for (const h of holdings) {
    if (h.holdingQty > 0 && h.actualWeightPct > best.weightPct) {
      best = { symbol: h.symbol, weightPct: h.actualWeightPct };
    }
  }
  return best;
}

function computeMaxDrawdown(
  snapshots: DaaStoreEquitySnapshot[],
): { pct: number; period: string } {
  if (snapshots.length < 2) return { pct: 0, period: "-" };

  const sorted = [...snapshots].sort(
    (a, b) => Date.parse(a.ts) - Date.parse(b.ts),
  );

  let peak = sorted[0].totalEquity;
  let peakTs = sorted[0].ts;
  let maxDd = 0;
  let ddStart = "";
  let ddEnd = "";

  for (const snap of sorted) {
    if (snap.totalEquity > peak) {
      peak = snap.totalEquity;
      peakTs = snap.ts;
    }
    const dd = peak > 0 ? (peak - snap.totalEquity) / peak : 0;
    if (dd > maxDd) {
      maxDd = dd;
      ddStart = peakTs;
      ddEnd = snap.ts;
    }
  }

  const period =
    ddStart && ddEnd
      ? `${ddStart.slice(5, 10)} ~ ${ddEnd.slice(5, 10)}`
      : "-";
  return { pct: maxDd * 100, period };
}

function driftViolations(
  cycle: RebalanceCycle | null,
  thresholdPct = 3,
): { count: number; status: string } {
  if (!cycle?.driftSnapshot?.length) return { count: 0, status: "无周期" };
  const violations = cycle.driftSnapshot.filter(
    (d) => Math.abs(d.driftPct) > thresholdPct,
  );
  return {
    count: violations.length,
    status: violations.length > 0 ? `${violations.length} 项超限` : "正常",
  };
}

// ---------------------------------------------------------------------------
// Weight comparison bar
// ---------------------------------------------------------------------------

function WeightBar({
  symbol,
  targetPct,
  actualPct,
}: {
  symbol: string;
  targetPct: number;
  actualPct: number;
}) {
  const maxPct = Math.max(targetPct, actualPct, 1);
  const targetWidth = Math.min(100, (targetPct / maxPct) * 100);
  const actualWidth = Math.min(100, (actualPct / maxPct) * 100);
  const drift = Math.abs(actualPct - targetPct);
  const hasDrift = drift > 3;

  return (
    <div className="flex items-center gap-3 text-xs">
      <div className="w-20 shrink-0 truncate font-medium text-[var(--text)]">
        {symbol}
      </div>
      <div className="text-[var(--faint)] w-16 shrink-0 text-right">
        目标 {formatPercent(targetPct)}
      </div>
      <div className="relative flex-1 h-3 rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${targetWidth}%`, background: "rgba(56,189,248,0.35)" }}
        />
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-[var(--primary)]"
          style={{ width: `${actualWidth}%` }}
        />
      </div>
      <div className="text-[var(--muted)] w-20 shrink-0 text-right">
        实际 {formatPercent(actualPct)}
      </div>
      {hasDrift ? (
        <span className="text-amber-300 shrink-0" title={`漂移 ${drift.toFixed(1)}%`}>
          &#9888;
        </span>
      ) : (
        <span className="w-4 shrink-0" />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PortfolioRiskPanel({
  bootstrap,
  snapshots,
  latestCycle,
}: {
  bootstrap: WorkbenchBootstrap;
  snapshots: DaaStoreEquitySnapshot[];
  latestCycle: RebalanceCycle | null;
}) {
  const holdings = bootstrap.assetUniverse;

  const hhi = useMemo(() => computeHHI(holdings), [holdings]);
  const maxPos = useMemo(() => maxSinglePosition(holdings), [holdings]);
  const drawdown = useMemo(() => computeMaxDrawdown(snapshots), [snapshots]);
  const drift = useMemo(() => driftViolations(latestCycle), [latestCycle]);

  const holdingsWithTarget = useMemo(
    () =>
      holdings
        .filter((h) => h.holdingQty > 0 || h.targetWeightPct > 0)
        .sort((a, b) => b.targetWeightPct - a.targetWeightPct),
    [holdings],
  );

  return (
    <DaaSurfacePanel accent="amber" title="组合风险概览" subtitle="HHI 集中度、最大单仓、历史最大回撤与漂移状态">
      {/* 4-column mini stat grid */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DaaSurfaceMiniStat
          label="HHI 集中度"
          value={hhi.toFixed(4)}
          hint={
            <span className="flex items-center gap-2">
              <HHIGauge hhi={hhi} />
              <span>{hhiLabel(hhi)}</span>
            </span>
          }
          tone={hhiTone(hhi)}
        />
        <DaaSurfaceMiniStat
          label="最大单仓"
          value={`${maxPos.weightPct.toFixed(1)}%`}
          hint={maxPos.symbol}
          tone={maxPos.weightPct >= 30 ? "red" : maxPos.weightPct >= 20 ? "amber" : "green"}
        />
        <DaaSurfaceMiniStat
          label="最大回撤"
          value={`${drawdown.pct.toFixed(1)}%`}
          hint={drawdown.period}
          tone={drawdown.pct >= 20 ? "red" : drawdown.pct >= 10 ? "amber" : "green"}
        />
        <DaaSurfaceMiniStat
          label="漂移状态"
          value={String(drift.count)}
          hint={drift.status}
          tone={drift.count > 0 ? "amber" : "green"}
        />
      </div>

      {/* Target vs Actual weight comparison */}
      {holdingsWithTarget.length > 0 ? (
        <div className="mt-5 space-y-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">
            目标 vs 实际权重
          </div>
          <div className="space-y-2">
            {holdingsWithTarget.map((h) => (
              <WeightBar
                key={h.assetKey}
                symbol={h.symbol}
                targetPct={h.targetWeightPct}
                actualPct={h.actualWeightPct}
              />
            ))}
          </div>
        </div>
      ) : null}
    </DaaSurfacePanel>
  );
}
