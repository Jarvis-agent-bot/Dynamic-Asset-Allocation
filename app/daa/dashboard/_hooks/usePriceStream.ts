"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * 单个资产的实时价格更新。
 */
export type PriceUpdate = {
  price: number;
  ts: string;
  delta: number;
  currency: string;
  /** 价格方向: "up" | "down" | "flat" */
  direction: "up" | "down" | "flat";
};

type StreamState = {
  /** assetKey → 最新价格 */
  prices: Map<string, PriceUpdate>;
  /** SSE 连接状态 */
  connected: boolean;
  /** 最后一次收到数据的时间 */
  lastUpdate: Date | null;
};

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

/**
 * SSE 实时价格流 Hook。
 *
 * 连接到 /api/daa/stream/prices，每秒接收价格 diff 更新。
 * - 自动重连（指数退避: 1s → 2s → 4s → ... → 30s）
 * - 页面不可见时暂停，可见时重连
 * - 返回 { prices, connected, lastUpdate }
 */
export function usePriceStream(assetKeys: string[]): StreamState {
  const [state, setState] = useState<StreamState>({
    prices: new Map(),
    connected: false,
    lastUpdate: null,
  });

  const sourceRef = useRef<EventSource | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const assetKeysRef = useRef(assetKeys);
  assetKeysRef.current = assetKeys;

  const connect = useCallback(() => {
    // 清理已有连接
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
    }

    const keys = assetKeysRef.current;
    if (keys.length === 0) return;

    const url = `/api/daa/stream/prices?assets=${keys.join(",")}`;
    const source = new EventSource(url);
    sourceRef.current = source;

    source.onopen = () => {
      retryCountRef.current = 0;
      setState((prev) => ({ ...prev, connected: true }));
    };

    source.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.type === "heartbeat") {
          // 心跳 — 仅更新时间
          setState((prev) => ({ ...prev, lastUpdate: new Date() }));
          return;
        }
        if (parsed.type === "price_update" && parsed.data) {
          setState((prev) => {
            const next = new Map(prev.prices);
            for (const [key, update] of Object.entries(parsed.data)) {
              const u = update as { price: number; ts: string; delta: number; currency: string };
              next.set(key, {
                price: u.price,
                ts: u.ts,
                delta: u.delta,
                currency: u.currency,
                direction: u.delta > 0 ? "up" : u.delta < 0 ? "down" : "flat",
              });
            }
            return { prices: next, connected: true, lastUpdate: new Date() };
          });
        }
      } catch {
        // 忽略解析错误
      }
    };

    source.onerror = () => {
      source.close();
      sourceRef.current = null;
      setState((prev) => ({ ...prev, connected: false }));

      // 指数退避重连
      const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, retryCountRef.current), RECONNECT_MAX_MS);
      retryCountRef.current += 1;
      retryTimerRef.current = setTimeout(connect, delay);
    };
  }, []);

  const disconnect = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
    }
    setState((prev) => ({ ...prev, connected: false }));
  }, []);

  // assetKeys 稳定化（避免 join 作为 dep 的代码异味）
  const assetKeysStable = useMemo(() => assetKeys.join(","), [assetKeys]);

  // 页面可见性管理
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        retryCountRef.current = 0; // 可见性恢复时重置退避
        connect();
      } else {
        disconnect();
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);

    // assetKeys 变化时重置退避并重连
    retryCountRef.current = 0;
    if (assetKeys.length > 0 && document.visibilityState === "visible") {
      connect();
    }

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      disconnect();
    };
  }, [assetKeysStable, connect, disconnect]);

  return state;
}
