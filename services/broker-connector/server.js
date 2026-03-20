const http = require("node:http");
const { URL } = require("node:url");

const REQUEST_TIMEOUT_MS = 12000;
const MARKET_EXCHANGE_HINTS = {
  US: ["SMART", "NASDAQ", "NYSE", "AMEX", "ARCA"],
  HK: ["SMART", "SEHK", "HKEX"],
};

const state = {
  requestedLoginAt: null,
  lastAuthenticatedAt: null,
  lastError: null,
  sessionCookieOverride: null,
  oauthTokenOverride: null,
  csrfTokenOverride: null,
};

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toFiniteOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isRecord(value) {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function getEnvConfig() {
  return {
    baseUrl: normalizeText(process.env.IBKR_WEB_API_BASE_URL || process.env.DAA_IBKR_WEB_API_BASE_URL || "https://api.ibkr.com/v1/api").replace(/\/+$/, ""),
    accountId: normalizeText(process.env.IBKR_ACCOUNT_ID || process.env.DAA_IBKR_ACCOUNT_ID) || null,
    sessionCookie: state.sessionCookieOverride || normalizeText(process.env.IBKR_WEB_API_SESSION_COOKIE || process.env.DAA_IBKR_WEB_API_SESSION_COOKIE) || null,
    oauthToken: state.oauthTokenOverride || normalizeText(process.env.IBKR_WEB_API_OAUTH_TOKEN || process.env.DAA_IBKR_WEB_API_OAUTH_TOKEN) || null,
    csrfToken: state.csrfTokenOverride || normalizeText(process.env.IBKR_WEB_API_CSRF_TOKEN || process.env.DAA_IBKR_WEB_API_CSRF_TOKEN) || null,
    loginUrl: normalizeText(process.env.BROKER_CONNECTOR_LOGIN_URL || process.env.IBKR_WEB_API_BASE_URL || "https://localhost:5000"),
    sharedSecret: normalizeText(process.env.BROKER_CONNECTOR_SHARED_SECRET || process.env.DAA_BROKER_CONNECTOR_SHARED_SECRET) || null,
  };
}

function buildHeaders(config, initHeaders) {
  const headers = new Headers(initHeaders || {});
  headers.set("accept", "application/json");
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  if (config.sessionCookie) headers.set("cookie", config.sessionCookie);
  if (config.oauthToken) headers.set("authorization", `Bearer ${config.oauthToken}`);
  if (config.csrfToken) headers.set("x-csrf-token", config.csrfToken);
  return headers;
}

async function requestJson(config, path, init = {}) {
  if (!config.baseUrl) {
    throw new Error("IBKR Web API base url 未配置");
  }
  if (!config.sessionCookie && !config.oauthToken) {
    throw new Error("缺少 IBKR 会话凭证");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      headers: buildHeaders(config, init.headers),
      cache: "no-store",
      signal: controller.signal,
    });
    const rawText = await response.text();
    const parsed = rawText ? JSON.parse(rawText) : null;
    if (!response.ok) {
      const error = new Error(`IBKR 请求失败: ${response.status}`);
      error.status = response.status;
      error.details = parsed;
      throw error;
    }
    return parsed;
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error("IBKR 请求超时");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeMarketFromIbkr(input) {
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

function extractSummaryValue(rows, keys) {
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

function normalizeSide(value) {
  return normalizeText(value).toUpperCase() === "SELL" ? "SELL" : "BUY";
}

function mapTradeStatus(statusRaw) {
  const status = normalizeText(statusRaw).toLowerCase();
  if (status === "pendingsubmit" || status === "presubmitted" || status === "submitted") return "submitted";
  if (status === "partiallyfilled") return "partially_filled";
  if (status === "filled" || status === "executed") return "executed";
  if (status === "cancelled" || status === "apicancelled") return "canceled";
  if (status === "inactive" || status === "rejected") return "rejected";
  return "submitted";
}

async function ensureAccountIdentity(config) {
  const [trading, portfolio] = await Promise.all([
    requestJson(config, "/iserver/accounts"),
    requestJson(config, "/portfolio/accounts"),
  ]);

  const configured = normalizeText(config.accountId);
  const tradingAccounts = toArray(trading.accounts).map((item) => normalizeText(item)).filter(Boolean);
  const selected = normalizeText(trading.selectedAccount);
  const portfolioAccounts = toArray(portfolio).map((row) => ({
    id: normalizeText(row.id || row.accountId || row.accountVan),
    alias: normalizeText(row.accountTitle || row.alias || row.accountAlias) || null,
  })).filter((row) => row.id);

  const preferred = configured
    || (selected && tradingAccounts.includes(selected) ? selected : "")
    || tradingAccounts[0]
    || (portfolioAccounts[0] ? portfolioAccounts[0].id : "")
    || "";

  if (!preferred) {
    throw new Error("未找到可用的 IBKR 账户");
  }

  const accountAlias = (portfolioAccounts.find((item) => item.id === preferred) || {}).alias || null;
  return { accountId: preferred, accountAlias };
}

async function getAccountSummary(config, accountId) {
  const identity = await ensureAccountIdentity(config);
  const resolvedAccountId = normalizeText(accountId) || identity.accountId;
  const [ledger, summary] = await Promise.all([
    requestJson(config, `/portfolio/${resolvedAccountId}/ledger`),
    requestJson(config, `/portfolio/${resolvedAccountId}/summary`),
  ]);

  const baseCurrency = normalizeText(ledger.basecurrency) || "USD";
  const baseLedger = isRecord(ledger[baseCurrency]) ? ledger[baseCurrency] : null;
  const cash = toNumber(baseLedger ? baseLedger.cashbalance : ledger.cashbalance, 0);
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

async function getPositions(config, accountId) {
  const identity = await ensureAccountIdentity(config);
  const resolvedAccountId = normalizeText(accountId) || identity.accountId;

  const out = [];
  for (let page = 0; page < 10; page += 1) {
    const rows = await requestJson(config, `/portfolio/${resolvedAccountId}/positions/${page}`);
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

async function resolveContract(config, symbolRaw, marketRaw) {
  const symbol = normalizeText(symbolRaw).toUpperCase();
  const market = normalizeText(marketRaw).toUpperCase() || "US";
  const payload = await requestJson(config, `/trsrv/stocks?symbols=${encodeURIComponent(symbol)}`);
  const groups = toArray(payload[symbol]);
  const contracts = groups
    .flatMap((group) => toArray(group.contracts))
    .map((item) => ({
      conid: normalizeText(item.conid),
      exchange: normalizeText(item.exchange).toUpperCase(),
      isUS: Boolean(item.isUS),
    }))
    .filter((item) => item.conid);

  if (!contracts.length) {
    throw new Error(`IBKR 未返回 ${symbol} 的可交易合约`);
  }

  const hints = MARKET_EXCHANGE_HINTS[market] || [];
  const selected = contracts.find((item) => hints.includes(item.exchange))
    || contracts.find((item) => market === "US" ? item.isUS : true)
    || contracts[0];
  return { conid: selected.conid };
}

function mapOrderRow(row, accountId) {
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

async function listOrders(config, input = {}) {
  const identity = await ensureAccountIdentity(config);
  const resolvedAccountId = normalizeText(input.accountId) || identity.accountId;
  const payload = await requestJson(config, `/iserver/account/orders?force=true&accountId=${encodeURIComponent(resolvedAccountId)}`);
  const rows = toArray(payload.orders).map((row) => mapOrderRow(row, resolvedAccountId));
  const scope = normalizeText(input.scope).toLowerCase();
  const limit = Math.max(1, Math.min(200, Math.trunc(toNumber(input.limit, 100))));
  if (scope === "open") {
    return rows.filter((row) => {
      const status = mapTradeStatus(row.status);
      return status === "submitted" || status === "partially_filled";
    }).slice(0, limit);
  }
  return rows.slice(0, limit);
}

async function getOrder(config, orderId, accountId) {
  const orders = await listOrders(config, { accountId, limit: 200, scope: "all" });
  return orders.find((item) => item.orderId === orderId) || null;
}

async function resolveOrderSubmission(config, payload, depth = 0) {
  const current = Array.isArray(payload) ? payload[0] : payload;
  if (!isRecord(current)) {
    throw new Error("IBKR 下单响应格式无法识别");
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
    const replied = await requestJson(config, `/iserver/reply/${encodeURIComponent(replyId)}`, {
      method: "POST",
      body: JSON.stringify({ confirmed: true }),
    });
    const next = await resolveOrderSubmission(config, replied, depth + 1);
    return {
      ...next,
      messages: [...messages, ...next.messages],
      warnings: [...warnings, ...next.warnings],
    };
  }

  throw new Error(messages[0] || "IBKR 下单未返回 orderId");
}

async function placeOrder(config, input) {
  const identity = await ensureAccountIdentity(config);
  const resolvedAccountId = normalizeText(input.accountId) || identity.accountId;
  const contract = await resolveContract(config, input.symbol, input.market);
  const response = await requestJson(config, `/iserver/account/${encodeURIComponent(resolvedAccountId)}/orders`, {
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
        quantity: Number(Number(input.qty).toFixed(6)),
        ...(input.orderType === "LMT" ? { price: input.limitPrice ?? input.referencePrice } : {}),
        referrer: "DAA",
      }],
    }),
  });

  const confirmation = await resolveOrderSubmission(config, response);
  return {
    accepted: confirmation.accepted,
    order: {
      broker: "ibkr_paper",
      accountId: resolvedAccountId,
      orderId: confirmation.orderId,
      symbol: normalizeText(input.symbol).toUpperCase(),
      market: normalizeText(input.market).toUpperCase(),
      currency: normalizeText(input.currency).toUpperCase(),
      side: input.side,
      qty: Number(input.qty),
      filledQty: null,
      orderType: input.orderType,
      referencePrice: Number(input.referencePrice),
      limitPrice: input.orderType === "LMT" ? Number(input.limitPrice ?? input.referencePrice) : null,
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

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function requireConnectorSecret(req, res) {
  const config = getEnvConfig();
  if (!config.sharedSecret) return true;
  const provided = normalizeText(req.headers["x-daa-broker-secret"]);
  if (provided && provided === config.sharedSecret) return true;
  sendJson(res, 401, { ok: false, error: "unauthorized" });
  return false;
}

async function buildSessionState() {
  const config = getEnvConfig();
  const checkedAt = new Date().toISOString();
  if (!config.sessionCookie && !config.oauthToken) {
    return {
      broker: "ibkr_paper",
      status: state.requestedLoginAt ? "pending_login" : "disconnected",
      accountId: config.accountId,
      loginUrl: config.loginUrl || null,
      message: state.requestedLoginAt ? "已生成登录入口，等待在 Broker 页面完成认证。" : "当前还没有可用的 IBKR 会话凭证。",
      checkedAt,
      authenticatedAt: state.lastAuthenticatedAt,
      lastError: state.lastError,
      sessionMeta: {
        connectorMode: "standalone",
        hasCredential: false,
      },
    };
  }

  try {
    const identity = await ensureAccountIdentity(config);
    state.lastAuthenticatedAt = checkedAt;
    state.lastError = null;
    return {
      broker: "ibkr_paper",
      status: "authenticated",
      accountId: identity.accountId,
      loginUrl: config.loginUrl || null,
      message: "Broker Connector 已拿到可用会话，可以代理账户与订单请求。",
      checkedAt,
      authenticatedAt: checkedAt,
      lastError: null,
      sessionMeta: {
        connectorMode: "standalone",
        hasCredential: true,
        accountAlias: identity.accountAlias,
      },
    };
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : String(error);
    return {
      broker: "ibkr_paper",
      status: "reauth_required",
      accountId: config.accountId,
      loginUrl: config.loginUrl || null,
      message: "检测到凭证但认证失败，需要重新登录或更新会话。",
      checkedAt,
      authenticatedAt: state.lastAuthenticatedAt,
      lastError: state.lastError,
      sessionMeta: {
        connectorMode: "standalone",
        hasCredential: true,
      },
    };
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    if (req.method === "GET" && url.pathname === "/health") {
      return sendJson(res, 200, { ok: true, service: "broker-connector", now: new Date().toISOString() });
    }
    if (!requireConnectorSecret(req, res)) return;

    if (req.method === "GET" && url.pathname === "/session/status") {
      return sendJson(res, 200, { ok: true, session: await buildSessionState() });
    }

    if (req.method === "POST" && url.pathname === "/session/start") {
      const body = await readBody(req);
      const sessionCookie = normalizeText(body.sessionCookie);
      const oauthToken = normalizeText(body.oauthToken);
      const csrfToken = normalizeText(body.csrfToken);
      if (sessionCookie) state.sessionCookieOverride = sessionCookie;
      if (oauthToken) state.oauthTokenOverride = oauthToken;
      if (csrfToken) state.csrfTokenOverride = csrfToken;
      state.requestedLoginAt = new Date().toISOString();
      return sendJson(res, 200, { ok: true, session: await buildSessionState() });
    }

    if (req.method === "POST" && url.pathname === "/session/logout") {
      state.requestedLoginAt = null;
      state.lastAuthenticatedAt = null;
      state.sessionCookieOverride = null;
      state.oauthTokenOverride = null;
      state.csrfTokenOverride = null;
      state.lastError = null;
      return sendJson(res, 200, {
        ok: true,
        session: await buildSessionState(),
      });
    }

    const config = getEnvConfig();

    if (req.method === "GET" && url.pathname === "/account/summary") {
      const account = await getAccountSummary(config, url.searchParams.get("accountId"));
      return sendJson(res, 200, { ok: true, account });
    }

    if (req.method === "GET" && url.pathname === "/positions") {
      const positions = await getPositions(config, url.searchParams.get("accountId"));
      return sendJson(res, 200, { ok: true, positions });
    }

    if (req.method === "GET" && url.pathname === "/orders") {
      const orders = await listOrders(config, {
        accountId: url.searchParams.get("accountId"),
        limit: url.searchParams.get("limit"),
        scope: url.searchParams.get("scope") || "all",
      });
      return sendJson(res, 200, { ok: true, orders });
    }

    if (req.method === "GET" && url.pathname.startsWith("/orders/")) {
      const orderId = decodeURIComponent(url.pathname.slice("/orders/".length));
      const order = await getOrder(config, orderId, url.searchParams.get("accountId"));
      if (!order) {
        return sendJson(res, 404, { ok: false, error: "order_not_found" });
      }
      return sendJson(res, 200, { ok: true, order });
    }

    if (req.method === "POST" && url.pathname === "/orders/submit") {
      const body = await readBody(req);
      const result = await placeOrder(config, body || {});
      return sendJson(res, 200, { ok: true, result });
    }

    return sendJson(res, 404, { ok: false, error: "not_found" });
  } catch (error) {
    return sendJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

const port = Math.max(1, Math.trunc(Number(process.env.PORT || process.env.BROKER_CONNECTOR_PORT || 8787)));
const host = normalizeText(process.env.HOST || process.env.BROKER_CONNECTOR_HOST || "127.0.0.1") || "127.0.0.1";

server.listen(port, host, () => {
  console.log(`[broker-connector] listening on http://${host}:${port}`);
});
