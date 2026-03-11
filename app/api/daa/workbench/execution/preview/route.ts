import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, readJsonBodyV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { parseDaaAssetKeyV1 } from "@/src/daa/assetKeyV1";
import { getStrategyExecutionConfigV2 } from "@/src/daa/config/systemConfigV2";
import { getMarketPricesWithCacheV1 } from "@/src/daa/modules/marketCache/marketCacheServiceV1";
import { buildFxLookupToBaseV1, resolveFxRateToBaseV1 } from "@/src/daa/modules/portfolio/portfolioValuationV1";
import { getDaaSystemConfigV2, listDaaAssetUniverseV1, listDaaFxRatesV1, updateDaaAssetUniverseLastPriceV1 } from "@/src/daa/store/daaStorePgV1";
import { toYfinanceSymbolByMarketV1 } from "@/src/market/yfinanceSymbolV1";
import { buildWorkbenchBootstrapV1 } from "@/src/daa/modules/workbench/workbenchReadServiceV1";
import { validateExecutionRiskV1 } from "@/src/daa/modules/workbench/workbenchExecutionServiceV1";

export const runtime = "nodejs";

type Body = {
  assetKey?: unknown;
  side?: unknown;
  qty?: unknown;
  notional?: unknown;
  feeRateBps?: unknown;
};

function toPositive(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

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
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBodyV1<Body>(req);
    const parsed = parseDaaAssetKeyV1(body?.assetKey);
    if (!parsed) return failV1("VALIDATION_FAILED", "assetKey is required", { status: 400 });

    const side = normalizeSide(body?.side);
    if (!side) return failV1("VALIDATION_FAILED", "side must be BUY or SELL", { status: 400 });

    const [bootstrap, fxRows, universeRows, systemRow] = await Promise.all([
      buildWorkbenchBootstrapV1({ syncPrices: false }),
      listDaaFxRatesV1(),
      listDaaAssetUniverseV1(),
      getDaaSystemConfigV2(),
    ]);
    const defaultFeeRateBps = getStrategyExecutionConfigV2(systemRow.config).feeRateBps;
    const feeRateBps = toNonNegative(body?.feeRateBps) ?? defaultFeeRateBps;

    const assetKey = `${parsed.market}::${parsed.symbol}`;
    const row = universeRows.find((item) => item.assetKey === assetKey);
    if (!row) return failV1("NOT_FOUND", `asset not found: ${assetKey}`, { status: 404 });
    const bootstrapRow = bootstrap.assetUniverse.find((item) => item.assetKey === assetKey) || null;

    let price = toPositive(bootstrapRow?.lastPrice || row.lastPrice || row.holdingPrice);
    let priceSource = bootstrapRow?.priceSource || (row.lastPrice > 0 ? "asset_universe.last_price" : "asset_universe.holding_price");
    let priceSnapshotAt = bootstrapRow?.priceUpdatedAt || row.priceUpdatedAt || null;

    const yfinanceSymbol = toYfinanceSymbolByMarketV1(row.symbol, row.market);
    const marketCache = systemRow.config.dataSources?.priceFeed?.marketCache || {
      freshMinutes: 15,
      serveStaleHours: 48,
      rawRetentionDays: 90,
    };
    if (yfinanceSymbol) {
      const priced = await getMarketPricesWithCacheV1({
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
          await updateDaaAssetUniverseLastPriceV1({
            assetKey: row.assetKey,
            lastPrice: latest.price,
            priceUpdatedAt: latest.priceUpdatedAt,
          });
        }
      }
    }

    if (!(price > 0)) {
      if (!yfinanceSymbol) {
        return failV1("VALIDATION_FAILED", `symbol unsupported for yfinance: ${row.market}::${row.symbol}`, {
          status: 400,
          details: { reasonCode: "UNSUPPORTED_SYMBOL" },
        });
      }
      return failV1("INTERNAL_ERROR", `${row.symbol} 拉取实时价格失败，请稍后重试`, {
        status: 502,
        details: { reasonCode: "PRICE_FETCH_TIMEOUT" },
      });
    }

    const qtyInput = toPositive(body?.qty);
    const notionalInput = toPositive(body?.notional);
    const qty = qtyInput > 0 ? qtyInput : (notionalInput > 0 ? (notionalInput / price) : 0);
    if (!(qty > 0)) {
      return failV1("VALIDATION_FAILED", "qty 或 notional 至少提供一个且 > 0", { status: 400 });
    }

    const grossNotional = qty * price;
    const fee = grossNotional * (feeRateBps / 10000);

    const warnings: string[] = [];
    const fxLookup = buildFxLookupToBaseV1(fxRows);
    const fxRateResolved = resolveFxRateToBaseV1(bootstrap.baseCurrency, row.currency, fxLookup);
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
    if (side === "BUY" && totalCostInBase != null && bootstrap.account.cash + 1e-9 < totalCostInBase) {
      warnings.push(`现金不足：预计需要 ${totalCostInBase.toFixed(2)} ${bootstrap.baseCurrency}，当前现金 ${bootstrap.account.cash.toFixed(2)} ${bootstrap.baseCurrency}`);
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

    const riskCheck = await validateExecutionRiskV1({
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

    return okV1({
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
