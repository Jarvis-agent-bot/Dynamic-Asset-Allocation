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
