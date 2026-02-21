import { useEffect, useState } from 'react';

export const LS_WHATIF_FEE_BPS = 'daa.whatif.feeBps';
export const LS_WHATIF_SLIPPAGE_BPS = 'daa.whatif.slippageBps';
export const LS_WHATIF_SLIPPAGE_SENSITIVITY_V0 = 'daa.whatif.slippageSensitivityV0';
export const LS_WHATIF_DRIFT_THRESHOLD_PCT_V0 = 'daa.whatif.driftThresholdPctV0';
export const LS_WHATIF_ORDERS_PREVIEW_SOURCE_V0 = 'daa.whatif.ordersPreviewSourceV0';
export const LS_REBALANCE_ASSET_BLACKLIST_V0 = 'daa.rebalance.assetBlacklist.v0';
export const LS_AUTO_PLAN_INPUT = 'daa.market.funds.autoPlan.input.v0';
// Legacy single-scenario key (kept for migration only).
export const LS_AUTO_PLAN_RESULT = 'daa.market.funds.autoPlan.result.v0';
export const LS_AUTO_PLAN_RESULT_A = 'daa.market.funds.autoPlan.result.A.v0';
export const LS_AUTO_PLAN_RESULT_B = 'daa.market.funds.autoPlan.result.B.v0';
export const LS_AUTO_PLAN_SCENARIO_PRESETS_V0 = 'daa.market.funds.autoPlan.presets.v0';

export type SlippageSensitivityV0 = 'LOW' | 'BASE' | 'HIGH';
export type OrdersPreviewSourceV0 = 'RECOMPUTE' | 'ENGINE_LAST_RUN';
export type AutoPlanScenarioKeyV0 = 'A' | 'B';

export const SLIPPAGE_SENSITIVITY_MULTIPLIER_V0: Record<SlippageSensitivityV0, number> = {
  LOW: 0.5,
  BASE: 1,
  HIGH: 2,
};

export type AutoPlanScenarioPresetV0 = {
  id: string;
  name: string;
  updatedAt: string;
  inputA: string;
  inputB: string;
  thresholdPctOverrideA: number | null;
  thresholdPctOverrideB: number | null;
};

function readLocalStorageStringV0(key: string, fallback = '') {
  if (typeof window === 'undefined') return fallback;
  return String(window.localStorage.getItem(key) ?? fallback);
}

export function useLocalStorageStringV0(key: string, fallback = '') {
  const [value, setValue] = useState(() => readLocalStorageStringV0(key, fallback));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, String(value ?? fallback));
  }, [fallback, key, value]);

  return [value, setValue] as const;
}

export function useLocalStorageOptionalNumberV0(key: string) {
  const [value, setValue] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(key);
    const num = raw === null ? null : Number(raw);
    return num !== null && Number.isFinite(num) && num >= 0 ? num : null;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, String(value));
  }, [key, value]);

  return [value, setValue] as const;
}

export function useLocalStorageFiniteNumberV0(key: string, fallback = 0) {
  const [raw, setRaw] = useLocalStorageStringV0(key, String(fallback));
  const value = Number(raw);
  return [Number.isFinite(value) ? value : fallback, setRaw] as const;
}
