import { NextResponse } from "next/server";

export const runtime = "nodejs";

type LookupMarket = "US" | "HK" | "CN" | "CRYPTO" | "OTHER";
type MarketFilter = LookupMarket | "ALL";

type LookupItem = {
  symbol: string;
  name: string;
  market: LookupMarket;
  currency: string;
  price: number;
  exchange: string;
};

type CandidateRow = {
  symbol: string;
  name: string;
  market: LookupMarket;
  currency: string;
  price: number;
  exchange: string;
};

type QuoteSnapshot = {
  price: number;
  currency: string;
  exchange: string;
};

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

function clampLimit(value: string | null): number {
  const raw = Number(value || 10);
  if (!Number.isFinite(raw)) return 10;
  return Math.max(1, Math.min(20, Math.trunc(raw)));
}

function normalizeCurrency(value: unknown, fallback = "USD"): string {
  const code = String(value || "").trim().toUpperCase();
  if (!code) return fallback;
  if (code === "RMB" || code === "CNH") return "CNY";
  return code;
}

function normalizeMarketFilter(value: unknown): MarketFilter {
  const market = String(value || "").trim().toUpperCase();
  if (market === "US" || market === "HK" || market === "CN" || market === "CRYPTO" || market === "OTHER") {
    return market;
  }
  return "ALL";
}

