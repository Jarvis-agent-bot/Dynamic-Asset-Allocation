"use client";

import {
  DAA_RUNTIME_DATA_EVENT_V1,
  loadUnifiedTargetWeightsStateV1,
  saveUnifiedTargetWeightsStateV1,
} from "./unifiedInputStore";

// Target weights editor (v0): persist user-provided target weights in localStorage.
// 用于统一控制台的纸上再平衡调权输入。

// 历史 key（仅保留给测试和迁移说明，不再用于读写）。
export const LS_TARGET_WEIGHTS = "daa.targetWeights";

export type TargetWeightV1 = {
  id: string;
  label: string;
  // 0..1, e.g. 0.6 === 60%
  targetPct: number;
};

export type TargetWeightsStateV1 = {
  schemaVersion: 1;
  updatedAt: string;
  targetWeights: TargetWeightV1[];
};

function nowIso() {
  return new Date().toISOString();
}

function toFiniteNumber(x: unknown): number | null {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

function normalizeTargetPct(x: unknown): number | null {
  const n = toFiniteNumber(x);
  if (n === null) return null;
  if (n < 0) return null;

  // Convenience: allow users to paste percentages like 60 (meaning 60%).
  if (n > 1 && n <= 100) return n / 100;

  return n;
}

export function normalizeTargetWeightsInput(x: unknown): TargetWeightV1[] {
  if (!x) return [];

  // Accept array form: [{id,label,targetPct}] or [{symbol,name,weight}]
  if (Array.isArray(x)) {
    return x
      .filter(Boolean)
      .map((a: any) => {
        const id = String(a?.id ?? a?.symbol ?? "").trim();
        const label = String(a?.label ?? a?.name ?? a?.id ?? a?.symbol ?? id).trim();
        const targetPct = normalizeTargetPct(a?.targetPct ?? a?.target_pct ?? a?.weight);
        return { id, label: label || id, targetPct };
      })
      .filter((a) => a.id && a.label && a.targetPct !== null && a.targetPct >= 0 && a.targetPct <= 1)
      .map((a) => ({ id: a.id, label: a.label, targetPct: a.targetPct as number }));
  }

  if (x && typeof x === "object") {
    const r: any = x as any;

    // Common wrapper shapes (export bundles / engine req+resp / runtime state).
    if (r.targetWeights !== undefined) return normalizeTargetWeightsInput(r.targetWeights);
    if (r.target_weights !== undefined) return normalizeTargetWeightsInput(r.target_weights);
    if (r.money_plan && typeof r.money_plan === "object" && (r.money_plan as any).allocations !== undefined) {
      return normalizeTargetWeightsInput((r.money_plan as any).allocations);
    }
    if (r.allocations !== undefined) return normalizeTargetWeightsInput(r.allocations);

    // Accept map form: {"SPY": 0.6, "TLT": 0.4}
    return Object.entries(r as Record<string, unknown>)
      .map(([idRaw, targetPctRaw]) => {
        const id = String(idRaw ?? "").trim();
        const targetPct = normalizeTargetPct(targetPctRaw);
        return { id, label: id, targetPct };
      })
      .filter((a) => a.id && a.targetPct !== null && a.targetPct >= 0 && a.targetPct <= 1)
      .map((a) => ({ id: a.id, label: a.label, targetPct: a.targetPct as number }));
  }

  return [];
}

function defaultStateV1(): TargetWeightsStateV1 {
  return { schemaVersion: 1, updatedAt: nowIso(), targetWeights: [] };
}

export function loadTargetWeightsStateV1(): TargetWeightsStateV1 {
  const fromUnified = loadUnifiedTargetWeightsStateV1();
  if (fromUnified && typeof fromUnified === "object" && !Array.isArray(fromUnified)) {
    const r: any = fromUnified as any;
    if (r.schemaVersion === 1) {
      const targetWeights = normalizeTargetWeightsInput(r.targetWeights);
      const updatedAt = typeof r.updatedAt === "string" && r.updatedAt ? r.updatedAt : nowIso();
      return { schemaVersion: 1, updatedAt, targetWeights };
    }
  }
  return defaultStateV1();
}

export function loadTargetWeightsV1(): TargetWeightV1[] {
  return loadTargetWeightsStateV1().targetWeights;
}

export function saveTargetWeightsStateV1(state: TargetWeightsStateV1) {
  saveUnifiedTargetWeightsStateV1(state, { dispatchEvent: false });
}

export function persistTargetWeightsV1(items: unknown) {
  if (typeof window === "undefined") return;

  const targetWeights = normalizeTargetWeightsInput(items);
  const next: TargetWeightsStateV1 = {
    schemaVersion: 1,
    updatedAt: nowIso(),
    targetWeights,
  };

  saveTargetWeightsStateV1(next);

  // Trigger refresh in the same tab.
  try {
    window.dispatchEvent(new CustomEvent(DAA_RUNTIME_DATA_EVENT_V1));
  } catch {
    // ignore
  }
}

export function parseTargetWeightsJson(text: string): { ok: true; value: TargetWeightV1[] } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(text) as unknown;
    const items = normalizeTargetWeightsInput(parsed);
    if (!items.length) return { ok: false, error: "No valid targetWeights found" };
    return { ok: true, value: items };
  } catch {
    return { ok: false, error: "JSON parse failed" };
  }
}
