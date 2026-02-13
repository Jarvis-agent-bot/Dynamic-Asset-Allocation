"use client";

import { WIZARD_DATA_EVENT } from "./wizardStorage";

import {
  defaultSellProceedsRoutingV0,
  normalizeSellProceedsRoutingV0,
  type SellProceedsRoutingV0,
} from "@/src/daa/sellProceedsRoutingV0";

export const LS_SELL_PROCEEDS_ROUTING_V0 = "daa.rebalance.sellProceedsRouting.v0";

export type SellProceedsRoutingStateV0 = {
  schemaVersion: 1;
  updatedAt: string;
  routing: SellProceedsRoutingV0;
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

function defaultStateV0(): SellProceedsRoutingStateV0 {
  return {
    schemaVersion: 1,
    updatedAt: nowIso(),
    routing: defaultSellProceedsRoutingV0(),
  };
}

export function loadSellProceedsRoutingStateV0(): SellProceedsRoutingStateV0 {
  if (typeof window === "undefined") return defaultStateV0();

  const raw = safeJsonParse(window.localStorage.getItem(LS_SELL_PROCEEDS_ROUTING_V0));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaultStateV0();

  const r: any = raw as any;
  if (r.schemaVersion !== 1) return defaultStateV0();

  const updatedAt = typeof r.updatedAt === "string" && r.updatedAt ? r.updatedAt : nowIso();
  const routing = normalizeSellProceedsRoutingV0(r.routing);

  return { schemaVersion: 1, updatedAt, routing };
}

export function loadSellProceedsRoutingV0(): SellProceedsRoutingV0 {
  return loadSellProceedsRoutingStateV0().routing;
}

export function saveSellProceedsRoutingStateV0(state: SellProceedsRoutingStateV0) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_SELL_PROCEEDS_ROUTING_V0, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function persistSellProceedsRoutingV0(routingLike: unknown) {
  if (typeof window === "undefined") return;

  const routing = normalizeSellProceedsRoutingV0(routingLike);
  const next: SellProceedsRoutingStateV0 = {
    schemaVersion: 1,
    updatedAt: nowIso(),
    routing,
  };

  saveSellProceedsRoutingStateV0(next);

  try {
    window.dispatchEvent(new CustomEvent(WIZARD_DATA_EVENT));
  } catch {
    // ignore
  }
}
