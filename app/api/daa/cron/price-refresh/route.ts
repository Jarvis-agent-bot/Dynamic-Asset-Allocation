import { failV1, okV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { requireCronAuthV1 } from "@/src/daa/cron/authV1";
import {
  appendPriceHistoryRowsV1,
  listDaaDataSourcesV1,
  listDaaPositionsV1,
  replaceDaaPositionsV1,
} from "@/src/daa/store/daaStorePgV1";
import { fetchYfinanceLatestCloseV1 } from "@/src/market/yfinanceFetchV1";

export const runtime = "nodejs";

function toSymbolsFromDataSources(dataSources: Array<{ configJson: Record<string, unknown> }>): string[] {
  const out = new Set<string>();
  for (const source of dataSources) {
    const symbolsRaw = (source.configJson as any)?.symbols;
    if (Array.isArray(symbolsRaw)) {
      for (const symbol of symbolsRaw) {
        const key = String(symbol || "").trim().toUpperCase();
        if (key) out.add(key);
      }
      continue;
    }

    if (typeof symbolsRaw === "string") {
      for (const part of symbolsRaw.split(",")) {
        const key = String(part || "").trim().toUpperCase();
        if (key) out.add(key);
      }
    }
  }
  return [...out];
}

export async function POST(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = requireCronAuthV1(req);
    if (denied) {
      const status = denied.status || 401;
      return failV1(status === 401 ? "CRON_AUTH_FAILED" : "ROUTE_DENIED", "cron unauthorized", { status });
    }

    const dataSources = await listDaaDataSourcesV1("price_feed");
    const positions = await listDaaPositionsV1();
    const symbols = new Set<string>(toSymbolsFromDataSources(dataSources));
    for (const position of positions) symbols.add(position.symbol);

    const hits: Array<{ symbol: string; price: number; ts: string }> = [];
    for (const symbol of symbols) {
      const latest = await fetchYfinanceLatestCloseV1(symbol);
      if (latest) hits.push(latest);
    }

    await appendPriceHistoryRowsV1(hits.map((row) => ({ ...row, source: "yfinance" })));

    if (hits.length > 0 && positions.length > 0) {
      const latestMap = new Map(hits.map((x) => [x.symbol, x.price]));
      const updated = positions.map((position) => {
        const nextPrice = latestMap.get(position.symbol);
        if (!nextPrice || nextPrice <= 0) return position;
        return {
          ...position,
          price: Number(nextPrice.toFixed(6)),
        };
      });
      await replaceDaaPositionsV1(updated);
    }

    return okV1({
      refreshedSymbols: hits.length,
      symbols: hits.map((x) => x.symbol),
      at: new Date().toISOString(),
    });
  });
}

export async function GET(req: Request) {
  return POST(req);
}
