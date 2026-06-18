# Market Session Calendar Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 DAA 在美股、港股等市场的手动执行、自动执行、再平衡执行与行情新鲜度判断中统一识别交易日、节假日、盘中 / 闭市状态。

**Architecture:** 新增一个独立的 `marketSession` 域模块，集中封装市场时区、常规交易时段、午休、节假日、半日市与 crypto 24/7 规则。执行层只依赖该模块的稳定接口，不在 `manualTradeService`、`workbenchRebalanceCycleService`、`automationAuthority` 里重复写时间判断。行情缓存继续允许闭市刷新，但把“数据时间”与“抓取时间”区分开，避免假日旧收盘价被误标为实时 fresh。

**Tech Stack:** TypeScript、Vitest、Next.js route/service modules、Postgres store 现有缓存表、`Intl.DateTimeFormat` 时区能力。不新增第三方依赖。

---

## 是否需要重构

需要，但应该是小范围的架构重构，不是大改。

当前系统已经有两类局部处理：

- `src/daa/signals/breakoutSignal.ts` 用市场时区和收盘时间丢弃未完成日线。
- `src/daa/modules/strategyLab/strategyLabService.ts` 和 `src/core/backtestDriftRebalance.ts` 在回测中按真实 K 线日期限制下单。

但执行链路没有统一市场状态守门：

- `src/daa/store/tradeTicketStore.ts` 的 `executeDaaTradeTickets()` 只检查现金、持仓、FX，不检查交易时段。
- `src/daa/automation/automationAuthority.ts` 的自动执行授权不检查市场是否开市。
- `src/daa/modules/marketCache/marketCacheService.ts` 把 Yahoo 抓取时间当成 `priceUpdatedAt`，闭市或假日会把旧收盘价标成 fresh。

因此建议补一个统一 `marketSession` 域模块，然后逐步接入执行、自动执行和行情缓存。

## File Structure

- Create: `src/daa/marketSession/marketSessionCalendar.ts`
  - 市场时区、交易日、交易时段、节假日、半日市、午休判断的唯一入口。
- Create: `src/daa/marketSession/exchangeCalendarData.ts`
  - 默认市场日历数据。先覆盖 `US`、`HK`、`CRYPTO`，结构支持后续扩展 `CN`、`JP` 等。
- Create: `src/daa/marketSession/marketSessionExecutionGuard.ts`
  - 面向执行层的守门接口，把 calendar 状态转换成阻断错误 / warning。
- Create: `src/daa/__tests__/marketSessionCalendar.test.ts`
  - 单测节假日、周末、盘前、盘中、午休、半日市、crypto 24/7。
- Create: `src/daa/__tests__/marketSessionExecutionGuard.test.ts`
  - 单测手动 / 自动执行守门的错误码和消息。
- Modify: `src/daa/modules/workbench/manualTradeService.ts`
  - `previewManualTrade()` 添加市场关闭 warning 并把 `canSubmit` 置 false。
  - `executeManualTrade()` 在落 ticket 前阻断闭市执行。
- Modify: `src/daa/modules/workbench/workbenchRebalanceCycleService.ts`
  - `executeWorkbenchRebalanceCycle()` 刷新价格后、创建 ticket 前阻断闭市市场。
- Modify: `src/daa/automation/autoRebalanceExecution.ts`
  - 自动执行前检查所有 selected proposals 的市场状态，闭市时只生成建议不执行。
- Modify: `src/daa/modules/marketCache/marketCacheService.ts`
  - Yahoo latest close 返回真实行情日期作为 `priceUpdatedAt`，抓取时间只保存在 raw / fetched 字段。
- Modify: `src/daa/__tests__/workbenchTradeFlowRoute.test.ts`
  - 增加闭市时手动预览不可提交、执行返回 `MARKET_CLOSED` 的集成测试。
- Modify: `src/daa/__tests__/autoRebalanceExecutionPolicy.test.ts`
  - 增加自动执行遇到闭市市场时被阻断的测试。
- Modify: `src/daa/__tests__/marketCacheService.test.ts`
  - 增加闭市 / 假日抓取不把 `priceUpdatedAt` 写成当前抓取时间的测试。

---

### Task 1: 新增 Market Session Calendar 域模块

**Files:**
- Create: `src/daa/marketSession/exchangeCalendarData.ts`
- Create: `src/daa/marketSession/marketSessionCalendar.ts`
- Test: `src/daa/__tests__/marketSessionCalendar.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/daa/__tests__/marketSessionCalendar.test.ts`:

