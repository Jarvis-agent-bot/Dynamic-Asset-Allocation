export type RebalanceScheduleCadenceV0 = "daily" | "weekly";

// Local schedule config for dynamic rebalancing runs.
//
// Notes:
// - `timeLocalHHMM` is a UI-friendly wall-clock string, interpreted in the user's local timezone.
// - For `weekly`, `weekday0Sun` follows JS Date.getDay(): 0=Sun .. 6=Sat.
export type RebalanceScheduleV1 = {
  enabled: boolean;
  cadence: RebalanceScheduleCadenceV0;
  timeLocalHHMM: string;
  weekday0Sun?: number; // only for weekly
};

export function defaultRebalanceScheduleV1(): RebalanceScheduleV1 {
  return {
    enabled: false,
    cadence: "weekly",
    timeLocalHHMM: "09:30",
    weekday0Sun: 1, // Mon
  };
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

export function parseTimeLocalHHMM(timeLocalHHMM: string): { hh: number; mm: number } | null {
  const raw = String(timeLocalHHMM ?? "").trim();
  const m = raw.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!m) return null;
  return { hh: Number(m[1]), mm: Number(m[2]) };
}

function normalizeWeekday0Sun(x: unknown): number {
  const n = typeof x === "number" ? x : Number(x);
  if (!Number.isFinite(n)) return 1;
  const i = Math.trunc(n);
  if (i < 0) return 0;
  if (i > 6) return 6;
  return i;
}

export function normalizeRebalanceScheduleInputV1(x: unknown): RebalanceScheduleV1 {
  const d = defaultRebalanceScheduleV1();
  if (!isPlainObject(x)) return d;

  const enabled = !!x.enabled;
  const cadence: RebalanceScheduleCadenceV0 = x.cadence === "daily" || x.cadence === "weekly" ? x.cadence : d.cadence;

  const timeLike = typeof x.timeLocalHHMM === "string" ? x.timeLocalHHMM : d.timeLocalHHMM;
  const parsed = parseTimeLocalHHMM(timeLike);
  const timeLocalHHMM = parsed ? timeLike : d.timeLocalHHMM;

  const weekday0Sun = cadence === "weekly" ? normalizeWeekday0Sun(x.weekday0Sun) : undefined;

  return { enabled, cadence, timeLocalHHMM, weekday0Sun };
}

export function computeNextRunAtLocalV0(schedule: RebalanceScheduleV1, now: Date): Date | null {
  if (!schedule.enabled) return null;

  const t = parseTimeLocalHHMM(schedule.timeLocalHHMM);
  if (!t) return null;

  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  if (schedule.cadence === "daily") {
    const candidate = new Date(y, m, d, t.hh, t.mm, 0, 0);
    if (candidate.getTime() > now.getTime()) return candidate;

    const next = new Date(candidate);
    next.setDate(candidate.getDate() + 1);
    return next;
  }

  // weekly
  const weekday0Sun = normalizeWeekday0Sun(schedule.weekday0Sun);
  const nowDow = now.getDay();
  let diff = (weekday0Sun - nowDow + 7) % 7;

  const candidate = new Date(y, m, d, t.hh, t.mm, 0, 0);
  candidate.setDate(candidate.getDate() + diff);

  // If it's today and the scheduled time has passed (or is exactly now), move to next week.
  if (diff === 0 && candidate.getTime() <= now.getTime()) {
    candidate.setDate(candidate.getDate() + 7);
  }

  return candidate;
}

// Computes the most recent scheduled wall-clock run time (local) that is <= now.
// Useful for detecting missed/overdue schedule ticks.
export function computeMostRecentScheduledAtLocalV0(schedule: RebalanceScheduleV1, now: Date): Date | null {
  const t = parseTimeLocalHHMM(schedule.timeLocalHHMM);
  if (!t) return null;

  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  if (schedule.cadence === "daily") {
    const today = new Date(y, m, d, t.hh, t.mm, 0, 0);
    if (today.getTime() <= now.getTime()) return today;

    const prev = new Date(today);
    prev.setDate(today.getDate() - 1);
    return prev;
  }

  // weekly
  const weekday0Sun = normalizeWeekday0Sun(schedule.weekday0Sun);
  const nowDow = now.getDay();
  const diffBack = (nowDow - weekday0Sun + 7) % 7;

  const candidate = new Date(y, m, d, t.hh, t.mm, 0, 0);
  candidate.setDate(candidate.getDate() - diffBack);

  // If it's today and the scheduled time hasn't happened yet, go back a week.
  if (diffBack === 0 && candidate.getTime() > now.getTime()) {
    candidate.setDate(candidate.getDate() - 7);
  }

  return candidate;
}
