/**
 * Lightweight ISO date (YYYY-MM-DD) validation.
 *
 * - Enforces the exact string format
 * - Enforces a valid calendar date (e.g. rejects 2026-02-30)
 *
 * Note: This intentionally does *not* parse times or time zones.
 */
export function assertIsoDateString(d: unknown, label = "date"): asserts d is string {
  if (typeof d !== "string" || d.length === 0) {
    throw new Error(`${label} must be a non-empty string (got ${String(d)})`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    throw new Error(`${label} must match YYYY-MM-DD (got ${d})`);
  }
  const parsed = new Date(`${d}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== d) {
    throw new Error(`${label} must be a valid calendar date (got ${d})`);
  }
}
