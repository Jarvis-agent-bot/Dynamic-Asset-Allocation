export function parseRetryAfterSecondsV0(header: string | null, nowMs: number = Date.now()): number | null {
  const v = typeof header === "string" ? header.trim() : "";
  if (!v) return null;

  // RFC 9110: Retry-After can be either seconds or an HTTP-date.
  if (/^\d+$/.test(v)) {
    const s = Number(v);
    if (!Number.isFinite(s)) return null;
    return Math.max(0, Math.floor(s));
  }

  const dateMs = Date.parse(v);
  if (!Number.isFinite(dateMs)) return null;

  const deltaSeconds = Math.ceil((dateMs - nowMs) / 1000);
  return Math.max(0, deltaSeconds);
}

export function formatRateLimitedMessageV0(opts: { action?: string; retryAfterSeconds?: number | null }): string {
  const action = typeof opts.action === "string" ? opts.action.trim() : "";
  const base = action ? `Too many requests to ${action}.` : "Too many requests.";

  const s = typeof opts.retryAfterSeconds === "number" && Number.isFinite(opts.retryAfterSeconds) ? Math.max(0, Math.floor(opts.retryAfterSeconds)) : null;

  if (s === null) return `${base} Please wait a bit and try again.`;
  if (s <= 1) return `${base} Please try again in a moment.`;
  if (s < 60) return `${base} Please wait ${s}s and try again.`;

  const minutes = Math.ceil(s / 60);
  const label = minutes === 1 ? "minute" : "minutes";
  return `${base} Please wait about ${minutes} ${label} and try again.`;
}
