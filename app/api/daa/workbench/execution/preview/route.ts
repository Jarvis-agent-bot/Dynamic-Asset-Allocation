import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { previewTradeViaGateway } from "@/src/daa/gateway";
import { ManualTradeServiceError } from "@/src/daa/modules/workbench/manualTradeService";

export const runtime = "nodejs";

type Body = {
  assetKey?: unknown;
  side?: unknown;
  qty?: unknown;
  notional?: unknown;
  feeRateBps?: unknown;
};

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBody<Body>(req);
    try {
      const side = String(body?.side || "").trim().toUpperCase();
      if (side !== "BUY" && side !== "SELL") {
        return fail("VALIDATION_FAILED", "side must be BUY or SELL", { status: 400 });
      }
      return ok(await previewTradeViaGateway({
        assetKey: String(body?.assetKey || ""),
        side,
        qty: body?.qty == null ? null : Number(body.qty),
        notional: body?.notional == null ? null : Number(body.notional),
        feeRateBps: body?.feeRateBps == null ? null : Number(body.feeRateBps),
      }));
    } catch (error) {
      if (error instanceof ManualTradeServiceError) {
        return fail(error.code as never, error.message, {
          status: error.status,
          ...(error.details ? { details: error.details } : {}),
        });
      }
      throw error;
    }
  });
}
