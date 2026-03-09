import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { listActorHoldingsV1 } from "@/src/daa/hf/hfServiceV1";

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
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const actorId = String(context.params.actorId || "").trim();
    if (!actorId) {
      return failV1("VALIDATION_FAILED", "missing_actor_id", { status: 400 });
    }

    const url = new URL(req.url);
    const marketScope = parseCsvList(url.searchParams.get("markets"));
    const holdings = listActorHoldingsV1(actorId, { marketScope });

    return okV1({
      actorId,
      marketScope: marketScope ?? null,
      count: holdings.length,
      holdings,
    });
  });
}
