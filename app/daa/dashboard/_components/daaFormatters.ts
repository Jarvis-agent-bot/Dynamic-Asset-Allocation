import { logSwallowed } from "@/src/daa/utils/logSwallowed";

const CURRENCY_SYMBOLS_: Record<string, string> = {
  USD: "$",
  EUR: "€",
  CNY: "¥",
  HKD: "HK$",
  JPY: "¥",
  GBP: "£",
};

const DATE_TIME_FORMATTER_ = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

type DateLike = Date | number | string | null | undefined;

function normalizeCurrencyCode(currency = "USD"): string {
  const normalized = String(currency || "USD").trim().toUpperCase();
  return normalized === "RMB" ? "CNY" : normalized;
}

function normalizeDateValue(value: DateLike): Date | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateParts(value: DateLike, formatter: Intl.DateTimeFormat, withTime = false): string | null {
  const date = normalizeDateValue(value);
  if (!date) return null;

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  if (!parts.year || !parts.month || !parts.day) return null;
  if (!withTime) return `${parts.year}-${parts.month}-${parts.day}`;
  if (!parts.hour || !parts.minute) return `${parts.year}-${parts.month}-${parts.day}`;
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

export function formatPercent(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return "0.00%";
  return `${v.toFixed(digits)}%`;
}

export function formatCurrency(v: number, currency = "USD"): string {
  if (!Number.isFinite(v)) return "$0";
  const displayCurrency = normalizeCurrencyCode(currency);
  const normalized = Math.abs(v) < 0.000_001 ? 0 : v;
  const roundedToCent = Math.round(normalized * 100) / 100;
  const hasCents = Math.abs(roundedToCent - Math.trunc(roundedToCent)) > 0.000_001;
  try {
    return roundedToCent.toLocaleString("en-US", {
      style: "currency",
      currency: displayCurrency,
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: hasCents ? 2 : 0,
    });
  } catch (err) {
    logSwallowed("daaFormatters.formatCurrency", err);
    return `${displayCurrency} ${roundedToCent.toLocaleString("en-US", {
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: hasCents ? 2 : 0,
    })}`;
  }
}

export function formatDateTime(value: DateLike): string {
  return formatDateParts(value, DATE_TIME_FORMATTER_, true) || "-";
}
