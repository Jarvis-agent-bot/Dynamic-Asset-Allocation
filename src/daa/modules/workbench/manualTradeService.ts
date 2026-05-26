import { parseDaaAssetKey } from "@/src/daa/assetKey";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import { recordTradeOutcomeAsEvidence } from "@/src/daa/agent/tradeOutcomeFeedback";
import { resolveInvestableCash } from "@/src/daa/account/resolveInvestableCash";
import { resolveExecutionRoute, syncBrokerOrders, type DaaBrokerBackedExecutionResult } from "./executionVenue";
import { getStrategyExecutionConfig } from "@/src/daa/config/systemConfig";
import { getMarketPricesWithCache } from "@/src/daa/modules/marketCache/marketCacheService";
import { buildFxLookupToBase, resolveFxRateToBase } from "@/src/daa/modules/portfolio/portfolioValuation";
import {
  applyDaaBrokerOrderSync,
  createDaaTradeTicket,
  executeDaaTradeTickets,
  getDaaSystemConfig,
  listDaaAssetUniverse,
  listDaaFxRates,
  listDaaTradeTickets,
  updateDaaAssetUniverseLastPrice,
} from "@/src/daa/store/daaStorePg";
import { toPositive } from "@/src/daa/utils/normalize";
import { toYfinanceSymbolByMarket } from "@/src/market/yfinanceSymbol";

import { buildWorkbenchBootstrap } from "./workbenchReadService";
import { validateExecutionRisk } from "./workbenchExecutionService";
import { normalizeOrderSizing } from "./orderSizing";
import { normalizeReasonTags, normalizeTradeSide } from "./tradeNormalization";

export class ManualTradeServiceError extends Error {
  code: string;
  status: number;
  details: Record<string, unknown> | null;

  constructor(input: {
    code: string;
    message: string;
    status?: number;
    details?: Record<string, unknown> | null;
  }) {
    super(input.message);
    this.name = "ManualTradeServiceError";
    this.code = input.code;
    this.status = input.status ?? 400;
    this.details = input.details ?? null;
  }
}

export type PreviewManualTradeInput = {
  assetKey: string;
  side: "BUY" | "SELL";
  qty?: number | null;
  notional?: number | null;
  sellAll?: boolean | null;
  feeRateBps?: number | null;
};

export type PreviewManualTradeResult = {
  assetKey: string;
  symbol: string;
  market: string;
  currency: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  sellAll?: boolean;
  grossNotional: number;
  fee: number;
  feeInBase: number | null;
  fxRateToBase: number | null;
  notionalInBase: number | null;
  baseCurrency: string;
  accountCash: number;
  holdingQty: number;
  canSubmit: boolean;
  priceSource: string;
  priceSnapshotAt: string | null;
  warnings: string[];
  riskCheck: Awaited<ReturnType<typeof validateExecutionRisk>>;
  feeRateBps: number;
};

export type ExecuteManualTradeInput = {
  source?: unknown;
  origin?: unknown;
  side?: unknown;
  assetKey?: unknown;
  cycleId?: unknown;
  symbol?: unknown;
  market?: unknown;
  currency?: unknown;
  qty?: unknown;
  price?: unknown;
  sellAll?: unknown;
  fee?: unknown;
  pricingMode?: unknown;
  priceSource?: unknown;
  priceSnapshotAt?: unknown;
  decisionRefId?: unknown;
  reasonTags?: unknown;
  reasonText?: unknown;
  createdBy?: unknown;
};

export type ExecuteManualTradeResult = DaaBrokerBackedExecutionResult;

function toNonNegative(v: unknown): number | null {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function normalizeSource(v: unknown): "manual" | "decision" {
  const source = String(v || "").trim().toLowerCase();
  if (source === "decision" || source === "recommendation") return "decision";
  return "manual";
}

function normalizePricingMode(v: unknown): "manual" | "market" {
  return String(v || "").trim().toLowerCase() === "market" ? "market" : "manual";
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error || "unknown_error");
}

