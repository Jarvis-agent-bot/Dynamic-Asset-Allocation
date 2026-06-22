export type SeriesCoverage = {
  pointCount: number;
  dateCount: number;
  startDate: string;
  endDate: string;
  historicalMaxGapDays: number;
  recentMaxGapDays: number;
  warningGapDays: number;
};

const DEFAULT_RECENT_WINDOW_DAYS = 14;
const DEFAULT_WARNING_GAP_DAYS = 3;

function normalizeDate(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = Date.parse(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

function daysBetween(leftDate: string, rightDate: string): number {
  const left = Date.parse(`${leftDate}T00:00:00.000Z`);
  const right = Date.parse(`${rightDate}T00:00:00.000Z`);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return 0;
  return Math.max(0, Math.round((right - left) / 86_400_000));
}

function cutoffDate(endDate: string, recentWindowDays: number): string {
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  if (!Number.isFinite(end)) return endDate;
  return new Date(end - recentWindowDays * 86_400_000).toISOString().slice(0, 10);
}

function maxDateGap(dates: string[]): number {
  let maxGapDays = 0;
  for (let index = 1; index < dates.length; index += 1) {
    maxGapDays = Math.max(maxGapDays, daysBetween(dates[index - 1], dates[index]));
  }
  return maxGapDays;
}

export function summarizeSeriesCoverage(
  data: Array<Record<string, unknown>>,
  options: {
    recentWindowDays?: number;
    warningGapDays?: number;
    todayDate?: string;
  } = {},
): SeriesCoverage | null {
  const dates = data
    .map((point) => String(point.date || ""))
    .filter(Boolean)
    .sort();
  if (dates.length === 0) return null;

  const uniqueDates = [...new Set(dates)];
  const startDate = uniqueDates[0];
  const endDate = uniqueDates[uniqueDates.length - 1];
  const recentWindowDays = Math.max(1, Math.trunc(options.recentWindowDays ?? DEFAULT_RECENT_WINDOW_DAYS));
  const warningGapThreshold = Math.max(1, Math.trunc(options.warningGapDays ?? DEFAULT_WARNING_GAP_DAYS));
  const todayDate = normalizeDate(options.todayDate) ?? new Date().toISOString().slice(0, 10);
  const recentReferenceDate = todayDate > endDate ? todayDate : endDate;
  const recentStartDate = cutoffDate(recentReferenceDate, recentWindowDays);
  const recentDates = uniqueDates.filter((date) => date >= recentStartDate);
  const staleGapDays = todayDate > endDate ? daysBetween(endDate, todayDate) : 0;
  const recentMaxGapDays = Math.max(maxDateGap(recentDates), staleGapDays);

  return {
    pointCount: dates.length,
    dateCount: uniqueDates.length,
    startDate,
    endDate,
    historicalMaxGapDays: maxDateGap(uniqueDates),
    recentMaxGapDays,
    warningGapDays: recentMaxGapDays > warningGapThreshold ? recentMaxGapDays : 0,
  };
}
