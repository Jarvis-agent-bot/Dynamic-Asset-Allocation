import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { syncBrokerOrders, type BrokerOrderSyncScope } from "@/src/daa/broker";

export const runtime = "nodejs";

function normalizeScope(value: unknown): BrokerOrderSyncScope {
  const text = String(value || "").trim().toLowerCase();
  if (text === "recent") return "recent";
  if (text === "ticket") return "ticket";
  return "open";
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBody<{ scope?: unknown; ticketId?: unknown; limit?: unknown }>(req);
    const limit = Number(body?.limit);
    return ok(await syncBrokerOrders({
      scope: normalizeScope(body?.scope),
      ticketId: body?.ticketId == null ? null : String(body.ticketId || "").trim() || null,
      limit: Number.isFinite(limit) ? Math.trunc(limit) : undefined,
    }));
  });
}
