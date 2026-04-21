/**
 * POST /api/daa/news/realtime-event
 *
 * 接收 Alpaca WS daemon 转发的实时新闻事件。
 * - 立即写入 daa_news_item_snapshot_v1（所有 mentioned symbols）
 * - 若事件涉及持仓/watchlist symbol，同步调用 LLM 分析 → 写 signal → 命中 majorEvent 时即时 TG push
 * - 不命中持仓的新闻仅存档，由 Agent cycle 按需读取
 *
 * 需要 DAA_CRON_TOKEN 认证。
 */

import { createHash } from "node:crypto";

import { fail, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { requireCronAuth } from "@/src/daa/cron/auth";
import { clamp } from "@/src/core/math";
import { analyzeNewsWithLlm, majorEventTypeLabelZh } from "@/src/daa/signals/newsLlmAnalyzer";
import { sourceCredibility } from "@/src/daa/signals/newsProviders";
import { sendTelegramByEnv } from "@/src/daa/notify/telegram";
import { formatAssetLabel } from "@/src/daa/assetRegistry";
import { listDaaAssetUniverse, upsertDaaNewsItemSnapshots } from "@/src/daa/store/daaStorePg";
import { hasRecentMajorEventNotification } from "@/src/daa/store/notificationDeliveryLogRepo";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export const runtime = "nodejs";

const FRESHNESS_HALF_LIFE_HOURS = 72;

/** Alpaca WS news 事件的入参结构（对应 daemon 转发体） */
type AlpacaNewsEvent = {
  id: number;
  headline: string;
  summary?: string;
  author?: string;
  created_at: string;
  updated_at?: string;
  url?: string;
  content?: string;
  symbols: string[];
  source: string;
};

function validateEvent(raw: unknown): AlpacaNewsEvent | string {
  if (!raw || typeof raw !== "object") return "body must be an object";
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== "number") return "id must be number";
  if (typeof obj.headline !== "string" || !obj.headline.trim()) return "headline is required";
  if (typeof obj.created_at !== "string" || !obj.created_at) return "created_at is required";
  if (!Array.isArray(obj.symbols)) return "symbols must be array";
  return {
    id: obj.id,
    headline: obj.headline,
    summary: typeof obj.summary === "string" ? obj.summary : undefined,
    author: typeof obj.author === "string" ? obj.author : undefined,
    created_at: obj.created_at,
    updated_at: typeof obj.updated_at === "string" ? obj.updated_at : undefined,
    url: typeof obj.url === "string" ? obj.url : undefined,
    content: typeof obj.content === "string" ? obj.content : undefined,
    symbols: obj.symbols.map(String).filter(Boolean),
    source: typeof obj.source === "string" ? obj.source : "benzinga",
  };
}

function computeFreshness(publishedAt: string): number {
  const ageHours = Math.max(0, (Date.now() - Date.parse(publishedAt)) / (1000 * 60 * 60));
  return clamp(Math.pow(2, -ageHours / FRESHNESS_HALF_LIFE_HOURS), 0.08, 1);
}

function hashNewsItem(title: string, link: string | null, ts: string): string {
  return createHash("sha1").update(`${title}::${link || ""}::${ts}`).digest("hex").slice(0, 20);
}

async function pushMajorEvent(
  symbol: string,
  analysis: { type: string; impact: string; description: string } | null,
  summary: string | null,
  actionHint: string | null,
): Promise<boolean> {
  if (!analysis || analysis.impact !== "high") return false;

  try {
    const alreadySent = await hasRecentMajorEventNotification({
      symbol,
      majorEventType: analysis.type,
      withinHours: 24,
    });
    if (alreadySent) return false;
  } catch (e) {
    logSwallowed("newsRealtime.dedup", e);
    return false;
  }

  try {
    const message = [
      `⚡ ${formatAssetLabel({ symbol })} 重大新闻 (实时)`,
      ``,
      analysis.description,
      ``,
      `类型: ${majorEventTypeLabelZh(analysis.type)}`,
      `行动建议: ${actionHint || "关注"}`,
      summary ? `\n📰 ${summary}` : "",
    ].filter(Boolean).join("\n");

    await sendTelegramByEnv(message, {
      eventType: "news_major_event",
      triggerSource: "alpaca_ws_realtime",
      parseMode: null,
      requestJson: {
        symbol,
        majorEventType: analysis.type,
        majorEventDesc: analysis.description.slice(0, 200),
      },
    });
    return true;
  } catch (e) {
    logSwallowed("newsRealtime.push", e);
    return false;
  }
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = await requireCronAuth(req);
    if (denied) {
      const status = denied.status || 401;
      return fail(status === 401 ? "CRON_AUTH_FAILED" : "ROUTE_DENIED", "cron unauthorized", { status });
    }

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return fail("VALIDATION_FAILED", "invalid JSON body", { status: 400 });
    }

    const parsed = validateEvent(rawBody);
    if (typeof parsed === "string") {
      return fail("VALIDATION_FAILED", parsed, { status: 400 });
    }
    const event = parsed;

    const mentionedSymbols = [...new Set(
      event.symbols.map((s) => s.trim().toUpperCase()).filter(Boolean),
    )];
    if (mentionedSymbols.length === 0) {
      return ok({ stored: 0, analyzed: 0, pushed: 0, reason: "no symbols" });
    }

    const credibility = sourceCredibility(event.source);
    const freshness = computeFreshness(event.created_at);
    const link = event.url || null;
    const itemHash = hashNewsItem(event.headline, link, event.created_at);

    // 所有 mentioned symbol 都写入档存储，供后续 cron/observe 聚合使用
    try {
      await upsertDaaNewsItemSnapshots(
        mentionedSymbols.map((symbol) => ({
          provider: "alpaca",
          symbol,
          itemHash,
          title: event.headline,
          link,
          publishedAt: event.created_at,
          sentimentScore: 0, // reserved
          sourceCredibility: credibility,
          freshness,
        })),
      );
    } catch (e) {
      logSwallowed("newsRealtime.upsert", e);
    }

    // 判断是否命中持仓/watchlist
    let held: Set<string>;
    try {
      const assets = await listDaaAssetUniverse();
      held = new Set(
        assets
          .filter((row) => row.holdingQty > 0 || row.watchEnabled !== false)
          .map((row) => row.symbol.toUpperCase()),
      );
    } catch (e) {
      logSwallowed("newsRealtime.assets", e);
      held = new Set();
    }
    const focusSymbols = mentionedSymbols.filter((s) => held.has(s));

    let analyzed = 0;
    let pushed = 0;
    if (focusSymbols.length > 0) {
      const rawItem = {
        title: event.headline,
        summary: event.summary,
        link: link || undefined,
        publishedAt: event.created_at,
        source: event.source,
        symbols: mentionedSymbols,
        provider: "alpaca",
      };

      for (const symbol of focusSymbols) {
        try {
          const analysis = await analyzeNewsWithLlm({ symbol, items: [rawItem] });
          analyzed++;
          const wasPushed = await pushMajorEvent(
            symbol,
            analysis.majorEvent,
            analysis.summary,
            analysis.actionHint,
          );
          if (wasPushed) pushed++;
        } catch (e) {
          logSwallowed(`newsRealtime.analyze.${symbol}`, e);
        }
      }
    }

    return ok({
      stored: mentionedSymbols.length,
      analyzed,
      pushed,
      focusSymbols,
      newsId: event.id,
    });
  });
}
