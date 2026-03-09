import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponseV1, okV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { listHumanActorsV1 } from "@/src/daa/hf/hfServiceV1";

export const runtime = "nodejs";

function parseCsvList(raw: string | null): string[] | undefined {
  if (!raw) return undefined;
  const values = raw
    .split(",")
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
}

export async function GET(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const marketScope = parseCsvList(url.searchParams.get("markets"));
    const actors = listHumanActorsV1({ marketScope });

    return okV1({
      marketScope: marketScope ?? null,
      count: actors.length,
      actors,
    });
  });
}
