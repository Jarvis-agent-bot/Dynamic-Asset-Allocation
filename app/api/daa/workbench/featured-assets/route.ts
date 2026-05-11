import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { normalizeDaaCurrencyCode } from "@/src/daa/assetKey";
import { mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { getDaaSystemConfig } from "@/src/daa/store/daaStorePg";
import {
  inferInstrumentTypeByAssetClass,
  inferMarketGroup,
  inferRegionByMarket,
  normalizeAssetClass,
} from "@/src/daa/modules/workbench/assetTaxonomy";
import type {
  WorkbenchFeaturedAssetGroup,
  WorkbenchFeaturedAssetItem,
} from "@/src/daa/modules/workbench/workbenchTypes";
import {
  WORKBENCH_FEATURED_ASSETS_CATALOG_,
  WORKBENCH_FEATURED_ROLE_ORDER_,
  type WorkbenchFeaturedAssetClass,
  type WorkbenchFeaturedMarket,
  type WorkbenchFeaturedRole,
  type WorkbenchFeaturedTheme,
} from "@/src/daa/modules/workbench/featuredAssetsCatalog";
import { getMarketPricesWithCache } from "@/src/daa/modules/marketCache/marketCacheService";
import { toYfinanceSymbolByMarket } from "@/src/market/yfinanceSymbol";
import { normalizeText } from "@/src/daa/utils/normalize";

type FeaturedMarketFilter = WorkbenchFeaturedMarket | "ALL";
type FeaturedAssetClassFilter = WorkbenchFeaturedAssetClass | "ALL";
type FeaturedThemeFilter = WorkbenchFeaturedTheme | "ALL";
type FeaturedRoleFilter = WorkbenchFeaturedRole | "ALL";

function clampLimitPerRole(value: unknown): number {
  if (value == null || String(value).trim() === "") return 8;
  const n = Number(value);
  if (!Number.isFinite(n)) return 8;
  return Math.max(1, Math.min(20, Math.trunc(n)));
}

function normalizeMarketFilter(value: unknown): FeaturedMarketFilter {
  const market = normalizeText(value).toUpperCase();
  if (market === "US" || market === "HK" || market === "CN" || market === "KR" || market === "CRYPTO") return market;
  return "ALL";
}

function normalizeAssetClassFilter(value: unknown): FeaturedAssetClassFilter {
  const text = normalizeText(value).toUpperCase();
  if (text === "ALL") return "ALL";
  const normalized = normalizeAssetClass(text, "EQUITY");
  if (normalized === "EQUITY" || normalized === "ETF" || normalized === "BOND" || normalized === "COMMODITY" || normalized === "CRYPTO" || normalized === "CURRENCY") {
    return normalized;
  }
  return "EQUITY";
}

function normalizeThemeFilter(value: unknown): FeaturedThemeFilter {
  const text = normalizeText(value).toLowerCase();
  if (
    text === "core_equity"
    || text === "global_region"
    || text === "defensive_income"
    || text === "commodity_resource"
    || text === "cash_equivalent"
    || text === "satellite_theme"
    || text === "crypto"
    || text === "currency_hedge"
    || text === "semiconductor"
    || text === "cybersecurity"
    || text === "robotics"
  ) {
    return text;
  }
  return "ALL";
}

function normalizeRoleFilter(value: unknown): FeaturedRoleFilter {
  const text = normalizeText(value).toLowerCase();
  if (WORKBENCH_FEATURED_ROLE_ORDER_.includes(text as WorkbenchFeaturedRole)) return text as WorkbenchFeaturedRole;
  return "ALL";
}

function quoteType(assetClass: WorkbenchFeaturedAssetClass): string {
  if (assetClass === "ETF" || assetClass === "COMMODITY" || assetClass === "CURRENCY") return "ETF";
  if (assetClass === "BOND") return "BOND";
  if (assetClass === "CRYPTO") return "CRYPTOCURRENCY";
  return "EQUITY";
}

function typeDisp(assetClass: WorkbenchFeaturedAssetClass): string {
  if (assetClass === "ETF") return "ETF";
  if (assetClass === "BOND") return "债券";
  if (assetClass === "COMMODITY") return "商品";
  if (assetClass === "CRYPTO") return "加密资产";
  if (assetClass === "CURRENCY") return "货币";
  return "股票";
}

function toFeaturedItem(input: {
  symbol: string;
  market: WorkbenchFeaturedMarket;
  currency: string;
  assetClass: WorkbenchFeaturedAssetClass;
  name: string;
  displayNameZh: string;
  exchange: string;
  thesisTagZh: string;
  themeKey?: WorkbenchFeaturedTheme;
  themeLabelZh?: string;
  roleKey: WorkbenchFeaturedRole;
  roleLabelZh: string;
  roleDescriptionZh: string;
  allocationNoteZh: string;
  suggestedWeightBandZh: string;
  price: number;
}): WorkbenchFeaturedAssetItem {
  const symbol = normalizeText(input.symbol).toUpperCase();
  const market = input.market;
  const currency = normalizeDaaCurrencyCode(input.currency, market === "HK" ? "HKD" : market === "CN" ? "CNY" : market === "KR" ? "KRW" : "USD");
  const exchange = normalizeText(input.exchange) || market;
  const assetClass = input.assetClass;
  const yfinanceSymbol = toYfinanceSymbolByMarket(symbol, market);
  const name = normalizeText(input.name) || symbol;
  return {
    symbol,
    market,
    currency,
    price: Number.isFinite(input.price) && input.price > 0 ? input.price : 0,
    name,
    shortName: name,
    longName: name,
    exchange,
    exchangeDisp: exchange,
    quoteType: quoteType(assetClass),
    typeDisp: typeDisp(assetClass),
    assetClass,
    region: inferRegionByMarket(market),
    instrumentType: inferInstrumentTypeByAssetClass(assetClass),
    marketGroup: inferMarketGroup({ market, assetClass }),
    yfinanceSymbol,
    thesisTagZh: normalizeText(input.thesisTagZh),
    themeKey: input.themeKey || "core_equity",
    themeLabelZh: normalizeText(input.themeLabelZh, input.themeKey || "核心配置"),
    displayNameZh: normalizeText(input.displayNameZh, name),
    allocationRoleKey: input.roleKey,
    allocationRoleLabelZh: input.roleLabelZh,
    allocationRoleDescriptionZh: input.roleDescriptionZh,
    allocationNoteZh: input.allocationNoteZh,
    suggestedWeightBandZh: input.suggestedWeightBandZh,
  };
}

async function enrichPrices(
  items: WorkbenchFeaturedAssetItem[],
  opts: { freshSec: number; serveStaleSec: number; rawRetentionDays: number; allowRefresh: boolean },
): Promise<WorkbenchFeaturedAssetItem[]> {
  if (!items.length) return items;
  const refreshTargets = items.filter((item) => item.yfinanceSymbol);
  if (!refreshTargets.length) return items;

  const priced = await getMarketPricesWithCache({
    assets: refreshTargets.map((item) => ({
      symbol: item.symbol,
      market: item.market,
      currency: item.currency,
    })),
    allowRefresh: opts.allowRefresh,
    forceRefresh: opts.allowRefresh,
    refreshBudget: refreshTargets.length,
    timeoutMs: 2400,
    source: "featured_assets",
    freshSec: opts.freshSec,
    serveStaleSec: opts.serveStaleSec,
    rawRetentionDays: opts.rawRetentionDays,
  });

  return items.map((item) => {
    const key = `${item.market}::${item.symbol}`;
    const priceRow = priced[key];
    if (!priceRow || !(priceRow.price > 0)) {
      return {
        ...item,
        price: 0,
        priceStatus: "missing",
        priceUpdatedAt: priceRow?.priceUpdatedAt || null,
        priceSource: priceRow?.priceSource || "featured_assets",
        priceAgeSec: priceRow?.priceAgeSec ?? null,
      };
    }
    return {
      ...item,
      price: priceRow.price,
      priceStatus: priceRow.priceStatus,
      priceUpdatedAt: priceRow.priceUpdatedAt,
      priceSource: priceRow.priceSource,
      priceAgeSec: priceRow.priceAgeSec,
    };
  });
}

function buildGroupRows(input: {
  marketFilter: FeaturedMarketFilter;
  assetClassFilter: FeaturedAssetClassFilter;
  themeFilter: FeaturedThemeFilter;
  roleFilter: FeaturedRoleFilter;
  limitPerGroup: number;
}): Array<{
  roleKey: WorkbenchFeaturedRole;
  roleLabelZh: string;
  roleDescriptionZh: string;
  rows: WorkbenchFeaturedAssetItem[];
}> {
  const filtered = WORKBENCH_FEATURED_ASSETS_CATALOG_.filter((item) => {
    if (input.marketFilter !== "ALL" && item.market !== input.marketFilter) return false;
    if (input.assetClassFilter !== "ALL" && item.assetClass !== input.assetClassFilter) return false;
    if (input.themeFilter !== "ALL" && item.themeKey !== input.themeFilter) return false;
    if (input.roleFilter !== "ALL" && item.roleKey !== input.roleFilter) return false;
    return true;
  });

  return WORKBENCH_FEATURED_ROLE_ORDER_.map((roleKey) => {
    const roleRows = filtered.filter((item) => item.roleKey === roleKey);
    const first = roleRows[0];
    if (!first) return null;
    const rows = filtered
      .filter((item) => item.roleKey === roleKey)
      .slice(0, input.limitPerGroup)
      .map((item) => toFeaturedItem({
        symbol: item.symbol,
        market: item.market,
        currency: item.currency,
        assetClass: item.assetClass,
        name: item.name,
        displayNameZh: item.displayNameZh,
        exchange: item.exchange,
        thesisTagZh: item.thesisTagZh,
        themeKey: item.themeKey,
        themeLabelZh: item.themeLabelZh,
        roleKey: item.roleKey,
        roleLabelZh: item.roleLabelZh,
        roleDescriptionZh: item.roleDescriptionZh,
        allocationNoteZh: item.allocationNoteZh,
        suggestedWeightBandZh: item.suggestedWeightBandZh,
        price: 0,
      }));
    return {
      roleKey,
      roleLabelZh: first.roleLabelZh,
      roleDescriptionZh: first.roleDescriptionZh,
      rows,
    };
  }).filter((group): group is NonNullable<typeof group> => Boolean(group && group.rows.length > 0));
}

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const marketFilter = normalizeMarketFilter(url.searchParams.get("market"));
    const roleFilter = normalizeRoleFilter(url.searchParams.get("role"));
    const themeFilter = normalizeThemeFilter(url.searchParams.get("theme"));
    const assetClassFilter = url.searchParams.has("assetClass")
      ? normalizeAssetClassFilter(url.searchParams.get("assetClass"))
      : "ALL";
    const limitPerGroup = clampLimitPerRole(url.searchParams.get("limitPerRole"));
    const system = await getDaaSystemConfig();
    const priceFeedEnabled = system.config.dataSources?.priceFeed?.enabled !== false;
    const cacheConfig = system.config.dataSources?.priceFeed?.marketCache || {
      freshMinutes: 15,
      serveStaleHours: 48,
      rawRetentionDays: 90,
    };

    const groups = buildGroupRows({ marketFilter, assetClassFilter, themeFilter, roleFilter, limitPerGroup });
    const pricedGroups: WorkbenchFeaturedAssetGroup[] = await Promise.all(
      groups.map(async (group) => ({
        groupKey: group.roleKey,
        groupLabelZh: group.roleLabelZh,
        groupDescriptionZh: group.roleDescriptionZh,
        items: await enrichPrices(group.rows, {
          allowRefresh: priceFeedEnabled,
          freshSec: Math.max(60, cacheConfig.freshMinutes * 60),
          serveStaleSec: Math.max(3600, cacheConfig.serveStaleHours * 3600),
          rawRetentionDays: cacheConfig.rawRetentionDays,
        }),
      })),
    );

    return ok({
      groups: pricedGroups,
      generatedAt: new Date().toISOString(),
    });
  });
}
