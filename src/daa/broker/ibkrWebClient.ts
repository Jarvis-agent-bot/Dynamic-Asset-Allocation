import type { TradeTicketSide } from "@/src/daa/modules/trade/tradeTypes";

import type {
  DaaBrokerAccountSummary,
  DaaBrokerOrder,
  DaaBrokerPlaceOrderInput,
  DaaBrokerPlaceOrderResult,
  DaaBrokerPosition,
} from "./brokerTypes";
import type { DaaIbkrPaperRuntimeConfig } from "./brokerConfig";

type JsonObject = Record<string, unknown>;

const REQUEST_TIMEOUT_MS = 12000;

const MARKET_EXCHANGE_HINTS: Record<string, string[]> = {
  US: ["SMART", "NASDAQ", "NYSE", "AMEX", "ARCA"],
  HK: ["SMART", "SEHK", "HKEX"],
};

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toFiniteOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function toArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function normalizeMarketFromIbkr(input: {
  market?: unknown;
  listingExchange?: unknown;
  exchange?: unknown;
  contractDesc?: unknown;
}): string {
  const tokens = [
    normalizeText(input.market).toUpperCase(),
    normalizeText(input.listingExchange).toUpperCase(),
    normalizeText(input.exchange).toUpperCase(),
    normalizeText(input.contractDesc).toUpperCase(),
  ].filter(Boolean);

  if (tokens.some((token) => token.includes("SEHK") || token.includes("HKEX") || token === "HK")) return "HK";
  if (tokens.some((token) => token.includes("NASDAQ") || token.includes("NYSE") || token.includes("ARCA") || token === "US")) return "US";
  return "US";
}

function extractSummaryValue(rows: unknown, keys: string[]): number | null {
  const normalizedKeys = new Set(keys.map((item) => item.toLowerCase()));
  for (const row of toArray(rows)) {
    if (!isRecord(row)) continue;
    const tag = normalizeText(row.tag || row.key).toLowerCase();
    if (!normalizedKeys.has(tag)) continue;
    const candidate = row.amount ?? row.value ?? row.currentValue;
    const amount = toNumber(candidate, Number.NaN);
    if (Number.isFinite(amount)) return amount;
  }
  return null;
}

function normalizeSide(value: unknown): TradeTicketSide {
  return normalizeText(value).toUpperCase() === "SELL" ? "SELL" : "BUY";
}

export class IbkrWebClientError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status = 500, details: unknown = null) {
    super(message);
    this.name = "IbkrWebClientError";
    this.status = status;
    this.details = details;
  }
}

export class IbkrWebClient {
  private readonly baseUrl: string;
  private readonly config: DaaIbkrPaperRuntimeConfig;
  private cachedAccountId: string | null = null;
  private cachedAccountAlias: string | null = null;

  constructor(config: DaaIbkrPaperRuntimeConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
  }

  private buildHeaders(init?: HeadersInit): Headers {
    const headers = new Headers(init || {});
    headers.set("accept", "application/json");
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    if (this.config.sessionCookie) headers.set("cookie", this.config.sessionCookie);
    if (this.config.oauthToken) headers.set("authorization", `Bearer ${this.config.oauthToken}`);
    if (this.config.csrfToken) headers.set("x-csrf-token", this.config.csrfToken);
    return headers;
  }

