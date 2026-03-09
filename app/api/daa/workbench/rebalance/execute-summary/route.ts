import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, readJsonBodyV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { WorkbenchDomainErrorV1, buildWorkbenchExecuteSummaryV1 } from "@/src/daa/modules/workbench/workbenchServiceV1";

export const runtime = "nodejs";

type Body = {
  cycleId?: unknown;
  executeMode?: unknown;
};

export async function POST(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBodyV1<Body>(req);
    const cycleId = String(body?.cycleId || "").trim();
    if (!cycleId) {
      return failV1("VALIDATION_FAILED", "cycleId is required", { status: 400 });
    }
    const executeMode = String(body?.executeMode || "").trim().toLowerCase() === "selected" ? "selected" : "all";
    let summary;
    try {
      summary = await buildWorkbenchExecuteSummaryV1({ cycleId, executeMode });
    } catch (error) {
      if (error instanceof WorkbenchDomainErrorV1) {
        return failV1("VALIDATION_FAILED", error.message, {
          status: error.status,
          details: {
            code: error.code,
            ...(error.details || {}),
          },
        });
      }
      throw error;
    }
    return okV1(summary);
  });
}
