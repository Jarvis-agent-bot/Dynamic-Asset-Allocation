import { requireDaaAdminEditorAuth, requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { fail, mapDeniedResponse, ok, readJsonBody, withApiHandler } from "@/src/daa/api/routeHelpers";
import { appendDaaLlmFeedback, listDaaLlmFeedback } from "@/src/daa/store/daaStorePg";

type Body = {
  contextId?: unknown;
  type?: unknown;
  score?: unknown;
  comment?: unknown;
};

function normalizeType(value: unknown): "insight" | "decision" {
  return String(value || "").trim().toLowerCase() === "decision" ? "decision" : "insight";
}

function normalizeScore(value: unknown): "up" | "down" | null {
  const score = String(value || "").trim().toLowerCase();
  if (score === "up" || score === "down") return score;
  return null;
}

export const runtime = "nodejs";

export async function GET(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminViewerAuth(req));
    if (denied) return denied;

    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(500, Math.trunc(Number(url.searchParams.get("limit") || 200) || 200)));
    const mode = String(url.searchParams.get("mode") || "list").trim().toLowerCase();
    const type = normalizeType(url.searchParams.get("type"));
    const days = Math.max(1, Math.min(30, Math.trunc(Number(url.searchParams.get("days") || 7) || 7)));

    const rows = await listDaaLlmFeedback({ type, limit });
    if (mode !== "stats") {
      return ok({ rows });
    }

    const sinceMs = Date.now() - (days * 24 * 60 * 60 * 1000);
    const weekRows = rows.filter((row) => Date.parse(row.createdAt) >= sinceMs);
    const useful = weekRows.filter((row) => row.score === "up").length;
    const useless = weekRows.filter((row) => row.score === "down").length;
    const total = useful + useless;
    return ok({
      days,
      total,
      useful,
      useless,
      usefulRatePct: total > 0 ? (useful / total) * 100 : 0,
      avgLatencyMs: null,
      rejectRatePct: null,
      topDownComments: weekRows
        .filter((row) => row.score === "down" && row.comment)
        .slice(0, 5)
        .map((row) => row.comment),
    });
  });
}

export async function POST(req: Request) {
  return withApiHandler(async () => {
    const denied = mapDeniedResponse(await requireDaaAdminEditorAuth(req));
    if (denied) return denied;

    const body = await readJsonBody<Body>(req);
    const contextId = String(body?.contextId || "").trim();
    if (!contextId) {
      return fail("VALIDATION_FAILED", "contextId is required", { status: 400 });
    }
    const score = normalizeScore(body?.score);
    if (!score) {
      return fail("VALIDATION_FAILED", "score must be up or down", { status: 400 });
    }

    const row = await appendDaaLlmFeedback({
      contextId,
      type: normalizeType(body?.type),
      score,
      comment: String(body?.comment || "").trim() || undefined,
    });
    return ok({ row });
  });
}
