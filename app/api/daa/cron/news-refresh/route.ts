import { fail, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { requireCronAuth } from "@/src/daa/cron/auth";
import { runLoggedJob } from "@/src/daa/jobs/jobService";
import { buildNewsSignals, type DaaNewsSignal } from "@/src/daa/signals/newsSignal";
import { getDaaSystemConfig, listDaaAssetUniverse } from "@/src/daa/store/daaStorePg";
import { sendTelegramByEnv } from "@/src/daa/notify/telegram";
import { parseSymbolsFromNewsQuery } from "@/src/market/yahooRssFetch";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export const runtime = "nodejs";

function normalizeUpper(value: unknown): string {
  return String(value || "").trim().toUpperCase();
}

async function resolveSymbols(): Promise<string[]> {
  const [system, assets] = await Promise.all([
    getDaaSystemConfig(),
    listDaaAssetUniverse(),
  ]);

  const out = new Set<string>();
  const newsFeed = system.config.dataSources.newsFeed;
  if (newsFeed.enabled === false) return [];

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

/** 检测重大事件并发送 TG 推送 */
async function checkMajorEvents(signals: DaaNewsSignal[]): Promise<number> {
  let pushed = 0;
  for (const signal of signals) {
    if (signal.llmMajorEvent && signal.llmMajorEvent.impact === "high") {
      try {
        const message = [
          `⚡ ${signal.symbol} 重大新闻`,
          ``,
          signal.llmMajorEvent.description,
          ``,
          `类型: ${signal.llmMajorEvent.type}`,
          `行动建议: ${signal.llmActionHint || "关注"}`,
          signal.llmSummary ? `\n📰 ${signal.llmSummary}` : "",
        ].filter(Boolean).join("\n");

        await sendTelegramByEnv(message, {
          eventType: "news_major_event",
          triggerSource: "cron_news_refresh",
          parseMode: null,
        });
        pushed++;
      } catch (e) {
        logSwallowed("newsRefresh.majorEventPush", e);
      }
    }
  }
  return pushed;
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = await requireCronAuth(req);
    if (denied) {
      const status = denied.status || 401;
      return fail(status === 401 ? "CRON_AUTH_FAILED" : "ROUTE_DENIED", "cron unauthorized", { status });
    }

    const execution = await runLoggedJob({
      req,
      jobType: "cron_news_refresh",
      triggerSource: "cron_news_refresh",
      idempotencyKey: req.headers.get("x-daa-idempotency-key"),
      summarize: (r) => {
        const result = r as Record<string, unknown>;
        return { symbols: result.refreshedSymbols, signals: result.signals, majorEvents: result.majorEventsPushed };
      },
      handler: async () => {
        const symbols = await resolveSymbols();
        if (symbols.length === 0) {
          return { refreshedSymbols: 0, signals: 0, items: 0, majorEventsPushed: 0 };
        }

        const signals = await buildNewsSignals({ symbols });
        const signalRows = signals.length;
        const itemRows = signals.reduce((acc, s) => acc + s.items.length, 0);

        // 检测重大事件 → TG 即时推送
        const majorEventsPushed = await checkMajorEvents(signals);

        return {
          refreshedSymbols: symbols.length,
          signals: signalRows,
          items: itemRows,
          majorEventsPushed,
          at: new Date().toISOString(),
        };
      },
    });

    return ok({
      ...(execution.result as Record<string, unknown>),
      requestId: execution.requestId,
      jobId: execution.jobId,
      durationMs: execution.durationMs,
    });
  });
}
