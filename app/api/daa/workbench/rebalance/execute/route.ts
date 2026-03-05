import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, readJsonBodyV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { executeWorkbenchRebalanceCycleV1 } from "@/src/daa/modules/workbench/workbenchServiceV1";

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
    const payload = (body || {}) as Body;
    const cycleId = String(payload.cycleId || "").trim();
    if (!cycleId) {
      return failV1("VALIDATION_FAILED", "cycleId is required", { status: 400 });
    }
    const executeMode = String(payload.executeMode || "").trim().toLowerCase() === "selected" ? "selected" : "all";
    let data;
    try {
      data = await executeWorkbenchRebalanceCycleV1({ cycleId, executeMode });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "");
      if (message.startsWith("RISK_BLOCKED:")) {
        return failV1("VALIDATION_FAILED", message.slice("RISK_BLOCKED:".length).trim() || "执行前风控阻断", { status: 409 });
      }
      throw error;
    }
    return okV1(data);
  });
}
