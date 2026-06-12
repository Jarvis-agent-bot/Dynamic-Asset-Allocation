"use client";

import { useMemo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

import {
  DaaSurfacePanel,
  type DaaSurfaceTone,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { formatPercent } from "@/app/daa/dashboard/_components/daaFormatters";
import { cn } from "@/lib/utils";
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
    .filter((holding) => holding.holdingQty > 0 && holding.actualWeightPct > 0)
    .map((holding) => holding.actualWeightPct / 100);
  if (weights.length === 0) return 0;
  return weights.reduce((sum, weight) => sum + weight * weight, 0);
}

function hhiLabel(hhi: number): string {
  if (hhi >= 0.25) return "高度集中";
  if (hhi >= 0.15) return "中度集中";
  if (hhi >= 0.06) return "适度分散";
  return "充分分散";
}

function hhiTone(hhi: number): DaaSurfaceTone {
  if (hhi >= 0.25) return "danger";
  if (hhi >= 0.15) return "warning";
  return "success";
}

/** 5-dot gauge: filled dots = severity 0..5 */
function HHIGauge({ hhi }: { hhi: number }) {
  const filled = hhi >= 0.25 ? 5 : hhi >= 0.2 ? 4 : hhi >= 0.15 ? 3 : hhi >= 0.1 ? 2 : hhi >= 0.04 ? 1 : 0;
  return (
    <span className="inline-flex items-center gap-1">
      {Array.from({ length: 5 }, (_, dotIndex) => (
        <span
          key={dotIndex}
          className={cn(
            "inline-block h-2 w-2 rounded-[var(--radius-sm)]",
            dotIndex < filled ? "bg-[var(--amber)]" : "bg-[var(--muted-bg)]",
          )}
        />
      ))}
    </span>
  );
}

function riskToneTextClass(tone: DaaSurfaceTone): string {
  if (tone === "danger") return "text-[var(--danger)]";
  if (tone === "warning") return "text-[var(--amber)]";
  if (tone === "success") return "text-[var(--success)]";
  if (tone === "primary") return "text-[var(--primary)]";
  return "text-[var(--text)]";
}

function riskProgressClass(tone: DaaSurfaceTone): string {
  if (tone === "danger") return "[&::-webkit-progress-value]:bg-[var(--danger)] [&::-moz-progress-bar]:bg-[var(--danger)] accent-[var(--danger)]";
  if (tone === "warning") return "[&::-webkit-progress-value]:bg-[var(--amber)] [&::-moz-progress-bar]:bg-[var(--amber)] accent-[var(--amber)]";
  if (tone === "success") return "[&::-webkit-progress-value]:bg-[var(--success)] [&::-moz-progress-bar]:bg-[var(--success)] accent-[var(--success)]";
  return "[&::-webkit-progress-value]:bg-[var(--primary)] [&::-moz-progress-bar]:bg-[var(--primary)] accent-[var(--primary)]";
}

function RiskMetricSegment({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: ReactNode;
  tone: DaaSurfaceTone;
}) {
  return (
    <div className="min-w-0 border-b border-[var(--border)] px-3 py-2 sm:border-r sm:even:border-r-0 xl:border-b-0 xl:even:border-r xl:last:border-r-0">
      <div className="text-[10px] text-[var(--muted)]">{label}</div>
      <div className={cn("mt-1 truncate font-[var(--font-mono)] text-sm font-semibold", riskToneTextClass(tone))}>
        {value}
      </div>
      <div className="mt-1 truncate text-[11px] text-[var(--faint)]">{hint}</div>
    </div>
  );
}

function maxSinglePosition(
  holdings: Array<{ symbol: string; actualWeightPct: number; holdingQty: number }>,
): { symbol: string; weightPct: number } {
  let best = { symbol: "-", weightPct: 0 };
  for (const holding of holdings) {
    if (holding.holdingQty > 0 && holding.actualWeightPct > best.weightPct) {
      best = { symbol: holding.symbol, weightPct: holding.actualWeightPct };
    }
  }
  return best;
}

function computeMaxDrawdown(
  snapshots: DaaStoreEquitySnapshot[],
): { pct: number; period: string } {
  if (snapshots.length < 2) return { pct: 0, period: "-" };

  const sorted = [...snapshots].sort(
    (leftSnapshot, rightSnapshot) => Date.parse(leftSnapshot.ts) - Date.parse(rightSnapshot.ts),
  );

  let peak = sorted[0].totalEquity;
  let peakTs = sorted[0].ts;
  let maxDd = 0;
  let ddStart = "";
  let ddEnd = "";

  for (const snapshot of sorted) {
    if (snapshot.totalEquity > peak) {
      peak = snapshot.totalEquity;
      peakTs = snapshot.ts;
    }
    const drawdown = peak > 0 ? (peak - snapshot.totalEquity) / peak : 0;
    if (drawdown > maxDd) {
      maxDd = drawdown;
      ddStart = peakTs;
      ddEnd = snapshot.ts;
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
  holdings: Array<{ gapPct: number | null; watchEnabled: boolean; targetWeightPct: number }>,
  driftThresholdPct = 3,
): { count: number; status: string } {
  // 优先使用 cycle snapshot；没有周期快照时读取当前持仓偏移。
  if (cycle?.driftSnapshot?.length) {
    const violations = cycle.driftSnapshot.filter(
      (driftPoint) => Math.abs(driftPoint.driftPct) > driftThresholdPct,
    );
    return {
      count: violations.length,
      status: violations.length > 0 ? `${violations.length} 项超限` : "正常",
    };
  }
  // 无周期时用实时 assetRows 计算
  const violations = holdings.filter(
    (holding) => holding.watchEnabled && holding.targetWeightPct > 0 && holding.gapPct != null && Math.abs(holding.gapPct) > driftThresholdPct,
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
  const drift = Math.abs(actualPct - targetPct);
  const hasDrift = drift > 3;
  const actualTone: DaaSurfaceTone = hasDrift ? "warning" : "primary";

  return (
    <div className="grid gap-2 text-xs md:grid-cols-[80px_1fr_80px_16px] md:items-center">
      <div className="w-20 shrink-0 truncate font-medium text-[var(--text)]">
        {symbol}
      </div>
      <div className="space-y-1">
        <div className="grid gap-1 sm:grid-cols-2">
          <div className="min-w-0">
            <div className="mb-0.5 flex justify-between gap-2 text-[10px] text-[var(--faint)]">
              <span>目标</span>
              <span className="font-[var(--font-mono)]">{formatPercent(targetPct)}</span>
            </div>
            <progress
              value={Math.min(Math.max(targetPct, 0), 100)}
              max={100}
              className="block h-1.5 w-full overflow-hidden rounded-[var(--radius-sm)] bg-[var(--elevated)] accent-[var(--primary-bg)] [&::-webkit-progress-bar]:bg-[var(--elevated)] [&::-webkit-progress-value]:bg-[var(--primary-bg)] [&::-moz-progress-bar]:bg-[var(--primary-bg)]"
            />
          </div>
          <div className="min-w-0">
            <div className="mb-0.5 flex justify-between gap-2 text-[10px] text-[var(--faint)]">
              <span>实际</span>
              <span className="font-[var(--font-mono)]">{formatPercent(actualPct)}</span>
            </div>
            <progress
              value={Math.min(Math.max(actualPct, 0), 100)}
              max={100}
              className={cn(
                "block h-1.5 w-full overflow-hidden rounded-[var(--radius-sm)] bg-[var(--elevated)] [&::-webkit-progress-bar]:bg-[var(--elevated)]",
                riskProgressClass(actualTone),
              )}
            />
          </div>
        </div>
      </div>
      <div className="text-right font-[var(--font-mono)] text-[var(--muted)]">
        {hasDrift ? `偏离 ${drift.toFixed(1)}%` : "贴近"}
      </div>
      {hasDrift ? (
        <span className="inline-flex w-4 shrink-0 justify-end text-[var(--amber)]" title={`偏离 ${drift.toFixed(1)}%`}>
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
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
  const driftThresholdPctPoints = (bootstrap.policy?.drift?.outerBandPct ?? 0.05) * 100;
  const drift = useMemo(() => driftViolations(latestCycle, holdings, driftThresholdPctPoints), [latestCycle, holdings, driftThresholdPctPoints]);
  const hhiMetricTone = hhiTone(hhi);
  const maxPositionTone = maxPos.weightPct >= 30 ? "danger" : maxPos.weightPct >= 20 ? "warning" : "success";
  const drawdownTone = drawdown.pct >= 20 ? "danger" : drawdown.pct >= 10 ? "warning" : "success";
  const driftTone = drift.count > 0 ? "warning" : "success";

  const holdingsWithTarget = useMemo(
    () =>
      holdings
        .filter((holding) => holding.holdingQty > 0 || holding.targetWeightPct > 0)
        .sort((leftHolding, rightHolding) => rightHolding.targetWeightPct - leftHolding.targetWeightPct),
    [holdings],
  );

  return (
    <DaaSurfacePanel accent="warning" title="组合风险概览" subtitle="HHI 集中度、最大单仓、历史最大回撤与漂移状态">
      <div className="grid overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))]">
        <RiskMetricSegment
          label="HHI 集中度"
          value={hhi.toFixed(4)}
          hint={
            <span className="flex items-center gap-2">
              <HHIGauge hhi={hhi} />
              <span>{hhiLabel(hhi)}</span>
            </span>
          }
          tone={hhiMetricTone}
        />
        <RiskMetricSegment
          label="最大单仓"
          value={`${maxPos.weightPct.toFixed(1)}%`}
          hint={maxPos.symbol}
          tone={maxPositionTone}
        />
        <RiskMetricSegment
          label="最大回撤"
          value={`${drawdown.pct.toFixed(1)}%`}
          hint={drawdown.period}
          tone={drawdownTone}
        />
        <RiskMetricSegment
          label="漂移状态"
          value={String(drift.count)}
          hint={drift.status}
          tone={driftTone}
        />
      </div>

      {/* Target vs Actual weight comparison */}
      {holdingsWithTarget.length > 0 ? (
        <div className="mt-5 space-y-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-normal text-[var(--faint)]">
            目标 vs 实际权重
          </div>
          <div className="space-y-2">
            {holdingsWithTarget.map((holding) => (
              <WeightBar
                key={holding.assetKey}
                symbol={holding.symbol}
                targetPct={holding.targetWeightPct}
                actualPct={holding.actualWeightPct}
              />
            ))}
          </div>
        </div>
      ) : null}
    </DaaSurfacePanel>
  );
}