```ts
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

  it("美股自定义节假日闭市", () => {
    const status = resolveMarketSessionStatus({
      market: "US",
      now: new Date("2026-07-03T15:00:00.000Z"),
      calendarOverride: {
        holidays: new Set(["2026-07-03"]),
      },
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
      calendarOverride: {
        earlyCloses: new Map([["2026-11-27", "13:00"]]),
      },
    });
    const closed = resolveMarketSessionStatus({
      market: "US",
      now: new Date("2026-11-27T18:30:00.000Z"),
      calendarOverride: {
        earlyCloses: new Map([["2026-11-27", "13:00"]]),
      },
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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run src/daa/__tests__/marketSessionCalendar.test.ts
```

Expected: FAIL with module not found for `@/src/daa/marketSession/marketSessionCalendar`.

- [ ] **Step 3: Add exchange calendar data**

Create `src/daa/marketSession/exchangeCalendarData.ts`:

```ts
export type MarketSessionCode = "US" | "HK" | "CN" | "JP" | "KR" | "TW" | "SG" | "UK" | "EU" | "CRYPTO" | "COMMODITY" | "FX" | "INDEX";

export type MarketSessionRange = {
  label: "regular" | "morning" | "afternoon" | "all_day";
  open: string;
  close: string;
};

export type ExchangeCalendarData = {
  timeZone: string;
  weekendDays: number[];
  sessions: MarketSessionRange[];
  holidays: string[];
  earlyCloses: Record<string, string>;
  alwaysOpen?: boolean;
};

export const EXCHANGE_CALENDAR_DATA_: Record<string, ExchangeCalendarData> = {
  US: {
    timeZone: "America/New_York",
    weekendDays: [0, 6],
    sessions: [{ label: "regular", open: "09:30", close: "16:00" }],
    holidays: [
      "2026-01-01",
      "2026-01-19",
      "2026-02-16",
      "2026-04-03",
      "2026-05-25",
      "2026-06-19",
      "2026-07-03",
      "2026-09-07",
      "2026-11-26",
      "2026-12-25",
    ],
    earlyCloses: {
      "2026-11-27": "13:00",
      "2026-12-24": "13:00",
    },
  },
  HK: {
    timeZone: "Asia/Hong_Kong",
    weekendDays: [0, 6],
    sessions: [
      { label: "morning", open: "09:30", close: "12:00" },
      { label: "afternoon", open: "13:00", close: "16:00" },
    ],
    holidays: [
      "2026-01-01",
      "2026-02-17",
      "2026-02-18",
      "2026-02-19",
      "2026-04-03",
      "2026-04-06",
      "2026-04-07",
      "2026-05-01",
      "2026-05-25",
      "2026-06-19",
      "2026-07-01",
      "2026-09-26",
      "2026-10-01",
      "2026-10-19",
      "2026-12-25",
      "2026-12-26",
    ],
    earlyCloses: {},
  },
  CRYPTO: {
    timeZone: "UTC",
    weekendDays: [],
    sessions: [{ label: "all_day", open: "00:00", close: "23:59" }],
    holidays: [],
    earlyCloses: {},
    alwaysOpen: true,
  },
};
```

- [ ] **Step 4: Add market session resolver**

Create `src/daa/marketSession/marketSessionCalendar.ts`:

