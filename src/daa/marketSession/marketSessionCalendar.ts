import { EXCHANGE_CALENDAR_DATA_, type MarketSessionRange } from "./exchangeCalendarData";

export type MarketSessionReasonCode =
  | "OPEN"
  | "UNSUPPORTED_MARKET"
  | "WEEKEND"
  | "HOLIDAY"
  | "BEFORE_OPEN"
  | "MIDDAY_BREAK"
  | "AFTER_CLOSE";

export type MarketSessionStatus = {
  market: string;
  timeZone: string;
  localDate: string;
  localTime: string;
  weekday: number;
  isTradingDay: boolean;
  isOpen: boolean;
  reasonCode: MarketSessionReasonCode;
  reasonZh: string;
  sessionLabel: MarketSessionRange["label"] | null;
  nextKnownOpenAt: string | null;
  nextKnownCloseAt: string | null;
};

export type MarketSessionCalendarOverride = {
  holidays?: Set<string>;
  earlyCloses?: Map<string, string>;
};

function normalizeMarket(value: unknown): string {
  return String(value || "US").trim().toUpperCase() || "US";
}

function parseHhmm(value: string): number {
  const matched = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || "").trim());
  if (!matched) return Number.NaN;
  return Number(matched[1]) * 60 + Number(matched[2]);
}

function hhmm(minuteOfDay: number): string {
  const minutes = Math.max(0, Math.min(23 * 60 + 59, Math.trunc(minuteOfDay)));
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function normalizeHour(value: unknown): number {
  const hour = Number(value);
  if (!Number.isFinite(hour)) return 0;
  return hour === 24 ? 0 : hour;
}

export function toZonedMarketDateTime(date: Date, timeZone: string): {
  date: string;
  time: string;
  minuteOfDay: number;
  weekday: number;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
    weekday: "short",
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "1970";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";
  const hour = normalizeHour(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || "0");
  const weekdayText = parts.find((part) => part.type === "weekday")?.value || "Mon";
  const weekday = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[
    weekdayText as "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat"
  ] ?? 1;
  const minuteOfDay = hour * 60 + (Number.isFinite(minute) ? minute : 0);
  return {
    date: `${year}-${month}-${day}`,
    time: hhmm(minuteOfDay),
    minuteOfDay,
    weekday,
  };
}

function reasonZh(code: MarketSessionReasonCode, market: string, localDate: string, localTime: string): string {
  switch (code) {
    case "OPEN":
      return `${market} 当前处于常规交易时段（${localDate} ${localTime}）。`;
    case "WEEKEND":
      return `${market} 当前为周末休市（${localDate} ${localTime}）。`;
    case "HOLIDAY":
      return `${market} 当前为交易所节假日休市（${localDate}）。`;
    case "BEFORE_OPEN":
      return `${market} 当前尚未开盘（${localDate} ${localTime}）。`;
    case "MIDDAY_BREAK":
      return `${market} 当前处于午间休市（${localDate} ${localTime}）。`;
    case "AFTER_CLOSE":
      return `${market} 当前已收盘（${localDate} ${localTime}）。`;
    default:
      return `${market} 缺少交易日历配置，无法判断是否开市。`;
  }
}

function sessionsForDate(sessions: MarketSessionRange[], earlyClose: string | null): MarketSessionRange[] {
  if (!earlyClose) return sessions;
  return sessions
    .map((session, index) => {
      if (index !== sessions.length - 1) return session;
      return { ...session, close: earlyClose };
    })
    .filter((session) => parseHhmm(session.open) < parseHhmm(session.close));
}

export function resolveMarketSessionStatus(input: {
  market?: string | null;
  now?: Date;
  calendarOverride?: MarketSessionCalendarOverride;
}): MarketSessionStatus {
  const market = normalizeMarket(input.market);
  const data = EXCHANGE_CALENDAR_DATA_[market];
  const now = input.now ?? new Date();

  if (!data) {
    const zoned = toZonedMarketDateTime(now, "UTC");
    return {
      market,
      timeZone: "UTC",
      localDate: zoned.date,
      localTime: zoned.time,
      weekday: zoned.weekday,
      isTradingDay: false,
      isOpen: false,
      reasonCode: "UNSUPPORTED_MARKET",
      reasonZh: reasonZh("UNSUPPORTED_MARKET", market, zoned.date, zoned.time),
      sessionLabel: null,
      nextKnownOpenAt: null,
      nextKnownCloseAt: null,
    };
  }

  const zoned = toZonedMarketDateTime(now, data.timeZone);
  if (data.alwaysOpen) {
    return {
      market,
      timeZone: data.timeZone,
      localDate: zoned.date,
      localTime: zoned.time,
      weekday: zoned.weekday,
      isTradingDay: true,
      isOpen: true,
      reasonCode: "OPEN",
      reasonZh: reasonZh("OPEN", market, zoned.date, zoned.time),
      sessionLabel: "all_day",
      nextKnownOpenAt: null,
      nextKnownCloseAt: null,
    };
  }

  const holidays = input.calendarOverride?.holidays ?? new Set(data.holidays);
  const earlyCloses = input.calendarOverride?.earlyCloses ?? new Map(Object.entries(data.earlyCloses));
  const isWeekend = data.weekendDays.includes(zoned.weekday);
  const isHoliday = holidays.has(zoned.date);
  if (isWeekend || isHoliday) {
    const code = isWeekend ? "WEEKEND" : "HOLIDAY";
    return {
      market,
      timeZone: data.timeZone,
      localDate: zoned.date,
      localTime: zoned.time,
      weekday: zoned.weekday,
      isTradingDay: false,
      isOpen: false,
      reasonCode: code,
      reasonZh: reasonZh(code, market, zoned.date, zoned.time),
      sessionLabel: null,
      nextKnownOpenAt: null,
      nextKnownCloseAt: null,
    };
  }

  const sessions = sessionsForDate(data.sessions, earlyCloses.get(zoned.date) ?? null);
  for (const session of sessions) {
    const open = parseHhmm(session.open);
    const close = parseHhmm(session.close);
    if (zoned.minuteOfDay >= open && zoned.minuteOfDay < close) {
      return {
        market,
        timeZone: data.timeZone,
        localDate: zoned.date,
        localTime: zoned.time,
        weekday: zoned.weekday,
        isTradingDay: true,
        isOpen: true,
        reasonCode: "OPEN",
        reasonZh: reasonZh("OPEN", market, zoned.date, zoned.time),
        sessionLabel: session.label,
        nextKnownOpenAt: null,
        nextKnownCloseAt: `${zoned.date}T${session.close}:00[${data.timeZone}]`,
      };
    }
  }

  const firstOpen = parseHhmm(sessions[0]?.open || "00:00");
  const lastClose = parseHhmm(sessions[sessions.length - 1]?.close || "23:59");
  const code: MarketSessionReasonCode = zoned.minuteOfDay < firstOpen
    ? "BEFORE_OPEN"
    : (zoned.minuteOfDay >= lastClose ? "AFTER_CLOSE" : "MIDDAY_BREAK");

  return {
    market,
    timeZone: data.timeZone,
    localDate: zoned.date,
    localTime: zoned.time,
    weekday: zoned.weekday,
    isTradingDay: true,
    isOpen: false,
    reasonCode: code,
    reasonZh: reasonZh(code, market, zoned.date, zoned.time),
    sessionLabel: null,
    nextKnownOpenAt: code === "BEFORE_OPEN" ? `${zoned.date}T${sessions[0]?.open}:00[${data.timeZone}]` : null,
    nextKnownCloseAt: null,
  };
}
