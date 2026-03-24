import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { parseDaaAssetKey } from "@/src/daa/assetKey";
import { resolveInvestableCash } from "@/src/daa/account/resolveInvestableCash";
import { getStrategyExecutionConfig } from "@/src/daa/config/systemConfig";
import { getMarketPricesWithCache } from "@/src/daa/modules/marketCache/marketCacheService";
import { buildFxLookupToBase, resolveFxRateToBase } from "@/src/daa/modules/portfolio/portfolioValuation";
import { getDaaSystemConfig, listDaaAssetUniverse, listDaaFxRates, updateDaaAssetUniverseLastPrice } from "@/src/daa/store/daaStorePg";
import { toYfinanceSymbolByMarket } from "@/src/market/yfinanceSymbol";
import { buildWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";
import { validateExecutionRisk } from "@/src/daa/modules/workbench/workbenchExecutionService";
import { toPositive } from "@/src/daa/utils/normalize";

export const runtime = "nodejs";

type Body = {
  assetKey?: unknown;
  side?: unknown;
  qty?: unknown;
  notional?: unknown;
  feeRateBps?: unknown;
};

function toNonNegative(v: unknown): number | null {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function normalizeSide(v: unknown): "BUY" | "SELL" | null {
  const side = String(v || "").trim().toUpperCase();
  if (side === "BUY" || side === "SELL") return side;
  return null;
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBody<Body>(req);
    const parsed = parseDaaAssetKey(body?.assetKey);
    if (!parsed) return fail("VALIDATION_FAILED", "assetKey is required", { status: 400 });

    const side = normalizeSide(body?.side);
    if (!side) return fail("VALIDATION_FAILED", "side must be BUY or SELL", { status: 400 });

    const [bootstrap, fxRows, universeRows, systemRow] = await Promise.all([
      buildWorkbenchBootstrap({ syncPrices: false }),
      listDaaFxRates(),
      listDaaAssetUniverse(),
      getDaaSystemConfig(),
    ]);
    const defaultFeeRateBps = getStrategyExecutionConfig(systemRow.config).feeRateBps;
    const feeRateBps = toNonNegative(body?.feeRateBps) ?? defaultFeeRateBps;

    const assetKey = `${parsed.market}::${parsed.symbol}`;
    const row = universeRows.find((item) => item.assetKey === assetKey);
    if (!row) return fail("NOT_FOUND", `asset not found: ${assetKey}`, { status: 404 });
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
        source: "execution_preview",
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
        return fail("VALIDATION_FAILED", `symbol unsupported for yfinance: ${row.market}::${row.symbol}`, {
          status: 400,
          details: { reasonCode: "UNSUPPORTED_SYMBOL" },
        });
      }
      if (!priceFeedEnabled) {
        return fail("VALIDATION_FAILED", `${row.symbol} 缺少可用本地行情，且行情源已关闭`, {
          status: 409,
          details: { reasonCode: "PRICE_FEED_DISABLED" },
        });
      }
      return fail("INTERNAL_ERROR", `${row.symbol} 拉取实时价格失败，请稍后重试`, {
        status: 502,
        details: { reasonCode: "PRICE_FETCH_TIMEOUT" },
      });
    }

    const qtyInput = toPositive(body?.qty);
    const notionalInput = toPositive(body?.notional);
    const qty = qtyInput > 0 ? qtyInput : (notionalInput > 0 ? (notionalInput / price) : 0);
    if (!(qty > 0)) {
      return fail("VALIDATION_FAILED", "qty 或 notional 至少提供一个且 > 0", { status: 400 });
    }

    const grossNotional = qty * price;
    const fee = grossNotional * (feeRateBps / 10000);

    const investableCash = resolveInvestableCash(bootstrap.account);
    const fxLookup = buildFxLookupToBase(fxRows);
    const fxRateResolved = resolveFxRateToBase(bootstrap.baseCurrency, row.currency, fxLookup);
    const hasFxRate = Number.isFinite(fxRateResolved) && Number(fxRateResolved) > 0;
    const fxRateToBase = hasFxRate ? Number(fxRateResolved) : null;
    if (!hasFxRate && row.currency !== bootstrap.baseCurrency) {
      warnings.push(`缺少汇率 ${row.currency}/${bootstrap.baseCurrency}，当前预览不会再做 1:1 估算，执行会被阻断`);
    }

    const notionalInBase = fxRateToBase == null ? null : grossNotional * fxRateToBase;
    const feeInBase = fxRateToBase == null ? null : fee * fxRateToBase;
    const totalCostInBase = notionalInBase == null || feeInBase == null
      ? null
      : (side === "BUY" ? (notionalInBase + feeInBase) : (notionalInBase - feeInBase));

    let manualBlock = false;
    if (side === "BUY" && totalCostInBase != null && investableCash + 1e-9 < totalCostInBase) {
      warnings.push(`可投资现金不足：预计需要 ${totalCostInBase.toFixed(2)} ${bootstrap.baseCurrency}，当前可投资现金 ${investableCash.toFixed(2)} ${bootstrap.baseCurrency}`);
      manualBlock = true;
    }
    if (side === "BUY" && fxRateToBase == null && row.currency !== bootstrap.baseCurrency) {
      warnings.push("由于缺少汇率，无法判断基准币现金是否充足");
      manualBlock = true;
    }
    if (side === "SELL" && row.holdingQty + 1e-9 < qty) {
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
    if (notionalInBase != null && totalCostInBase != null) {
      const nextAssetBase = Math.max(0, currentAssetBase + (side === "BUY" ? notionalInBase : -notionalInBase));
      const nextHoldingsBase = Math.max(0, holdingsBase + (side === "BUY" ? notionalInBase : -notionalInBase));
      const nextCash = Math.max(0, bootstrap.account.cash + (side === "BUY" ? -totalCostInBase : totalCostInBase));
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
        side,
        suggestedQty: qty,
        suggestedNotional: notionalInBase ?? 0,
        price,
        reason: "preview",
      },
    });
    if (riskCheck.overallStatus === "block") {
      const blocked = riskCheck.items.find((item) => item.status === "block");
      if (blocked) warnings.push(`执行将被阻断：${blocked.message}`);
      manualBlock = true;
    }

    return ok({
      assetKey,
      symbol: row.symbol,
      market: row.market,
      currency: row.currency,
      side,
      qty,
      price,
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
    });
  });
}