function toPositiveNumber(...values: unknown[]): number {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function inferMarket(symbol: string, quoteType: string, exchange: string): LookupMarket {
  const upper = symbol.toUpperCase();
  const type = quoteType.toUpperCase();
  const exch = exchange.toUpperCase();

  if (type === "CRYPTOCURRENCY" || upper.includes("-USD")) return "CRYPTO";

  if (upper.endsWith(".HK") || exch.includes("HK") || exch.includes("HONG KONG")) return "HK";

  if (
    upper.endsWith(".SS")
    || upper.endsWith(".SZ")
    || exch.includes("SSE")
    || exch.includes("SHANGHAI")
    || exch.includes("SHENZHEN")
    || exch.includes("SHE")
    || exch.includes("SHG")
    || exch.includes("SHZ")
  ) {
    return "CN";
  }

  if (
    exch.includes("NYSE")
    || exch.includes("NASDAQ")
    || exch.includes("AMEX")
    || exch.includes("ARCA")
    || exch.includes("BATS")
    || exch.includes("NMS")
    || exch.includes("NYQ")
    || exch.includes("PCX")
  ) {
    return "US";
  }

  if (/^[A-Z][A-Z0-9.\-]{0,9}$/.test(upper) && !upper.includes(".")) {
    return "US";
  }

  return "OTHER";
}

function fallbackCurrencyByMarket(market: LookupMarket): string {
  if (market === "HK") return "HKD";
  if (market === "CN") return "CNY";
  return "USD";
}

function matchMarketFilter(market: LookupMarket, filter: MarketFilter): boolean {
  if (filter === "ALL") return true;
  return market === filter;
}

function buildMarketHintSymbols(query: string, filter: MarketFilter): string[] {
  const q = String(query || "").trim().toUpperCase();
  if (!q) return [];

  const out = new Set<string>();
  const digits = q.replace(/\D+/g, "");

  if (filter === "HK") {
    if (/^\d{1,5}$/.test(digits)) {
      out.add(`${digits.padStart(4, "0")}.HK`);
    }
    if (/^[A-Z0-9]{2,8}\.HK$/.test(q)) {
      out.add(q);
    }
  }

  if (filter === "CN") {
    if (/^\d{6}$/.test(digits)) {
      const suffix = digits.startsWith("6") ? "SS" : "SZ";
      out.add(`${digits}.${suffix}`);
    }
    if (/^[A-Z0-9]{2,8}\.(SS|SZ)$/.test(q)) {
      out.add(q);
    }
  }

  if (filter === "CRYPTO") {
    if (/^[A-Z0-9]{2,10}$/.test(q)) {
      out.add(`${q}-USD`);
    }
    if (/^[A-Z0-9-]{3,15}$/.test(q) && q.includes("-")) {
      out.add(q);
    }
  }

  return [...out];
}

async function fetchChartSnapshot(symbol: string): Promise<QuoteSnapshot | null> {
  const upstream = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  upstream.searchParams.set("interval", "1d");
  upstream.searchParams.set("range", "5d");

  const response = await fetch(upstream, {
    method: "GET",
    headers: {
      accept: "application/json",
      "user-agent": "Mozilla/5.0 (compatible; DAA/0.1; +https://example.invalid)",
    },
    cache: "no-store",
  });

  if (!response.ok) return null;

  const payload = await response.json().catch(() => null);
  const result = payload?.chart?.result?.[0];
  const closeValues = Array.isArray(result?.indicators?.quote?.[0]?.close) ? result.indicators.quote[0].close : [];

  let closePrice = 0;
  for (let i = closeValues.length - 1; i >= 0; i -= 1) {
    const value = Number(closeValues[i]);
    if (Number.isFinite(value) && value > 0) {
      closePrice = value;
      break;
    }
  }

  const price = toPositiveNumber(result?.meta?.regularMarketPrice, closePrice);
  if (!price) return null;

  return {
    price,
    currency: normalizeCurrency(result?.meta?.currency || "", ""),
    exchange: String(result?.meta?.fullExchangeName || result?.meta?.exchangeName || "").trim(),
  };
}

async function fetchSnapshotsBySymbols(symbols: string[]): Promise<Map<string, QuoteSnapshot>> {
  const out = new Map<string, QuoteSnapshot>();
  const uniqueSymbols = [...new Set(symbols.map((item) => String(item || "").trim().toUpperCase()).filter(Boolean))].slice(0, 25);

  await Promise.all(
    uniqueSymbols.map(async (symbol) => {
      try {
        const snapshot = await fetchChartSnapshot(symbol);
        if (snapshot) out.set(symbol, snapshot);
      } catch {
        // ignore per-symbol failures
      }
    }),
  );

  return out;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = String(url.searchParams.get("q") || "").trim();
    const limit = clampLimit(url.searchParams.get("limit"));
    const marketFilter = normalizeMarketFilter(url.searchParams.get("market"));

    if (!q) {
      return json({ ok: false, error: "missing q" }, { status: 400 });
    }

    const upstream = new URL("https://query1.finance.yahoo.com/v1/finance/search");
    upstream.searchParams.set("q", q);
    upstream.searchParams.set("quotesCount", String(limit * 3));
    upstream.searchParams.set("newsCount", "0");
    upstream.searchParams.set("enableFuzzyQuery", "true");

    const response = await fetch(upstream, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": "Mozilla/5.0 (compatible; DAA/0.1; +https://example.invalid)",
      },
      cache: "no-store",
    });

    const text = await response.text();
    if (!response.ok) {
      return json(
        {
          ok: false,
          error: "yfinance search upstream error",
          status: response.status,
          body: text.slice(0, 1600),
        },
        { status: 502 },
      );
    }

    const payload = JSON.parse(text) as Record<string, unknown>;
    const quotes = Array.isArray((payload as any)?.quotes) ? (payload as any).quotes : [];

    const orderedSymbols: string[] = [];
    const candidates = new Map<string, CandidateRow>();

    function upsertCandidate(row: CandidateRow) {
      const symbol = String(row.symbol || "").trim().toUpperCase();
      if (!symbol) return;
      if (!candidates.has(symbol)) orderedSymbols.push(symbol);

      const current = candidates.get(symbol);
      if (!current) {
        candidates.set(symbol, {
          ...row,
          symbol,
          name: row.name || symbol,
          exchange: row.exchange || "",
        });
        return;
      }

      candidates.set(symbol, {
        ...current,
        ...row,
        symbol,
        name: row.name || current.name || symbol,
        currency: row.currency || current.currency,
        exchange: row.exchange || current.exchange,
        price: current.price > 0 ? current.price : row.price,
      });
    }

    for (const row of quotes) {
      const symbol = String(row?.symbol || "").trim().toUpperCase();
      if (!symbol) continue;

      const quoteType = String(row?.quoteType || "").trim();
      const exchange = String(row?.exchange || row?.exchDisp || "").trim();
      const market = inferMarket(symbol, quoteType, exchange);

      if (!matchMarketFilter(market, marketFilter)) continue;

      const price = toPositiveNumber(row?.regularMarketPrice, row?.postMarketPrice, row?.bid, row?.ask);
      const currencyRaw = normalizeCurrency(row?.currency || "", "");
      const currency = currencyRaw || fallbackCurrencyByMarket(market);
      const name = String(row?.shortname || row?.longname || symbol).trim() || symbol;

      upsertCandidate({
        symbol,
        name,
        market,
        currency,
        price,
        exchange,
      });
    }

    const hintSymbols = buildMarketHintSymbols(q, marketFilter);
    for (const symbol of hintSymbols) {
      if (candidates.has(symbol)) continue;
      const market = inferMarket(symbol, "", "");
      if (!matchMarketFilter(market, marketFilter)) continue;
      upsertCandidate({
        symbol,
        name: symbol,
        market,
        currency: fallbackCurrencyByMarket(market),
        price: 0,
        exchange: "",
      });
    }

    const symbolsNeedingSnapshot = orderedSymbols
      .map((symbol) => candidates.get(symbol))
      .filter((row): row is CandidateRow => Boolean(row))
      .filter((row) => !(Number.isFinite(row.price) && row.price > 0))
      .map((row) => row.symbol);

    const snapshotBySymbol = await fetchSnapshotsBySymbols(symbolsNeedingSnapshot);

    const items: LookupItem[] = [];
    for (const symbol of orderedSymbols) {
      const row = candidates.get(symbol);
      if (!row) continue;

      const snapshot = snapshotBySymbol.get(symbol);
      const price = toPositiveNumber(row.price, snapshot?.price);
      if (!price) continue;

      const mergedExchange = String(row.exchange || snapshot?.exchange || "").trim();
      const mergedMarket = row.market === "OTHER" ? inferMarket(symbol, "", mergedExchange) : row.market;
      if (!matchMarketFilter(mergedMarket, marketFilter)) continue;

      items.push({
        symbol,
        name: row.name || symbol,
        market: mergedMarket,
        currency: normalizeCurrency(row.currency || snapshot?.currency || "", fallbackCurrencyByMarket(mergedMarket)),
        price,
        exchange: mergedExchange,
      });

      if (items.length >= limit) break;
    }

    return json({
      ok: true,
      source: "yfinance-search",
      query: q,
      marketFilter,
      items,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ ok: false, error: "symbol search failed", message }, { status: 502 });
  }
}