  private async requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.baseUrl) {
      throw new IbkrWebClientError("IBKR Web API base URL 未配置", 500);
    }
    if (!this.config.sessionCookie && !this.config.oauthToken) {
      throw new IbkrWebClientError("缺少 IBKR 会话凭证，请配置 Session Cookie 或 OAuth Token", 500);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: this.buildHeaders(init.headers),
        cache: "no-store",
        signal: controller.signal,
      });
      const rawText = await response.text();
      const parsed = rawText ? JSON.parse(rawText) as T : null;
      if (!response.ok) {
        throw new IbkrWebClientError(
          `IBKR 请求失败: ${response.status}`,
          response.status,
          parsed,
        );
      }
      return parsed as T;
    } catch (error) {
      if (error instanceof IbkrWebClientError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new IbkrWebClientError("IBKR 请求超时", 504);
      }
      throw new IbkrWebClientError(error instanceof Error ? error.message : "IBKR 请求失败", 500);
    } finally {
      clearTimeout(timer);
    }
  }

  private async ensureAccountIdentity(): Promise<{ accountId: string; accountAlias: string | null }> {
    if (this.cachedAccountId) {
      return {
        accountId: this.cachedAccountId,
        accountAlias: this.cachedAccountAlias,
      };
    }

    const [trading, portfolio] = await Promise.all([
      this.requestJson<JsonObject>("/iserver/accounts"),
      this.requestJson<Array<JsonObject>>("/portfolio/accounts"),
    ]);

    const configured = normalizeText(this.config.accountId);
    const tradingAccounts = toArray<string>(trading.accounts).map((item) => normalizeText(item)).filter(Boolean);
    const selected = normalizeText(trading.selectedAccount);
    const portfolioAccounts = toArray<JsonObject>(portfolio).map((row) => ({
      id: normalizeText(row.id || row.accountId || row.accountVan),
      alias: normalizeText(row.accountTitle || row.alias || row.accountAlias) || null,
    })).filter((row) => row.id);

    const preferred = configured
      || (selected && tradingAccounts.includes(selected) ? selected : "")
      || tradingAccounts[0]
      || portfolioAccounts[0]?.id
      || "";

    if (!preferred) {
      throw new IbkrWebClientError("未找到可用的 IBKR 账户", 404, { trading, portfolio });
    }

    const matchedAlias = portfolioAccounts.find((item) => item.id === preferred)?.alias || null;
    this.cachedAccountId = preferred;
    this.cachedAccountAlias = matchedAlias;
    return { accountId: preferred, accountAlias: matchedAlias };
  }

  async getAccountSummary(accountId?: string | null): Promise<DaaBrokerAccountSummary> {
    const identity = await this.ensureAccountIdentity();
    const resolvedAccountId = normalizeText(accountId) || identity.accountId;
    const [ledger, summary] = await Promise.all([
      this.requestJson<JsonObject>(`/portfolio/${resolvedAccountId}/ledger`),
      this.requestJson<Array<JsonObject>>(`/portfolio/${resolvedAccountId}/summary`),
    ]);

    const baseCurrency = normalizeText(ledger.basecurrency) || "USD";
    const baseLedger = isRecord(ledger[baseCurrency]) ? ledger[baseCurrency] as JsonObject : null;
    const cash = toNumber(baseLedger?.cashbalance ?? ledger.cashbalance, 0);
    const availableFunds = extractSummaryValue(summary, ["availablefunds", "available_funds"]);
    const buyingPower = extractSummaryValue(summary, ["buyingpower", "buying_power"]);
    const netLiquidation = extractSummaryValue(summary, ["netliquidation", "net_liquidation"]);
    const investableCash = availableFunds != null ? Math.max(0, availableFunds) : cash;
    const frozenCash = Math.max(0, cash - investableCash);

    return {
      broker: "ibkr_paper",
      accountId: resolvedAccountId,
      accountAlias: identity.accountAlias,
      baseCurrency,
      cash: Math.max(0, cash),
      investableCash,
      frozenCash,
      totalEquity: netLiquidation,
      buyingPower,
      netLiquidation,
      updatedAt: new Date().toISOString(),
    };
  }

  async getPositions(accountId?: string | null): Promise<DaaBrokerPosition[]> {
    const identity = await this.ensureAccountIdentity();
    const resolvedAccountId = normalizeText(accountId) || identity.accountId;

    const out: DaaBrokerPosition[] = [];
    for (let page = 0; page < 10; page += 1) {
      const rows = await this.requestJson<Array<JsonObject>>(`/portfolio/${resolvedAccountId}/positions/${page}`);
      if (!rows.length) break;
      for (const row of rows) {
        const qty = toNumber(row.position, 0);
        if (!(qty > 0)) continue;
        const symbol = normalizeText(row.ticker || row.contractDesc || row.description).toUpperCase();
        if (!symbol) continue;
        const market = normalizeMarketFromIbkr({
          market: row.countryCode,
          listingExchange: row.listingExchange,
          exchange: row.exchange,
          contractDesc: row.contractDesc,
        });
        const avgCost = toNumber(row.avgPrice ?? row.avgCost, 0);
        const marketPrice = toNumber(row.mktPrice, avgCost);
        out.push({
          broker: "ibkr_paper",
          accountId: resolvedAccountId,
          assetKey: `${market}::${symbol}`,
          symbol,
          market,
          currency: normalizeText(row.currency).toUpperCase() || "USD",
          qty,
          price: avgCost > 0 ? avgCost : marketPrice,
          costBasis: avgCost > 0 ? avgCost * qty : null,
          lastPrice: marketPrice > 0 ? marketPrice : null,
          marketValue: toFiniteOrNull(row.mktValue),
          brokerConid: normalizeText(row.conid) || null,
          updatedAt: new Date().toISOString(),
        });
      }
      if (rows.length < 100) break;
    }

    return out;
  }

  async listOrders(input: { accountId?: string | null; limit?: number } = {}): Promise<DaaBrokerOrder[]> {
    const identity = await this.ensureAccountIdentity();
    const resolvedAccountId = normalizeText(input.accountId) || identity.accountId;
    const payload = await this.requestJson<JsonObject>(`/iserver/account/orders?force=true&accountId=${encodeURIComponent(resolvedAccountId)}`);
    const rows = toArray<JsonObject>(payload.orders);
    return rows
      .map((row) => this.mapOrderRow(row, resolvedAccountId))
      .slice(0, Math.max(1, input.limit ?? 100));
  }

  async getOrder(orderId: string, accountId?: string | null): Promise<DaaBrokerOrder | null> {
    const orders = await this.listOrders({ accountId, limit: 200 });
    return orders.find((item) => item.orderId === orderId) || null;
  }

  async placeOrder(input: DaaBrokerPlaceOrderInput): Promise<DaaBrokerPlaceOrderResult> {
    const identity = await this.ensureAccountIdentity();
    const resolvedAccountId = normalizeText(input.accountId) || identity.accountId;
    const contract = await this.resolveContract(input.symbol, input.market);
    const response = await this.requestJson<unknown>(`/iserver/account/${encodeURIComponent(resolvedAccountId)}/orders`, {
      method: "POST",
      body: JSON.stringify({
        orders: [{
          acctId: resolvedAccountId,
          conid: contract.conid,
          secType: `${contract.conid}:STK`,
          cOID: `daa-${Date.now()}`,
          orderType: input.orderType,
          side: input.side,
          tif: input.timeInForce || "DAY",
          quantity: Number(input.qty.toFixed(6)),
          ...(input.orderType === "LMT" ? { price: input.limitPrice ?? input.referencePrice } : {}),
          referrer: "DAA",
        }],
      }),
    });

    const confirmation = await this.resolveOrderSubmission(response);
    return {
      accepted: confirmation.accepted,
      order: {
        broker: "ibkr_paper",
        accountId: resolvedAccountId,
        orderId: confirmation.orderId,
        symbol: input.symbol.toUpperCase(),
        market: input.market.toUpperCase(),
        currency: input.currency.toUpperCase(),
        side: input.side,
        qty: input.qty,
        filledQty: null,
        orderType: input.orderType,
        referencePrice: input.referencePrice,
        limitPrice: input.orderType === "LMT" ? (input.limitPrice ?? input.referencePrice) : null,
        avgFillPrice: null,
        status: confirmation.status,
        submittedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        raw: confirmation.raw,
      },
      messages: confirmation.messages,
      warnings: confirmation.warnings,
    };
  }

  private async resolveContract(symbolRaw: string, marketRaw: string): Promise<{ conid: string }> {
    const symbol = normalizeText(symbolRaw).toUpperCase();
    const market = normalizeText(marketRaw).toUpperCase() || "US";
    if (!symbol) throw new IbkrWebClientError("symbol 不能为空", 400);

    const payload = await this.requestJson<Record<string, unknown>>(`/trsrv/stocks?symbols=${encodeURIComponent(symbol)}`);
    const groups = toArray<JsonObject>(payload[symbol]);
    const contracts = groups
      .flatMap((group) => toArray<JsonObject>(group.contracts))
      .map((item) => ({
        conid: normalizeText(item.conid),
        exchange: normalizeText(item.exchange).toUpperCase(),
        isUS: Boolean(item.isUS),
      }))
      .filter((item) => item.conid);

    if (!contracts.length) {
      throw new IbkrWebClientError(`IBKR 未返回 ${symbol} 的可交易合约`, 404, payload);
    }

    const hints = MARKET_EXCHANGE_HINTS[market] || [];
    const selected = contracts.find((item) => hints.includes(item.exchange))
      || contracts.find((item) => market === "US" ? item.isUS : true)
      || contracts[0];

    return { conid: selected.conid };
  }

  private mapOrderRow(row: JsonObject, accountId: string): DaaBrokerOrder {
    const symbol = normalizeText(row.ticker || row.symbol).toUpperCase();
    const market = normalizeMarketFromIbkr({
      market: row.countryCode,
      listingExchange: row.listingExchange,
      exchange: row.exchange,
      contractDesc: row.description,
    });
    const qty = toNumber(row.totalSize ?? row.size, 0);
    return {
      broker: "ibkr_paper",
      accountId,
      orderId: normalizeText(row.orderId || row.order_id),
      symbol,
      market,
      currency: normalizeText(row.currency).toUpperCase() || "USD",
      side: normalizeSide(row.side),
      qty,
      filledQty: toFiniteOrNull(row.filledQuantity ?? row.filledSize),
      orderType: normalizeText(row.orderType).toUpperCase() === "LMT" ? "LMT" : "MKT",
      referencePrice: toFiniteOrNull(row.price),
      limitPrice: toFiniteOrNull(row.price),
      avgFillPrice: toFiniteOrNull(row.avgPrice ?? row.avgFillPrice),
      status: normalizeText(row.status || row.order_status || row.orderStatus) || "unknown",
      submittedAt: normalizeText(row.lastExecutionTime || row.created_at) || null,
      updatedAt: new Date().toISOString(),
      raw: row,
    };
  }

  private async resolveOrderSubmission(payload: unknown, depth = 0): Promise<{
    accepted: boolean;
    orderId: string;
    status: string;
    messages: string[];
    warnings: string[];
    raw: JsonObject | null;
  }> {
    const current = Array.isArray(payload) ? payload[0] : payload;
    if (!isRecord(current)) {
      throw new IbkrWebClientError("IBKR 下单响应格式无法识别", 502, payload);
    }

    const orderId = normalizeText(current.order_id || current.orderId);
    const status = normalizeText(current.order_status || current.orderStatus || current.status) || (orderId ? "Submitted" : "pending");
    const messages = [
      ...toArray(current.message).map((item) => normalizeText(item)).filter(Boolean),
      normalizeText(current.text),
    ].filter(Boolean);
    const warnings = [
      ...toArray(current.warning_message).map((item) => normalizeText(item)).filter(Boolean),
      normalizeText(current.warningMessage),
    ].filter(Boolean);

    if (orderId) {
      return {
        accepted: true,
        orderId,
        status,
        messages,
        warnings,
        raw: current,
      };
    }

    const replyId = normalizeText(current.id);
    if (replyId && depth < 3) {
      const replied = await this.requestJson<unknown>(`/iserver/reply/${encodeURIComponent(replyId)}`, {
        method: "POST",
        body: JSON.stringify({ confirmed: true }),
      });
      const next = await this.resolveOrderSubmission(replied, depth + 1);
      return {
        ...next,
        messages: [...messages, ...next.messages],
        warnings: [...warnings, ...next.warnings],
      };
    }

    throw new IbkrWebClientError(
      messages[0] || "IBKR 下单未返回 orderId",
      502,
      current,
    );
  }
}
