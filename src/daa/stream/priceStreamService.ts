/**
 * SSE 价格流服务 — 从 DB 缓存读取价格，计算 diff，生成 SSE 事件。
 * 不直接调用外部 API，零额外市场数据压力。
 *
 * 安全设计：
 * - 全局连接计数器，上限 MAX_GLOBAL_STREAMS (10)
 * - 共享单例轮询：一个 timer 读 DB，扇出到所有活跃流
 * - 默认 3 秒轮询间隔（DB 缓存 15 分钟刷新，无需更快）
 */

import { batchReadAssetPriceSnapshots, type AssetPriceSnapshot } from "@/src/daa/store/assetUniverseStore";
import { appendDaaMarketPriceHistoryRows, upsertDaaMarketPriceSnapshots } from "@/src/daa/store/daaStorePg";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { toYfinanceSymbolByMarket } from "@/src/market/yfinanceSymbol";
import { getYahooRealtimeQuoteHub, type YahooRealtimePriceUpdate } from "@/src/market/yahooRealtime";

type PriceUpdateEvent = {
  type: "price_update";
  data: Record<string, { price: number; ts: string; delta: number; currency: string; source?: string }>;
};

type HeartbeatEvent = {
  type: "heartbeat";
  ts: string;
};

export type RealtimePriceAsset = {
  assetKey: string;
  market: string;
  symbol: string;
  yfinanceSymbol: string;
  currency: string;
};

export type RealtimePriceUpdate = {
  assetKey: string;
  price: number;
  ts: string;
  currency: string;
  source: string;
  change?: number;
};

export type RealtimePriceSubscription = (
  assets: RealtimePriceAsset[],
  onUpdate: (update: RealtimePriceUpdate) => void,
) => () => void;

// --- 全局连接限制 ---
const MAX_GLOBAL_STREAMS = 10;
let activeStreamCount = 0;

function inferCurrency(market: string): string {
  if (market === "HK") return "HKD";
  if (market === "CN") return "CNY";
  if (market === "KR") return "KRW";
  if (market === "JP") return "JPY";
  if (market === "TW") return "TWD";
  if (market === "UK") return "GBP";
  if (market === "EU") return "EUR";
  return "USD";
}

function parseAssetKey(assetKey: string): { market: string; symbol: string } | null {
  const text = String(assetKey || "").trim().toUpperCase();
  const separator = text.indexOf("::");
  if (separator <= 0 || separator >= text.length - 2) return null;
  return {
    market: text.slice(0, separator),
    symbol: text.slice(separator + 2),
  };
}

function buildRealtimeAssets(assetKeys: string[]): RealtimePriceAsset[] {
  const seen = new Set<string>();
  const assets: RealtimePriceAsset[] = [];
  for (const assetKey of assetKeys) {
    const parsed = parseAssetKey(assetKey);
    if (!parsed) continue;
    const yfinanceSymbol = toYfinanceSymbolByMarket(parsed.symbol, parsed.market);
    if (!yfinanceSymbol) continue;
    const normalizedKey = `${parsed.market}::${parsed.symbol}`;
    if (seen.has(normalizedKey)) continue;
    seen.add(normalizedKey);
    assets.push({
      assetKey: normalizedKey,
      market: parsed.market,
      symbol: parsed.symbol,
      yfinanceSymbol,
      currency: inferCurrency(parsed.market),
    });
  }
  return assets;
}

async function persistRealtimePrice(asset: RealtimePriceAsset, update: YahooRealtimePriceUpdate): Promise<void> {
  const currency = update.currency || asset.currency;
  await upsertDaaMarketPriceSnapshots([{
    provider: "yfinance",
    market: asset.market,
    symbol: asset.symbol,
    normalizedSymbol: asset.yfinanceSymbol,
    currency,
    price: update.price,
    status: "fresh",
    priceUpdatedAt: update.ts,
    source: "yahoo_streamer",
    errorCode: null,
    errorMessage: null,
    rawRefId: null,
  }]);
  await appendDaaMarketPriceHistoryRows([{
    provider: "yfinance",
    market: asset.market,
    symbol: asset.symbol,
    ts: update.ts,
    price: update.price,
    currency,
    source: "yahoo_streamer",
    rawRefId: null,
  }]);
}

function subscribeYahooRealtimePrices(
  assets: RealtimePriceAsset[],
  onUpdate: (update: RealtimePriceUpdate) => void,
): () => void {
  if (assets.length <= 0) return () => undefined;

  const assetByYfinanceSymbol = new Map<string, RealtimePriceAsset>();
  for (const asset of assets) {
    assetByYfinanceSymbol.set(asset.yfinanceSymbol.toUpperCase(), asset);
  }

  return getYahooRealtimeQuoteHub().subscribe([...assetByYfinanceSymbol.keys()], (update) => {
    const asset = assetByYfinanceSymbol.get(update.symbol.toUpperCase());
    if (!asset) return;

    onUpdate({
      assetKey: asset.assetKey,
      price: update.price,
      ts: update.ts,
      currency: update.currency || asset.currency,
      source: update.source,
      change: update.change,
    });

    void persistRealtimePrice(asset, update).catch((err) => logSwallowed("priceStream.persistRealtimePrice", err));
  });
}

/**
 * 比较两次价格快照，返回有变化的资产 diff。
 */
