import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, readJsonBodyV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { runWorkbenchRiskCheckV1 } from "@/src/daa/modules/workbench/workbenchServiceV1";

export const runtime = "nodejs";

type Body = {
  cycleId?: unknown;
  selectedSymbols?: unknown;
};

export async function POST(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBodyV1<Body>(req);
    const payload = (body || {}) as Body;
    const selectedSymbols = Array.isArray(payload.selectedSymbols)
      ? payload.selectedSymbols.map((item) => String(item || "").trim().toUpperCase()).filter(Boolean)
      : undefined;
    const cycleId = payload.cycleId == null ? undefined : String(payload.cycleId || "").trim();
    if (payload.cycleId != null && !cycleId) {
      return failV1("VALIDATION_FAILED", "cycleId must not be empty", { status: 400 });
    }
    const data = await runWorkbenchRiskCheckV1({ cycleId, selectedSymbols });
    return okV1(data);
  });
}
