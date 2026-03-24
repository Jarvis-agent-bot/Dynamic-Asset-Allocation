import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { normalizeDaaCurrencyCode } from "@/src/daa/assetKey";
import { resolveInvestableCash } from "@/src/daa/account/resolveInvestableCash";
import { buildFxLookupToBase, resolveFxRateToBase } from "@/src/daa/modules/portfolio/portfolioValuation";
import { buildTradeExecutionNotifyText } from "@/src/daa/notify/tradeExecutionBuilder";
import { sendFeishuByEnv } from "@/src/daa/notify/feishu";
import { sendTelegramByEnv } from "@/src/daa/notify/telegram";
import { createDaaTradeTicket, executeDaaTradeTickets, getDaaSystemConfig, listDaaFxRates, listDaaTradeTickets } from "@/src/daa/store/daaStorePg";
import { validateExecutionRisk } from "@/src/daa/modules/workbench/workbenchExecutionService";
import { parseExecuteTradeBody } from "@/src/daa/modules/workbench/workbenchTypes";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBody(req);
    const parsed = parseExecuteTradeBody(body);
    if (!parsed.ok) {
      return fail("VALIDATION_FAILED", parsed.message, { status: 400 });
    }
    const input = parsed.value;

    const instrumentCurrency = normalizeDaaCurrencyCode(input.currency, "USD");
    const [systemRow, fxRows] = await Promise.all([
      getDaaSystemConfig(),
      listDaaFxRates(),
    ]);
    const baseCurrency = normalizeDaaCurrencyCode(systemRow.config.strategy.account.baseCurrency, "USD");
    const fxLookup = buildFxLookupToBase(fxRows);
    const fxRateToBase = resolveFxRateToBase(baseCurrency, instrumentCurrency, fxLookup);
    if (fxRateToBase == null || fxRateToBase <= 0) {
      return fail("VALIDATION_FAILED", `缺少汇率：${instrumentCurrency}/${baseCurrency}`, {
        status: 409,
        details: {
          code: "FX_RATE_MISSING",
          instrumentCurrency,
          baseCurrency,
        },
      });
    }

    const notionalInBase = input.qty * input.price * fxRateToBase;
    const feeInBase = input.fee * fxRateToBase;
    const totalCostInBase = input.side === "BUY" ? (notionalInBase + feeInBase) : Math.max(0, notionalInBase - feeInBase);
    const accountConfig = systemRow.config.strategy.account;
    const investableCash = resolveInvestableCash({
      cash: accountConfig.cash,
      frozenCash: accountConfig.frozenCash,
      investableCash: accountConfig.investableCash,
    });
    if (input.side === "BUY" && investableCash + 1e-9 < totalCostInBase) {
      return fail("VALIDATION_FAILED", `可投资现金不足：需要 ${totalCostInBase.toFixed(2)} ${baseCurrency}，当前可投资现金 ${investableCash.toFixed(2)} ${baseCurrency}`, {
        status: 409,
        details: {
          code: "INSUFFICIENT_INVESTABLE_CASH",
          needed: totalCostInBase,
          investableCash,
          baseCurrency,
        },
      });
    }
    const manualRiskCheck = await validateExecutionRisk({
      manualProposal: {
        assetKey: input.assetKey,
        symbol: input.symbol,
        currency: instrumentCurrency,
        side: input.side,
        suggestedQty: input.qty,
        suggestedNotional: notionalInBase,
        price: input.price,
        reason: "manual_execution",
      },
    });
    const blocked = manualRiskCheck.items.find((item) => item.status === "block");
    if (blocked) {
      return fail("VALIDATION_FAILED", blocked.message, {
        status: 409,
        details: {
          code: "RISK_BLOCKED",
          rule: blocked.rule,
          current: blocked.current,
          limit: blocked.limit,
        },
      });
    }

    const item = await createDaaTradeTicket({
      source: input.source,
      side: input.side,
      assetKey: input.assetKey || undefined,
      cycleId: input.cycleId,
      symbol: input.symbol,
      market: input.market,
      instrumentCurrency,
      qty: input.qty,
      price: input.price,
      fee: input.fee,
      pricingMode: input.pricingMode,
      priceSource: input.priceSource,
      priceSnapshotAt: input.priceSnapshotAt,
      decisionRefId: input.decisionRefId,
      reasonTags: input.reasonTags,
      reasonText: input.reasonText,
      createdBy: input.createdBy,
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

    try {
      const notification = systemRow.config.notification;
      if (
        (notification.telegram.enabled && notification.telegram.onTradeExecuted)
        || (notification.feishu.enabled && notification.feishu.onTradeExecuted)
      ) {
        const message = buildTradeExecutionNotifyText({
          source: input.source === "decision" ? "decision_trade_execution" : "manual_trade_execution",
          baseCurrency,
          executeMode: "single",
          cycleId: responseItem.cycleId || null,
          ticketId: responseItem.ticketId,
          executedCount: summary.executed,
          failedCount: summary.rejected,
          totalCount: summary.total,
          totalNotional: notionalInBase,
          logs: responseLogs.filter((row) => row.ticketId === responseItem.ticketId),
        });
        const meta = {
          eventType: "trade_executed",
          triggerSource: input.source === "decision" ? "decision_trade_execution" : "manual_trade_execution",
          cycleId: responseItem.cycleId || null,
          ticketId: responseItem.ticketId,
          requestJson: {
            status: result.status,
            symbol: input.symbol,
            side: input.side,
            qty: input.qty,
            notionalInBase,
          },
        };
        await Promise.allSettled([
          notification.telegram.enabled && notification.telegram.onTradeExecuted ? sendTelegramByEnv(message, meta) : Promise.resolve(false),
          notification.feishu.enabled && notification.feishu.onTradeExecuted ? sendFeishuByEnv(message, meta) : Promise.resolve(false),
        ]);
      }
    } catch (err) {
      logSwallowed("executeRoute.notify", err);
    }

    return ok({
      item: responseItem,
      result,
      summary,
      logs: responseLogs,
    });
  });
}