```ts
import { EXCHANGE_CALENDAR_DATA_, type MarketSessionRange } from "./exchangeCalendarData";

export type MarketSessionReasonCode =
  | "OPEN"
  | "UNSUPPORTED_MARKET"
  | "WEEKEND"
  | "HOLIDAY"
  | "BEFORE_OPEN"
  | "MIDDAY_BREAK"
  | "AFTER_CLOSE";

export type MarketSessionStatus = {
  market: string;
  timeZone: string;
  localDate: string;
  localTime: string;
  weekday: number;
  isTradingDay: boolean;
  isOpen: boolean;
  reasonCode: MarketSessionReasonCode;
  reasonZh: string;
  sessionLabel: MarketSessionRange["label"] | null;
  nextKnownOpenAt: string | null;
  nextKnownCloseAt: string | null;
};

export type MarketSessionCalendarOverride = {
  holidays?: Set<string>;
  earlyCloses?: Map<string, string>;
};

function normalizeMarket(value: unknown): string {
  return String(value || "US").trim().toUpperCase() || "US";
}

function parseHhmm(value: string): number {
  const matched = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || "").trim());
  if (!matched) return Number.NaN;
  return Number(matched[1]) * 60 + Number(matched[2]);
}

function hhmm(minuteOfDay: number): string {
  const minutes = Math.max(0, Math.min(23 * 60 + 59, Math.trunc(minuteOfDay)));
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function toZonedMarketDateTime(date: Date, timeZone: string): {
  date: string;
  time: string;
  minuteOfDay: number;
  weekday: number;
} {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "1970";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";
  const hour = Number(parts.find((part) => part.type === "hour")?.value || "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value || "0");
  const weekdayText = parts.find((part) => part.type === "weekday")?.value || "Mon";
  const weekday = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[weekdayText as "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat"] ?? 1;
  const minuteOfDay = (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0);
  return {
    date: `${year}-${month}-${day}`,
    time: hhmm(minuteOfDay),
    minuteOfDay,
    weekday,
  };
}

function reasonZh(code: MarketSessionReasonCode, market: string, localDate: string, localTime: string): string {
  switch (code) {
    case "OPEN":
      return `${market} 当前处于常规交易时段（${localDate} ${localTime}）。`;
    case "WEEKEND":
      return `${market} 当前为周末休市（${localDate} ${localTime}）。`;
    case "HOLIDAY":
      return `${market} 当前为交易所节假日休市（${localDate}）。`;
    case "BEFORE_OPEN":
      return `${market} 当前尚未开盘（${localDate} ${localTime}）。`;
    case "MIDDAY_BREAK":
      return `${market} 当前处于午间休市（${localDate} ${localTime}）。`;
    case "AFTER_CLOSE":
      return `${market} 当前已收盘（${localDate} ${localTime}）。`;
    default:
      return `${market} 缺少交易日历配置，无法判断是否开市。`;
  }
}

function sessionsForDate(sessions: MarketSessionRange[], localDate: string, earlyClose: string | null): MarketSessionRange[] {
  if (!earlyClose) return sessions;
  return sessions.map((session, index) => {
    if (index !== sessions.length - 1) return session;
    return { ...session, close: earlyClose };
  });
}

export function resolveMarketSessionStatus(input: {
  market?: string | null;
  now?: Date;
  calendarOverride?: MarketSessionCalendarOverride;
}): MarketSessionStatus {
  const market = normalizeMarket(input.market);
  const data = EXCHANGE_CALENDAR_DATA_[market];
  const fallbackNow = input.now ?? new Date();

  if (!data) {
    const zoned = toZonedMarketDateTime(fallbackNow, "UTC");
    return {
      market,
      timeZone: "UTC",
      localDate: zoned.date,
      localTime: zoned.time,
      weekday: zoned.weekday,
      isTradingDay: false,
      isOpen: false,
      reasonCode: "UNSUPPORTED_MARKET",
      reasonZh: reasonZh("UNSUPPORTED_MARKET", market, zoned.date, zoned.time),
      sessionLabel: null,
      nextKnownOpenAt: null,
      nextKnownCloseAt: null,
    };
  }

  const zoned = toZonedMarketDateTime(fallbackNow, data.timeZone);
  if (data.alwaysOpen) {
    return {
      market,
      timeZone: data.timeZone,
      localDate: zoned.date,
      localTime: zoned.time,
      weekday: zoned.weekday,
      isTradingDay: true,
      isOpen: true,
      reasonCode: "OPEN",
      reasonZh: reasonZh("OPEN", market, zoned.date, zoned.time),
      sessionLabel: "all_day",
      nextKnownOpenAt: null,
      nextKnownCloseAt: null,
    };
  }

  const holidays = input.calendarOverride?.holidays ?? new Set(data.holidays);
  const earlyCloses = input.calendarOverride?.earlyCloses ?? new Map(Object.entries(data.earlyCloses));
  const isWeekend = data.weekendDays.includes(zoned.weekday);
  const isHoliday = holidays.has(zoned.date);
  if (isWeekend || isHoliday) {
    const code = isWeekend ? "WEEKEND" : "HOLIDAY";
    return {
      market,
      timeZone: data.timeZone,
      localDate: zoned.date,
      localTime: zoned.time,
      weekday: zoned.weekday,
      isTradingDay: false,
      isOpen: false,
      reasonCode: code,
      reasonZh: reasonZh(code, market, zoned.date, zoned.time),
      sessionLabel: null,
      nextKnownOpenAt: null,
      nextKnownCloseAt: null,
    };
  }

  const sessions = sessionsForDate(data.sessions, zoned.date, earlyCloses.get(zoned.date) ?? null);
  for (const session of sessions) {
    const open = parseHhmm(session.open);
    const close = parseHhmm(session.close);
    if (zoned.minuteOfDay >= open && zoned.minuteOfDay < close) {
      return {
        market,
        timeZone: data.timeZone,
        localDate: zoned.date,
        localTime: zoned.time,
        weekday: zoned.weekday,
        isTradingDay: true,
        isOpen: true,
        reasonCode: "OPEN",
        reasonZh: reasonZh("OPEN", market, zoned.date, zoned.time),
        sessionLabel: session.label,
        nextKnownOpenAt: null,
        nextKnownCloseAt: `${zoned.date}T${session.close}:00[${data.timeZone}]`,
      };
    }
  }

  const firstOpen = parseHhmm(sessions[0]?.open || "00:00");
  const lastClose = parseHhmm(sessions[sessions.length - 1]?.close || "23:59");
  const code: MarketSessionReasonCode = zoned.minuteOfDay < firstOpen
    ? "BEFORE_OPEN"
    : (zoned.minuteOfDay >= lastClose ? "AFTER_CLOSE" : "MIDDAY_BREAK");

  return {
    market,
    timeZone: data.timeZone,
    localDate: zoned.date,
    localTime: zoned.time,
    weekday: zoned.weekday,
    isTradingDay: true,
    isOpen: false,
    reasonCode: code,
    reasonZh: reasonZh(code, market, zoned.date, zoned.time),
    sessionLabel: null,
    nextKnownOpenAt: code === "BEFORE_OPEN" ? `${zoned.date}T${sessions[0]?.open}:00[${data.timeZone}]` : null,
    nextKnownCloseAt: null,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
pnpm vitest run src/daa/__tests__/marketSessionCalendar.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/daa/marketSession/exchangeCalendarData.ts src/daa/marketSession/marketSessionCalendar.ts src/daa/__tests__/marketSessionCalendar.test.ts
git commit -m "feat: add market session calendar"
```

