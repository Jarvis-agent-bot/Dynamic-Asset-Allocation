import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, readJsonBodyV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import type { StrategyLabWritebackInputV1 } from "@/src/daa/modules/strategyLab/strategyLabContractsV1";
import { writeStrategyLabTargetWeightsV1 } from "@/src/daa/modules/strategyLab/strategyLabServiceV1";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBodyV1<StrategyLabWritebackInputV1>(req);
    const scopeAssetKeys = Array.isArray(body?.scopeAssetKeys) ? body.scopeAssetKeys : [];
    if (!scopeAssetKeys.length) {
      return failV1("VALIDATION_FAILED", "scopeAssetKeys is required", { status: 400 });
    }

    const candidateId = String(body?.candidateId || "").trim().toLowerCase();
    if (!candidateId) {
      return failV1("VALIDATION_FAILED", "candidateId is required", { status: 400 });
    }

    const data = await writeStrategyLabTargetWeightsV1({
      candidateId: candidateId as StrategyLabWritebackInputV1["candidateId"],
      scopeAssetKeys,
      weightsByAssetKey: body?.weightsByAssetKey || {},
    });

    return okV1(data);
  });
}
