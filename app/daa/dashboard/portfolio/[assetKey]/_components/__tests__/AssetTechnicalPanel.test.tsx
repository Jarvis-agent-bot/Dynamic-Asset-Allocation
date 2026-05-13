// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AssetTechnicalPanel } from "../AssetTechnicalPanel";
import type { DaaTechnicalSignal } from "@/src/daa/signals/technicalSignal";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mockFetch(data: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data }),
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function makeSignal(overrides: Partial<DaaTechnicalSignal> = {}): DaaTechnicalSignal {
  return {
    symbol: "0700.HK",
    scorePct: 72,
    confidencePct: 80,
    momentumRegime: "strong",
    metrics: {
      close: 463.8,
      sma20: 470.1,
      sma60: 485.2,
      ema12: 466.1,
      ema26: 472.2,
      macd: -1.2,
      macdSignal: -2.1,
      macdHist: 0.9,
      rsi14: 58.2,
      bollingerUpper: 502.2,
      bollingerMid: 471.6,
      bollingerLower: 441.0,
      return20Pct: -4.1,
      return60Pct: 2.3,
      drawdown30Pct: -9.4,
      annualizedVolPct: 32.7,
      goldenCross: false,
      deathCross: false,
      macdBullishCross: true,
      macdBearishCross: false,
    },
    specific: [
      {
        key: "hk_relative_strength",
        label: "港股相对强弱",
        value: 0.92,
        unit: "x",
        status: "neutral",
        description: "相对恒指处于中性区间",
      },
    ],
    reasons: ["MACD 位于信号线上方", "RSI 处于健康区间"],
    ...overrides,
  };
}

describe("AssetTechnicalPanel", () => {
  it("展示真实技术信号的核心指标分组", async () => {
    const fetchMock = mockFetch({
      symbol: "0700.HK",
      signal: makeSignal(),
      unavailableReason: null,
    });

    render(<AssetTechnicalPanel symbol="0700.HK" currency="HKD" />);

    expect(await screen.findByText(/评分 72/)).toBeInTheDocument();
    expect(screen.getByText("强动量")).toBeInTheDocument();
    expect(screen.getByText("RSI14")).toBeInTheDocument();
    expect(screen.getByText("MACD Hist")).toBeInTheDocument();
    expect(screen.getByText("BOLL 上 / 中 / 下")).toBeInTheDocument();
    expect(screen.getByText("港股相对强弱")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/daa/signals/technical?symbol=0700.HK",
      { cache: "no-store" },
    );
  });

  it("历史行情不足时显示空状态", async () => {
    mockFetch({
      symbol: "NEW",
      signal: null,
      unavailableReason: "not_enough_price_history",
    });

    render(<AssetTechnicalPanel symbol="NEW" currency="USD" />);

    await waitFor(() => {
      expect(screen.getByText("历史行情不足，暂时无法生成技术指标。")).toBeInTheDocument();
    });
  });
});
