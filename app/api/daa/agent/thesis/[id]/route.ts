/**
 * GET /api/daa/agent/thesis/[id] — 获取投资判断详情（含依据链 + 复盘历史）
 */

export const runtime = "nodejs";

import { withApiHandler, ok, fail, mapDeniedResponse } from "@/src/daa/api/routeHelpers";
import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { getThesisWithEvidence, getReviewsByThreadId } from "@/src/daa/agent/store/thesisStore";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const id = params.id;
    if (!id) return fail("VALIDATION_FAILED", "缺少投资判断 ID", { status: 400 });

    const result = await getThesisWithEvidence(id);
    if (!result) return fail("NOT_FOUND", "投资判断不存在", { status: 404 });

    const reviews = await getReviewsByThreadId(id);

    return ok({
      thread: result.thread,
      evidence: result.evidence,
      reviews,
    });
  });
}
