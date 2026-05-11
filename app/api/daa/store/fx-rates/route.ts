import { requireDaaAdminEditorAuth, requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { parseDaaFxRateInputs } from "@/src/daa/api/storePayloadValidators";
import { listDaaFxRates, replaceDaaFxRates } from "@/src/daa/store/daaStorePg";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const rates = await listDaaFxRates();
    return ok({ rates });
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBody<{ rates?: unknown }>(req);
    const parsed = parseDaaFxRateInputs(body?.rates);
    if (!parsed.ok) return fail("VALIDATION_FAILED", parsed.message, { status: 400 });

    const rates = await replaceDaaFxRates(parsed.value);
    return ok({ rates });
  });
}
