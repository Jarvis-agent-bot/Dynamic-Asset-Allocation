"use client";

import { WIZARD_DATA_EVENT } from "./wizardStorage";

// Funds hub dynamic rebalance guardrails (v0): a small set of safety limits stored in localStorage.
// Keep this as simple scalar values so the UI can read/write without schema migrations.

export const LS_MAX_TURNOVER_PCT01_V0 = "daa.rebalance.guardrails.maxTurnoverPct01.v0";

// Default: allow up to 25% of total equity turnover per rebalance run.
export const DEFAULT_MAX_TURNOVER_PCT01_V0 = 0.25;

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return DEFAULT_MAX_TURNOVER_PCT01_V0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

export function loadMaxTurnoverPct01V0(): number {
  if (typeof window === "undefined") return DEFAULT_MAX_TURNOVER_PCT01_V0;

  const raw = window.localStorage.getItem(LS_MAX_TURNOVER_PCT01_V0);
  if (raw === null) return DEFAULT_MAX_TURNOVER_PCT01_V0;

  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_MAX_TURNOVER_PCT01_V0;
  return clamp01(n);
}

export function persistMaxTurnoverPct01V0(pct01: number) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(LS_MAX_TURNOVER_PCT01_V0, String(clamp01(pct01)));
  } catch {
    // ignore
  }

  try {
    window.dispatchEvent(new CustomEvent(WIZARD_DATA_EVENT));
  } catch {
    // ignore
  }
}
