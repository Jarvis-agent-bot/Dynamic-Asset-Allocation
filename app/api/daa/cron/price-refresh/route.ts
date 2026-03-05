import { failV1, okV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { requireCronAuthV1 } from "@/src/daa/cron/authV1";
import {
  appendPriceHistoryRowsV1,
  getDaaSystemConfigV2,
  listDaaAssetUniverseV1,
  updateDaaAssetUniverseLastPriceV1,
} from "@/src/daa/store/daaStorePgV1";
import { fetchYfinanceLatestCloseV1 } from "@/src/market/yfinanceFetchV1";
import { toYfinanceSymbolByMarketV1 } from "@/src/market/yfinanceSymbolV1";

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

type PriceTarget = {
  yfinanceSymbol: string;
};

function toPriceTargetsV1(input: {
  dataSources: Array<{ configJson: Record<string, unknown> }>;
  assetRows: Array<{ symbol: string; market: string }>;
}): PriceTarget[] {
  const out = new Map<string, PriceTarget>();

  for (const row of input.assetRows) {
    const yfinanceSymbol = toYfinanceSymbolByMarketV1(row.symbol, row.market);
    if (!yfinanceSymbol) continue;
    out.set(yfinanceSymbol, {
      yfinanceSymbol,
    });
  }

  const sourceSymbols = toSymbolsFromDataSources(input.dataSources);
  for (const symbol of sourceSymbols) {
    const yfinanceSymbol = toYfinanceSymbolByMarketV1(symbol, "US");
    if (!yfinanceSymbol || out.has(yfinanceSymbol)) continue;
    out.set(yfinanceSymbol, {
      yfinanceSymbol,
    });
  }

  return [...out.values()];
}

export async function POST(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = requireCronAuthV1(req);
    if (denied) {
      const status = denied.status || 401;
      return failV1(status === 401 ? "CRON_AUTH_FAILED" : "ROUTE_DENIED", "cron unauthorized", { status });
    }

    const [system, assetRows] = await Promise.all([getDaaSystemConfigV2(), listDaaAssetUniverseV1()]);
    const priceFeed = system.config.dataSources.priceFeed;
    const dataSources = priceFeed.enabled
      ? [{ configJson: { symbols: priceFeed.symbols } }]
      : [];
    const priceTargets = toPriceTargetsV1({ dataSources, assetRows });

    const latestBySymbol = new Map<string, { symbol: string; price: number; ts: string }>();
    for (const target of priceTargets) {
      const latest = await fetchYfinanceLatestCloseV1(target.yfinanceSymbol);
      if (!latest || !(latest.price > 0)) continue;
      latestBySymbol.set(target.yfinanceSymbol, latest);
    }
    const hits = [...latestBySymbol.values()];

    await appendPriceHistoryRowsV1(hits.map((row) => ({ ...row, source: "yfinance" })));

    const refreshedAssetKeys: string[] = [];
    for (const row of assetRows) {
      const yfinanceSymbol = toYfinanceSymbolByMarketV1(row.symbol, row.market);
      if (!yfinanceSymbol) continue;
      const latest = latestBySymbol.get(yfinanceSymbol);
      if (!latest || !(latest.price > 0)) continue;
      const updated = await updateDaaAssetUniverseLastPriceV1({
        assetKey: row.assetKey,
        lastPrice: latest.price,
        priceUpdatedAt: latest.ts,
      });
      if (updated) refreshedAssetKeys.push(updated.assetKey);
    }

    return okV1({
      refreshedSymbols: hits.length,
      symbols: hits.map((x) => x.symbol),
      refreshedAssets: refreshedAssetKeys.length,
      assetKeys: refreshedAssetKeys,
      at: new Date().toISOString(),
    });
  });
}

export async function GET(req: Request) {
  return POST(req);
}
