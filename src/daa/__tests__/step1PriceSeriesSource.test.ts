import { describe, expect, it } from "vitest";

import { inferStep1PriceSeriesSource, isOkxCryptoSymbol } from "../step1PriceSeriesSource";

describe("step1PriceSeriesSource", () => {
  it("defaults to yfinance for non-crypto tickers", () => {
    expect(inferStep1PriceSeriesSource("SPY")).toBe("yfinance");
    expect(inferStep1PriceSeriesSource("2800")).toBe("yfinance");
    expect(inferStep1PriceSeriesSource("2800.HK")).toBe("yfinance");
  });

  it("uses okx for typical crypto pairs", () => {
    expect(isOkxCryptoSymbol("BTC-USDT")).toBe(true);
    expect(isOkxCryptoSymbol("eth-usdc")).toBe(true);
    expect(inferStep1PriceSeriesSource("BTC-USDT")).toBe("okx");
  });

  it("does not treat random hyphenated strings as okx by default", () => {
    expect(isOkxCryptoSymbol("SPY-TEST")).toBe(false);
    expect(inferStep1PriceSeriesSource("SPY-TEST")).toBe("yfinance");
  });
});