---

### Task 2: 新增执行守门接口

**Files:**
- Create: `src/daa/marketSession/marketSessionExecutionGuard.ts`
- Test: `src/daa/__tests__/marketSessionExecutionGuard.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/daa/__tests__/marketSessionExecutionGuard.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run src/daa/__tests__/marketSessionExecutionGuard.test.ts
```

Expected: FAIL with module not found.

- [ ] **Step 3: Add execution guard**

Create `src/daa/marketSession/marketSessionExecutionGuard.ts`:

```ts
import {
  resolveMarketSessionStatus,
  type MarketSessionStatus,
} from "./marketSessionCalendar";

export type MarketOrderTypeForSession = "market" | "manual" | "limit";

export type MarketExecutionGuardResult = {
  allowed: boolean;
  code: "MARKET_OPEN" | "MARKET_CLOSED" | "UNSUPPORTED_MARKET";
  message: string;
  status: MarketSessionStatus;
};

export class MarketSessionExecutionError extends Error {
  code: "MARKET_CLOSED" | "UNSUPPORTED_MARKET";
  status: MarketSessionStatus;

  constructor(input: { code: "MARKET_CLOSED" | "UNSUPPORTED_MARKET"; message: string; status: MarketSessionStatus }) {
    super(input.message);
    this.name = "MarketSessionExecutionError";
    this.code = input.code;
    this.status = input.status;
  }
}

function normalizeSymbol(value: unknown): string {
  return String(value || "").trim().toUpperCase() || "UNKNOWN";
}

export function resolveMarketExecutionGuard(input: {
  market?: string | null;
  symbol?: string | null;
  orderType?: MarketOrderTypeForSession;
  now?: Date;
}): MarketExecutionGuardResult {
  const symbol = normalizeSymbol(input.symbol);
  const status = resolveMarketSessionStatus({
    market: input.market,
    now: input.now,
  });

  if (status.reasonCode === "UNSUPPORTED_MARKET") {
    return {
      allowed: false,
      code: "UNSUPPORTED_MARKET",
      message: `${symbol} 所属市场 ${status.market} 缺少交易日历配置，不能执行市价模拟成交。`,
      status,
    };
  }

  if (!status.isOpen) {
    return {
      allowed: false,
      code: "MARKET_CLOSED",
      message: `${symbol} 当前不可执行：${status.reasonZh}`,
      status,
    };
  }

  return {
    allowed: true,
    code: "MARKET_OPEN",
    message: `${symbol} 当前可执行：${status.reasonZh}`,
    status,
  };
}

export function assertMarketSessionAllowsExecution(input: {
  market?: string | null;
  symbol?: string | null;
  orderType?: MarketOrderTypeForSession;
  now?: Date;
}): MarketExecutionGuardResult {
  const guard = resolveMarketExecutionGuard(input);
  if (guard.allowed) return guard;
  throw new MarketSessionExecutionError({
    code: guard.code === "UNSUPPORTED_MARKET" ? "UNSUPPORTED_MARKET" : "MARKET_CLOSED",
    message: `${guard.code}:${guard.message}`,
    status: guard.status,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm vitest run src/daa/__tests__/marketSessionExecutionGuard.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/daa/marketSession/marketSessionExecutionGuard.ts src/daa/__tests__/marketSessionExecutionGuard.test.ts
git commit -m "feat: add market session execution guard"
```

---

### Task 3: 接入手动交易预览与执行

**Files:**
- Modify: `src/daa/modules/workbench/manualTradeService.ts`
- Modify: `src/daa/__tests__/workbenchTradeFlowRoute.test.ts`

- [ ] **Step 1: Write failing integration tests**

