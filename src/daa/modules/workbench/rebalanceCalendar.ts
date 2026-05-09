import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { normalizeText } from "@/src/daa/utils/normalize";

export type CalendarFrequency = "every_3_days" | "weekly" | "monthly" | "quarterly" | "semi_annual" | "annual";

export function toIsoByMs(ms: number): string {
  return new Date(ms).toISOString();
}

export function normalizeTimeZoneOrUtc(value: unknown): string {
  const text = normalizeText(value);
  if (!text) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: text }).format(new Date());
    return text;
  } catch (err) {
    logSwallowed("rebalanceCalendar.resolveTimezone", err);
    return "UTC";
  }
}

function toUtcMinuteOfDay(value: string): number | null {
  const matched = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(normalizeText(value));
  if (!matched) return null;
  return Number(matched[1]) * 60 + Number(matched[2]);
}

export function isPastUtcTime(now: Date, hhmm: string): boolean {
  const minute = toUtcMinuteOfDay(hhmm);
  if (minute == null) return true;
  const nowMinute = now.getUTCHours() * 60 + now.getUTCMinutes();
  return nowMinute >= minute;
}

export function getZonedYmd(date: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
} {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(date);
    const year = Number(parts.find((item) => item.type === "year")?.value || "");
    const month = Number(parts.find((item) => item.type === "month")?.value || "");
    const day = Number(parts.find((item) => item.type === "day")?.value || "");
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      return { year, month, day };
    }
  } catch (err) {
    logSwallowed("rebalanceCalendar.parseConfig", err);
  }
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

export function isCalendarMonthDue(month: number, frequency: CalendarFrequency): boolean {
  // 高频周期不依赖月份判断，实际间隔由 nextCalendarDueDate 控制。
  if (frequency === "every_3_days" || frequency === "weekly" || frequency === "monthly") return true;
  if (frequency === "quarterly") return month === 1 || month === 4 || month === 7 || month === 10;
  if (frequency === "semi_annual") return month === 1 || month === 7;
  return month === 1;
}

export function buildCalendarPeriodKey(input: {
  date: Date;
  timeZone: string;
  frequency: CalendarFrequency;
}): string {
  const { year, month, day } = getZonedYmd(input.date, input.timeZone);
  if (input.frequency === "every_3_days") {
    const epochDay = Math.floor(input.date.getTime() / 86_400_000);
    return `3d-${Math.floor(epochDay / 3)}`;
  }
  if (input.frequency === "weekly") {
    const d = new Date(Date.UTC(year, month - 1, day));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
  }
  if (input.frequency === "annual") return `${year}`;
  if (input.frequency === "semi_annual") return `${year}-H${month <= 6 ? 1 : 2}`;
  if (input.frequency === "quarterly") return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function nextCalendarDueDate(input: {
  frequency: CalendarFrequency;
  dayOfMonth: number;
  nowMs?: number;
}): string {
  const now = new Date(input.nowMs ?? Date.now());

  if (input.frequency === "every_3_days") {
    const candidate = new Date(now.getTime() + 3 * 86_400_000);
    candidate.setUTCHours(0, 0, 0, 0);
    return toIsoByMs(candidate.getTime());
  }

  if (input.frequency === "weekly") {
    const candidate = new Date(now.getTime());
    candidate.setUTCHours(0, 0, 0, 0);
    const daysUntilMonday = (8 - (candidate.getUTCDay() || 7)) % 7 || 7;
    candidate.setUTCDate(candidate.getUTCDate() + daysUntilMonday);
    return toIsoByMs(candidate.getTime());
  }

  const stepMonths = input.frequency === "quarterly"
    ? 3
    : (input.frequency === "semi_annual" ? 6 : (input.frequency === "annual" ? 12 : 1));
  const day = Math.max(1, Math.min(28, Math.trunc(input.dayOfMonth || 1)));
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth();
  let candidate = Date.UTC(year, month, day, 0, 0, 0, 0);
  while (candidate <= now.getTime()) {
    month += stepMonths;
    while (month > 11) {
      month -= 12;
      year += 1;
    }
    candidate = Date.UTC(year, month, day, 0, 0, 0, 0);
  }
  return toIsoByMs(candidate);
}
