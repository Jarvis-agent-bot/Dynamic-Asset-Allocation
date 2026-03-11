const CURRENCY_SYMBOLS_V1: Record<string, string> = {
  USD: "$",
  EUR: "€",
  CNY: "¥",
  HKD: "HK$",
  JPY: "¥",
  GBP: "£",
};

const DATE_FORMATTER_V1 = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const DATE_TIME_FORMATTER_V1 = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

type DateLikeV1 = Date | number | string | null | undefined;

function normalizeCurrencyCodeV1(currency = "USD"): string {
  const normalized = String(currency || "USD").trim().toUpperCase();
  return normalized === "RMB" ? "CNY" : normalized;
}

function currencyPrefixV1(currency: string): string {
  return CURRENCY_SYMBOLS_V1[currency] || `${currency} `;
}

function normalizeDateValueV1(value: DateLikeV1): Date | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDatePartsV1(value: DateLikeV1, formatter: Intl.DateTimeFormat, withTime = false): string | null {
  const date = normalizeDateValueV1(value);
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

export function formatNotional(v: number): string {
  if (!Number.isFinite(v)) return "0";
  return Math.round(v).toLocaleString();
}

export function formatCurrency(v: number, currency = "USD"): string {
  if (!Number.isFinite(v)) return "$0";
  const displayCurrency = normalizeCurrencyCodeV1(currency);
  try {
    return v.toLocaleString("en-US", { style: "currency", currency: displayCurrency, maximumFractionDigits: 0 });
  } catch {
    return `${displayCurrency} ${Math.round(v).toLocaleString()}`;
  }
}

export function formatCurrencyCompact(v: number, currency = "USD"): string {
  if (!Number.isFinite(v)) return formatCurrency(0, currency);
  const displayCurrency = normalizeCurrencyCodeV1(currency);
  const sign = v < 0 ? "-" : "";
  const absValue = Math.abs(v);

  if (absValue < 1000) {
    return formatCurrency(v, displayCurrency);
  }

  const units = [
    { threshold: 1_000_000_000_000, suffix: "T" },
    { threshold: 1_000_000_000, suffix: "B" },
    { threshold: 1_000_000, suffix: "M" },
    { threshold: 1_000, suffix: "K" },
  ];
  const unit = units.find((item) => absValue >= item.threshold);
  if (!unit) return formatCurrency(v, displayCurrency);

  const scaled = absValue / unit.threshold;
  const digits = scaled >= 100 ? 0 : 1;
  const scaledText = scaled.toFixed(digits).replace(/\.0$/, "");
  return `${sign}${currencyPrefixV1(displayCurrency)}${scaledText}${unit.suffix}`;
}

export function formatDateV1(value: DateLikeV1): string {
  return formatDatePartsV1(value, DATE_FORMATTER_V1) || "-";
}

export function formatDateTimeV1(value: DateLikeV1): string {
  return formatDatePartsV1(value, DATE_TIME_FORMATTER_V1, true) || "-";
}

export function formatDateRangeV1(start: DateLikeV1, end: DateLikeV1): string {
  const startText = formatDateV1(start);
  const endText = formatDateV1(end);
  if (startText === "-" && endText === "-") return "-";
  if (startText === "-") return endText;
  if (endText === "-") return startText;
  return `${startText} → ${endText}`;
}
