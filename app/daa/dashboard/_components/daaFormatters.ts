const CURRENCY_SYMBOLS_: Record<string, string> = {
  USD: "$",
  EUR: "€",
  CNY: "¥",
  HKD: "HK$",
  JPY: "¥",
  GBP: "£",
};

const DATE_FORMATTER_ = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

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

function currencyPrefix(currency: string): string {
  return CURRENCY_SYMBOLS_[currency] || `${currency} `;
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

export function formatNotional(v: number): string {
  if (!Number.isFinite(v)) return "0";
  return Math.round(v).toLocaleString();
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
  } catch {
    return `${displayCurrency} ${roundedToCent.toLocaleString("en-US", {
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: hasCents ? 2 : 0,
    })}`;
  }
}

export function formatCurrencyCompact(v: number, currency = "USD"): string {
  if (!Number.isFinite(v)) return formatCurrency(0, currency);
  const displayCurrency = normalizeCurrencyCode(currency);
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
  return `${sign}${currencyPrefix(displayCurrency)}${scaledText}${unit.suffix}`;
}

export function formatDate(value: DateLike): string {
  return formatDateParts(value, DATE_FORMATTER_) || "-";
}

export function formatDateTime(value: DateLike): string {
  return formatDateParts(value, DATE_TIME_FORMATTER_, true) || "-";
}

export function formatDateRange(start: DateLike, end: DateLike): string {
  const startText = formatDate(start);
  const endText = formatDate(end);
  if (startText === "-" && endText === "-") return "-";
  if (startText === "-") return endText;
  if (endText === "-") return startText;
  return `${startText} → ${endText}`;
}
