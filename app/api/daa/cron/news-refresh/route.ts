import { fail, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { requireCronAuth } from "@/src/daa/cron/auth";
import { runLoggedJob } from "@/src/daa/jobs/jobService";
import { buildNewsSignals, type DaaNewsSignal } from "@/src/daa/signals/newsSignal";
import { getDaaSystemConfig, listDaaAssetUniverse } from "@/src/daa/store/daaStorePg";
import { sendTelegramByEnv } from "@/src/daa/notify/telegram";
import { parseSymbolsFromNewsQuery } from "@/src/market/yahooRssFetch";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { createHash } from "crypto";

export const runtime = "nodejs";

function normalizeUpper(value: unknown): string {
  return String(value || "").trim().toUpperCase();
}

type SymbolWithMarket = { symbol: string; market: string };

/** 将 region (US/HK/CN) 映射到 newsProvider 需要的 market */
function regionToMarket(region: string): string {
  const map: Record<string, string> = { US: "US", HK: "HK", CN: "CN", JP: "JP", EU: "EU" };
  return map[region.toUpperCase()] || "US";
}

/** 根据 symbol 后缀猜测 market（针对非 asset universe 来源的 symbol） */
function guessMarketFromSymbol(symbol: string): string {
  if (symbol.endsWith(".HK")) return "HK";
  if (symbol.endsWith(".SS") || symbol.endsWith(".SZ")) return "CN";
  if (symbol.endsWith(".T")) return "JP";
  return "US";
}

async function resolveSymbolsWithMarket(): Promise<SymbolWithMarket[]> {
  const [system, assets] = await Promise.all([
    getDaaSystemConfig(),
    listDaaAssetUniverse(),
  ]);

  const seen = new Map<string, SymbolWithMarket>();
  const newsFeed = system.config.dataSources.newsFeed;
  if (newsFeed.enabled === false) return [];

  for (const symbol of newsFeed.symbols || []) {
    const key = normalizeUpper(symbol);
    if (key && !seen.has(key)) seen.set(key, { symbol: key, market: guessMarketFromSymbol(key) });
  }
  for (const symbol of parseSymbolsFromNewsQuery(newsFeed.query || "")) {
    const key = normalizeUpper(symbol);
    if (key && !seen.has(key)) seen.set(key, { symbol: key, market: guessMarketFromSymbol(key) });
  }
  for (const row of assets) {
    if (!(row.holdingQty > 0) && row.watchEnabled === false) continue;
    const key = normalizeUpper(row.symbol);
    if (key && !seen.has(key)) seen.set(key, { symbol: key, market: regionToMarket(row.region || "US") });
  }

  return [...seen.values()];
}

/** 已推送事件缓存（内存级，重启后清空；DB 级去重通过 notification_delivery_log 实现） */
const pushedEventKeys = new Set<string>();

/** 检测重大事件并发送 TG 推送（同一事件只推一次） */
async function checkMajorEvents(signals: DaaNewsSignal[]): Promise<number> {
  let pushed = 0;
  for (const signal of signals) {
    if (signal.llmMajorEvent && signal.llmMajorEvent.impact === "high") {
      // 去重 key = symbol + 事件类型 + 描述 hash（避免截断碰撞）
      const descHash = createHash("sha256").update(signal.llmMajorEvent.description).digest("hex").slice(0, 12);
      const eventKey = `${signal.symbol}:${signal.llmMajorEvent.type}:${descHash}`;
      if (pushedEventKeys.has(eventKey)) continue;

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
        pushedEventKeys.add(eventKey);
        pushed++;
      } catch (e) {
        logSwallowed("newsRefresh.majorEventPush", e);
      }
    }
  }
  // 防止内存无限增长：超过 200 条时清理最早的
  if (pushedEventKeys.size > 200) {
    const arr = [...pushedEventKeys];
    for (let i = 0; i < arr.length - 100; i++) pushedEventKeys.delete(arr[i]);
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
        const symbolsWithMarket = await resolveSymbolsWithMarket();
        if (symbolsWithMarket.length === 0) {
          return { refreshedSymbols: 0, signals: 0, items: 0, majorEventsPushed: 0 };
        }

        const signals = await buildNewsSignals({ symbolsWithMarket });
        const signalRows = signals.length;
        const itemRows = signals.reduce((acc, s) => acc + s.items.length, 0);

        // 检测重大事件 → TG 即时推送
        const majorEventsPushed = await checkMajorEvents(signals);

        return {
          refreshedSymbols: symbolsWithMarket.length,
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
