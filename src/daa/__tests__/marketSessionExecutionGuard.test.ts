import { describe, expect, it } from "vitest";

import {
  assertMarketSessionAllowsExecution,
  resolveMarketExecutionGuard,
} from "@/src/daa/marketSession/marketSessionExecutionGuard";

describe("market-session-execution-guard", () => {
  it("阻断闭市美股市价执行", () => {
    const guard = resolveMarketExecutionGuard({
      market: "US",
      symbol: "AAPL",
      orderType: "market",
      now: new Date("2026-06-08T13:00:00.000Z"),
    });

    expect(guard.allowed).toBe(false);
    expect(guard.code).toBe("MARKET_CLOSED");
    expect(guard.message).toContain("AAPL");
  });

  it("允许开市美股执行", () => {
    const guard = resolveMarketExecutionGuard({
      market: "US",
      symbol: "AAPL",
      orderType: "market",
      now: new Date("2026-06-08T14:00:00.000Z"),
    });

    expect(guard.allowed).toBe(true);
    expect(guard.code).toBe("MARKET_OPEN");
  });

  it("允许 crypto 周末执行", () => {
    const guard = resolveMarketExecutionGuard({
      market: "CRYPTO",
      symbol: "BTC-USD",
      orderType: "market",
      now: new Date("2026-06-07T03:00:00.000Z"),
    });

    expect(guard.allowed).toBe(true);
    expect(guard.code).toBe("MARKET_OPEN");
  });

  it("assert helper 抛出稳定错误码", () => {
    expect(() => assertMarketSessionAllowsExecution({
      market: "HK",
      symbol: "0700",
      orderType: "market",
      now: new Date("2026-06-08T04:30:00.000Z"),
    })).toThrow(/MARKET_CLOSED/);
  });
});
