import { requireDaaAdminEditorAuth, requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, readJsonBodyV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { appendDaaRunHistoryV1, listDaaRunHistoryV1 } from "@/src/daa/store/daaStorePgV1";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") || 50);
    const entries = await listDaaRunHistoryV1(limit);
    return okV1({ entries });
  });
}

export async function POST(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBodyV1<{
      requestJson?: unknown;
      responseJson?: unknown;
      summaryJson?: unknown;
      triggerSource?: unknown;
    }>(req);

    if (!body || typeof body !== "object") {
      return failV1("VALIDATION_FAILED", "body is required", { status: 400 });
    }

    const requestJson = body.requestJson;
    const responseJson = body.responseJson;
    if (!requestJson || typeof requestJson !== "object" || Array.isArray(requestJson)) {
      return failV1("VALIDATION_FAILED", "requestJson must be an object", { status: 400 });
    }
    if (!responseJson || typeof responseJson !== "object" || Array.isArray(responseJson)) {
      return failV1("VALIDATION_FAILED", "responseJson must be an object", { status: 400 });
    }

    const summaryJson = body.summaryJson && typeof body.summaryJson === "object" && !Array.isArray(body.summaryJson)
      ? (body.summaryJson as Record<string, unknown>)
      : {};

    const entry = await appendDaaRunHistoryV1({
      requestJson: requestJson as Record<string, unknown>,
      responseJson: responseJson as Record<string, unknown>,
      summaryJson,
      triggerSource: typeof body.triggerSource === "string" ? body.triggerSource : "manual",
    });

    return okV1({ entry });
  });
}
