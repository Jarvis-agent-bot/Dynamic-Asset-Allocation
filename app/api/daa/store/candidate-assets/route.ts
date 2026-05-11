import { requireDaaAdminEditorAuth, requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { parseDaaCandidateAssetInputs } from "@/src/daa/api/storePayloadValidators";
import { listDaaCandidateAssets, replaceDaaCandidateAssets } from "@/src/daa/store/daaStorePg";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const candidates = await listDaaCandidateAssets();
    return ok({ candidates });
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBody<{ candidates?: unknown }>(req);
    const parsed = parseDaaCandidateAssetInputs(body?.candidates);
    if (!parsed.ok) return fail("VALIDATION_FAILED", parsed.message, { status: 400 });

    const candidates = await replaceDaaCandidateAssets(parsed.value);
    return ok({ candidates });
  });
}
