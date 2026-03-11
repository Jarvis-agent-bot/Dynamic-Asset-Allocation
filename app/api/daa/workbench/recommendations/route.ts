import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, readJsonBodyV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { DEFAULT_ANALYSIS_FOCUS_V1 } from "@/src/daa/llm/analysisFocusDefaultsV1";
import { runWorkbenchRecommendationsV1 } from "@/src/daa/modules/workbench/workbenchRecommendationServiceV1";

export const runtime = "nodejs";

type Body = {
  analysisFocus?: unknown;
};

export async function POST(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBodyV1<Body>(req);
    const analysisFocus = String(body?.analysisFocus || "").trim() || DEFAULT_ANALYSIS_FOCUS_V1;
    if (!analysisFocus) {
      return failV1("VALIDATION_FAILED", "analysisFocus is required", { status: 400 });
    }

    const data = await runWorkbenchRecommendationsV1({ analysisFocus });
    return okV1(data);
  });
}
