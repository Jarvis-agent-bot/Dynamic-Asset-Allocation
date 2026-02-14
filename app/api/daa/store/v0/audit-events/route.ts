import { NextResponse } from "next/server";

import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";

import { listDaaRunAuditEventsV0 } from "@/src/daa/sqlite/daaSqliteStoreV0";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = await requireDaaAdminViewerAuth(req);
  if (denied) return denied;

  const url = new URL(req.url);

  const limitRaw = url.searchParams.get("limit");
  const limitNum = limitRaw === null ? NaN : Number(limitRaw);
  const limit = Number.isFinite(limitNum) ? Math.max(1, Math.min(200, Math.trunc(limitNum))) : 50;

  const beforeCreatedAt = String(url.searchParams.get("beforeCreatedAt") ?? "").trim() || undefined;
  const beforeEventId = String(url.searchParams.get("beforeEventId") ?? "").trim() || undefined;

  const fromCreatedAt = String(url.searchParams.get("fromCreatedAt") ?? "").trim() || undefined;
  const toCreatedAt = String(url.searchParams.get("toCreatedAt") ?? "").trim() || undefined;

  // Filter by the admin actor/user id who wrote the event.
  // Expected values: viewer-token | editor-token | legacy-token.
  const actorUserId = String(url.searchParams.get("actorUserId") ?? "").trim() || undefined;

  try {
    const events = await listDaaRunAuditEventsV0({
      limit,
      beforeCreatedAt,
      beforeEventId,
      fromCreatedAt,
      toCreatedAt,
      actorUserId,
    });
    return NextResponse.json({ ok: true, events });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e ?? "error") }, { status: 500 });
  }
}
