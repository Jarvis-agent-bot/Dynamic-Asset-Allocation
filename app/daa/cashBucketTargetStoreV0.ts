"use client";

import { normalizeCashBucketTargetPct01V0 } from "@/src/daa/cashBucketTargetsV0";

import { WIZARD_DATA_EVENT } from "./wizardStorage";

export const LS_CASH_BUCKET_TARGET_V0 = "daa.rebalance.cashBucketTargetPct01.v0";

export type CashBucketTargetStateV0 = {
  schemaVersion: 1;
  updatedAt: string;
  // 0..1, e.g. 0.2 === 20%
  targetCashPct01: number;
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

function defaultStateV0(): CashBucketTargetStateV0 {
  return { schemaVersion: 1, updatedAt: nowIso(), targetCashPct01: 0 };
}

export function loadCashBucketTargetStateV0(): CashBucketTargetStateV0 {
  if (typeof window === "undefined") return defaultStateV0();

  const raw = safeJsonParse(window.localStorage.getItem(LS_CASH_BUCKET_TARGET_V0));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaultStateV0();

  const r: any = raw as any;
  if (r.schemaVersion !== 1) return defaultStateV0();

  const updatedAt = typeof r.updatedAt === "string" && r.updatedAt ? r.updatedAt : nowIso();
  const targetCashPct01 = normalizeCashBucketTargetPct01V0(r.targetCashPct01);

  return { schemaVersion: 1, updatedAt, targetCashPct01 };
}

export function loadCashBucketTargetPct01V0(): number {
  return loadCashBucketTargetStateV0().targetCashPct01;
}

export function saveCashBucketTargetStateV0(state: CashBucketTargetStateV0) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_CASH_BUCKET_TARGET_V0, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function persistCashBucketTargetPct01V0(targetCashPct01Like: unknown) {
  if (typeof window === "undefined") return;

  const targetCashPct01 = normalizeCashBucketTargetPct01V0(targetCashPct01Like);
  const next: CashBucketTargetStateV0 = {
    schemaVersion: 1,
    updatedAt: nowIso(),
    targetCashPct01,
  };

  saveCashBucketTargetStateV0(next);

  try {
    window.dispatchEvent(new CustomEvent(WIZARD_DATA_EVENT));
  } catch {
    // ignore
  }
}
