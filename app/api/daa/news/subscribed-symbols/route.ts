/**
 * GET /api/daa/news/subscribed-symbols
 *
 * 为 Alpaca WS daemon 提供当前需要实时订阅的 US 市场 symbol 列表。
 * 来源: 持仓 + watchlist + newsFeed.symbols 手动配置。
 * 仅返回 US market 的 symbol（Alpaca 免费层仅支持 US 股票）。
 * 需要 DAA_CRON_TOKEN 认证。
 */

import { fail, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { requireCronAuth } from "@/src/daa/cron/auth";
import { getDaaSystemConfig, listDaaAssetUniverse } from "@/src/daa/store/daaStorePg";
import { parseSymbolsFromNewsQuery } from "@/src/market/yahooRssFetch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeUpper(value: unknown): string {
  return String(value || "").trim().toUpperCase();
}

/** 猜 market：常见非 US 后缀明确排除 */
function isLikelyUsSymbol(symbol: string): boolean {
  const s = symbol.toUpperCase();
  if (s.includes("=F")) return false;
  if (s.endsWith(".HK") || s.endsWith(".SS") || s.endsWith(".SZ") || s.endsWith(".KS") || s.endsWith(".T")) return false;
  return true;
}

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = await requireCronAuth(req);
    if (denied) {
      const status = denied.status || 401;
      return fail(status === 401 ? "CRON_AUTH_FAILED" : "ROUTE_DENIED", "cron unauthorized", { status });
    }

    const [system, assets] = await Promise.all([
      getDaaSystemConfig(),
      listDaaAssetUniverse(),
    ]);

    const seen = new Set<string>();
    const newsFeed = system.config.dataSources.newsFeed;

    // 手动配置的 symbols（newsFeed.symbols）
    if (newsFeed.enabled !== false) {
      for (const symbol of newsFeed.symbols || []) {
        const key = normalizeUpper(symbol);
        if (key && isLikelyUsSymbol(key)) seen.add(key);
      }
      for (const symbol of parseSymbolsFromNewsQuery(newsFeed.query || "")) {
        const key = normalizeUpper(symbol);
        if (key && isLikelyUsSymbol(key)) seen.add(key);
      }
    }

    // 持仓 + watchlist（以交易 market 为准；region 只是资产暴露地区，不能决定 Alpaca 订阅）
    for (const row of assets) {
      const market = String(row.market || "US").toUpperCase();
      if (market !== "US") continue;
      const held = row.holdingQty > 0;
      const watched = row.watchEnabled !== false;
      if (!held && !watched) continue;
      const key = normalizeUpper(row.symbol);
      if (key && isLikelyUsSymbol(key)) seen.add(key);
    }

    const symbols = [...seen].sort();
    return ok({ symbols, count: symbols.length });
  });
}
