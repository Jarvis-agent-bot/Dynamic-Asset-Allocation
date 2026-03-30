import { withApiHandler } from "@/src/daa/api/routeHelpers";
import { getDividendSummary, listDividendHistory, processDividendIncome, type DaaDividendIncome, type DaaDividendRecord } from "@/src/daa/modules/dividend/dividendService";
import { getDaaSystemConfig } from "@/src/daa/store/daaStorePg";

export const runtime = "nodejs";

type DividendReadModel = {
  summary: {
    totalDividendsBase: number;
    pendingDividendsBase: number;
    creditedDividendsBase: number;
    reinvestedDividendsBase: number;
    lastDividendAt: string | null;
  };
  upcomingDividends: Array<{
    symbol: string;
    market: string;
    exDate: string;
    amountPerShare: number;
    currency: string;
  }>;
  recentPayouts: Array<{
    symbol: string;
    market: string;
    exDate: string;
    amountPerShare: number;
    totalAmount: number;
    amountInBase: number;
    currency: string;
    status: string;
    createdAt: string;
  }>;
  portfolioDividendYield: number;
  baseCurrency: string;
};

async function buildDividendReadModel(): Promise<DividendReadModel> {
  const [summary, history, systemConfig] = await Promise.all([
    getDividendSummary(),
    listDividendHistory({ limit: 100 }),
    getDaaSystemConfig(),
  ]);

  const baseCurrency = systemConfig.config.strategy.account.baseCurrency;
  const totalEquity = systemConfig.config.strategy.account.totalEquity ?? 0;
  const today = new Date().toISOString().slice(0, 10);

  // Filter upcoming dividends (ex-date in next 30 days)
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  const thirtyDaysFromNowStr = thirtyDaysFromNow.toISOString().slice(0, 10);

  const upcomingDividends = history.filter(
    (row) => row.exDate >= today && row.exDate <= thirtyDaysFromNowStr
  );

  // Filter recent payouts (last 90 days)
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const ninetyDaysAgoStr = ninetyDaysAgo.toISOString().slice(0, 10);

  const recentPayouts = history
    .filter((row) => row.exDate >= ninetyDaysAgoStr && row.exDate <= today)
    .slice(0, 20);

  // Calculate estimated annual dividend yield
  const annualDividendBase = summary.totalDividendsBase * (365 / 90); // Rough estimate based on recent 90 days
  const portfolioDividendYield = totalEquity > 0 ? (annualDividendBase / totalEquity) * 100 : 0;

  return {
    summary: {
      totalDividendsBase: summary.totalDividendsBase,
      pendingDividendsBase: summary.pendingDividendsBase,
      creditedDividendsBase: summary.creditedDividendsBase,
      reinvestedDividendsBase: summary.reinvestedDividendsBase,
      lastDividendAt: summary.lastDividendAt,
    },
    upcomingDividends: upcomingDividends.map((row) => ({
      symbol: row.symbol,
      market: row.market,
      exDate: row.exDate,
      amountPerShare: row.amount,
      currency: row.currency,
    })),
    recentPayouts: recentPayouts.map((row) => ({
      symbol: row.symbol,
      market: row.market,
      exDate: row.exDate,
      amountPerShare: row.amount,
      totalAmount: row.amount, // Will be calculated properly when we have holding qty
      amountInBase: row.amount, // Will be calculated properly with FX rates
      currency: row.currency,
      status: "paid",
      createdAt: row.createdAt,
    })),
    portfolioDividendYield: Number(portfolioDividendYield.toFixed(2)),
    baseCurrency,
  };
}

export async function GET(req: Request) {
  return withApiHandler(async () => {
    try {
      const data = await buildDividendReadModel();
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("[daa/read/dividends] error:", err);
      return new Response(
        JSON.stringify({
          error: "Failed to load dividend data",
          summary: {
            totalDividendsBase: 0,
            pendingDividendsBase: 0,
            creditedDividendsBase: 0,
            reinvestedDividendsBase: 0,
            lastDividendAt: null,
          },
          upcomingDividends: [],
          recentPayouts: [],
          portfolioDividendYield: 0,
          baseCurrency: "USD",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  });
}
