/**
 * 持仓基本面接口：返回每只持仓的核心 7 指标。
 * 直接从 daa_external_payload_raw_v1 的 fundamentals_yahoo_valuation_v4 缓存读取，
 * 由 cron_fundamentals_refresh 负责定期刷新。
 */
import { withApiHandler } from "@/src/daa/api/routeHelpers";
import { isVisibleHolding } from "@/src/daa/modules/portfolio/holdingVisibility";
import { buildViewerReadRouteResponse } from "@/src/daa/modules/read/readRouteHelpers";
import { buildWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";
import { withDaaPgClient } from "@/src/daa/pg/daaPg";
import { normalizeYfinanceSymbol } from "@/src/market/yfinance";
import { YFINANCE_FUNDAMENTALS_CACHE_RESOURCE } from "@/src/market/yfinanceFundamentalsCache";

export const runtime = "nodejs";

type FundamentalRow = {
  assetKey: string;
  symbol: string;
  market: string;
  displayName: string;
  currency: string;
  marketCap: number | null;
  pe: number | null;
  pb: number | null;
  debtToEquityPct: number | null;
  freeCashflow: number | null;
  totalRevenue: number | null;
  netIncome: number | null;
  trailingEps: number | null;
  asOf: string | null;
  hasData: boolean;
};

function readNumber(payload: unknown, key: string): number | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>)[key];
  if (value == null) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export async function GET(req: Request) {
  return withApiHandler(() => buildViewerReadRouteResponse(req, {
    load: async () => {
      const bootstrap = await buildWorkbenchBootstrap({ syncPrices: false });
      const portfolio = bootstrap.assetUniverse.filter(isVisibleHolding);
      if (portfolio.length === 0) {
        return { items: [] as FundamentalRow[], asOf: null as string | null };
      }

      const symbolMap = new Map<string, typeof portfolio[number]>();
      for (const row of portfolio) {
        const normalized = normalizeYfinanceSymbol(row.symbol);
        if (normalized) symbolMap.set(normalized, row);
      }
      const normalizedSymbols = Array.from(symbolMap.keys());

      const payloads = await withDaaPgClient(async ({ query }) => {
        const res = await query<{
          subject_key: string;
          payload_json: Record<string, unknown> | null;
          fetched_at: Date | string;
        }>(
          `SELECT DISTINCT ON (subject_key) subject_key, payload_json, fetched_at
           FROM daa_external_payload_raw_v1
           WHERE provider = 'yfinance'
             AND resource = $1
             AND subject_key = ANY($2)
           ORDER BY subject_key, fetched_at DESC`,
          [YFINANCE_FUNDAMENTALS_CACHE_RESOURCE, normalizedSymbols],
        );
        return res.rows;
      });

      const payloadMap = new Map<string, { payload: Record<string, unknown> | null; fetchedAt: string }>();
      for (const row of payloads) {
        const ts = typeof row.fetched_at === "string" ? row.fetched_at : row.fetched_at.toISOString();
        payloadMap.set(row.subject_key, { payload: row.payload_json, fetchedAt: ts });
      }

      const items: FundamentalRow[] = portfolio.map((row) => {
        const normalized = normalizeYfinanceSymbol(row.symbol) ?? row.symbol;
        const cached = payloadMap.get(normalized);
        const payload = cached?.payload ?? null;
        const totalRevenue = readNumber(payload, "totalRevenue");
        const netIncomeRaw = readNumber(payload, "netIncome");
        const profitMarginsPct = readNumber(payload, "profitMarginsPct");
        const netIncome = netIncomeRaw
          ?? (totalRevenue != null && profitMarginsPct != null
            ? totalRevenue * (profitMarginsPct / 100)
            : null);

        const fields = {
          pe: readNumber(payload, "trailingPE"),
          pb: readNumber(payload, "pbRatio"),
          debtToEquityPct: readNumber(payload, "debtToEquity"),
          freeCashflow: readNumber(payload, "freeCashflow"),
          totalRevenue,
          netIncome,
          trailingEps: readNumber(payload, "trailingEps"),
          marketCap: readNumber(payload, "marketCap"),
        };

        const hasData = Object.values(fields).some((v) => v != null);

        return {
          assetKey: row.assetKey,
          symbol: row.symbol,
          market: row.market,
          displayName: row.name || row.symbol,
          currency: row.currency || "USD",
          ...fields,
          asOf: cached?.fetchedAt ?? null,
          hasData,
        };
      });

      const oldestAsOf = items
        .map((r) => r.asOf)
        .filter((v): v is string => Boolean(v))
        .sort()[0] ?? null;

      return { items, asOf: oldestAsOf };
    },
  }));
}
