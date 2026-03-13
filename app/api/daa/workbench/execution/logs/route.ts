import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { listDaaTradeTickets } from "@/src/daa/store/daaStorePg";
import { normalizeExecutionLogFilters } from "@/src/daa/modules/workbench/workbenchExecutionService";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const filters = normalizeExecutionLogFilters({
      status: url.searchParams.get("status"),
      source: url.searchParams.get("source"),
      limit: url.searchParams.get("limit"),
    });

    const tickets = await listDaaTradeTickets({
      limit: filters.limit,
      status: filters.status,
      source: filters.source,
    });

    const logs = filters.status ? tickets : tickets.filter((ticket) => ticket.status !== "ready");
    return ok({ logs });
  });
}
