import { NextResponse } from "next/server";

import { requireDaaAdminViewerAuth } from "../../../../../../src/daa/adminAuth";

import { listDaaAuthAuditEventsV0 } from "../../../../../../src/daa/auth/daaAuthStoreV0";
import { listDaaRunAuditEventsV0 } from "../../../../../../src/daa/storeV0";

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

  const sourceRaw = String(url.searchParams.get("source") ?? "").trim().toLowerCase();
  const source = sourceRaw === "auth" || sourceRaw === "all" ? sourceRaw : "run";

  const mapAuthEvent = (e: any) => ({
    eventId: e.eventId,
    runId: `auth:${e.accountId ?? "unknown"}`,
    createdAt: e.createdAt,
    kind: e.kind,
    actorUserId: e.actorUserId,
    payload: {
      ...(typeof e.payload === "object" && e.payload ? (e.payload as Record<string, unknown>) : {}),
      scope: "auth",
      accountId: e.accountId,
      sessionId: e.sessionId,
    },
  });

  const mapRunEvent = (e: any) => ({
    ...e,
    payload: {
      ...(typeof e.payload === "object" && e.payload ? (e.payload as Record<string, unknown>) : {}),
      scope: "run",
    },
  });

  try {
    if (source === "auth") {
      const events = await listDaaAuthAuditEventsV0({
        limit,
        beforeCreatedAt,
        beforeEventId,
        fromCreatedAt,
        toCreatedAt,
        actorUserId,
      });
      return NextResponse.json({ ok: true, events: events.map(mapAuthEvent) });
    }

    if (source === "all") {
      const [authEvents, runEvents] = await Promise.all([
        listDaaAuthAuditEventsV0({
          limit,
          beforeCreatedAt,
          beforeEventId,
          fromCreatedAt,
          toCreatedAt,
          actorUserId,
        }),
        listDaaRunAuditEventsV0({
          limit,
          beforeCreatedAt,
          beforeEventId,
          fromCreatedAt,
          toCreatedAt,
          actorUserId,
        }),
      ]);

      const merged = [...runEvents.map(mapRunEvent), ...authEvents.map(mapAuthEvent)]
        .sort((a, b) => {
          const byTs = String(b.createdAt).localeCompare(String(a.createdAt));
          if (byTs !== 0) return byTs;
          return String(b.eventId).localeCompare(String(a.eventId));
        })
        .slice(0, limit);

      return NextResponse.json({ ok: true, events: merged });
    }

    const events = await listDaaRunAuditEventsV0({
      limit,
      beforeCreatedAt,
      beforeEventId,
      fromCreatedAt,
      toCreatedAt,
      actorUserId,
    });
    return NextResponse.json({ ok: true, events: events.map(mapRunEvent) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e ?? "error") }, { status: 500 });
  }
}
