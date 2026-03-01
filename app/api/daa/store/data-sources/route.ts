import { requireDaaAdminEditorAuth, requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1, readJsonBodyV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { listDaaDataSourcesV1, replaceDaaDataSourcesV1 } from "@/src/daa/store/daaStorePgV1";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const kind = url.searchParams.get("kind")?.trim() || undefined;
    const dataSources = await listDaaDataSourcesV1(kind);
    return okV1({ dataSources });
  });
}

export async function POST(req: Request) {
  return withApiHandlerV1(async () => {
    const denied = mapDeniedResponseV1(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBodyV1<{ dataSources?: unknown }>(req);
    if (!Array.isArray(body?.dataSources)) {
      return failV1("VALIDATION_FAILED", "dataSources must be an array", { status: 400 });
    }

    const dataSources = await replaceDaaDataSourcesV1(body.dataSources as any[]);
    return okV1({ dataSources });
  });
}
