import { fail, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import {
  buildAccountScopedRequestIdempotencyKey,
  buildUtcCronWindowIdempotencyKey,
  runForEachActiveDaaAccountScope,
  runIdempotentAccountScopedCronJob,
  summarizeAccountScopedCronRuns,
  unwrapSingleAccountCronResult,
} from "@/src/daa/cron/accountCronScope";
import { requireCronAuth } from "@/src/daa/cron/auth";
import { buildNewsSignals, type DaaNewsSignal } from "@/src/daa/signals/newsSignal";
import { majorEventTypeLabelZh } from "@/src/daa/signals/newsLlmAnalyzer";
import { getDaaSystemConfig, listDaaAssetUniverse } from "@/src/daa/store/daaStorePg";
import { sendTelegramByEnv } from "@/src/daa/notify/telegram";
import { parseSymbolsFromNewsQuery } from "@/src/market/yahooRssFetch";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { hasRecentMajorEventNotification } from "@/src/daa/store/notificationDeliveryLogRepo";
import { formatAssetLabel } from "@/src/daa/assetRegistry";
import { runAutopilotLoop } from "@/src/daa/agent/autopilotOrchestrator";

export const runtime = "nodejs";
export const maxDuration = 300;

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

/** 检测重大事件并发送 TG 推送（同一 symbol+type 24 小时内只推一次） */
async function checkMajorEvents(signals: DaaNewsSignal[]): Promise<number> {
  let pushed = 0;
  // 局部变量：本次执行内的快速去重（避免同一批次重复查 DB）
  const batchPushedKeys = new Set<string>();

  for (const signal of signals) {
    if (signal.llmMajorEvent && signal.llmMajorEvent.impact === "high") {
      const eventKey = `${signal.symbol}:${signal.llmMajorEvent.type}`;

      // 1) 本次批量内去重
      if (batchPushedKeys.has(eventKey)) continue;

      // 2) DB 级去重：24 小时内同一 symbol + eventType 已推过则跳过
      try {
        const alreadySent = await hasRecentMajorEventNotification({
          symbol: signal.symbol,
          majorEventType: signal.llmMajorEvent.type,
          withinHours: 24,
        });
        if (alreadySent) {
          batchPushedKeys.add(eventKey);
          continue;
        }
      } catch (e) {
        logSwallowed("newsRefresh.majorEventDedup", e);
        // DB 查询失败时保守跳过，防止误推
        continue;
      }

      try {
        const message = [
          `⚡ ${formatAssetLabel({ symbol: signal.symbol })} 重大新闻`,
          ``,
          signal.llmMajorEvent.description,
          ``,
          `类型: ${majorEventTypeLabelZh(signal.llmMajorEvent.type)}`,
          `行动建议: ${signal.llmActionHint || "关注"}`,
          signal.llmSummary ? `\n📰 ${signal.llmSummary}` : "",
        ].filter(Boolean).join("\n");

        await sendTelegramByEnv(message, {
          eventType: "news_major_event",
          triggerSource: "cron_news_refresh",
          parseMode: null,
          requestJson: {
            symbol: signal.symbol,
            majorEventType: signal.llmMajorEvent.type,
            majorEventDesc: signal.llmMajorEvent.description.slice(0, 200),
          },
        });
        batchPushedKeys.add(eventKey);
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

    const fallbackKey = buildUtcCronWindowIdempotencyKey("cron_news_refresh", 30);
    const runs = await runForEachActiveDaaAccountScope((scope) =>
      runNewsRefreshJob(req, buildAccountScopedRequestIdempotencyKey(scope, req, fallbackKey)),
    );
    const single = unwrapSingleAccountCronResult(runs);
    return ok(single ?? summarizeAccountScopedCronRuns(runs));
  });
}

async function runNewsRefreshJob(req: Request, idempotencyKey: string | null): Promise<Record<string, unknown>> {
    return runIdempotentAccountScopedCronJob({
      req,
      jobType: "cron_news_refresh",
      triggerSource: "cron_news_refresh",
      idempotencyKey,
      duplicateReason: "当前账号同一 news-refresh 幂等任务已完成，跳过重复触发。",
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
        const autopilot = majorEventsPushed > 0
          ? await runAutopilotLoop({
              source: "cron_news_refresh",
              reason: `news refresh detected ${majorEventsPushed} high-impact events`,
              affectedSymbols: signals
                .filter((signal) => signal.llmMajorEvent?.impact === "high")
                .map((signal) => signal.symbol),
            }).catch((error) => {
              logSwallowed("newsRefresh.autopilot", error);
              return {
                attempted: true,
                error: error instanceof Error ? error.message : String(error || ""),
              };
            })
          : { attempted: false, reason: "no high-impact major event" };

        return {
          refreshedSymbols: symbolsWithMarket.length,
          signals: signalRows,
          items: itemRows,
          majorEventsPushed,
          autopilot,
          at: new Date().toISOString(),
        };
      },
    });
}
