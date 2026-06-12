/**
 * GET /api/daa/agent/memories — 分页列出经验记录
 * DELETE /api/daa/agent/memories?id=xxx — 删除单条经验记录
 */

export const runtime = "nodejs";

import { withApiHandler, ok, fail, mapDeniedResponse } from "@/src/daa/api/routeHelpers";
import { requireDaaAdminViewerAuth, requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { listMemories, deleteMemory } from "@/src/daa/agent/store/memoryStore";
import type { MemoryType } from "@/src/daa/agent/cognitiveTypes";

const VALID_TYPES = new Set(["pattern", "lesson", "preference", "fact"]);

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const type = url.searchParams.get("type") || undefined;
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 20));
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

    const validType = type && VALID_TYPES.has(type) ? (type as MemoryType) : undefined;

    const result = await listMemories({ type: validType, limit, offset });
    return ok(result);
  });
}

export async function DELETE(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return fail("VALIDATION_FAILED", "缺少经验记录 ID", { status: 400 });

    await deleteMemory(id);
    return ok({ deleted: true });
  });
}