function throwManualTradeError(
  code: string,
  message: string,
  status = 400,
  details: Record<string, unknown> | null = null,
): never {
  throw new ManualTradeServiceError({ code, message, status, details });
}

export async function previewManualTrade(input: PreviewManualTradeInput): Promise<PreviewManualTradeResult> {
  const parsed = parseDaaAssetKey(input.assetKey);
  if (!parsed) throwManualTradeError("VALIDATION_FAILED", "assetKey is required", 400);

  const [bootstrap, fxRows, systemRow] = await Promise.all([
    buildWorkbenchBootstrap({ syncPrices: false }),
    listDaaFxRates(),
    getDaaSystemConfig(),
  ]);
  const universeRows = await listDaaAssetUniverse();
  const defaultFeeRateBps = getStrategyExecutionConfig(systemRow.config).feeRateBps;
  const feeRateBps = toNonNegative(input.feeRateBps) ?? defaultFeeRateBps;

  const assetKey = `${parsed.market}::${parsed.symbol}`;
  const row = universeRows.find((item) => item.assetKey === assetKey);
  if (!row) throwManualTradeError("NOT_FOUND", `asset not found: ${assetKey}`, 404);

  const bootstrapRow = bootstrap.assetUniverse.find((item) => item.assetKey === assetKey) || null;
  let price = toPositive(bootstrapRow?.lastPrice || row.lastPrice || row.holdingPrice);
  let priceSource = bootstrapRow?.priceSource || (row.lastPrice > 0 ? "asset_universe.last_price" : "asset_universe.holding_price");
  let priceSnapshotAt = bootstrapRow?.priceUpdatedAt || row.priceUpdatedAt || null;

  const yfinanceSymbol = toYfinanceSymbolByMarket(row.symbol, row.market);
  const priceFeedEnabled = systemRow.config.dataSources?.priceFeed?.enabled !== false;
  const marketCache = systemRow.config.dataSources?.priceFeed?.marketCache || {
    freshMinutes: 15,
    serveStaleHours: 48,
    rawRetentionDays: 90,
  };
  const warnings: string[] = [];
  if (yfinanceSymbol && priceFeedEnabled) {
    const priced = await getMarketPricesWithCache({
      assets: [{
        symbol: row.symbol,
        market: row.market,
        currency: row.currency,
      }],
      allowRefresh: true,
      forceRefresh: true,
      refreshBudget: 1,
      timeoutMs: 2600,
      source: "assistant_trade_preview",
      freshSec: Math.max(60, marketCache.freshMinutes * 60),
      serveStaleSec: Math.max(3600, marketCache.serveStaleHours * 3600),
      rawRetentionDays: marketCache.rawRetentionDays,
      concurrency: 1,
    });
    const latest = priced[assetKey];
    if (latest && latest.price > 0) {
      price = latest.price;
      priceSource = latest.priceSource || `yfinance:${yfinanceSymbol}`;
      if (latest.priceUpdatedAt) {
        priceSnapshotAt = latest.priceUpdatedAt;
        await updateDaaAssetUniverseLastPrice({
          assetKey: row.assetKey,
          lastPrice: latest.price,
          priceUpdatedAt: latest.priceUpdatedAt,
        });
      }
    }
  } else if (yfinanceSymbol && !priceFeedEnabled) {
    warnings.push("行情源已关闭，当前预览沿用本地缓存/持仓价格，不发起实时刷新。");
  }

  if (!(price > 0)) {
    if (!yfinanceSymbol) {
      throwManualTradeError("VALIDATION_FAILED", `symbol unsupported for yfinance: ${row.market}::${row.symbol}`, 400, {
        reasonCode: "UNSUPPORTED_SYMBOL",
      });
    }
    if (!priceFeedEnabled) {
      throwManualTradeError("VALIDATION_FAILED", `${row.symbol} 缺少可用本地行情，且行情源已关闭`, 409, {
        reasonCode: "PRICE_FEED_DISABLED",
      });
    }
    throwManualTradeError("INTERNAL_ERROR", `${row.symbol} 拉取实时价格失败，请稍后重试`, 502, {
      reasonCode: "PRICE_FETCH_TIMEOUT",
    });
  }

  const investableCash = resolveInvestableCash(bootstrap.account);
  const fxLookup = buildFxLookupToBase(fxRows);
  const fxRateResolved = resolveFxRateToBase(bootstrap.baseCurrency, row.currency, fxLookup);
  const hasFxRate = Number.isFinite(fxRateResolved) && Number(fxRateResolved) > 0;
  const fxRateToBase = hasFxRate ? Number(fxRateResolved) : null;
  if (!hasFxRate && row.currency !== bootstrap.baseCurrency) {
    warnings.push(`缺少汇率 ${row.currency}/${bootstrap.baseCurrency}，当前预览不会再做 1:1 估算，执行会被阻断`);
  }

  const qtyInput = toPositive(input.qty);
  const notionalInput = toPositive(input.notional);
  const rawQty = qtyInput > 0 ? qtyInput : (notionalInput > 0 ? (notionalInput / price) : 0);
  if (!(rawQty > 0)) {
    throwManualTradeError("VALIDATION_FAILED", "qty 或 notional 至少提供一个且 > 0", 400);
  }
  const sizing = normalizeOrderSizing({
    side: input.side,
    market: row.market,
    assetClass: row.assetClass,
    instrumentType: row.instrumentType,
    marketGroup: row.marketGroup,
    price,
    fxRateToBase,
    qty: rawQty,
    holdingQty: row.holdingQty,
    sellAll: input.sellAll === true,
    minNotionalBase: systemRow.config.strategy.constraints.minNotional,
  });
  warnings.push(...sizing.warnings);
  const qty = sizing.qty;
  price = sizing.price;
  const grossNotional = qty * price;
  const fee = grossNotional * (feeRateBps / 10000);
  const notionalInBase = fxRateToBase == null ? null : grossNotional * fxRateToBase;
  const feeInBase = fxRateToBase == null ? null : fee * fxRateToBase;
  const requestedGrossNotional = (qty > 0 ? qty : rawQty) * price;
  const requestedFee = requestedGrossNotional * (feeRateBps / 10000);
  const requestedNotionalInBase = fxRateToBase == null ? null : requestedGrossNotional * fxRateToBase;
  const requestedFeeInBase = fxRateToBase == null ? null : requestedFee * fxRateToBase;
  const totalCostInBase = notionalInBase == null || feeInBase == null
    ? null
    : (input.side === "BUY" ? (notionalInBase + feeInBase) : (notionalInBase - feeInBase));
  const requestedTotalCostInBase = requestedNotionalInBase == null || requestedFeeInBase == null
    ? null
    : (input.side === "BUY" ? (requestedNotionalInBase + requestedFeeInBase) : (requestedNotionalInBase - requestedFeeInBase));

  let manualBlock = false;
  if (!(qty > 0)) {
    manualBlock = true;
  }
  if (input.side === "BUY" && requestedTotalCostInBase != null && investableCash + 1e-9 < requestedTotalCostInBase) {
    warnings.push(`可投资现金不足：预计需要 ${requestedTotalCostInBase.toFixed(2)} ${bootstrap.baseCurrency}，当前可投资现金 ${investableCash.toFixed(2)} ${bootstrap.baseCurrency}`);
    manualBlock = true;
  }
  if (input.side === "BUY" && fxRateToBase == null && row.currency !== bootstrap.baseCurrency) {
    warnings.push("由于缺少汇率，无法判断基准币现金是否充足");
    manualBlock = true;
  }
  if (input.side === "SELL" && row.holdingQty + 1e-9 < qty) {
    warnings.push(`持仓不足：预计卖出 ${qty.toFixed(6)}，当前持仓 ${row.holdingQty.toFixed(6)}`);
    manualBlock = true;
  }
  if (row.market === "CRYPTO" || row.assetClass === "CRYPTO" || row.instrumentType === "CRYPTO") {
    warnings.push(`${row.symbol} 属于高波动资产，请控制仓位与回撤`);
  }

  if (priceSnapshotAt) {
    const ageMs = Date.now() - Date.parse(priceSnapshotAt);
    if (Number.isFinite(ageMs) && ageMs > 6 * 60 * 60 * 1000) {
      warnings.push("行情抓取时间超过 6 小时，建议先刷新行情再下单");
    }
  }

  const holdingsBase = bootstrap.assetUniverse.reduce((sum, item) => sum + (item.valuationBase ?? 0), 0);
  const currentAssetBase = bootstrap.assetUniverse.find((item) => item.assetKey === assetKey)?.valuationBase ?? 0;
  const notionalForProjection = notionalInBase && notionalInBase > 0 ? notionalInBase : requestedNotionalInBase;
  const costForProjection = totalCostInBase && totalCostInBase > 0 ? totalCostInBase : requestedTotalCostInBase;
  if (notionalForProjection != null && costForProjection != null) {
    const nextAssetBase = Math.max(0, currentAssetBase + (input.side === "BUY" ? notionalForProjection : -notionalForProjection));
    const nextHoldingsBase = Math.max(0, holdingsBase + (input.side === "BUY" ? notionalForProjection : -notionalForProjection));
    const nextCash = Math.max(0, bootstrap.account.cash + (input.side === "BUY" ? -costForProjection : costForProjection));
    const nextEquity = Math.max(1e-9, nextHoldingsBase + nextCash);
    const nextWeightPct = (nextAssetBase / nextEquity) * 100;
    if (nextWeightPct >= 30) {
      warnings.push(`${row.symbol} 交易后仓位约 ${nextWeightPct.toFixed(2)}%，集中度偏高`);
    }
  } else if (row.currency !== bootstrap.baseCurrency) {
    warnings.push("缺少可用汇率，暂无法计算交易后的基准币仓位变化");
  }

  const riskCheck = await validateExecutionRisk({
    manualProposal: {
      assetKey,
      symbol: row.symbol,
      currency: row.currency,
      side: input.side,
      suggestedQty: qty,
      suggestedNotional: notionalInBase ?? 0,
      price,
      reason: "assistant_preview",
    },
  });
  if (riskCheck.overallStatus === "block") {
    const blocked = riskCheck.items.find((item) => item.status === "block");
    if (blocked) warnings.push(`执行将被阻断：${blocked.message}`);
    manualBlock = true;
  }

  return {
    assetKey,
    symbol: row.symbol,
    market: row.market,
    currency: row.currency,
    side: input.side,
    qty,
    price,
    sellAll: sizing.sellAll,
    grossNotional,
    fee,
    feeInBase,
    fxRateToBase,
    notionalInBase,
    baseCurrency: bootstrap.baseCurrency,
    accountCash: bootstrap.account.cash,
    holdingQty: row.holdingQty,
    canSubmit: !manualBlock && riskCheck.overallStatus !== "block",
    priceSource,
    priceSnapshotAt,
    warnings,
    riskCheck,
    feeRateBps,
  };
}