Append to `src/daa/__tests__/workbenchTradeFlowRoute.test.ts` inside the existing `describe.skipIf(...)` block:

```ts
  it("闭市时手动预览不可提交，执行会被稳定错误码阻断", async () => {
    vi.setSystemTime(new Date("2026-06-08T13:00:00.000Z"));
    try {
      const current = await getDaaSystemConfig();
      await saveDaaSystemConfig({
        baseVersion: current.version,
        config: {
          ...current.config,
          dataSources: {
            ...current.config.dataSources,
            priceFeed: {
              ...current.config.dataSources.priceFeed,
              enabled: false,
            },
          },
        },
      });

      const upsertResponse = await upsertAsset(new Request("http://localhost/api/daa/workbench/assets/upsert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          symbol: "AAPL",
          market: "US",
          currency: "USD",
          assetClass: "EQUITY",
          region: "US",
          exchange: "NASDAQ",
          instrumentType: "STOCK",
          marketGroup: "US_EQUITY",
          watchEnabled: true,
          lastPrice: 100,
        }),
      }));
      expect(upsertResponse.status).toBe(200);

      const previewResponse = await previewExecution(new Request("http://localhost/api/daa/workbench/execution/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          assetKey: "US::AAPL",
          side: "BUY",
          qty: 1,
        }),
      }));
      const previewJson = await previewResponse.json();

      expect(previewResponse.status).toBe(200);
      expect(previewJson.ok).toBe(true);
      expect(previewJson.data.canSubmit).toBe(false);
      expect(previewJson.data.warnings.join(" ")).toContain("当前不可执行");

      const executeResponse = await executeOrder(new Request("http://localhost/api/daa/workbench/execution/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: "manual",
          side: "BUY",
          assetKey: "US::AAPL",
          symbol: "AAPL",
          market: "US",
          currency: "USD",
          qty: 1,
          price: 100,
          fee: 0,
          pricingMode: "market",
          reasonText: "闭市阻断测试",
        }),
      }));
      const executeJson = await executeResponse.json();

      expect(executeResponse.status).toBe(409);
      expect(executeJson.ok).toBe(false);
      expect(executeJson.error.code).toBe("MARKET_CLOSED");
    } finally {
      vi.useRealTimers();
    }
  }, 15000);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run src/daa/__tests__/workbenchTradeFlowRoute.test.ts -t "闭市时手动预览"
```

Expected: FAIL because preview still allows submit or execute still succeeds.

- [ ] **Step 3: Wire guard into `previewManualTrade()`**

Modify `src/daa/modules/workbench/manualTradeService.ts` imports:

```ts
import {
  assertMarketSessionAllowsExecution,
  resolveMarketExecutionGuard,
  MarketSessionExecutionError,
} from "@/src/daa/marketSession/marketSessionExecutionGuard";
```

In `previewManualTrade()`, after the existing crypto warning block and before stale-price age warning, add:

```ts
  const marketGuard = resolveMarketExecutionGuard({
    market: row.market,
    symbol: row.symbol,
    orderType: "market",
  });
  if (!marketGuard.allowed) {
    warnings.push(marketGuard.message);
    manualBlock = true;
  }
```

- [ ] **Step 4: Wire guard into `executeManualTrade()`**

In `executeManualTrade()`, after `assetMeta` is resolved and before `normalizeOrderSizing(...)`, add:

```ts
  try {
    assertMarketSessionAllowsExecution({
      market,
      symbol,
      orderType: pricingMode === "market" ? "market" : "manual",
    });
  } catch (error) {
    if (error instanceof MarketSessionExecutionError) {
      throwManualTradeError(error.code, error.message.replace(`${error.code}:`, ""), 409, {
        code: error.code,
        marketStatus: error.status,
      });
    }
    throw error;
  }
```

- [ ] **Step 5: Run targeted tests**

Run:

```bash
pnpm vitest run src/daa/__tests__/workbenchTradeFlowRoute.test.ts -t "闭市时手动预览"
```

Expected: PASS.

- [ ] **Step 6: Run full manual trade route tests**

Run:

```bash
pnpm vitest run src/daa/__tests__/workbenchTradeFlowRoute.test.ts
```

Expected: PASS or SKIP when test DB is unavailable. If tests fail because existing tests use current real time outside market hours, set `vi.setSystemTime(new Date("2026-06-08T14:00:00.000Z"))` in their setup and restore timers in `afterEach`.

- [ ] **Step 7: Commit**

```bash
git add src/daa/modules/workbench/manualTradeService.ts src/daa/__tests__/workbenchTradeFlowRoute.test.ts
git commit -m "feat: guard manual trades by market session"
```

---

### Task 4: 接入再平衡执行与自动执行

