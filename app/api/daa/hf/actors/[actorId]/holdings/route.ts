import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { listActorHoldings } from "@/src/daa/hf/hfService";

export const runtime = "nodejs";

function parseCsvList(raw: string | null): string[] | undefined {
  if (!raw) return undefined;
  const values = raw
    .split(",")
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
}

export async function GET(
  req: Request,
  context: { params: { actorId: string } },
) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const actorId = String(context.params.actorId || "").trim();
    if (!actorId) {
      return fail("VALIDATION_FAILED", "missing_actor_id", { status: 400 });
    }

    const url = new URL(req.url);
    const marketScope = parseCsvList(url.searchParams.get("markets"));
    const holdings = listActorHoldings(actorId, { marketScope });

    return ok({
      actorId,
      marketScope: marketScope ?? null,
      count: holdings.length,
      holdings,
    });
  });
}