function diffPriceSnapshots(
  prev: Map<string, AssetPriceSnapshot>,
  curr: AssetPriceSnapshot[],
): PriceUpdateEvent | null {
  const changes: PriceUpdateEvent["data"] = {};
  let hasChange = false;

  for (const snap of curr) {
    const prevSnap = prev.get(snap.assetKey);
    if (!prevSnap || prevSnap.lastPrice !== snap.lastPrice || prevSnap.priceUpdatedAt !== snap.priceUpdatedAt) {
      const delta = prevSnap ? snap.lastPrice - prevSnap.lastPrice : 0;
      changes[snap.assetKey] = {
        price: snap.lastPrice,
        ts: snap.priceUpdatedAt,
        delta,
        currency: snap.currency,
      };
      hasChange = true;
    }
  }

  return hasChange ? { type: "price_update", data: changes } : null;
}

/**
 * 创建 SSE 可读流。
 *
 * @param assetKeys 要订阅的资产键列表
 * @param intervalMs 检查间隔（默认 3000ms — DB 缓存 15 分钟更新，3s 足够）
 * @param maxDurationMs 最大流持续时间（默认 5 分钟）
 * @returns ReadableStream 或 null（如果已达全局连接上限）
 */
export function createPriceStream(
  assetKeys: string[],
  intervalMs = 3000,
  maxDurationMs = 5 * 60 * 1000,
  opts: { realtimeSubscribe?: RealtimePriceSubscription } = {},
): ReadableStream<Uint8Array> | null {
  // 连接限制检查
  if (activeStreamCount >= MAX_GLOBAL_STREAMS) {
    return null;
  }

  activeStreamCount += 1;
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let startedAt = 0;
  let cleaned = false;
  const prevSnapshots = new Map<string, AssetPriceSnapshot>();
  let unsubscribeRealtime: (() => void) | null = null;

  function enqueuePriceUpdate(
    controller: ReadableStreamDefaultController<Uint8Array>,
    input: { assetKey: string; price: number; ts: string; currency: string; source?: string; fallbackDelta?: number },
  ) {
    const prev = prevSnapshots.get(input.assetKey);
    const delta = prev ? input.price - prev.lastPrice : (input.fallbackDelta ?? 0);
    const event: PriceUpdateEvent = {
      type: "price_update",
      data: {
        [input.assetKey]: {
          price: input.price,
          ts: input.ts,
          delta,
          currency: input.currency,
          source: input.source,
        },
      },
    };
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    prevSnapshots.set(input.assetKey, {
      assetKey: input.assetKey,
      symbol: parseAssetKey(input.assetKey)?.symbol ?? input.assetKey,
      lastPrice: input.price,
      priceUpdatedAt: input.ts,
      currency: input.currency,
    });
  }

  return new ReadableStream<Uint8Array>({
    start(controller) {
      startedAt = Date.now();

      const connectEvent = `event: connected\ndata: ${JSON.stringify({ assetCount: assetKeys.length, intervalMs })}\n\n`;
      controller.enqueue(encoder.encode(connectEvent));

      const realtimeAssets = buildRealtimeAssets(assetKeys);
      const realtimeSubscribe = opts.realtimeSubscribe ?? subscribeYahooRealtimePrices;
      try {
        unsubscribeRealtime = realtimeSubscribe(realtimeAssets, (update) => {
          try {
            enqueuePriceUpdate(controller, {
              assetKey: update.assetKey,
              price: update.price,
              ts: update.ts,
              currency: update.currency,
              source: update.source,
              fallbackDelta: update.change,
            });
          } catch {
            cleanup(controller);
          }
        });
      } catch (err) {
        logSwallowed("priceStream.realtimeSubscribe", err);
      }

      timer = setInterval(async () => {
        if (Date.now() - startedAt > maxDurationMs) {
          const closeEvent = `event: close\ndata: ${JSON.stringify({ reason: "max_duration" })}\n\n`;
          try { controller.enqueue(encoder.encode(closeEvent)); } catch { /* closed */ }
          cleanup(controller);
          return;
        }

        try {
          const snapshots = await batchReadAssetPriceSnapshots(assetKeys);
          const diff = diffPriceSnapshots(prevSnapshots, snapshots);

          if (diff) {
            const sseData = `data: ${JSON.stringify(diff)}\n\n`;
            controller.enqueue(encoder.encode(sseData));
            for (const snap of snapshots) {
              prevSnapshots.set(snap.assetKey, snap);
            }
          }
        } catch (err) {
          logSwallowed("priceStream.tick", err);
        }
      }, intervalMs);

      heartbeatTimer = setInterval(() => {
        try {
          const hb: HeartbeatEvent = { type: "heartbeat", ts: new Date().toISOString() };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(hb)}\n\n`));
        } catch {
          cleanup(controller);
        }
      }, 15_000);
    },

    cancel() {
      // cancel 由消费端调用，stream 框架已处理关闭，只需清理 timers
      cleanup(null);
    },
  });

  function cleanup(controller: ReadableStreamDefaultController<Uint8Array> | null) {
    if (cleaned) return;
    cleaned = true;
    if (timer) { clearInterval(timer); timer = null; }
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    if (unsubscribeRealtime) {
      try { unsubscribeRealtime(); } catch { /* noop */ }
      unsubscribeRealtime = null;
    }
    activeStreamCount = Math.max(0, activeStreamCount - 1);
    try { controller?.close(); } catch { /* already closed */ }
  }
}
