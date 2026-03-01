import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { reconcileDecisionPositionsV1 } from "@/src/daa/store/daaStorePgV1";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const decisionId = String(url.searchParams.get("decisionId") || "").trim();
    if (!decisionId) {
      return failV1("VALIDATION_FAILED", "decisionId is required", { status: 400 });
    }

    const data = await reconcileDecisionPositionsV1(decisionId);
    return okV1(data);
  });
}
