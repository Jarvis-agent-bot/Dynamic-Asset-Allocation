import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, readJsonBodyV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { normalizeDaaCurrencyCodeV1 } from "@/src/daa/assetKeyV1";
import { buildFxLookupToBaseV1, resolveFxRateToBaseV1 } from "@/src/daa/modules/portfolio/portfolioValuationV1";
import { createDaaTradeTicketV1, executeDaaTradeTicketsV1, getDaaSystemConfigV2, listDaaFxRatesV1, listDaaTradeTicketsV1 } from "@/src/daa/store/daaStorePgV1";
import { normalizeReasonTagsV1, normalizeTradeSideV1, validateExecutionRiskV1 } from "@/src/daa/modules/workbench/workbenchExecutionServiceV1";

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
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBodyV1<Body>(req);
    const side = normalizeTradeSideV1(body?.side);
    if (!side) {
      return failV1("VALIDATION_FAILED", "side must be BUY or SELL", { status: 400 });
    }

    const symbol = String(body?.symbol || "").trim().toUpperCase();
    const market = String(body?.market || "US").trim().toUpperCase() || "US";
    const qty = Number(body?.qty);
    const price = Number(body?.price);
    const fee = Number(body?.fee || 0);
    if (!symbol) {
      return failV1("VALIDATION_FAILED", "symbol is required", { status: 400 });
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      return failV1("VALIDATION_FAILED", "qty must be > 0", { status: 400 });
    }
    if (!Number.isFinite(price) || price <= 0) {
      return failV1("VALIDATION_FAILED", "price must be > 0", { status: 400 });
    }
    if (!Number.isFinite(fee) || fee < 0) {
      return failV1("VALIDATION_FAILED", "fee must be >= 0", { status: 400 });
    }

    const source = normalizeSource(body?.source ?? body?.origin);
    const instrumentCurrency = normalizeDaaCurrencyCodeV1(body?.currency, "USD");
    const [systemRow, fxRows] = await Promise.all([
      getDaaSystemConfigV2(),
      listDaaFxRatesV1(),
    ]);
    const baseCurrency = normalizeDaaCurrencyCodeV1(systemRow.config.strategy.account.baseCurrency, "USD");
    const fxLookup = buildFxLookupToBaseV1(fxRows);
    const fxRateToBase = resolveFxRateToBaseV1(baseCurrency, instrumentCurrency, fxLookup);
    if (fxRateToBase == null || fxRateToBase <= 0) {
      return failV1("VALIDATION_FAILED", `缺少汇率：${instrumentCurrency}/${baseCurrency}`, {
        status: 409,
        details: {
          code: "FX_RATE_MISSING",
          instrumentCurrency,
          baseCurrency,
        },
      });
    }

    const notionalInBase = qty * price * fxRateToBase;
    const manualRiskCheck = await validateExecutionRiskV1({
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
      return failV1("VALIDATION_FAILED", blocked.message, {
        status: 409,
        details: {
          code: "RISK_BLOCKED",
          rule: blocked.rule,
          current: blocked.current,
          limit: blocked.limit,
        },
      });
    }

    const item = await createDaaTradeTicketV1({
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
      reasonTags: normalizeReasonTagsV1(body?.reasonTags),
      reasonText: String(body?.reasonText || "").trim() || undefined,
      createdBy: String(body?.createdBy || "").trim() || "admin",
    });

    const executed = await executeDaaTradeTicketsV1({ ticketIds: [item.ticketId] });
    const result = executed.results[0] || {
      ticketId: item.ticketId,
      status: "rejected" as const,
      rejectCode: "UNKNOWN",
      rejectMessage: "execution result missing",
    };
    const logs = await listDaaTradeTicketsV1({ limit: 200 });

    return okV1({
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
