/**
 * SSE 价格流服务 — 从 DB 缓存读取价格，计算 diff，生成 SSE 事件。
 * 不直接调用外部 API，零额外市场数据压力。
 */

import { batchReadAssetPriceSnapshots, type AssetPriceSnapshot } from "@/src/daa/store/assetUniverseStore";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export type PriceUpdateEvent = {
  type: "price_update";
  data: Record<string, { price: number; ts: string; delta: number; currency: string }>;
};

export type HeartbeatEvent = {
  type: "heartbeat";
  ts: string;
};

export type StreamEvent = PriceUpdateEvent | HeartbeatEvent;

/**
 * 比较两次价格快照，返回有变化的资产 diff。
 */
export function diffPriceSnapshots(
  prev: Map<string, AssetPriceSnapshot>,
  curr: AssetPriceSnapshot[],
): PriceUpdateEvent | null {
  const changes: PriceUpdateEvent["data"] = {};
  let hasChange = false;

  for (const snap of curr) {
    const prevSnap = prev.get(snap.assetKey);
    // 价格变化 or 时间戳更新 → 推送
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
 * 创建 SSE 可读流 — 每秒从 DB 读取价格并推送 diff。
 *
 * @param assetKeys 要订阅的资产键列表
 * @param intervalMs 检查间隔（默认 1000ms）
 * @param maxDurationMs 最大流持续时间（默认 5 分钟）
 */
export function createPriceStream(
  assetKeys: string[],
  intervalMs = 1000,
  maxDurationMs = 5 * 60 * 1000,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let startedAt = 0;
  const prevSnapshots = new Map<string, AssetPriceSnapshot>();

  return new ReadableStream<Uint8Array>({
    start(controller) {
      startedAt = Date.now();

      // 发送初始连接事件
      const connectEvent = `event: connected\ndata: ${JSON.stringify({ assetCount: assetKeys.length, intervalMs })}\n\n`;
      controller.enqueue(encoder.encode(connectEvent));

      // 每秒检查价格变化
      timer = setInterval(async () => {
        // 超时自动关闭
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
            // 更新 prev
            for (const snap of snapshots) {
              prevSnapshots.set(snap.assetKey, snap);
            }
          }
        } catch (err) {
          logSwallowed("priceStream.tick", err);
        }
      }, intervalMs);

      // 心跳保活（15 秒）
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
      cleanup(null);
    },
  });

  function cleanup(controller: ReadableStreamDefaultController<Uint8Array> | null) {
    if (timer) { clearInterval(timer); timer = null; }
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    try { controller?.close(); } catch { /* already closed */ }
  }
}
