import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { buildAssetDetailReadModel } from "@/src/daa/modules/read/assetDetailReadService";
import { parseBooleanSearchParam } from "@/src/daa/modules/read/readRouteHelpers";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const authResult = await requireDaaAdminViewerAuth(req);
    const denied = mapDeniedResponse(authResult);
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const assetKey = String(searchParams.get("assetKey") || "").trim();
    if (!assetKey) {
      return fail("VALIDATION_FAILED", "missing assetKey", { status: 400 });
    }

    return ok(await buildAssetDetailReadModel({
      assetKey,
      fresh: parseBooleanSearchParam(searchParams.get("fresh"), false),
    }));
  });
}
