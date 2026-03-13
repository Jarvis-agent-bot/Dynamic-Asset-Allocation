import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { normalizeDaaCurrencyCode } from "@/src/daa/assetKey";
import { resolveInvestableCash } from "@/src/daa/account/resolveInvestableCash";
import { buildFxLookupToBase, resolveFxRateToBase } from "@/src/daa/modules/portfolio/portfolioValuation";
import { createDaaTradeTicket, executeDaaTradeTickets, getDaaSystemConfig, listDaaFxRates, listDaaTradeTickets } from "@/src/daa/store/daaStorePg";
import { normalizeReasonTags, normalizeTradeSide, validateExecutionRisk } from "@/src/daa/modules/workbench/workbenchExecutionService";

export const runtime = "nodejs";

type Body = {
  source?: unknown;
  origin?: unknown;
  side?: unknown;
  assetKey?: unknown;
  cycleId?: unknown;
  symbol?: unknown;
  market?: unknown;
  currency?: unknown;
  qty?: unknown;
  price?: unknown;
  notionalInBase?: unknown;
  fee?: unknown;
  pricingMode?: unknown;
  priceSource?: unknown;
  priceSnapshotAt?: unknown;
  decisionRefId?: unknown;
  reasonTags?: unknown;
  reasonText?: unknown;
  createdBy?: unknown;
};

function normalizeSource(v: unknown): "manual" | "decision" {
  const source = String(v || "").trim().toLowerCase();
  if (source === "decision" || source === "recommendation") return "decision";
  return "manual";
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBody<Body>(req);
    const side = normalizeTradeSide(body?.side);
    if (!side) {
      return fail("VALIDATION_FAILED", "side must be BUY or SELL", { status: 400 });
    }

    const symbol = String(body?.symbol || "").trim().toUpperCase();
    const market = String(body?.market || "US").trim().toUpperCase() || "US";
    const qty = Number(body?.qty);
    const price = Number(body?.price);
    const fee = Number(body?.fee || 0);
    if (!symbol) {
      return fail("VALIDATION_FAILED", "symbol is required", { status: 400 });
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      return fail("VALIDATION_FAILED", "qty must be > 0", { status: 400 });
    }
    if (!Number.isFinite(price) || price <= 0) {
      return fail("VALIDATION_FAILED", "price must be > 0", { status: 400 });
    }
    if (!Number.isFinite(fee) || fee < 0) {
      return fail("VALIDATION_FAILED", "fee must be >= 0", { status: 400 });
    }

    const source = normalizeSource(body?.source ?? body?.origin);
    const instrumentCurrency = normalizeDaaCurrencyCode(body?.currency, "USD");
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

    const notionalInBase = qty * price * fxRateToBase;
    const feeInBase = fee * fxRateToBase;
    const totalCostInBase = side === "BUY" ? (notionalInBase + feeInBase) : Math.max(0, notionalInBase - feeInBase);
    const accountConfig = systemRow.config.strategy.account;
    const investableCash = resolveInvestableCash({
      cash: accountConfig.cash,
      frozenCash: accountConfig.frozenCash,
      investableCash: accountConfig.investableCash,
    });
    if (side === "BUY" && investableCash + 1e-9 < totalCostInBase) {
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
        assetKey: String(body?.assetKey || "").trim() || `${market}::${symbol}`,
        symbol,
        currency: instrumentCurrency,
        side,
        suggestedQty: qty,
        suggestedNotional: notionalInBase,
        price,
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
      source,
      side,
      assetKey: String(body?.assetKey || "").trim() || undefined,
      cycleId: String(body?.cycleId || "").trim() || undefined,
      symbol,
      market,
      instrumentCurrency,
      qty,
      price,
      fee,
      pricingMode: String(body?.pricingMode || "").trim().toLowerCase() === "market" ? "market" : "manual",
      priceSource: String(body?.priceSource || "").trim() || undefined,
      priceSnapshotAt: String(body?.priceSnapshotAt || "").trim() || undefined,
      decisionRefId: String(body?.decisionRefId || "").trim() || null,
      reasonTags: normalizeReasonTags(body?.reasonTags),
      reasonText: String(body?.reasonText || "").trim() || undefined,
      createdBy: String(body?.createdBy || "").trim() || "admin",
    });

    const executed = await executeDaaTradeTickets({ ticketIds: [item.ticketId] });
    const result = executed.results[0] || {
      ticketId: item.ticketId,
      status: "rejected" as const,
      rejectCode: "UNKNOWN",
      rejectMessage: "execution result missing",
    };
    const logs = await listDaaTradeTickets({ limit: 200 });

    return ok({
      item: executed.tickets.find((ticket) => ticket.ticketId === item.ticketId) || item,
      result,
      summary: {
        executed: executed.results.filter((row) => row.status === "executed").length,
        rejected: executed.results.filter((row) => row.status === "rejected").length,
        total: executed.results.length,
      },
      logs: logs.filter((row) => row.status !== "ready"),
    });
  });
}
