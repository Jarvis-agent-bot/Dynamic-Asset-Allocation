import { fail, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import {
  buildAccountScopedRequestIdempotencyKey,
  buildUtcCronWindowIdempotencyKey,
  runForEachActiveDaaAccountScope,
  runIdempotentAccountScopedCronJob,
  summarizeAccountScopedCronRuns,
  unwrapSingleAccountCronResult,
} from "@/src/daa/cron/accountCronScope";
import { requireCronAuth } from "@/src/daa/cron/auth";
import { extractDividendsFromRawPayloads } from "@/src/daa/modules/dividend/dividendExtractor";
import {
  creditPendingDividends,
  getDividendHoldingQtyOnExDate,
  getDividendSummary,
  processDividendIncome,
  listDividendHistory,
} from "@/src/daa/modules/dividend/dividendService";
import { buildFxLookupToBase } from "@/src/daa/modules/portfolio/portfolioValuation";
import {
  appendDaaCashLedgerEntry,
  getDaaSystemConfig,
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

    const fallbackKey = buildUtcCronWindowIdempotencyKey("cron_dividend_refresh", 24 * 60);
    const runs = await runForEachActiveDaaAccountScope((scope) =>
      runDividendRefreshJob(req, buildAccountScopedRequestIdempotencyKey(scope, req, fallbackKey)),
    );
    const single = unwrapSingleAccountCronResult(runs);
    return ok(single ?? summarizeAccountScopedCronRuns(runs));
  });
}

async function runDividendRefreshJob(req: Request, idempotencyKey: string | null): Promise<Record<string, unknown>> {
    return runIdempotentAccountScopedCronJob({
      req,
      jobType: "cron_dividend_refresh",
      triggerSource: "cron_dividend_refresh",
      idempotencyKey,
      duplicateReason: "当前账号同一 dividend-refresh 幂等任务已完成，跳过重复触发。",
      summarize: (result) => ({
        extracted: result.extracted,
        incomeProcessed: result.incomeProcessed,
        credited: result.credited,
      }),
      handler: async () => {
        // Step 1: Extract dividend records from stored Yahoo Finance raw payloads (90 days)
        const extraction = await extractDividendsFromRawPayloads({ sinceDays: 90 });

        // Step 2: 按除息日开盘前的成交历史回放持仓，不能使用当前持仓回填历史分红。
        const [system, fxRows] = await Promise.all([
          getDaaSystemConfig(),
          listDaaFxRates(),
        ]);
        const baseCurrency = system.config.strategy.account.baseCurrency || "USD";
        const fxLookup = buildFxLookupToBase(fxRows);

        // Process income for recent dividends (last 90 days)
        const recentDividends = await listDividendHistory({ limit: 200 });
        let incomeProcessed = 0;
        for (const div of recentDividends) {
          const holdingQty = await getDividendHoldingQtyOnExDate({
            symbol: div.symbol,
            market: div.market,
            exDate: div.exDate,
          });
          if (!(holdingQty > 0)) continue;

          const fxRate = fxLookup.get(`${div.currency}/${baseCurrency}`)
            ?? (div.currency === baseCurrency ? 1 : null);
          if (fxRate == null) continue;

          const income = await processDividendIncome({
            symbol: div.symbol,
            market: div.market,
            exDate: div.exDate,
            amountPerShare: div.amount,
            currency: div.currency,
            holdingQty,
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
}
