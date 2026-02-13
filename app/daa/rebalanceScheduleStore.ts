"use client";

import { WIZARD_DATA_EVENT } from "./wizardStorage";

import {
  defaultRebalanceScheduleV1,
  normalizeRebalanceScheduleInputV1,
  type RebalanceScheduleV1,
} from "@/src/daa/rebalanceScheduleV0";

// Schedule editor (v0): persist local schedule config in localStorage.
// Used by Funds hub UI to configure daily/weekly dynamic rebalance runs.

export const LS_REBALANCE_SCHEDULE = "daa.rebalance.schedule";

export type RebalanceScheduleStateV1 = {
  schemaVersion: 1;
  updatedAt: string;
  schedule: RebalanceScheduleV1;
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

function defaultStateV1(): RebalanceScheduleStateV1 {
  return { schemaVersion: 1, updatedAt: nowIso(), schedule: defaultRebalanceScheduleV1() };
}

export function loadRebalanceScheduleStateV1(): RebalanceScheduleStateV1 {
  if (typeof window === "undefined") return defaultStateV1();

  const raw = safeJsonParse(window.localStorage.getItem(LS_REBALANCE_SCHEDULE));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaultStateV1();

  const r: any = raw as any;
  if (r.schemaVersion !== 1) return defaultStateV1();

  const schedule = normalizeRebalanceScheduleInputV1(r.schedule);
  const updatedAt = typeof r.updatedAt === "string" && r.updatedAt ? r.updatedAt : nowIso();

  return { schemaVersion: 1, updatedAt, schedule };
}

export function saveRebalanceScheduleStateV1(state: RebalanceScheduleStateV1) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_REBALANCE_SCHEDULE, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function persistRebalanceScheduleV1(scheduleLike: unknown) {
  if (typeof window === "undefined") return;

  const schedule = normalizeRebalanceScheduleInputV1(scheduleLike);
  const next: RebalanceScheduleStateV1 = {
    schemaVersion: 1,
    updatedAt: nowIso(),
    schedule,
  };

  saveRebalanceScheduleStateV1(next);

  try {
    window.dispatchEvent(new CustomEvent(WIZARD_DATA_EVENT));
  } catch {
    // ignore
  }
}
