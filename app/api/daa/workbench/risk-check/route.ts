import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { runWorkbenchRiskCheck } from "@/src/daa/modules/workbench/workbenchExecutionService";

export const runtime = "nodejs";

type Body = {
  cycleId?: unknown;
  selectedAssetSideKeys?: unknown;
};

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBody<Body>(req);
    const payload = (body || {}) as Body;
    const selectedAssetSideKeys = Array.isArray(payload.selectedAssetSideKeys)
      ? payload.selectedAssetSideKeys.map((item) => String(item || "").trim()).filter(Boolean)
      : undefined;
    const cycleId = payload.cycleId == null ? undefined : String(payload.cycleId || "").trim();
    if (payload.cycleId != null && !cycleId) {
      return fail("VALIDATION_FAILED", "cycleId must not be empty", { status: 400 });
    }
    const data = await runWorkbenchRiskCheck({ cycleId, selectedAssetSideKeys });
    return ok(data);
  });
}
