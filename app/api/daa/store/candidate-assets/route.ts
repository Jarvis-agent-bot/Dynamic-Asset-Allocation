import { requireDaaAdminEditorAuth, requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, readJsonBodyV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { listDaaCandidateAssetsV1, replaceDaaCandidateAssetsV1 } from "@/src/daa/store/daaStorePgV1";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const candidates = await listDaaCandidateAssetsV1();
    return okV1({ candidates });
  });
}

export async function POST(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBodyV1<{ candidates?: unknown }>(req);
    if (!Array.isArray(body?.candidates)) {
      return failV1("VALIDATION_FAILED", "candidates must be an array", { status: 400 });
    }

    const candidates = await replaceDaaCandidateAssetsV1(body.candidates as any[]);
    return okV1({ candidates });
  });
}