**Files:**
- Modify: `src/daa/modules/workbench/workbenchRebalanceCycleService.ts`
- Modify: `src/daa/automation/autoRebalanceExecution.ts`
- Modify: `src/daa/__tests__/autoRebalanceExecutionPolicy.test.ts`

- [ ] **Step 1: Write auto execution failing test**

Append to `src/daa/__tests__/autoRebalanceExecutionPolicy.test.ts`:

```ts
  it("自动执行遇到闭市市场时阻断，不进入执行网关", async () => {
    vi.setSystemTime(new Date("2026-06-08T13:00:00.000Z"));
    try {
      const result = await executeAutoRebalanceCycle({
        cycle: {
          cycleId: "cycle-market-closed",
          proposals: [{
            assetKey: "US::AAPL",
            symbol: "AAPL",
            currency: "USD",
            fxRateToBase: 1,
            side: "BUY",
            suggestedQty: 1,
            suggestedNotional: 100,
            price: 100,
            reason: "test",
            selected: true,
            hfContribution: null,
          }],
          riskCheck: { overallStatus: "pass", items: [] },
          policySnapshot: {
            decision: {
              decisionId: "policy-1",
              action: "authorize_auto_execute",
              source: "drift_monitor",
              score: 100,
              threshold: 70,
              reasons: [],
              blockers: [],
              noTradeBandState: "entered_outer",
              createdAt: new Date().toISOString(),
            },
            intentIds: [],
            signalIds: [],
          },
        },
        systemConfig: {
          policy: {
            enabled: true,
            execution: {
              autoGenerateEnabled: true,
              autoExecuteEnabled: true,
              maxSingleOrderPctOfNav: 1,
            },
          },
        } as never,
        triggerSource: "cron_drift_check",
        totalEquity: 10000,
      });

      expect(result.executed).toBe(false);
      expect(result.blockedReason).toContain("当前不可执行");
    } finally {
      vi.useRealTimers();
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run src/daa/__tests__/autoRebalanceExecutionPolicy.test.ts -t "自动执行遇到闭市市场"
```

Expected: FAIL because no market-session block exists.

- [ ] **Step 3: Guard auto execution**

Modify `src/daa/automation/autoRebalanceExecution.ts` imports:

```ts
import { resolveMarketExecutionGuard } from "@/src/daa/marketSession/marketSessionExecutionGuard";
import { parseDaaAssetKey } from "@/src/daa/assetKey";
```

After `selectedProposalCount` is computed and before `evaluateAutoRebalanceAuthority(...)`, add:

```ts
  const closedProposal = selectedProposals(input.cycle.proposals)
    .map((proposal) => {
      const parsed = parseDaaAssetKey(proposal.assetKey);
      const guard = resolveMarketExecutionGuard({
        market: parsed?.market || "US",
        symbol: proposal.symbol,
        orderType: "market",
      });
      return guard.allowed ? null : { proposal, guard };
    })
    .find((row): row is NonNullable<typeof row> => Boolean(row));

  if (closedProposal) {
    const message = `[market-session 守门] ${closedProposal.guard.message}`;
    logSwallowed(`${input.triggerSource}.autoExecuteMarketSessionGate`, new Error(message));
    return {
      ...base,
      blockedReason: message,
      error: message,
      authority: null,
    };
  }
```

- [ ] **Step 4: Guard rebalance execution**

Modify `src/daa/modules/workbench/workbenchRebalanceCycleService.ts` imports:

```ts
import {
  resolveMarketExecutionGuard,
} from "@/src/daa/marketSession/marketSessionExecutionGuard";
```

In `executeWorkbenchRebalanceCycle()`, after `executionRows` is built and before `const createdTicketIds: string[] = [];`, add:

```ts
  const blockedExecutionRow = executionRows
    .map((row) => {
      const parsed = parseDaaAssetKey(row.assetKey);
      const guard = resolveMarketExecutionGuard({
        market: parsed?.market || "US",
        symbol: row.symbol,
        orderType: "market",
      });
      return guard.allowed ? null : { row, guard };
    })
    .find((item): item is NonNullable<typeof item> => Boolean(item));

  if (blockedExecutionRow) {
    await patchDaaRebalanceCycle({
      cycleId: input.cycleId,
      status: "reviewing",
      notes: `${cycle.notes || ""}\n[market-session] ${blockedExecutionRow.guard.message}`.trim(),
    });
    throw new Error(`MARKET_CLOSED:${JSON.stringify({
      code: blockedExecutionRow.guard.code,
      symbol: blockedExecutionRow.row.symbol,
      marketStatus: blockedExecutionRow.guard.status,
      message: blockedExecutionRow.guard.message,
    })}`);
  }
```

- [ ] **Step 5: Run targeted tests**

Run:

```bash
pnpm vitest run src/daa/__tests__/autoRebalanceExecutionPolicy.test.ts -t "自动执行遇到闭市市场"
```

