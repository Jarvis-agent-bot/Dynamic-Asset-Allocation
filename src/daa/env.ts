export function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;

  const i = Math.trunc(n);
  if (i <= 0) return fallback;

  return i;
}
