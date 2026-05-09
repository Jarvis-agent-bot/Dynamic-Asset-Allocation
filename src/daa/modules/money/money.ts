import { normalizeCurrencyAlias } from "@/src/daa/config/currency";

type MoneyAmount = {
  amount: number;
  currency: string;
};

type BaseMoney = MoneyAmount & {
  kind: "base";
};

type LocalMoney = MoneyAmount & {
  kind: "local";
};

type FxRateLike = {
  baseCcy?: unknown;
  quoteCcy?: unknown;
  base_ccy?: unknown;
  quote_ccy?: unknown;
  rate?: unknown;
};

export type FxRateBook = Map<string, number>;

type FxConversionResult = {
  local: LocalMoney;
  base: BaseMoney | null;
  fxRateToBase: number | null;
  fxMissing: boolean;
};

export function normalizeMoneyCurrency(value: unknown, fallback = "USD"): string {
  return normalizeCurrencyAlias(value, fallback);
}

export function normalizeMoneyPair(baseCurrency: unknown, quoteCurrency: unknown): string {
  return `${normalizeMoneyCurrency(baseCurrency)}/${normalizeMoneyCurrency(quoteCurrency)}`;
}

function toPositiveMoneyAmount(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function createLocalMoney(amount: unknown, currency: unknown, fallbackCurrency = "USD"): LocalMoney {
  return {
    kind: "local",
    amount: toPositiveMoneyAmount(amount),
    currency: normalizeMoneyCurrency(currency, fallbackCurrency),
  };
}

function createBaseMoney(amount: unknown, baseCurrency: unknown): BaseMoney {
  return {
    kind: "base",
    amount: toPositiveMoneyAmount(amount),
    currency: normalizeMoneyCurrency(baseCurrency, "USD"),
  };
}

export function buildFxRateBook(rows: FxRateLike[]): FxRateBook {
  const output: FxRateBook = new Map();
  for (const row of rows) {
    const base = normalizeMoneyCurrency(row.baseCcy ?? row.base_ccy, "");
    const quote = normalizeMoneyCurrency(row.quoteCcy ?? row.quote_ccy, "");
    const rate = Number(row.rate);
    if (!base || !quote || !Number.isFinite(rate) || rate <= 0) continue;
    output.set(normalizeMoneyPair(base, quote), rate);
  }
  return output;
}

export function resolveFxRateToBaseCurrency(
  baseCurrency: unknown,
  localCurrency: unknown,
  fxBook: FxRateBook,
): number | null {
  const base = normalizeMoneyCurrency(baseCurrency, "USD");
  const local = normalizeMoneyCurrency(localCurrency, base);
  if (local === base) return 1;
  if (local === "USDC" && base === "USD") return 1;
  if (local === "USD" && base === "USDC") return 1;

  const direct = fxBook.get(normalizeMoneyPair(local, base));
  if (direct && direct > 0) return direct;
  const reverse = fxBook.get(normalizeMoneyPair(base, local));
  if (reverse && reverse > 0) return 1 / reverse;
  return null;
}

export function convertLocalMoneyToBase(input: {
  amount: unknown;
  localCurrency: unknown;
  baseCurrency: unknown;
  fxBook: FxRateBook;
}): FxConversionResult {
  const baseCurrency = normalizeMoneyCurrency(input.baseCurrency, "USD");
  const local = createLocalMoney(input.amount, input.localCurrency, baseCurrency);
  const fxRateToBase = resolveFxRateToBaseCurrency(baseCurrency, local.currency, input.fxBook);
  const base = fxRateToBase == null
    ? null
    : createBaseMoney(local.amount * fxRateToBase, baseCurrency);

  return {
    local,
    base,
    fxRateToBase,
    fxMissing: local.amount > 0 && base == null,
  };
}
