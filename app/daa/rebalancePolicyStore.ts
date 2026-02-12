"use client";

import { WIZARD_DATA_EVENT } from "./wizardStorage";

// Rebalance trigger policy editor (v0): persist user-configured trigger policy in localStorage.
// Used by Market/Funds paper rebalance request.

export const LS_REBALANCE_POLICY = "daa.rebalance.policy";

export type RebalancePolicyV1 = {
  // 0..1, e.g. 0.01 === 1%
  thresholdPct: number;
  minTradeNotional: number;
  cooldownSeconds: number;
};

export type RebalancePolicyStateV1 = {
  schemaVersion: 1;
  updatedAt: string;
  policy: RebalancePolicyV1;
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

function toFiniteNumber(x: unknown): number | null {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

function clamp01(x: number) {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function normalizeThresholdPct(x: unknown): number {
  const n0 = toFiniteNumber(x);
  if (n0 === null) return 0;
  if (n0 <= 0) return 0;

  // Convenience: allow entering "1" meaning 1%.
  if (n0 >= 1 && n0 <= 100) return clamp01(n0 / 100);

  return clamp01(n0);
}

function normalizeNonNegative(x: unknown): number {
  const n = toFiniteNumber(x);
  if (n === null) return 0;
  return Math.max(0, n);
}

export function defaultRebalancePolicyV1(): RebalancePolicyV1 {
  return {
    thresholdPct: 0.01,
    minTradeNotional: 10,
    cooldownSeconds: 10 * 60,
  };
}

function defaultStateV1(): RebalancePolicyStateV1 {
  return { schemaVersion: 1, updatedAt: nowIso(), policy: defaultRebalancePolicyV1() };
}

export function normalizeRebalancePolicyInput(x: unknown): RebalancePolicyV1 {
  if (!x || typeof x !== "object" || Array.isArray(x)) return defaultRebalancePolicyV1();
  const r: any = x as any;

  return {
    thresholdPct: normalizeThresholdPct(r.thresholdPct),
    minTradeNotional: normalizeNonNegative(r.minTradeNotional),
    cooldownSeconds: normalizeNonNegative(r.cooldownSeconds),
  };
}

export function loadRebalancePolicyStateV1(): RebalancePolicyStateV1 {
  if (typeof window === "undefined") return defaultStateV1();

  const raw = safeJsonParse(window.localStorage.getItem(LS_REBALANCE_POLICY));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaultStateV1();

  const r: any = raw as any;
  if (r.schemaVersion !== 1) return defaultStateV1();

  const policy = normalizeRebalancePolicyInput(r.policy);
  const updatedAt = typeof r.updatedAt === "string" && r.updatedAt ? r.updatedAt : nowIso();

  return { schemaVersion: 1, updatedAt, policy };
}

export function loadRebalancePolicyV1(): RebalancePolicyV1 {
  return loadRebalancePolicyStateV1().policy;
}

export function saveRebalancePolicyStateV1(state: RebalancePolicyStateV1) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_REBALANCE_POLICY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function persistRebalancePolicyV1(policyLike: unknown) {
  if (typeof window === "undefined") return;

  const policy = normalizeRebalancePolicyInput(policyLike);
  const next: RebalancePolicyStateV1 = {
    schemaVersion: 1,
    updatedAt: nowIso(),
    policy,
  };

  saveRebalancePolicyStateV1(next);

  try {
    window.dispatchEvent(new CustomEvent(WIZARD_DATA_EVENT));
  } catch {
    // ignore
  }
}
