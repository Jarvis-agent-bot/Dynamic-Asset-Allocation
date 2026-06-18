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
import { isVisibleHolding } from "@/src/daa/modules/portfolio/holdingVisibility";
import { buildWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";
import { getDaaSystemConfig } from "@/src/daa/store/daaStorePg";
import { sendTelegramByEnv } from "@/src/daa/notify/telegram";
import { parseSymbolsFromNewsQuery } from "@/src/market/yahooRssFetch";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { hasRecentMajorEventNotification } from "@/src/daa/store/notificationDeliveryLogRepo";
import { formatAssetLabel } from "@/src/daa/assetRegistry";
import { isActionableNewsForAutopilot, runNewsAutopilotDaily } from "@/src/daa/automation/newsAutopilotTrigger";

export const runtime = "nodejs";
export const maxDuration = 300;

function normalizeUpper(value: unknown): string {
  return String(value || "").trim().toUpperCase();
}

type SymbolWithMarket = { symbol: string; market: string };

/** 将 region 映射到 newsProvider 需要的 market */
function regionToMarket(region: string): string {
  const map: Record<string, string> = { US: "US", HK: "HK", CN: "CN", KR: "KR", JP: "JP", EU: "EU", COMMODITY: "COMMODITY" };
  return map[region.toUpperCase()] || "US";
}

/** 根据 symbol 后缀猜测 market（针对非 asset universe 来源的 symbol） */
function guessMarketFromSymbol(symbol: string): string {
  if (symbol.includes("=F")) return "COMMODITY";
  if (symbol.endsWith(".HK")) return "HK";
  if (symbol.endsWith(".SS") || symbol.endsWith(".SZ")) return "CN";
  if (symbol.endsWith(".KS")) return "KR";
  if (symbol.endsWith(".T")) return "JP";
  return "US";
}

async function resolveSymbolsWithMarket(): Promise<SymbolWithMarket[]> {
  const [system, bootstrap] = await Promise.all([
    getDaaSystemConfig(),
    buildWorkbenchBootstrap({ syncPrices: false }),
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
  for (const row of bootstrap.assetUniverse) {
    if (!isVisibleHolding(row) && row.watchEnabled === false) continue;
    const key = normalizeUpper(row.symbol);
    const market = normalizeUpper(row.market) || regionToMarket(row.region || "US");
    if (key && !seen.has(key)) seen.set(key, { symbol: key, market });
  }

  return [...seen.values()];
}

type MajorEventRefreshResult = {
  pushed: number;
  highImpactSymbols: string[];
  actionableSymbols: string[];
};

/** 检测重大事件并发送 TG 推送（同一 symbol+type 24 小时内只推一次） */
async function checkMajorEvents(signals: DaaNewsSignal[]): Promise<MajorEventRefreshResult> {
  let pushed = 0;
  const highImpactSymbols = new Set<string>();
  const actionableSymbols = new Set<string>();
  // 局部变量：本次执行内的快速去重（避免同一批次重复查 DB）
  const batchPushedKeys = new Set<string>();

  for (const signal of signals) {
    if (isActionableNewsForAutopilot({
      impact: signal.llmMajorEvent?.impact,
      actionHint: signal.llmActionHint,
    })) {
      actionableSymbols.add(signal.symbol);
    }
    if (signal.llmMajorEvent && signal.llmMajorEvent.impact === "high") {
      const eventKey = `${signal.symbol}:${signal.llmMajorEvent.type}`;
      highImpactSymbols.add(signal.symbol);

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
  return { pushed, highImpactSymbols: [...highImpactSymbols], actionableSymbols: [...actionableSymbols] };
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
        const autopilot = result.autopilot as Record<string, unknown> | undefined;
        const rebalance = autopilot?.rebalance as Record<string, unknown> | undefined;
        const autoExecute = rebalance?.autoExecute as Record<string, unknown> | undefined;
        return {
          symbols: result.refreshedSymbols,
          signals: result.signals,
          majorEvents: result.majorEventsPushed,
          autopilotAttempted: autopilot?.attempted ?? null,
          autopilotSkipped: autopilot?.skipped ?? null,
          autopilotReason: autopilot?.reason ?? null,
          autopilotCycleId: rebalance?.cycleId ?? null,
          autopilotAutoExecutedOrders: autoExecute?.ordersCount ?? 0,
        };
      },
      handler: async () => {
        const symbolsWithMarket = await resolveSymbolsWithMarket();
        if (symbolsWithMarket.length === 0) {
          return {
            refreshedSymbols: 0,
            signals: 0,
            items: 0,
            majorEventsDetected: 0,
            majorEventSymbols: [],
            majorEventsPushed: 0,
            autopilot: { attempted: false, reason: "no symbols" },
          };
        }

        const signals = await buildNewsSignals({ symbolsWithMarket });
        const signalRows = signals.length;
        const itemRows = signals.reduce((acc, s) => acc + s.items.length, 0);

        // 检测重大事件 → TG 即时推送
        const majorEvents = await checkMajorEvents(signals);
        const autopilotSymbols = majorEvents.actionableSymbols.length > 0
          ? majorEvents.actionableSymbols
          : majorEvents.highImpactSymbols;
        const autopilot = autopilotSymbols.length > 0
          ? await runNewsAutopilotDaily({
              req,
              source: "cron_news_refresh",
              reason: `daily news autopilot detected ${autopilotSymbols.length} actionable news signals`,
              affectedSymbols: autopilotSymbols,
            }).catch((error) => {
              logSwallowed("newsRefresh.autopilot", error);
              return {
                attempted: true,
                error: error instanceof Error ? error.message : String(error || ""),
              };
            })
          : { attempted: false, reason: "no actionable news signal" };

        return {
          refreshedSymbols: symbolsWithMarket.length,
          signals: signalRows,
          items: itemRows,
          majorEventsDetected: majorEvents.highImpactSymbols.length,
          majorEventSymbols: majorEvents.highImpactSymbols,
          majorEventsPushed: majorEvents.pushed,
          autopilot,
          at: new Date().toISOString(),
        };
      },
    });
}