Expected: PASS.

- [ ] **Step 6: Run execution-related tests**

Run:

```bash
pnpm vitest run src/daa/__tests__/autoRebalanceExecutionPolicy.test.ts src/daa/__tests__/workbenchRebalanceGuards.test.ts src/daa/__tests__/localExecutionGateway.test.ts
```

Expected: PASS. If existing tests depend on current wall-clock time, pin system time in those specific tests to `2026-06-08T14:00:00.000Z`.

- [ ] **Step 7: Commit**

```bash
git add src/daa/automation/autoRebalanceExecution.ts src/daa/modules/workbench/workbenchRebalanceCycleService.ts src/daa/__tests__/autoRebalanceExecutionPolicy.test.ts
git commit -m "feat: guard rebalance execution by market session"
```

---

### Task 5: 修正行情缓存 fresh 语义

**Files:**
- Modify: `src/daa/modules/marketCache/marketCacheService.ts`
- Modify: `src/daa/__tests__/marketCacheService.test.ts`

- [ ] **Step 1: Write failing market cache test**

Append to `src/daa/__tests__/marketCacheService.test.ts`:

```ts
  it("latest close 使用行情 bar 日期作为 priceUpdatedAt，而不是抓取时间", async () => {
    vi.setSystemTime(new Date("2026-06-08T13:00:00.000Z"));
    try {
      yahooFetchChartMock.mockResolvedValue({
        status: 200,
        url: "https://query2.finance.yahoo.com/v8/finance/chart/AAPL",
        payloadText: "{}",
        responseHeaders: {},
        payloadJson: {
          chart: {
            result: [{
              timestamp: [Date.parse("2026-06-05T20:00:00.000Z") / 1000],
              indicators: {
                quote: [{
                  close: [195],
                }],
              },
              meta: {
                regularMarketPrice: 195,
              },
            }],
          },
        },
      });

      const result = await getMarketPricesWithCache({
        assets: [{ market: "US", symbol: "AAPL", currency: "USD" }],
        allowRefresh: true,
        forceRefresh: true,
        refreshBudget: 1,
        freshSec: 60,
        serveStaleSec: 7 * 24 * 3600,
      });

      expect(result["US::AAPL"].price).toBe(195);
      expect(result["US::AAPL"].priceUpdatedAt).toBe("2026-06-05T20:00:00.000Z");
      expect(result["US::AAPL"].priceStatus).toBe("stale");
    } finally {
      vi.useRealTimers();
    }
  });
```

If the test file uses different mock names, adapt only the mock variable names while preserving the expected behavior.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm vitest run src/daa/__tests__/marketCacheService.test.ts -t "latest close 使用行情 bar 日期"
```

Expected: FAIL because `priceUpdatedAt` is current fetch time.

- [ ] **Step 3: Carry bar timestamp through fetch result**

In `src/daa/modules/marketCache/marketCacheService.ts`, extend `FetchResult`:

```ts
type FetchResult = {
  ok: boolean;
  status: number;
  price: number;
  priceAsOf: string | null;
  payloadJson: Record<string, unknown> | null;
  payloadText: string;
  responseHeaders: Record<string, string>;
  requestUrl: string;
  errorCode: string | null;
  errorMessage: string | null;
  retryable: boolean;
};
```

Replace `pickLatestClose(...)` with:

```ts
function pickLatestClose(payload: YfinanceChartPayload | null): { price: number; priceAsOf: string | null } {
  const result = payload?.chart?.result?.[0];
  const closes = Array.isArray(result?.indicators?.quote?.[0]?.close)
    ? result.indicators.quote[0].close
    : [];
  const timestamps = Array.isArray(result?.timestamp) ? result.timestamp : [];

  for (let i = closes.length - 1; i >= 0; i -= 1) {
    const close = Number(closes[i]);
    if (!Number.isFinite(close) || close <= 0) continue;
    const ts = Number(timestamps[i]);
    return {
      price: close,
      priceAsOf: Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : null,
    };
  }
  return { price: 0, priceAsOf: null };
}
```

In all `FetchResult` return objects, add `priceAsOf: null` except the successful branch:

```ts
    const latest = pickLatestClose(typedPayload);
    if (!(latest.price > 0)) {
      return {
        ok: false,
        status: 200,
        price: 0,
        priceAsOf: null,
        payloadJson,
        payloadText: yahooResult.payloadText,
        responseHeaders: yahooResult.responseHeaders,
        requestUrl: yahooResult.url,
        errorCode: "price_missing",
        errorMessage: "latest close missing",
        retryable: false,
      };
    }

    return {
      ok: true,
      status: yahooResult.status,
      price: latest.price,
      priceAsOf: latest.priceAsOf,
      payloadJson,
      payloadText: yahooResult.payloadText,
      responseHeaders: yahooResult.responseHeaders,
      requestUrl: yahooResult.url,
      errorCode: null,
      errorMessage: null,
      retryable: false,
    };
