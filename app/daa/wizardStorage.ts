"use client";

// LocalStorage keys used by the /daa Wizard to persist cross-step data.
// Keep them stable so users can refresh/navigate without losing state.

export const LS_ACTIVE_STEP = "daa.wizard.activeStep";
export const LS_MONEY_PLAN = "daa.wizard.moneyPlan";
export const LS_REBALANCE_REQUEST = "daa.wizard.rebalanceRequest";
export const LS_REBALANCE_RESPONSE = "daa.wizard.rebalanceResponse";
export const LS_MARKET_EVENTS = "daa.wizard.marketEvents";

// Step-specific storage keys (kept here so cross-step summary can read them).
export const LS_HUMAN_PROFILE = "daa.step6.humanProfile";

export const WIZARD_DATA_EVENT = "daa:wizard:data";

export function pretty(x: unknown) {
  return JSON.stringify(x, null, 2);
}

export function saveJsonToLs(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    // A tiny app-wide event so panels can refresh without plumbing props/context.
    window.dispatchEvent(new CustomEvent(WIZARD_DATA_EVENT));
  } catch {
    // ignore
  }
}

export function readJsonFromLs<T = unknown>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
