import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import type { StrategyLabWritebackInput } from "@/src/daa/modules/strategyLab/strategyLabContracts";
import { writeStrategyLabTargetWeights } from "@/src/daa/modules/strategyLab/strategyLabService";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBody<StrategyLabWritebackInput>(req);
    const scopeAssetKeys = Array.isArray(body?.scopeAssetKeys) ? body.scopeAssetKeys : [];
    if (!scopeAssetKeys.length) {
      return fail("VALIDATION_FAILED", "scopeAssetKeys is required", { status: 400 });
    }

    const candidateId = String(body?.candidateId || "").trim().toLowerCase();
    if (!candidateId) {
      return fail("VALIDATION_FAILED", "candidateId is required", { status: 400 });
    }

    const data = await writeStrategyLabTargetWeights({
      candidateId: candidateId as StrategyLabWritebackInput["candidateId"],
      scopeAssetKeys,
      weightsByAssetKey: body?.weightsByAssetKey || {},
    });

    return ok(data);
  });
}