export async function executeManualTrade(input: ExecuteManualTradeInput) {
  const side = normalizeTradeSide(input.side);
  if (!side) {
    throwManualTradeError("VALIDATION_FAILED", "side must be BUY or SELL", 400);
  }

  const symbol = String(input.symbol || "").trim().toUpperCase();
  const market = String(input.market || "US").trim().toUpperCase() || "US";
  const qty = Number(input.qty);
  let price = Number(input.price);
  const fee = Number(input.fee || 0);
  if (!symbol) throwManualTradeError("VALIDATION_FAILED", "symbol is required", 400);
  if (!Number.isFinite(qty) || qty <= 0) throwManualTradeError("VALIDATION_FAILED", "qty must be > 0", 400);
  if (!Number.isFinite(price) || price <= 0) throwManualTradeError("VALIDATION_FAILED", "price must be > 0", 400);
  if (!Number.isFinite(fee) || fee < 0) throwManualTradeError("VALIDATION_FAILED", "fee must be >= 0", 400);

  const source = normalizeSource(input.source ?? input.origin);
  const instrumentCurrency = String(input.currency || "USD").trim().toUpperCase() || "USD";
  const [systemRow, fxRows] = await Promise.all([
    getDaaSystemConfig(),
    listDaaFxRates(),
  ]);
  const baseCurrency = String(systemRow.config.strategy.account.baseCurrency || "USD").trim().toUpperCase() || "USD";
  const fxLookup = buildFxLookupToBase(fxRows);
  const fxRateToBase = resolveFxRateToBase(baseCurrency, instrumentCurrency, fxLookup);
  if (fxRateToBase == null || fxRateToBase <= 0) {
    throwManualTradeError("VALIDATION_FAILED", `缺少汇率：${instrumentCurrency}/${baseCurrency}`, 409, {
      code: "FX_RATE_MISSING",
      instrumentCurrency,
      baseCurrency,
    });
  }

  const pricingMode = normalizePricingMode(input.pricingMode);
  const assetKey = String(input.assetKey || "").trim() || `${market}::${symbol}`;
  const assetUniverseRows = await listDaaAssetUniverse();
  const assetUniverse = Array.isArray(assetUniverseRows) ? assetUniverseRows : [];
  const assetMeta = assetUniverse.find((row) => row.assetKey === assetKey) || null;
  const sizing = normalizeOrderSizing({
    side,
    market,
    assetClass: assetMeta?.assetClass || null,
    instrumentType: assetMeta?.instrumentType || null,
    marketGroup: assetMeta?.marketGroup || null,
    price,
    fxRateToBase,
    qty,
    holdingQty: assetMeta?.holdingQty ?? null,
    sellAll: input.sellAll === true,
    minNotionalBase: systemRow.config.strategy.constraints.minNotional,
  });
  if (!(sizing.qty > 0)) {
    throwManualTradeError("VALIDATION_FAILED", sizing.warnings[0] || "订单数量低于可执行规格", 400, {
      code: "ORDER_SIZE_INVALID",
      warnings: sizing.warnings,
    });
  }
  const normalizedQty = sizing.qty;
  price = sizing.price;
  const feeRate = qty > 0 && Number(input.price) > 0 ? fee / (qty * Number(input.price)) : 0;
  const normalizedFee = normalizedQty * price * Math.max(0, feeRate);
  const notionalInBase = normalizedQty * price * fxRateToBase;
  const feeInBase = normalizedFee * fxRateToBase;
  const totalCostInBase = side === "BUY" ? (notionalInBase + feeInBase) : Math.max(0, notionalInBase - feeInBase);
  const reasonTags = normalizeReasonTags(input.reasonTags);
  const reasonText = String(input.reasonText || "").trim() || null;
  const createdBy = String(input.createdBy || "").trim() || "admin";
  const accountConfig = systemRow.config.strategy.account;
  const investableCash = resolveInvestableCash({
    cash: accountConfig.cash,
    frozenCash: accountConfig.frozenCash,
    investableCash: accountConfig.investableCash,
  });
  if (side === "BUY" && investableCash + 1e-9 < totalCostInBase) {
    throwManualTradeError("VALIDATION_FAILED", `可投资现金不足：需要 ${totalCostInBase.toFixed(2)} ${baseCurrency}，当前可投资现金 ${investableCash.toFixed(2)} ${baseCurrency}`, 409, {
      code: "INSUFFICIENT_INVESTABLE_CASH",
      needed: totalCostInBase,
      investableCash,
      baseCurrency,
    });
  }

  const manualRiskCheck = await validateExecutionRisk({
    manualProposal: {
      assetKey,
      symbol,
      currency: instrumentCurrency,
      side,
      suggestedQty: normalizedQty,
      suggestedNotional: notionalInBase,
      price,
      reason: "manual_execution",
    },
  });
  const blocked = manualRiskCheck.items.find((item) => item.status === "block");
  if (blocked) {
    throwManualTradeError("VALIDATION_FAILED", blocked.message, 409, {
      code: "RISK_BLOCKED",
      rule: blocked.rule,
      current: blocked.current,
      limit: blocked.limit,
    });
  }

  const route = await resolveExecutionRoute({
    assetKey,
    symbol,
    market,
    currency: instrumentCurrency,
    assetClass: assetMeta?.assetClass || null,
    instrumentType: assetMeta?.instrumentType || null,
    marketGroup: assetMeta?.marketGroup || null,
  });

  if (!route.remote) {
    const item = await createDaaTradeTicket({
      source,
      side,
      assetKey,
      cycleId: String(input.cycleId || "").trim() || undefined,
      symbol,
      market,
      instrumentCurrency,
      qty: normalizedQty,
      price,
      fee: normalizedFee,
      sellAll: sizing.sellAll,
      pricingMode,
      priceSource: String(input.priceSource || "").trim() || undefined,
      priceSnapshotAt: String(input.priceSnapshotAt || "").trim() || undefined,
      decisionRefId: String(input.decisionRefId || "").trim() || null,
      reasonTags,
      reasonText: reasonText || undefined,
      brokerKind: route.kind,
      brokerAccountId: route.kind,
      brokerOrderId: null,
      brokerStatus: "ready",
      createdBy,
    });

    const executed = await executeDaaTradeTickets({ ticketIds: [item.ticketId] });
    const result = executed.results[0] || {
      ticketId: item.ticketId,
      status: "rejected" as const,
      rejectCode: "UNKNOWN",
      rejectMessage: "execution result missing",
    };
    const logs = await listDaaTradeTickets({ limit: 200 });
    const responseItem = executed.tickets.find((ticket) => ticket.ticketId === item.ticketId) || item;
    const responseLogs = logs.filter((row) => row.status !== "ready");
    const summary = {
      executed: executed.results.filter((row) => row.status === "executed").length,
      rejected: executed.results.filter((row) => row.status === "rejected").length,
      total: executed.results.length,
    };

    // P0: 交易结果反馈 → thesis evidence 闭环
    if (result.status === "executed" && item.decisionRefId) {
      recordTradeOutcomeAsEvidence({
        thesisId: item.decisionRefId,
        assetKey,
        side,
        entryPrice: item.price,
        currentPrice: item.price,
        realizedPnlPct: null,
      }).catch((e) => logSwallowed("manualTrade.feedbackLoop", e));
    }

    return {
      item: responseItem,
      result,
      summary,
      logs: responseLogs,
      baseCurrency,
      notionalInBase,
      feeInBase,
      source,
      side,
      symbol,
      broker: {
        kind: route.kind,
        accountId: route.kind,
        accepted: result?.status === "executed",
        remoteStatus: result?.status || "ready",
        remoteOrderId: item.ticketId,
        routeReason: route.routeReason,
        messages: [route.kind === "crypto_paper" ? "Crypto Paper 本地执行成功" : "本地模拟执行成功"],
        warnings: result?.status === "executed" ? [] : [result?.rejectMessage || "本地模拟执行失败"],
      },
    } satisfies ExecuteManualTradeResult;
  }

  let placed;
  const localTicket = await createDaaTradeTicket({
    source,
    side,
    assetKey,
    cycleId: String(input.cycleId || "").trim() || undefined,
    symbol,
    market,
    instrumentCurrency,
    qty: normalizedQty,
    price,
    fee: normalizedFee,
    sellAll: sizing.sellAll,
    pricingMode,
    priceSource: String(input.priceSource || "").trim() || undefined,
    priceSnapshotAt: String(input.priceSnapshotAt || "").trim() || undefined,
    decisionRefId: String(input.decisionRefId || "").trim() || null,
    reasonTags,
    reasonText: reasonText || undefined,
    brokerKind: route.kind,
    createdBy,
  });

  try {
    placed = await route.adapter.placeOrder({
      assetKey,
      symbol,
      market,
      currency: instrumentCurrency,
      side,
      qty: normalizedQty,
      orderType: pricingMode === "market" ? "MKT" : "LMT",
      referencePrice: price,
      limitPrice: pricingMode === "manual" ? price : null,
      reasonText,
      tags: reasonTags,
      createdBy,
    });
  } catch (error) {
    const message = normalizeErrorMessage(error);
    const rejectedTicket = await applyDaaBrokerOrderSync({
      ticketId: localTicket.ticketId,
      order: {
        broker: route.kind,
        accountId: "",
        orderId: "",
        status: "Rejected",
        filledQty: null,
        avgFillPrice: null,
        updatedAt: new Date().toISOString(),
        raw: { text: message },
      },
    }) || localTicket;
    const logs = await listDaaTradeTickets({ limit: 200 });
    return {
      item: rejectedTicket,
      result: {
        ticketId: rejectedTicket.ticketId,
        status: "rejected",
        rejectCode: "BROKER_ORDER_FAILED",
        rejectMessage: message,
      },
      summary: {
        executed: 0,
        rejected: 1,
        total: 1,
      },
      logs: logs.filter((row) => row.status !== "ready"),
      baseCurrency,
      notionalInBase,
      feeInBase,
      source,
      side,
      symbol,
      broker: {
        kind: route.kind,
        accountId: "",
        accepted: false,
        remoteStatus: "Rejected",
        remoteOrderId: "",
        routeReason: route.routeReason,
        messages: [],
        warnings: [message],
      },
    } satisfies ExecuteManualTradeResult;
  }

  let syncedTicket = await applyDaaBrokerOrderSync({
    ticketId: localTicket.ticketId,
    order: {
      broker: route.kind,
      accountId: placed.order.accountId,
      orderId: placed.order.orderId,
      status: placed.order.status,
      filledQty: placed.order.filledQty,
      avgFillPrice: placed.order.avgFillPrice,
      updatedAt: placed.order.updatedAt,
      raw: placed.order.raw,
    },
  }) || localTicket;

  try {
    const synced = await syncBrokerOrders({
      scope: "ticket",
      ticketId: localTicket.ticketId,
      limit: 50,
    });
    syncedTicket = synced.tickets[0] || syncedTicket;
  } catch (err) {
    logSwallowed("manualTradeService.syncBrokerOrders", err);
  }

  const logs = await listDaaTradeTickets({ limit: 200 });
  const resultStatus = syncedTicket.status;
  return {
    item: syncedTicket,
    result: resultStatus === "rejected"
      ? {
        ticketId: syncedTicket.ticketId,
        status: "rejected",
        rejectCode: syncedTicket.rejectCode || "BROKER_ORDER_REJECTED",
        rejectMessage: syncedTicket.rejectMessage || placed.warnings[0] || placed.messages[0] || "broker rejected",
      }
      : {
        ticketId: syncedTicket.ticketId,
        status: resultStatus,
      },
    summary: {
      executed: resultStatus === "executed" ? 1 : 0,
      rejected: resultStatus === "rejected" ? 1 : 0,
      total: 1,
    },
    logs: logs.filter((row) => row.status !== "ready"),
    baseCurrency,
    notionalInBase,
    feeInBase,
    source,
    side,
    symbol,
    broker: {
      kind: route.kind,
      accountId: placed.order.accountId,
      accepted: placed.accepted,
      remoteStatus: syncedTicket.brokerStatus || placed.order.status,
      remoteOrderId: placed.order.orderId,
      routeReason: route.routeReason,
      messages: placed.messages,
      warnings: placed.warnings,
    },
  } satisfies ExecuteManualTradeResult;
}
