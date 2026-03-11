import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { mapDeniedResponseV1, okV1, withApiHandlerV1 } from "@/src/daa/api/routeHelpersV1";
import { buildTradesReadModelV1 } from "@/src/daa/modules/read/tradesReadServiceV1";
import { buildDevMemTradesReadModelV1, shouldUseDevMemFallbackV1 } from "@/src/daa/devMemFallbackV1";

export const runtime = "nodejs";

function toNumberV1(value: string | null, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export async function GET(req: Request) {
  return withApiHandlerV1(async () => {
    const authResult = await requireDaaAdminViewerAuth(req).catch((error) => {
      if (shouldUseDevMemFallbackV1(error)) return null;
      throw error;
    });
    const denied = mapDeniedResponseV1(authResult);
    if (denied) {
      if (shouldUseDevMemFallbackV1()) return okV1(buildDevMemTradesReadModelV1());
      return denied;
    }
    const { searchParams } = new URL(req.url);
    try {
      return okV1(await buildTradesReadModelV1({
        tradeLimit: toNumberV1(searchParams.get("tradeLimit"), 150),
        reportLimit: toNumberV1(searchParams.get("reportLimit"), 120),
      }));
    } catch (error) {
      if (shouldUseDevMemFallbackV1(error)) return okV1(buildDevMemTradesReadModelV1());
      throw error;
    }
  });
}
