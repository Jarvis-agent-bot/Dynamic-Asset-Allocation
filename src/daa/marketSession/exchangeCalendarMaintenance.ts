import { EXCHANGE_CALENDAR_DATA_ } from "./exchangeCalendarData";

type ExchangeCalendarMaintenanceInput = {
  requiredMarkets: string[];
  requiredYears: number[];
};

type ExchangeCalendarMaintenanceResult = {
  ok: boolean;
  issues: string[];
};

function normalizeMarket(value: unknown): string {
  return String(value || "").trim().toUpperCase();
}

function normalizeYear(value: unknown): number | null {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  return year;
}

function dateYear(value: string): number | null {
  const matched = /^(\d{4})-\d{2}-\d{2}$/.exec(String(value || "").trim());
  return matched ? Number(matched[1]) : null;
}

export function validateExchangeCalendarMaintenance(
  input: ExchangeCalendarMaintenanceInput,
): ExchangeCalendarMaintenanceResult {
  const requiredMarkets = [...new Set(input.requiredMarkets.map(normalizeMarket).filter(Boolean))];
  const requiredYears = [...new Set(input.requiredYears.map(normalizeYear).filter((year): year is number => year != null))];
  const issues: string[] = [];

  for (const market of requiredMarkets) {
    const data = EXCHANGE_CALENDAR_DATA_[market];
    if (!data) {
      issues.push(`${market} 缺少交易所日历配置`);
      continue;
    }
    if (data.alwaysOpen) continue;

    const coveredYears = new Set<number>();
    for (const holiday of data.holidays) {
      const year = dateYear(holiday);
      if (year != null) coveredYears.add(year);
    }
    for (const earlyClose of Object.keys(data.earlyCloses)) {
      const year = dateYear(earlyClose);
      if (year != null) coveredYears.add(year);
    }

    for (const year of requiredYears) {
      if (!coveredYears.has(year)) {
        issues.push(`${market} 缺少 ${year} 年交易所节假日 / 半日市日历`);
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}
