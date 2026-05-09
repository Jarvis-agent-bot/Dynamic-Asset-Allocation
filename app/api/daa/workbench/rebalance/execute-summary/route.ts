import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { normalizeRebalanceExecuteMode } from "@/src/daa/modules/workbench/rebalanceExecuteMode";
import { WorkbenchDomainError } from "@/src/daa/modules/workbench/workbenchErrors";
import { buildWorkbenchExecuteSummary } from "@/src/daa/modules/workbench/workbenchExecutionService";

export const runtime = "nodejs";

type Body = {
  cycleId?: unknown;
  executeMode?: unknown;
};

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBody<Body>(req);
    const cycleId = String(body?.cycleId || "").trim();
    if (!cycleId) {
      return fail("VALIDATION_FAILED", "cycleId is required", { status: 400 });
    }
    const executeMode = normalizeRebalanceExecuteMode(body?.executeMode);
    let summary;
    try {
      summary = await buildWorkbenchExecuteSummary({ cycleId, executeMode });
    } catch (error) {
      if (error instanceof WorkbenchDomainError) {
        return fail("VALIDATION_FAILED", error.message, {
          status: error.status,
          details: {
            code: error.code,
            ...(error.details || {}),
          },
        });
      }
      throw error;
    }
    return ok(summary);
  });
}
