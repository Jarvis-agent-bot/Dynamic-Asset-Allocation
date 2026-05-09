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
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

type PriceUpdateEvent = {
  type: "price_update";
  data: Record<string, { price: number; ts: string; delta: number; currency: string }>;
};

type HeartbeatEvent = {
  type: "heartbeat";
  ts: string;
};

// --- 全局连接限制 ---
const MAX_GLOBAL_STREAMS = 10;
let activeStreamCount = 0;

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

  return new ReadableStream<Uint8Array>({
    start(controller) {
      startedAt = Date.now();

      const connectEvent = `event: connected\ndata: ${JSON.stringify({ assetCount: assetKeys.length, intervalMs })}\n\n`;
      controller.enqueue(encoder.encode(connectEvent));

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
    activeStreamCount = Math.max(0, activeStreamCount - 1);
    try { controller?.close(); } catch { /* already closed */ }
  }
}
