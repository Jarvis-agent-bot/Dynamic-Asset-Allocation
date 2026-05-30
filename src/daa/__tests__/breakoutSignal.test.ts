import { beforeEach, describe, expect, it, vi } from "vitest";

import { normalizeSystemConfig } from "@/src/daa/config/systemConfig";
import {
  buildVolumeBreakoutSignalForSymbol,
  computeLatestVolumeBreakoutSignal,
} from "@/src/daa/signals/breakoutSignal";
import { fetchPriceSeriesWithCache } from "@/src/daa/modules/marketCache/priceSeriesCache";

vi.mock("@/src/daa/modules/marketCache/priceSeriesCache", () => ({
  fetchPriceSeriesWithCache: vi.fn(),
}));

function bar(i: number, close: number, volume = 1000) {
  return {
    date: `2026-01-${String(i + 1).padStart(2, "0")}`,
    open: close - 0.5,
    high: close + 1,
    low: close - 1,
    close,
    volume,
  };
}

describe("breakoutSignal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("识别最新一根放量突破信号", () => {
    const config = normalizeSystemConfig({
      strategy: {
        breakout: {
          breakoutLookback: 5,
          volMultiple: 1.5,
          maFast: 5,
          maSlow: 10,
          maxExtensionPct: 0.5,
        },
      },
    });
    const bars = Array.from({ length: 20 }, (_, i) => bar(i, 100 + i * 0.5, 1000));
    bars.push(bar(20, 114, 2200));

    const signal = computeLatestVolumeBreakoutSignal({
      symbol: "QQQ",
      bars,
      params: config.strategy.breakout,
    });

    expect(signal.triggered).toBe(true);
    expect(signal.action).toBe("open_or_add");
    expect(signal.reasons.join(" ")).toContain("成交量放大");
  });

  it("无突破时不会给出 open_or_add", () => {
    const config = normalizeSystemConfig({});
    const bars = Array.from({ length: 80 }, (_, i) => bar(i, 100 + Math.sin(i / 3), 1000));

    const signal = computeLatestVolumeBreakoutSignal({
      symbol: "QQQ",
      bars,
      params: config.strategy.breakout,
    });

    expect(signal.triggered).toBe(false);
    expect(signal.action).not.toBe("open_or_add");
  });

  it("会忽略当天未收盘的日线，避免盘中假突破", () => {
    vi.setSystemTime(new Date("2026-01-21T12:00:00.000Z"));
    const config = normalizeSystemConfig({
      strategy: {
        breakout: {
          breakoutLookback: 5,
          volMultiple: 1.5,
          maFast: 5,
          maSlow: 10,
          maxExtensionPct: 0.5,
        },
      },
    });
    const bars = Array.from({ length: 20 }, (_, i) => bar(i, 100 + i * 0.5, 1000));
    bars.push(bar(20, 114, 2200));

    const signal = computeLatestVolumeBreakoutSignal({
      symbol: "QQQ",
      bars,
      params: config.strategy.breakout,
    });

    expect(signal.triggered).toBe(false);
    expect(signal.action).not.toBe("open_or_add");
  });

  it("同一自然日但市场已收盘时，不会误丢最后一根完整日线", () => {
    vi.setSystemTime(new Date("2026-01-21T10:30:00.000Z"));
    const config = normalizeSystemConfig({
      strategy: {
        breakout: {
          breakoutLookback: 5,
          volMultiple: 1.5,
          maFast: 5,
          maSlow: 10,
          maxExtensionPct: 0.5,
        },
      },
    });
    const bars = Array.from({ length: 20 }, (_, i) => bar(i, 100 + i * 0.5, 1000));
    bars.push(bar(20, 114, 2200));

    const signal = computeLatestVolumeBreakoutSignal({
      symbol: "0700",
      market: "HK",
      bars,
      params: config.strategy.breakout,
    } as never);

    expect(signal.triggered).toBe(true);
    expect(signal.action).toBe("open_or_add");
  });

  it("构建实时突破信号时会按市场映射 yfinance symbol", async () => {
    const config = normalizeSystemConfig({});
    vi.mocked(fetchPriceSeriesWithCache).mockResolvedValue({
      symbol: "0700.HK",
      data: [],
      source: "db",
    });

    await buildVolumeBreakoutSignalForSymbol({
      symbol: "0700",
      market: "HK",
      currency: "HKD",
      params: config.strategy.breakout,
    });

    expect(vi.mocked(fetchPriceSeriesWithCache)).toHaveBeenCalledWith(
      "0700.HK",
      expect.any(String),
      expect.objectContaining({
        market: "HK",
        currency: "HKD",
        requireOhlcv: true,
      }),
    );
  });
});
