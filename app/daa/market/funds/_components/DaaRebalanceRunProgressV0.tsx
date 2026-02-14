"use client";

import { useEffect, useMemo, useState } from "react";

import { loadRebalanceOrderStatusRunV0, type RebalanceOrderStatusRunV0 } from "@/src/daa/rebalanceOrderStatusRunStoreV0";

function parseIsoMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function fmtTimeCompact(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return rs ? `${m}m${rs}s` : `${m}m`;
}

function estimateSimulatedPaperExecMs(orderCount: number): number {
  const n = Number.isFinite(orderCount) ? Math.max(0, Math.floor(orderCount)) : 0;
  if (n <= 0) return 0;

  // Keep in sync with simulatePaperBrokerFillProgressV0 (Funds hub E2E-friendly paper broker fills).
  const steps = 4;
  const totalTargetMs = 2500;
  const perStepMs = Math.max(60, Math.min(250, Math.floor(totalTargetMs / Math.max(1, n * steps))));
  return n * steps * perStepMs;
}

function computeWeightedFillPct01(orders: Array<{ notional: number; filledNotional?: number; fillPct01?: number }>): number | null {
  let total = 0;
  let filled = 0;

  for (const o of orders) {
    const notional = Number(o?.notional ?? NaN);
    if (!Number.isFinite(notional) || notional <= 0) continue;

    const filledNotional = Number(o?.filledNotional ?? NaN);
    const pctFromField = Number(o?.fillPct01 ?? NaN);

    const pct = Number.isFinite(pctFromField)
      ? Math.max(0, Math.min(1, pctFromField))
      : Number.isFinite(filledNotional)
        ? Math.max(0, Math.min(1, filledNotional / notional))
        : null;

    total += notional;
    filled += pct === null ? 0 : notional * pct;
  }

  if (total <= 0) return null;
  return Math.max(0, Math.min(1, filled / total));
}

type Step = { id: string; label: string; phases: Array<RebalanceOrderStatusRunV0["phase"]> };

const STEPS: Step[] = [
  { id: "core", label: "Compute plan", phases: ["fetching_core"] },
  { id: "validate", label: "Validate", phases: ["validating"] },
  { id: "execute", label: "Execute", phases: ["executing"] },
  { id: "record", label: "Record", phases: ["recorded", "done"] },
];

function phaseToStepIndex(phase: RebalanceOrderStatusRunV0["phase"]): number {
  const idx = STEPS.findIndex((s) => s.phases.includes(phase));
  if (idx >= 0) return idx;
  return phase === "idle" ? 0 : phase === "error" ? STEPS.length - 1 : 0;
}

export function DaaRebalanceRunProgressV0({ pollMs = 500 }: { pollMs?: number }) {
  const [snap, setSnap] = useState<RebalanceOrderStatusRunV0 | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const read = () => {
      setSnap(loadRebalanceOrderStatusRunV0(window.localStorage));
    };

    read();

    const id = window.setInterval(read, Math.max(250, pollMs));
    return () => window.clearInterval(id);
  }, [pollMs]);

  const ui = useMemo(() => {
    if (!snap) return null;

    const createdMs = parseIsoMs(snap.createdAt);
    const updatedMs = parseIsoMs(snap.updatedAt);

    // Auto-hide stale completed snapshots so the UI doesn't stay noisy forever.
    const now = Date.now();
    if (snap.state !== "running" && updatedMs !== null && now - updatedMs > 30_000) return null;

    const currentIdx = phaseToStepIndex(snap.phase);
    const isError = snap.state === "error" || snap.phase === "error";

    const stepsUi = STEPS.map((s, i) => {
      if (isError) return { ...s, done: i < currentIdx, active: i === currentIdx };
      if (snap.state === "running") return { ...s, done: i < currentIdx, active: i === currentIdx };
      return { ...s, done: i <= currentIdx, active: false };
    });

    const orders = snap.orders ?? [];
    const fillPct01 = computeWeightedFillPct01(orders as any);

    const elapsedSec = createdMs === null ? null : Math.max(0, (now - createdMs) / 1000);

    const execMs = estimateSimulatedPaperExecMs(orders.length);
    const remainingExecSec =
      snap.state === "running" && snap.phase === "executing" && fillPct01 !== null && execMs > 0
        ? Math.max(0, (execMs * (1 - fillPct01)) / 1000)
        : null;

    const hint =
      snap.state === "running" && remainingExecSec !== null
        ? `ETA ~ ${fmtTimeCompact(remainingExecSec)} remaining`
        : snap.state === "running" && elapsedSec !== null
          ? `Elapsed ${fmtTimeCompact(elapsedSec)}`
          : snap.state === "error"
            ? `Error${snap.error ? `: ${snap.error}` : ""}`
            : `Done`;

    return { stepsUi, hint, fillPct01, ordersCount: orders.length, state: snap.state, phase: snap.phase };
  }, [snap]);

  if (!ui) return null;

  const badge = ui.state === "running" ? { bg: "#d9a300", text: "#111" } : ui.state === "error" ? { bg: "#b00020", text: "#fff" } : { bg: "#0a7", text: "#fff" };

  return (
    <div
      style={{
        marginTop: 10,
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(0,0,0,0.08)",
      }}
      role="status"
      aria-label="Rebalance run progress"
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
          <div style={{ fontSize: 12, fontWeight: 800 }}>Run progress</div>
          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: badge.bg, color: badge.text }}>
            {ui.state}
          </span>
          <span className="muted" style={{ fontSize: 11 }}>
            phase={ui.phase}
          </span>
          {ui.phase === "executing" && ui.fillPct01 !== null ? (
            <span className="muted" style={{ fontSize: 11 }}>
              fill ~ {Math.round(ui.fillPct01 * 100)}% ({ui.ordersCount} orders)
            </span>
          ) : ui.ordersCount ? (
            <span className="muted" style={{ fontSize: 11 }}>
              {ui.ordersCount} orders
            </span>
          ) : null}
        </div>

        <div className="muted" style={{ fontSize: 11 }}>
          {ui.hint}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
        {ui.stepsUi.map((s, idx) => {
          const dotBg = s.done ? "#0a7" : s.active ? "#3b82f6" : "rgba(255,255,255,0.18)";
          const dotText = s.done || s.active ? "#fff" : "rgba(255,255,255,0.6)";

          return (
            <div key={s.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div
                aria-hidden
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 999,
                  background: dotBg,
                  color: dotText,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 800,
                }}
              >
                {idx + 1}
              </div>
              <div style={{ fontSize: 11, fontWeight: s.active ? 800 : 600, color: s.done || s.active ? "var(--text)" : "var(--muted)" }}>
                {s.label}
              </div>

              {idx < ui.stepsUi.length - 1 ? (
                <div aria-hidden style={{ width: 18, height: 1, background: "rgba(255,255,255,0.12)" }} />
              ) : null}
            </div>
          );
        })}
      </div>

      {ui.state === "running" && ui.phase === "fetching_core" ? (
        <div className="muted" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.6 }}>
          Hint: this is an in-process Next.js route; if it feels slow, check for heavy inputs (many symbols / large series).
        </div>
      ) : null}
    </div>
  );
}
