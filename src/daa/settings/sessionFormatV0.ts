export function parseIsoToMsV0(raw: string): number | null {
  const iso = String(raw || "").trim();
  if (!iso) return null;

  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return ms;
}

export function formatSessionRemainingV0(expiresAt: string, nowMs: number = Date.now()): string {
  const endMs = parseIsoToMsV0(expiresAt);
  if (endMs == null) return "-";

  const diffMs = endMs - nowMs;
  if (diffMs <= 0) return "expired";

  const totalSeconds = Math.floor(diffMs / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

export function formatIsoLocalV0(raw: string): string {
  const ms = parseIsoToMsV0(raw);
  if (ms == null) return "-";
  return new Date(ms).toLocaleString();
}
