export type DynamicRebalancePauseReasonV0 =
  | {
      kind: "paused-market-closed";
      title: string;
      detail: string;
      nextOpenAt?: Date;
    }
  | {
      kind: "stalled-data-stale";
      title: string;
      detail: string;
      priceUpdatedAt?: Date;
      ageMin?: number;
    };

function safeParseDate(x: unknown): Date | null {
  if (typeof x !== "string" || !x) return null;
  const d = new Date(x);
  return Number.isFinite(d.getTime()) ? d : null;
}

function toInt(x: string | undefined, fallback: number): number {
  const n = Number(x);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function getShanghaiParts(date: Date): { y: number; m: number; d: number; dow0Sun: number; hh: number; mm: number } {
  // Use a fixed tz so logic/tests are stable (and matches this project's default runtime tz).
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const parts = fmt.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;

  const y = toInt(get("year"), 1970);
  const m = toInt(get("month"), 1);
  const d = toInt(get("day"), 1);
  const hh = toInt(get("hour"), 0);
  const mm = toInt(get("minute"), 0);

  const weekday = String(get("weekday") ?? "");
  const dow0Sun = weekday === "Sun" ? 0 : weekday === "Mon" ? 1 : weekday === "Tue" ? 2 : weekday === "Wed" ? 3 : weekday === "Thu" ? 4 : weekday === "Fri" ? 5 : weekday === "Sat" ? 6 : 0;

  return { y, m, d, dow0Sun, hh, mm };
}

function dateFromShanghaiLocal(args: { y: number; m1: number; d: number; hh: number; mm: number }): Date {
  // Asia/Shanghai is UTC+8 with no DST.
  // Convert a Shanghai wall-clock time to an absolute timestamp.
  return new Date(Date.UTC(args.y, args.m1 - 1, args.d, args.hh - 8, args.mm, 0, 0));
}

function isCnMarketOpenShanghaiV0(now: Date): boolean {
  const p = getShanghaiParts(now);
  if (p.dow0Sun === 0 || p.dow0Sun === 6) return false;

  const min = p.hh * 60 + p.mm;
  const session1 = min >= 9 * 60 + 30 && min < 11 * 60 + 30;
  const session2 = min >= 13 * 60 && min < 15 * 60;
  return session1 || session2;
}

function computeNextCnMarketOpenShanghaiV0(now: Date): Date {
  const p = getShanghaiParts(now);

  const min = p.hh * 60 + p.mm;
  const beforeMorningOpen = min < 9 * 60 + 30;
  const lunchBreak = min >= 11 * 60 + 30 && min < 13 * 60;

  const isWeekend = p.dow0Sun === 0 || p.dow0Sun === 6;

  // Helper: advance by local days (Shanghai), ignoring DST.
  const shMidnightUtcMs = Date.UTC(p.y, p.m - 1, p.d, -8, 0, 0, 0);
  const addDays = (days: number): Date => new Date(shMidnightUtcMs + days * 24 * 60 * 60 * 1000);

  const nextTradingDayStart = (): Date => {
    let base = addDays(1);
    for (let i = 0; i < 8; i++) {
      const pp = getShanghaiParts(base);
      if (pp.dow0Sun !== 0 && pp.dow0Sun !== 6) {
        return dateFromShanghaiLocal({ y: pp.y, m1: pp.m, d: pp.d, hh: 9, mm: 30 });
      }
      base = addDays(i + 2);
    }
    // Fallback: next day 09:30.
    const pp = getShanghaiParts(addDays(1));
    return dateFromShanghaiLocal({ y: pp.y, m1: pp.m, d: pp.d, hh: 9, mm: 30 });
  };

  if (isWeekend) return nextTradingDayStart();

  if (beforeMorningOpen) return dateFromShanghaiLocal({ y: p.y, m1: p.m, d: p.d, hh: 9, mm: 30 });
  if (lunchBreak) return dateFromShanghaiLocal({ y: p.y, m1: p.m, d: p.d, hh: 13, mm: 0 });

  // If market is open, we should not be calling this.
  // If it's after close (or any other non-trading window), go to next trading day.
  return nextTradingDayStart();
}

function formatShanghaiCompact(date: Date): string {
  // Keep formatting stable regardless of env locale.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  // en-CA with these parts yields YYYY-MM-DD, then add time.
  const parts = fmt.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  const y = get("year");
  const m = get("month");
  const d = get("day");
  const hh = get("hour");
  const mm = get("minute");

  return `${y}-${m}-${d} ${hh}:${mm}`;
}

export function computeDynamicRebalancePauseReasonV0(args: {
  enabled: boolean;
  now: Date;
  priceSnapshotUpdatedAt?: string;
  priceCount?: number;
  staleAfterMin?: number;
}): DynamicRebalancePauseReasonV0 | null {
  if (!args.enabled) return null;

  const now = args.now;
  const marketOpen = isCnMarketOpenShanghaiV0(now);

  if (!marketOpen) {
    const nextOpenAt = computeNextCnMarketOpenShanghaiV0(now);
    return {
      kind: "paused-market-closed",
      title: "Paused (market closed)",
      detail: `CN market hours (Asia/Shanghai) only. Next open: ${formatShanghaiCompact(nextOpenAt)}.`,
      nextOpenAt,
    };
  }

  const priceCount = Math.max(0, args.priceCount ?? 0);
  const updatedAt = safeParseDate(args.priceSnapshotUpdatedAt);
  const staleAfterMin = Math.max(1, args.staleAfterMin ?? 60);

  const ageMin = updatedAt ? Math.floor((now.getTime() - updatedAt.getTime()) / 60000) : Number.POSITIVE_INFINITY;
  const isStale = !updatedAt || ageMin > staleAfterMin;

  if (priceCount === 0 || isStale) {
    const updatedText = updatedAt ? formatShanghaiCompact(updatedAt) : "<unknown>";
    const ageText = Number.isFinite(ageMin) ? `${ageMin}m` : ">>";

    return {
      kind: "stalled-data-stale",
      title: "Stalled (price data stale)",
      detail: `Update price snapshot before dynamic rebalance. Last update: ${updatedText} (age ~${ageText}).`,
      priceUpdatedAt: updatedAt ?? undefined,
      ageMin: Number.isFinite(ageMin) ? ageMin : undefined,
    };
  }

  return null;
}
