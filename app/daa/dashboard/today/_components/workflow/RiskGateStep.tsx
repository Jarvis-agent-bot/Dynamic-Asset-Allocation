"use client";

import { useMemo } from "react";
import { ArrowRight, ShieldAlert, ShieldCheck } from "lucide-react";

import {
  DaaSurfaceMiniStat,
  DaaSurfaceStatusPill,
} from "@/app/daa/dashboard/_components/DaaSurfaceUI";
import { formatPercent } from "@/app/daa/dashboard/_components/daaFormatters";
import type {
  PreTradeRiskCheck,
  RebalanceCycle,
  WorkbenchBootstrap,
} from "@/src/daa/modules/workbench/workbenchTypes";

// ─── Helpers ───

function computeHHI(weights: number[]): number {
  return weights.reduce((sum, w) => sum + w * w, 0);
}

function hhiLabel(hhi: number): string {
  if (hhi >= 0.25) return "高度集中";
  if (hhi >= 0.15) return "中度集中";
  return "适度分散";
}

function hhiTone(hhi: number): "red" | "amber" | "green" {
  if (hhi >= 0.25) return "red";
  if (hhi >= 0.15) return "amber";
  return "green";
}

type RiskMetric = {
  label: string;
  before: string;
  after: string;
  improved: boolean | null; // null = unchanged
  tone: "green" | "amber" | "red";
};

// ─── Component ───

export function RiskGateStep(props: {
  bootstrap: WorkbenchBootstrap;
  currentCycle: RebalanceCycle;
  currentRiskCheck: PreTradeRiskCheck | null;
}) {
  const metrics = useMemo(() => {
    const holdings = props.bootstrap.assetUniverse.filter((h) => h.holdingQty > 0);
    const result: RiskMetric[] = [];

    // ── Before: 当前组合 ──
    const beforeWeights = holdings.map((h) => h.actualWeightPct / 100);
    const beforeHHI = computeHHI(beforeWeights);
    const beforeMaxPos = Math.max(...holdings.map((h) => h.actualWeightPct), 0);
    const driftThreshold = (props.bootstrap.rebalanceStrategy?.drift?.thresholdPct ?? 0.05) * 100;
    const beforeDriftCount = holdings.filter(
      (h) => h.targetWeightPct > 0 && h.gapPct != null && Math.abs(h.gapPct) > driftThreshold,
    ).length;

    // ── After: 模拟执行后 ──
    // 从建议中计算目标权重变化
    const proposals = props.currentCycle.proposals.filter((p) => p.selected);
    const weightAdjustments = new Map<string, number>();
    for (const p of proposals) {
      const current = weightAdjustments.get(p.assetKey) ?? 0;
      const delta = p.side === "BUY"
        ? (p.suggestedNotional / (props.bootstrap.account.totalEquity || 1)) * 100
        : -(p.suggestedNotional / (props.bootstrap.account.totalEquity || 1)) * 100;
      weightAdjustments.set(p.assetKey, current + delta);
    }

    const afterWeights: number[] = [];
    for (const h of holdings) {
      const adj = weightAdjustments.get(h.assetKey) ?? 0;
      afterWeights.push(Math.max(0, (h.actualWeightPct + adj)) / 100);
    }
    // 新买入的资产（不在当前持仓中）
    for (const [key, adj] of weightAdjustments.entries()) {
      if (!holdings.find((h) => h.assetKey === key) && adj > 0) {
        afterWeights.push(adj / 100);
      }
    }

    const afterHHI = afterWeights.length > 0 ? computeHHI(afterWeights) : beforeHHI;
    const afterMaxPos = afterWeights.length > 0 ? Math.max(...afterWeights) * 100 : beforeMaxPos;

    // 估算执行后漂移（简化：假设全部勾选的建议执行后漂移归零）
    const afterDriftCount = Math.max(0, beforeDriftCount - proposals.length);

    // ── 组装指标 ──
    result.push({
      label: "HHI 集中度",
      before: beforeHHI.toFixed(4),
      after: afterHHI.toFixed(4),
      improved: afterHHI < beforeHHI ? true : afterHHI > beforeHHI ? false : null,
      tone: hhiTone(afterHHI),
    });

    result.push({
      label: "最大单仓",
      before: `${beforeMaxPos.toFixed(1)}%`,
      after: `${afterMaxPos.toFixed(1)}%`,
      improved: afterMaxPos < beforeMaxPos ? true : afterMaxPos > beforeMaxPos ? false : null,
      tone: afterMaxPos >= 30 ? "red" : afterMaxPos >= 20 ? "amber" : "green",
    });

    result.push({
      label: "偏移超限",
      before: `${beforeDriftCount} 项`,
      after: `${afterDriftCount} 项`,
      improved: afterDriftCount < beforeDriftCount ? true : afterDriftCount > beforeDriftCount ? false : null,
      tone: afterDriftCount > 0 ? "amber" : "green",
    });

    return result;
  }, [props.bootstrap, props.currentCycle]);

  const riskCheck = props.currentRiskCheck;
  const failedItems = riskCheck?.items.filter((item) => item.status !== "pass") ?? [];
  const overallStatus = riskCheck?.overallStatus ?? "pass";

  return (
    <div className="space-y-4">
      {/* Before → After 对比 */}
      <div className="grid gap-3 sm:grid-cols-3">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-[16px] border border-[var(--border)] bg-[rgba(8,12,20,0.5)] px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)]">{m.label}</div>
            <div className="mt-2 flex items-center gap-2">
              <span className="font-[var(--font-mono)] text-sm text-[var(--muted)]">{m.before}</span>
              <ArrowRight className="h-3 w-3 text-[var(--faint)]" />
              <span className={`font-[var(--font-mono)] text-sm font-semibold ${
                m.improved === true ? "text-emerald-400" : m.improved === false ? "text-red-400" : "text-[var(--text)]"
              }`}>
                {m.after}
              </span>
              {m.improved === true && <span className="text-[10px] text-emerald-400">↓ 改善</span>}
              {m.improved === false && <span className="text-[10px] text-red-400">↑ 恶化</span>}
            </div>
          </div>
        ))}
      </div>

      {/* 风控检查结果 */}
      {failedItems.length > 0 && (
        <div className="space-y-2">
          {failedItems.map((item) => (
            <div
              key={item.rule}
              className={`flex items-start gap-3 rounded-[14px] border px-4 py-3 ${
                item.status === "block"
                  ? "border-rose-400/24 bg-rose-500/10"
                  : "border-amber-400/24 bg-amber-500/10"
              }`}
            >
              <ShieldAlert className={`mt-0.5 h-4 w-4 shrink-0 ${item.status === "block" ? "text-rose-400" : "text-amber-400"}`} />
              <div>
                <div className="flex items-center gap-2">
                  <DaaSurfaceStatusPill tone={item.status === "block" ? "red" : "amber"}>
                    {item.status === "block" ? "阻断" : "警告"}
                  </DaaSurfaceStatusPill>
                  <span className="text-sm font-medium text-[var(--text)]">{item.message}</span>
                </div>
                <div className="mt-1 font-[var(--font-mono)] text-xs text-[var(--faint)]">
                  当前 {item.current.toFixed(2)} · 阈值 {item.limit.toFixed(2)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {failedItems.length === 0 && riskCheck && (
        <div className="flex items-center gap-2 rounded-[14px] border border-emerald-400/24 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-400">
          <ShieldCheck className="h-4 w-4" />
          所有风控检查已通过
        </div>
      )}
    </div>
  );
}
