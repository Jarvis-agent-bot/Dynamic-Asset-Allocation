import { requireDaaAdminEditorAuth, requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { appendDaaRunHistory, listDaaRunHistory } from "@/src/daa/store/daaStorePg";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") || 50);
    const entries = await listDaaRunHistory(limit);
    return ok({ entries });
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBody<{
      requestJson?: unknown;
      responseJson?: unknown;
      summaryJson?: unknown;
      triggerSource?: unknown;
    }>(req);

    if (!body || typeof body !== "object") {
      return fail("VALIDATION_FAILED", "body is required", { status: 400 });
    }

    const requestJson = body.requestJson;
    const responseJson = body.responseJson;
    if (!requestJson || typeof requestJson !== "object" || Array.isArray(requestJson)) {
      return fail("VALIDATION_FAILED", "requestJson must be an object", { status: 400 });
    }
    if (!responseJson || typeof responseJson !== "object" || Array.isArray(responseJson)) {
      return fail("VALIDATION_FAILED", "responseJson must be an object", { status: 400 });
    }

    const summaryJson = body.summaryJson && typeof body.summaryJson === "object" && !Array.isArray(body.summaryJson)
      ? (body.summaryJson as Record<string, unknown>)
      : {};

    const entry = await appendDaaRunHistory({
      requestJson: requestJson as Record<string, unknown>,
      responseJson: responseJson as Record<string, unknown>,
      summaryJson,
      triggerSource: typeof body.triggerSource === "string" ? body.triggerSource : "manual",
    });

    return ok({ entry });
  });
}
