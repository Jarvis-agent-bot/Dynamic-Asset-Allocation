import { fail, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { requireCronAuth } from "@/src/daa/cron/auth";
import { runLoggedJob } from "@/src/daa/jobs/jobService";
import { extractDividendsFromRawPayloads } from "@/src/daa/modules/dividend/dividendExtractor";
import {
  creditPendingDividends,
  getDividendSummary,
  processDividendIncome,
  listDividendHistory,
} from "@/src/daa/modules/dividend/dividendService";
import { buildFxLookupToBase } from "@/src/daa/modules/portfolio/portfolioValuation";
import {
  appendDaaCashLedgerEntry,
  getDaaSystemConfig,
  listDaaAssetUniverse,
  listDaaFxRates,
} from "@/src/daa/store/daaStorePg";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = await requireCronAuth(req);
    if (denied) {
      const status = denied.status || 401;
      return fail(status === 401 ? "CRON_AUTH_FAILED" : "ROUTE_DENIED", "cron unauthorized", { status });
    }

    const execution = await runLoggedJob({
      req,
      jobType: "cron_dividend_refresh",
      triggerSource: "cron_dividend_refresh",
      idempotencyKey: req.headers.get("x-daa-idempotency-key"),
      summarize: (result) => ({
        extracted: result.extracted,
        incomeProcessed: result.incomeProcessed,
        credited: result.credited,
      }),
      handler: async () => {
        // Step 1: Extract dividend records from stored Yahoo Finance raw payloads (90 days)
        const extraction = await extractDividendsFromRawPayloads({ sinceDays: 90 });

        // Step 2: For newly extracted dividends, match against current holdings to create income entries
        const [system, assetRows, fxRows] = await Promise.all([
          getDaaSystemConfig(),
          listDaaAssetUniverse(),
          listDaaFxRates(),
        ]);
        const baseCurrency = system.config.strategy.account.baseCurrency || "USD";
        const fxLookup = buildFxLookupToBase(fxRows);

        const holdingsBySymbol = new Map(
          assetRows
            .filter((row) => row.holdingQty > 0)
            .map((row) => [row.symbol.toUpperCase(), row]),
        );

        // Process income for recent dividends (last 90 days)
        const recentDividends = await listDividendHistory({ limit: 200 });
        let incomeProcessed = 0;
        for (const div of recentDividends) {
          const holding = holdingsBySymbol.get(div.symbol.toUpperCase());
          if (!holding) continue;

          const fxRate = fxLookup.get(`${div.currency}/${baseCurrency}`)
            ?? (div.currency === baseCurrency ? 1 : null);
          if (fxRate == null) continue;

          const income = await processDividendIncome({
            symbol: div.symbol,
            market: div.market,
            exDate: div.exDate,
            amountPerShare: div.amount,
            currency: div.currency,
            holdingQty: holding.holdingQty,
            fxRate,
            baseCurrency,
          });
          if (income) incomeProcessed++;
        }

        // Step 3: Credit pending dividend income to cash ledger
        const creditResult = await creditPendingDividends({
          baseCurrency,
          appendCashLedger: async (entry) => {
            const result = await appendDaaCashLedgerEntry({
              side: entry.side,
              amount: entry.amount,
              baseCurrency: entry.baseCurrency,
              entryKind: entry.entryKind as "dividend",
              note: entry.note,
            });
            return { id: result.entry.id };
          },
        });

        const summary = await getDividendSummary();

        return {
          extracted: extraction.extracted,
          extractedSymbols: extraction.symbols,
          incomeProcessed,
          credited: creditResult.credited,
          creditedAmountBase: creditResult.totalAmountBase,
          summary,
          at: new Date().toISOString(),
        };
      },
    });

    return ok({
      ...execution.result,
      requestId: execution.requestId,
      jobId: execution.jobId,
      durationMs: execution.durationMs,
    });
  });
}

export async function GET(req: Request) {
  return POST(req);
}
