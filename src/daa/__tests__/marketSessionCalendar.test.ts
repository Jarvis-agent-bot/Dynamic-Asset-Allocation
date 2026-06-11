import { describe, expect, it } from "vitest";

import {
  resolveMarketSessionStatus,
  toZonedMarketDateTime,
} from "@/src/daa/marketSession/marketSessionCalendar";

describe("market-session-calendar", () => {
  it("美股周末闭市", () => {
    const status = resolveMarketSessionStatus({
      market: "US",
      now: new Date("2026-06-06T15:00:00.000Z"),
    });

    expect(status.isTradingDay).toBe(false);
    expect(status.isOpen).toBe(false);
    expect(status.reasonCode).toBe("WEEKEND");
  });

  it("美股节假日闭市", () => {
    const status = resolveMarketSessionStatus({
      market: "US",
      now: new Date("2026-07-03T15:00:00.000Z"),
    });

    expect(status.isTradingDay).toBe(false);
    expect(status.isOpen).toBe(false);
    expect(status.reasonCode).toBe("HOLIDAY");
  });

  it("美股常规盘中开市", () => {
    const status = resolveMarketSessionStatus({
      market: "US",
      now: new Date("2026-06-08T14:00:00.000Z"),
    });

    expect(status.localDate).toBe("2026-06-08");
    expect(status.localTime).toBe("10:00");
    expect(status.isTradingDay).toBe(true);
    expect(status.isOpen).toBe(true);
    expect(status.sessionLabel).toBe("regular");
  });

  it("美股盘前闭市", () => {
    const status = resolveMarketSessionStatus({
      market: "US",
      now: new Date("2026-06-08T13:00:00.000Z"),
    });

    expect(status.localTime).toBe("09:00");
    expect(status.isTradingDay).toBe(true);
    expect(status.isOpen).toBe(false);
    expect(status.reasonCode).toBe("BEFORE_OPEN");
  });

  it("港股午休闭市", () => {
    const status = resolveMarketSessionStatus({
      market: "HK",
      now: new Date("2026-06-08T04:30:00.000Z"),
    });

    expect(status.localDate).toBe("2026-06-08");
    expect(status.localTime).toBe("12:30");
    expect(status.isTradingDay).toBe(true);
    expect(status.isOpen).toBe(false);
    expect(status.reasonCode).toBe("MIDDAY_BREAK");
  });

  it("港股下午盘开市", () => {
    const status = resolveMarketSessionStatus({
      market: "HK",
      now: new Date("2026-06-08T06:00:00.000Z"),
    });

    expect(status.localTime).toBe("14:00");
    expect(status.isOpen).toBe(true);
    expect(status.sessionLabel).toBe("afternoon");
  });

  it("半日市使用提前收盘时间", () => {
    const open = resolveMarketSessionStatus({
      market: "US",
      now: new Date("2026-11-27T17:30:00.000Z"),
    });
    const closed = resolveMarketSessionStatus({
      market: "US",
      now: new Date("2026-11-27T18:30:00.000Z"),
    });

    expect(open.localTime).toBe("12:30");
    expect(open.isOpen).toBe(true);
    expect(closed.localTime).toBe("13:30");
    expect(closed.isOpen).toBe(false);
    expect(closed.reasonCode).toBe("AFTER_CLOSE");
  });

  it("crypto 24/7 开市", () => {
    const status = resolveMarketSessionStatus({
      market: "CRYPTO",
      now: new Date("2026-06-07T03:00:00.000Z"),
    });

    expect(status.isTradingDay).toBe(true);
    expect(status.isOpen).toBe(true);
    expect(status.reasonCode).toBe("OPEN");
  });

  it("能稳定解析目标市场本地时间", () => {
    const zoned = toZonedMarketDateTime(new Date("2026-06-08T14:00:00.000Z"), "America/New_York");
    expect(zoned).toEqual({
      date: "2026-06-08",
      time: "10:00",
      minuteOfDay: 600,
      weekday: 1,
    });
  });
});
