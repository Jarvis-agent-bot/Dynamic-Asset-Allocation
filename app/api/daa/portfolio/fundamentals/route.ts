/**
 * 持仓基本面接口：返回每只持仓的核心 7 指标。
 * 从结构化 fundamentals 快照读取，raw payload 只作为短期审计材料。
 */
import { withApiHandler } from "@/src/daa/api/routeHelpers";
import { isVisibleHolding } from "@/src/daa/modules/portfolio/holdingVisibility";
import { buildViewerReadRouteResponse } from "@/src/daa/modules/read/readRouteHelpers";
import { buildWorkbenchBootstrap } from "@/src/daa/modules/workbench/workbenchReadService";
import { listDaaFundamentalSnapshots } from "@/src/daa/store/daaStorePg";
import { normalizeYfinanceSymbol } from "@/src/market/yfinance";

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

      const snapshots = await listDaaFundamentalSnapshots({
        provider: "yfinance",
        normalizedSymbols,
        limit: Math.max(1, normalizedSymbols.length),
      });

      const snapshotMap = new Map<string, (typeof snapshots)[number]>();
      for (const row of snapshots) {
        if (!snapshotMap.has(row.normalizedSymbol)) snapshotMap.set(row.normalizedSymbol, row);
      }

      const items: FundamentalRow[] = portfolio.map((row) => {
        const normalized = normalizeYfinanceSymbol(row.symbol) ?? row.symbol;
        const cached = snapshotMap.get(normalized);
        const payload = cached?.snapshotJson ?? null;
        const totalRevenue = cached?.totalRevenue ?? readNumber(payload, "totalRevenue");
        const netIncomeRaw = cached?.netIncome ?? readNumber(payload, "netIncome");
        const profitMarginsPct = readNumber(payload, "profitMarginsPct");
        const netIncome = netIncomeRaw
          ?? (totalRevenue != null && profitMarginsPct != null
            ? totalRevenue * (profitMarginsPct / 100)
            : null);

        const fields = {
          pe: cached?.trailingPE ?? readNumber(payload, "trailingPE"),
          pb: cached?.pbRatio ?? readNumber(payload, "pbRatio"),
          debtToEquityPct: cached?.debtToEquity ?? readNumber(payload, "debtToEquity"),
          freeCashflow: cached?.freeCashflow ?? readNumber(payload, "freeCashflow"),
          totalRevenue,
          netIncome,
          trailingEps: cached?.trailingEps ?? readNumber(payload, "trailingEps"),
          marketCap: cached?.marketCap ?? readNumber(payload, "marketCap"),
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
