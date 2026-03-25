/**
 * Shared normalization helpers for parsing unknown values from DB rows,
 * API bodies, and external payloads.
 */

/** Coerce unknown to a trimmed string, returning fallback on null/undefined/empty. */
export function normalizeText(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value.trim() || fallback;
  if (value == null) return fallback;
  return String(value).trim() || fallback;
}

/** Coerce unknown to a finite number, returning fallback on NaN/Infinity. */
export function toFinite(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Coerce unknown to a positive number (>0), returning fallback otherwise. */
export function toPositive(value: unknown, fallback = 0): number {
  const n = toFinite(value, NaN);
  return n > 0 ? n : fallback;
}

/** normalizeText + toUpperCase. */
export function normalizeUpper(value: unknown, fallback = ""): string {
  return normalizeText(value, fallback).toUpperCase();
}

/** Collapse consecutive whitespace to single space, then trim. */
export function normalizeCollapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
