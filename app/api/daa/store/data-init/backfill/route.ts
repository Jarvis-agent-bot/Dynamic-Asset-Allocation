import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { runHistoryBackfill, type BackfillRange, type BackfillInterval } from "@/src/daa/modules/dataInit/historyBackfillService";

export const runtime = "nodejs";

const VALID_RANGES: BackfillRange[] = ["1y", "2y", "5y"];
const VALID_INTERVALS: BackfillInterval[] = ["1d", "1h"];

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBody<{
      assetKeys?: unknown;
      range?: unknown;
      interval?: unknown;
    }>(req);

    // 验证 range
    const range = String(body?.range || "1y").trim() as BackfillRange;
    if (!VALID_RANGES.includes(range)) {
      return fail("VALIDATION_FAILED", `range 必须是 ${VALID_RANGES.join(" | ")}`, { status: 400 });
    }

    // 验证 interval
    const interval = String(body?.interval || "1d").trim() as BackfillInterval;
    if (!VALID_INTERVALS.includes(interval)) {
      return fail("VALIDATION_FAILED", `interval 必须是 ${VALID_INTERVALS.join(" | ")}`, { status: 400 });
    }

    // 验证 assetKeys（可选）
    let assetKeys: string[] | undefined;
    if (body?.assetKeys != null) {
      if (!Array.isArray(body.assetKeys)) {
        return fail("VALIDATION_FAILED", "assetKeys 必须是字符串数组", { status: 400 });
      }
      assetKeys = body.assetKeys
        .map((k) => String(k || "").trim())
        .filter(Boolean);
    }

    const result = await runHistoryBackfill({ assetKeys, range, interval });
    return ok(result);
  });
}
