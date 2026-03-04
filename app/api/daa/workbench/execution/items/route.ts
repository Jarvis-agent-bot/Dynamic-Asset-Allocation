import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, readJsonBodyV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { normalizeDaaCurrencyCodeV1 } from "@/src/daa/assetKeyV1";
import { normalizeReasonTagsV1, normalizeTradeSideV1 } from "@/src/daa/modules/workbench/workbenchServiceV1";
import { createDaaTradeTicketV1, getActiveDaaTradeBasketV1, listDaaTradeTicketsV1 } from "@/src/daa/store/daaStorePgV1";

export const runtime = "nodejs";

type Body = {
  source?: unknown;
  origin?: unknown;
  side?: unknown;
  assetKey?: unknown;
  symbol?: unknown;
  market?: unknown;
  currency?: unknown;
  qty?: unknown;
  price?: unknown;
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
  if (source === "decision") return "decision";
  if (source === "recommendation") return "decision";
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
    const ticket = await createDaaTradeTicketV1({
      source,
      side,
      assetKey: String(body?.assetKey || "").trim() || undefined,
      symbol,
      market,
      instrumentCurrency: normalizeDaaCurrencyCodeV1(body?.currency, "USD"),
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

    const basket = await getActiveDaaTradeBasketV1();
    if (!basket) {
      return failV1("NOT_FOUND", "active execution queue not found", { status: 404 });
    }

    const queueItems = await listDaaTradeTicketsV1({
      basketId: basket.basketId,
      status: "ready",
      limit: 500,
    });

    return okV1({
      queueId: basket.basketId,
      queueStatus: basket.status,
      item: ticket,
      queueItems,
    });
  });
}
