export type SymbolLookupMarketFilter = "ALL" | "US" | "HK" | "CN" | "CRYPTO";

export type SymbolLookupItem = {
  symbol: string;
  name: string;
  market: "US" | "HK" | "CN" | "CRYPTO" | "OTHER";
  currency: string;
  price: number;
  exchange: string;
};

export async function searchSymbolLookupItemsV1(input: {
  query: string;
  market: SymbolLookupMarketFilter;
  limit?: number;
}): Promise<SymbolLookupItem[]> {
  const query = String(input.query || "").trim();
  if (!query) return [];

  const params = new URLSearchParams();
  params.set("q", query);
  params.set("market", input.market || "ALL");
  params.set("limit", String(Math.max(1, Math.min(20, Math.trunc(input.limit ?? 10)))));

  const response = await fetch(`/api/daa/market/yfinance/symbol-search?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    const message = String(payload?.error?.message || payload?.error || payload?.message || `HTTP ${response.status}`);
    throw new Error(message);
  }

  const items: unknown[] = Array.isArray(payload.items) ? payload.items : [];
  return items
    .map((item) => {
      const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return {
        symbol: String(row.symbol || "").trim().toUpperCase(),
        name: String(row.name || "").trim(),
        market: String(row.market || "OTHER").trim().toUpperCase(),
        currency: String(row.currency || "USD").trim().toUpperCase(),
        price: Number(row.price || 0),
        exchange: String(row.exchange || "").trim(),
      };
    })
    .filter((item) => item.symbol && Number.isFinite(item.price) && item.price > 0) as SymbolLookupItem[];
}
