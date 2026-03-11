import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponseV1, okV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { buildWorkbenchReadModelV1 } from "@/src/daa/modules/read/workbenchReadServiceV1";
import { buildDevMemWorkbenchReadModelV1, shouldUseDevMemFallbackV1 } from "@/src/daa/devMemFallbackV1";

export const runtime = "nodejs";

function toBooleanV1(value: string | null, fallback = false): boolean {
  if (value == null) return fallback;
  const text = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  return fallback;
}

export async function GET(req: Request) {
  return withApiHandlerV1(async () => {
    const authResult = await requireDaaAdminViewerAuth(req).catch((error) => {
      if (shouldUseDevMemFallbackV1(error)) return null;
      throw error;
    });
    const denied = mapDeniedResponseV1(authResult);
    if (denied) {
      if (shouldUseDevMemFallbackV1()) return okV1(buildDevMemWorkbenchReadModelV1());
      return denied;
    }
    const { searchParams } = new URL(req.url);
    try {
      return okV1(await buildWorkbenchReadModelV1({
        syncPrices: toBooleanV1(searchParams.get("syncPrices"), false),
        autoRiskCycle: toBooleanV1(searchParams.get("autoRiskCycle"), false),
      }));
    } catch (error) {
      if (shouldUseDevMemFallbackV1(error)) return okV1(buildDevMemWorkbenchReadModelV1());
      throw error;
    }
  });
}
