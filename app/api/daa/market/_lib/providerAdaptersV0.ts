type ProviderErrorStatus = 400 | 500 | 502;

export class ProviderAdapterError extends Error {
  readonly status: ProviderErrorStatus;

  constructor(status: ProviderErrorStatus, message: string) {
    super(message);
    this.status = status;
  }
}

export function mustGetEnvV0(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new ProviderAdapterError(500, `missing env: ${name}`);
  }
  return v.trim();
}

export function clampLimitV0(rawLimit: string | null, opts?: { defaultValue?: number; max?: number }): number {
  const defaultValue = Math.max(1, Math.trunc(opts?.defaultValue ?? 50));
  const max = Math.max(defaultValue, Math.trunc(opts?.max ?? 200));
  const parsed = Number(rawLimit ?? String(defaultValue));
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue;
  return Math.min(max, Math.trunc(parsed));
}

export function parseXueqiuCookieV0(raw: string): string {
  const compact = raw.trim();
  if (!compact) throw new ProviderAdapterError(500, "missing env: XUEQIU_TOKEN");

  // Accept either a complete cookie string (xq_a_token + u) or a bare token value.
  if (!compact.includes("=")) {
    return `xq_a_token=${compact}`;
  }

  const out: string[] = [];
  for (const part of compact.split(";")) {
    const seg = part.trim();
    if (!seg) continue;
    const eqIdx = seg.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = seg.slice(0, eqIdx).trim();
    const value = seg.slice(eqIdx + 1).trim();
    if (!key || !value) continue;
    if (key === "xq_a_token" || key === "u") out.push(`${key}=${value}`);
  }

  if (!out.length) {
    throw new ProviderAdapterError(500, "invalid XUEQIU_TOKEN format");
  }
  return out.join("; ");
}

export function getProviderErrorStatusV0(err: unknown, fallback: ProviderErrorStatus = 500): ProviderErrorStatus {
  if (err instanceof ProviderAdapterError) return err.status;
  return fallback;
}

export async function fetchTextWithTimeoutV0(url: URL, init?: RequestInit, timeoutMs = 12000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new ProviderAdapterError(502, "provider upstream timeout");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
