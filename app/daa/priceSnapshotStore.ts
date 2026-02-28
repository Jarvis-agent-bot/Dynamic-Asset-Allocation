"use client";

import { DAA_RUNTIME_DATA_EVENT_V1, loadUnifiedPriceSnapshotV1, saveUnifiedPriceSnapshotV1 } from "./unifiedInputStore";

// 历史 key（仅保留给测试和迁移说明，不再用于读写）。
export const LS_PRICE_SNAPSHOT = "daa.priceSnapshot.v1";

export type PriceSnapshotV1 = {
  schemaVersion: 1;
  updatedAt: string;
  prices: Record<string, { price: number }>;
};

function nowIso() {
  return new Date().toISOString();
}

function toFinitePositiveNumber(x: unknown): number | null {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeSymbol(sym: unknown): string {
  return String(sym ?? "").trim();
}

function normalizePrices(x: unknown): PriceSnapshotV1["prices"] {
  const out: PriceSnapshotV1["prices"] = {};

  if (!x) return out;

  // Accept either { SYMBOL: 123 } or { SYMBOL: { price: 123 } } or [{ symbol, price }].
  if (Array.isArray(x)) {
    for (const row of x) {
      if (!row || typeof row !== "object") continue;
      const r: any = row as any;
      const symbol = normalizeSymbol(r.symbol);
      const price = toFinitePositiveNumber(r.price);
      if (!symbol || price === null) continue;
      out[symbol] = { price };
    }
    return out;
  }

  if (typeof x === "object") {
    for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
      const symbol = normalizeSymbol(k);
      if (!symbol) continue;

      const price = (() => {
        if (v && typeof v === "object" && !Array.isArray(v)) return toFinitePositiveNumber((v as any).price);
        return toFinitePositiveNumber(v);
      })();

      if (price === null) continue;
      out[symbol] = { price };
    }
  }

  return out;
}

export function defaultPriceSnapshotV1(): PriceSnapshotV1 {
  return { schemaVersion: 1, updatedAt: nowIso(), prices: {} };
}

export function loadPriceSnapshotV1(): PriceSnapshotV1 {
  const fromUnified = loadUnifiedPriceSnapshotV1();
  if (fromUnified && typeof fromUnified === "object" && !Array.isArray(fromUnified)) {
    const r: any = fromUnified as any;
    if (r.schemaVersion === 1) {
      const prices = normalizePrices(r.prices);
      const updatedAt = typeof r.updatedAt === "string" && r.updatedAt ? r.updatedAt : nowIso();
      return { schemaVersion: 1, updatedAt, prices };
    }
  }
  return defaultPriceSnapshotV1();
}

export function savePriceSnapshotV1(st: PriceSnapshotV1) {
  try {
    saveUnifiedPriceSnapshotV1(st, { dispatchEvent: false });
    window.dispatchEvent(new CustomEvent(DAA_RUNTIME_DATA_EVENT_V1));
  } catch {
    // ignore
  }
}

export function getSnapshotPrice(st: PriceSnapshotV1, symbol: string): number | null {
  const sym = normalizeSymbol(symbol);
  if (!sym) return null;
  const p = (st.prices ?? {})[sym];
  const n = toFinitePositiveNumber((p as any)?.price);
  return n;
}

export function parsePriceSnapshotText(text: string): { prices: Record<string, number>; issues: string[] } {
  const issues: string[] = [];
  const out: Record<string, number> = {};

  const raw = String(text ?? "").trim();
  if (!raw) return { prices: out, issues };

  // 1) Try JSON first.
  try {
    const parsed = JSON.parse(raw) as unknown;
    const normalized = normalizePrices(parsed);
    for (const [sym, v] of Object.entries(normalized)) out[sym] = v.price;
    if (Object.keys(out).length) return { prices: out, issues };
  } catch {
    // fall through
  }

  // 2) Parse lines like: SYMBOL 123.45 / SYMBOL=123.45 / SYMBOL: 123.45
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("//"));

  for (const line of lines) {
    const parts = line
      .replace(/,/g, " ")
      .split(/[\s:=]+/)
      .map((p) => p.trim())
      .filter(Boolean);

    if (parts.length < 2) {
      issues.push(`unrecognized line: ${line}`);
      continue;
    }

    const symbol = normalizeSymbol(parts[0]);
    const price = toFinitePositiveNumber(parts[1]);

    if (!symbol) {
      issues.push(`empty symbol in line: ${line}`);
      continue;
    }

    if (price === null) {
      issues.push(`invalid price in line: ${line}`);
      continue;
    }

    out[symbol] = price;
  }

  return { prices: out, issues };
}
