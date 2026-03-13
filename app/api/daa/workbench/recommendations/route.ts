import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { DEFAULT_ANALYSIS_FOCUS_ } from "@/src/daa/llm/analysisFocusDefaults";
import { runWorkbenchRecommendations } from "@/src/daa/modules/workbench/workbenchRecommendationService";

export const runtime = "nodejs";

type Body = {
  analysisFocus?: unknown;
};

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBody<Body>(req);
    const analysisFocus = String(body?.analysisFocus || "").trim() || DEFAULT_ANALYSIS_FOCUS_;
    if (!analysisFocus) {
      return fail("VALIDATION_FAILED", "analysisFocus is required", { status: 400 });
    }

    const data = await runWorkbenchRecommendations({ analysisFocus });
    return ok(data);
  });
}
