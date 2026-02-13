"use client";

import { WIZARD_DATA_EVENT } from "./wizardStorage";

// Execution mode (v0): controls whether Funds hub rebalance should execute in paper mode
// (record only) or live mode (intended for real brokerage execution).
//
// Note: the "live" adapter is currently a placeholder; we keep the mode persisted so the
// UI+API shape stays stable when real execution is wired.

export const LS_EXECUTION_MODE_V0 = "daa.execution.mode.v0";

export type ExecutionModeV0 = "paper" | "live";

export type ExecutionModeStateV0 = {
  schemaVersion: 1;
  updatedAt: string;
  mode: ExecutionModeV0;
};

function nowIso() {
  return new Date().toISOString();
}

function safeJsonParse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function defaultExecutionModeV0(): ExecutionModeV0 {
  return "paper";
}

function normalizeExecutionModeV0(x: unknown): ExecutionModeV0 {
  return x === "live" ? "live" : "paper";
}

function defaultStateV0(): ExecutionModeStateV0 {
  return { schemaVersion: 1, updatedAt: nowIso(), mode: defaultExecutionModeV0() };
}

export function loadExecutionModeStateV0(): ExecutionModeStateV0 {
  if (typeof window === "undefined") return defaultStateV0();

  const raw = safeJsonParse(window.localStorage.getItem(LS_EXECUTION_MODE_V0));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaultStateV0();

  const r: any = raw as any;
  if (r.schemaVersion !== 1) return defaultStateV0();

  const updatedAt = typeof r.updatedAt === "string" && r.updatedAt ? r.updatedAt : nowIso();
  const mode = normalizeExecutionModeV0(r.mode);

  return { schemaVersion: 1, updatedAt, mode };
}

export function loadExecutionModeV0(): ExecutionModeV0 {
  return loadExecutionModeStateV0().mode;
}

export function saveExecutionModeStateV0(state: ExecutionModeStateV0) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_EXECUTION_MODE_V0, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function persistExecutionModeV0(modeLike: unknown) {
  if (typeof window === "undefined") return;

  const mode = normalizeExecutionModeV0(modeLike);
  const next: ExecutionModeStateV0 = {
    schemaVersion: 1,
    updatedAt: nowIso(),
    mode,
  };

  saveExecutionModeStateV0(next);

  try {
    window.dispatchEvent(new CustomEvent(WIZARD_DATA_EVENT));
  } catch {
    // ignore
  }
}
