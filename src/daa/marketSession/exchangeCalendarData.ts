export type MarketSessionCode =
  | "US"
  | "HK"
  | "CN"
  | "JP"
  | "KR"
  | "TW"
  | "SG"
  | "UK"
  | "EU"
  | "CRYPTO"
  | "COMMODITY"
  | "FX"
  | "INDEX";

export type MarketSessionRange = {
  label: "regular" | "morning" | "afternoon" | "all_day";
  open: string;
  close: string;
};

export type ExchangeCalendarData = {
  timeZone: string;
  weekendDays: number[];
  sessions: MarketSessionRange[];
  holidays: string[];
  earlyCloses: Record<string, string>;
  alwaysOpen?: boolean;
};

export const EXCHANGE_CALENDAR_DATA: Record<string, ExchangeCalendarData> = {
  US: {
    timeZone: "America/New_York",
    weekendDays: [0, 6],
    sessions: [{ label: "regular", open: "09:30", close: "16:00" }],
    holidays: [
      "2026-01-01",
      "2026-01-19",
      "2026-02-16",
      "2026-04-03",
      "2026-05-25",
      "2026-06-19",
      "2026-07-03",
      "2026-09-07",
      "2026-11-26",
      "2026-12-25",
    ],
    earlyCloses: {
      "2026-11-27": "13:00",
      "2026-12-24": "13:00",
    },
  },
  HK: {
    timeZone: "Asia/Hong_Kong",
    weekendDays: [0, 6],
    sessions: [
      { label: "morning", open: "09:30", close: "12:00" },
      { label: "afternoon", open: "13:00", close: "16:00" },
    ],
    holidays: [
      "2026-01-01",
      "2026-02-17",
      "2026-02-18",
      "2026-02-19",
      "2026-04-03",
      "2026-04-06",
      "2026-04-07",
      "2026-05-01",
      "2026-05-25",
      "2026-06-19",
      "2026-07-01",
      "2026-10-01",
      "2026-10-19",
      "2026-12-25",
    ],
    earlyCloses: {
      "2026-02-16": "12:00",
      "2026-12-24": "12:00",
      "2026-12-31": "12:00",
    },
  },
  CRYPTO: {
    timeZone: "UTC",
    weekendDays: [],
    sessions: [{ label: "all_day", open: "00:00", close: "23:59" }],
    holidays: [],
    earlyCloses: {},
    alwaysOpen: true,
  },
};
