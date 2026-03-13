import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponse, ok, withApiHandler } from "@/src/daa/api/routeHelpers";
import { buildWorkbenchReadModel } from "@/src/daa/modules/read/workbenchReadService";
import { buildDevMemWorkbenchReadModel, shouldUseDevMemFallback } from "@/src/daa/devMemFallback";

export const runtime = "nodejs";

function toBoolean(value: string | null, fallback = false): boolean {
  if (value == null) return fallback;
  const text = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  return fallback;
}

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const authResult = await requireDaaAdminViewerAuth(req).catch((error) => {
      if (shouldUseDevMemFallback(error)) return null;
      throw error;
    });
    const denied = mapDeniedResponse(authResult);
    if (denied) {
      if (shouldUseDevMemFallback()) return ok(buildDevMemWorkbenchReadModel());
      return denied;
    }
    const { searchParams } = new URL(req.url);
    try {
      return ok(await buildWorkbenchReadModel({
        syncPrices: toBoolean(searchParams.get("syncPrices"), false),
        autoRiskCycle: toBoolean(searchParams.get("autoRiskCycle"), false),
      }));
    } catch (error) {
      if (shouldUseDevMemFallback(error)) return ok(buildDevMemWorkbenchReadModel());
      throw error;
    }
  });
}
