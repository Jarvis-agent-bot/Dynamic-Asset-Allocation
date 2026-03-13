import { fail, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { requireCronAuth } from "@/src/daa/cron/auth";
import { buildNewsSignals } from "@/src/daa/signals/newsSignal";
import {
  appendDaaIngestJobLog,
  getDaaSystemConfig,
  listDaaAssetUniverse,
} from "@/src/daa/store/daaStorePg";
import { parseSymbolsFromNewsQuery } from "@/src/market/yahooRssFetch";

export const runtime = "nodejs";

function normalizeUpper(value: unknown): string {
  return String(value || "").trim().toUpperCase();
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "unknown_error");
}

async function resolveSymbols(): Promise<string[]> {
  const [system, assets] = await Promise.all([
    getDaaSystemConfig(),
    listDaaAssetUniverse(),
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
  for (const symbol of parseSymbolsFromNewsQuery(newsFeed.query || "")) {
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
  return withApiHandler(async () => {
    const denied = requireCronAuth(req);
    if (denied) {
      const status = denied.status || 401;
      return fail(status === 401 ? "CRON_AUTH_FAILED" : "ROUTE_DENIED", "cron unauthorized", { status });
    }

    const startedAt = new Date().toISOString();
    let totalCount = 0;
    try {
      const symbols = await resolveSymbols();
      totalCount = symbols.length;
      if (symbols.length <= 0) {
        await appendDaaIngestJobLog({
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
        return ok({
          refreshedSymbols: 0,
          signals: 0,
          items: 0,
          at: new Date().toISOString(),
        });
      }

      const signals = await buildNewsSignals({ symbols });
      const signalRows = signals.length;
      const itemRows = signals.reduce((acc, signal) => acc + signal.items.length, 0);

      await appendDaaIngestJobLog({
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

      return ok({
        refreshedSymbols: symbols.length,
        signals: signalRows,
        items: itemRows,
        at: new Date().toISOString(),
      });
    } catch (error) {
      try {
        await appendDaaIngestJobLog({
          jobType: "cron_news_refresh",
          triggerSource: "cron_news_refresh",
          status: "failed",
          startedAt,
          finishedAt: new Date().toISOString(),
          totalCount,
          successCount: 0,
          failureCount: Math.max(1, totalCount),
          diagnosticsJson: {
            error: describeError(error),
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
