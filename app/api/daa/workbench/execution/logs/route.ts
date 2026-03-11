import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponseV1, okV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { listDaaTradeTicketsV1 } from "@/src/daa/store/daaStorePgV1";
import { normalizeExecutionLogFiltersV1 } from "@/src/daa/modules/workbench/workbenchExecutionServiceV1";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const filters = normalizeExecutionLogFiltersV1({
      status: url.searchParams.get("status"),
      source: url.searchParams.get("source"),
      limit: url.searchParams.get("limit"),
    });

    const tickets = await listDaaTradeTicketsV1({
      limit: filters.limit,
      status: filters.status,
      source: filters.source,
    });

    const logs = filters.status ? tickets : tickets.filter((ticket) => ticket.status !== "ready");
    return okV1({ logs });
  });
}