```

- [ ] **Step 4: Save snapshot with `priceAsOf`**

In the `if (fetchResult.ok && fetchResult.price > 0)` branch, replace `priceUpdatedAt: fetchedAt` with:

```ts
              priceUpdatedAt: fetchResult.priceAsOf || fetchedAt,
```

And replace history row `ts: fetchedAt` with:

```ts
              ts: fetchResult.priceAsOf || fetchedAt,
```

- [ ] **Step 5: Run targeted test**

Run:

```bash
pnpm vitest run src/daa/__tests__/marketCacheService.test.ts -t "latest close 使用行情 bar 日期"
```

Expected: PASS.

- [ ] **Step 6: Run market cache tests**

Run:

```bash
pnpm vitest run src/daa/__tests__/marketCacheService.test.ts src/daa/__tests__/cronMarketCacheRoutes.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/daa/modules/marketCache/marketCacheService.ts src/daa/__tests__/marketCacheService.test.ts
git commit -m "fix: preserve market data as-of time in price cache"
```

---

### Task 6: 文档与全量验证

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DEPLOYMENT.md`

- [ ] **Step 1: Document market session architecture**

Add to `docs/ARCHITECTURE.md` after the market data cache section:

```md
### Market Session Guard

所有模拟执行入口都必须经过 `src/daa/marketSession`：

- `marketSessionCalendar.ts` 负责交易所时区、节假日、半日市和交易时段判断。
- `marketSessionExecutionGuard.ts` 负责把市场状态转换成执行层错误码。
- 手动交易、再平衡执行和自动执行共享同一个守门结果。
- 行情缓存中的 `priceUpdatedAt` 表示真实行情 bar 时间，不表示本次抓取时间；抓取时间保存在缓存行 / raw payload 的 fetched 字段。

当前已内置 `US`、`HK`、`CRYPTO`，后续扩展其他市场必须先补日历数据和测试。
```

- [ ] **Step 2: Document operational calendar maintenance**

Add to `docs/DEPLOYMENT.md` in the cron / maintenance section:

```md
### Exchange Calendar Maintenance

每年年末需要检查下一年度交易所日历：

- `src/daa/marketSession/exchangeCalendarData.ts`
- 美股：常规休市日与半日市。
- 港股：公众假期、交易所特别休市、午休保持 12:00-13:00。
- 如果交易所有临时休市，先更新该文件并部署，再允许自动执行恢复。

未配置市场默认不能执行市价模拟成交，避免把未知市场误当 24/7。
```

- [ ] **Step 3: Run focused verification**

Run:

```bash
pnpm vitest run \
  src/daa/__tests__/marketSessionCalendar.test.ts \
  src/daa/__tests__/marketSessionExecutionGuard.test.ts \
  src/daa/__tests__/workbenchTradeFlowRoute.test.ts \
  src/daa/__tests__/autoRebalanceExecutionPolicy.test.ts \
  src/daa/__tests__/marketCacheService.test.ts
```

Expected: PASS or DB-dependent route tests SKIP when test DB is unavailable.

- [ ] **Step 4: Run typecheck**

Run:

```bash
pnpm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Run full tests if time allows**

Run:

```bash
pnpm test
```

Expected: PASS. If unrelated DB availability tests skip, record that in final handoff.

- [ ] **Step 6: Commit docs and final verification**

```bash
git add docs/ARCHITECTURE.md docs/DEPLOYMENT.md
git commit -m "docs: document market session guard"
```

---

## Self-Review

**Spec coverage:** 计划覆盖节假日、周末、开盘前、盘中、午休、收盘后、半日市、crypto 24/7、手动执行、自动执行、再平衡执行和行情 fresh 语义。

**Placeholder scan:** 无 `TBD`、`TODO`、`implement later`。每个代码任务都有具体测试、代码片段、运行命令与预期结果。

**Type consistency:** `MarketSessionStatus`、`MarketSessionExecutionError`、`resolveMarketExecutionGuard()`、`assertMarketSessionAllowsExecution()` 在所有任务中命名一致。

**Residual risk:** 计划内的 2026 交易所假日数据需要在实施时用官方交易所日历复核一次；这是数据准确性要求，不应交给业务逻辑猜测。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-08-market-session-calendar-refactor.md`. Two execution options:

1. **Subagent-Driven (recommended)** - fresh worker per task, review between tasks, better for this cross-cutting refactor.
2. **Inline Execution** - execute tasks in this session using checkpoints.

Recommended: **Subagent-Driven**，因为这里同时影响执行、自动化、行情缓存和文档，分任务审查更容易控制回归风险。
