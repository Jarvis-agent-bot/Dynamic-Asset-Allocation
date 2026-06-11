import { describe, expect, it, vi } from "vitest";

import { createPriceStream, type RealtimePriceSubscription } from "./priceStreamService";

function readStreamText(stream: ReadableStream<Uint8Array>, durationMs = 30): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";

  return new Promise((resolve) => {
    const timer = setTimeout(async () => {
      await reader.cancel();
      resolve(out);
    }, durationMs);

    function pump() {
      reader.read().then(({ done, value }) => {
        if (done) {
          clearTimeout(timer);
          resolve(out);
          return;
        }
        out += decoder.decode(value, { stream: true });
        pump();
      }).catch(() => {
        clearTimeout(timer);
        resolve(out);
      });
    }

    pump();
  });
}

describe("priceStreamService", () => {
  it("把 Yahoo 实时订阅更新推送到现有 SSE price_update 事件", async () => {
    let emit: Parameters<RealtimePriceSubscription>[1] | null = null;
    const subscribe: RealtimePriceSubscription = vi.fn((_assets, onUpdate) => {
      emit = onUpdate;
      queueMicrotask(() => {
        onUpdate({
          assetKey: "US::AMD",
          price: 510.13,
          ts: "2026-06-02T04:50:00.000Z",
          currency: "USD",
          source: "yahoo_streamer",
          change: 8.25,
        });
      });
      return () => undefined;
    });

    const stream = createPriceStream(["US::AMD"], 10_000, 10_000, {
      realtimeSubscribe: subscribe,
      marketSessionNow: new Date("2026-06-08T14:00:00.000Z"),
    });
    expect(stream).not.toBeNull();

    const text = await readStreamText(stream!, 50);

    expect(subscribe).toHaveBeenCalledWith([{
      assetKey: "US::AMD",
      market: "US",
      symbol: "AMD",
      yfinanceSymbol: "AMD",
      currency: "USD",
    }], expect.any(Function));
    expect(emit).not.toBeNull();
    expect(text).toContain("event: connected");
    expect(text).toContain("\"type\":\"price_update\"");
    expect(text).toContain("\"US::AMD\"");
    expect(text).toContain("\"price\":510.13");
    expect(text).toContain("\"source\":\"yahoo_streamer\"");
    expect(text).toContain("\"delta\":8.25");
    expect(text).toContain("\"marketSession\"");
    expect(text).toContain("\"market\":\"US\"");
    expect(text).toContain("\"reasonCode\":\"OPEN\"");
    expect(text).toContain("\"isOpen\":true");
  });
});
