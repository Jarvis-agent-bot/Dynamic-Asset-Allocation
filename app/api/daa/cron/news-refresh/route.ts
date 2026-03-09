import { failV1, okV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { requireCronAuthV1 } from "@/src/daa/cron/authV1";
import { buildNewsSignalsV1 } from "@/src/daa/signals/newsSignalV1";
import {
  appendDaaIngestJobLogV1,
  getDaaSystemConfigV2,
  listDaaAssetUniverseV1,
} from "@/src/daa/store/daaStorePgV1";
import { parseSymbolsFromNewsQueryV1 } from "@/src/market/yahooRssFetchV1";

export const runtime = "nodejs";

function normalizeUpper(value: unknown): string {
  return String(value || "").trim().toUpperCase();
}

function describeErrorV1(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "unknown_error");
}

async function resolveSymbolsV1(): Promise<string[]> {
  const [system, assets] = await Promise.all([
    getDaaSystemConfigV2(),
    listDaaAssetUniverseV1(),
  ]);

  const out = new Set<string>();
  const newsFeed = system.config.dataSources.newsFeed;
  if (newsFeed.enabled === false) {
    return [];
  }
  for (const symbol of newsFeed.symbols || []) {
    const key = normalizeUpper(symbol);
    if (key) out.add(key);
  }
  for (const symbol of parseSymbolsFromNewsQueryV1(newsFeed.query || "")) {
    const key = normalizeUpper(symbol);
    if (key) out.add(key);
  }

  for (const row of assets) {
    if (!(row.holdingQty > 0) && row.watchEnabled === false) continue;
    const key = normalizeUpper(row.symbol);
    if (key) out.add(key);
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

    const startedAt = new Date().toISOString();
    let totalCount = 0;
    try {
      const symbols = await resolveSymbolsV1();
      totalCount = symbols.length;
      if (symbols.length <= 0) {
        await appendDaaIngestJobLogV1({
          jobType: "cron_news_refresh",
          triggerSource: "cron_news_refresh",
          status: "ok",
          startedAt,
          finishedAt: new Date().toISOString(),
          totalCount: 0,
          successCount: 0,
          failureCount: 0,
          diagnosticsJson: { reason: "no_symbols" },
        });
        return okV1({
          refreshedSymbols: 0,
          signals: 0,
          items: 0,
          at: new Date().toISOString(),
        });
      }

      const signals = await buildNewsSignalsV1({ symbols });
      const signalRows = signals.length;
      const itemRows = signals.reduce((acc, signal) => acc + signal.items.length, 0);

      await appendDaaIngestJobLogV1({
        jobType: "cron_news_refresh",
        triggerSource: "cron_news_refresh",
        status: signals.length > 0 ? "ok" : "partial",
        startedAt,
        finishedAt: new Date().toISOString(),
        totalCount: symbols.length,
        successCount: signals.length,
        failureCount: Math.max(0, symbols.length - signals.length),
        diagnosticsJson: {
          signalRows,
          itemRows,
        },
      });

      return okV1({
        refreshedSymbols: symbols.length,
        signals: signalRows,
        items: itemRows,
        at: new Date().toISOString(),
      });
    } catch (error) {
      try {
        await appendDaaIngestJobLogV1({
          jobType: "cron_news_refresh",
          triggerSource: "cron_news_refresh",
          status: "failed",
          startedAt,
          finishedAt: new Date().toISOString(),
          totalCount,
          successCount: 0,
          failureCount: Math.max(1, totalCount),
          diagnosticsJson: {
            error: describeErrorV1(error),
          },
        });
      } catch {
        // ignore job log failure
      }
      throw error;
    }
  });
}

export async function GET(req: Request) {
  return POST(req);
}
