import { requireDaaAdminEditorAuth, requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, readJsonBodyV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { listDaaFxRatesV1, replaceDaaFxRatesV1 } from "@/src/daa/store/daaStorePgV1";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const rates = await listDaaFxRatesV1();
    return okV1({ rates });
  });
}

export async function POST(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBodyV1<{ rates?: unknown }>(req);
    if (!Array.isArray(body?.rates)) {
      return failV1("VALIDATION_FAILED", "rates must be an array", { status: 400 });
    }

    const rates = await replaceDaaFxRatesV1(body.rates as any[]);
    return okV1({ rates });
  });
}
