/**
 * Core-layer number utility — no dependencies on src/daa/.
 * Keeps the core layer pure per architecture convention.
 */

/**
 * 将 unknown 值转为有限数字，非有限值返回 fallback（默认 0）。
 */
export function toFinite(value: unknown, fallback: number = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}
