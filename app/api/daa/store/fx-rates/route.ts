import { requireDaaAdminEditorAuth, requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
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
    if (!Array.isArray(body?.rates)) {
      return fail("VALIDATION_FAILED", "rates must be an array", { status: 400 });
    }

    const rates = await replaceDaaFxRates(body.rates as any[]);
    return ok({ rates });
  });
}
