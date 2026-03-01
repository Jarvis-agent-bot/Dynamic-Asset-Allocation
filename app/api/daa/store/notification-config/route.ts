import { requireDaaAdminEditorAuth, requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, readJsonBodyV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { getDaaNotificationConfigV1, saveDaaNotificationConfigV1 } from "@/src/daa/store/daaStorePgV1";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function GET(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const config = await getDaaNotificationConfigV1();
    return okV1({ config });
  });
}

export async function POST(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBodyV1<{ config?: unknown }>(req);
    if (!isRecord(body?.config)) {
      return failV1("VALIDATION_FAILED", "config must be an object", { status: 400 });
    }

    const config = await saveDaaNotificationConfigV1(body.config as any);
    return okV1({ config });
  });
}
