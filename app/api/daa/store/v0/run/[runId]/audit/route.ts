import { NextResponse } from "next/server";

import { getDaaAdminActorUserIdFromRequestV1, requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { appendDaaRunAuditEventV0 } from "@/src/daa/sqlite/daaSqliteStoreV0";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: { runId: string } }) {
  const denied = await requireDaaAdminEditorAuth(req);
  if (denied) return denied;

  const runId = String(ctx?.params?.runId ?? "").trim();
  if (!runId) return NextResponse.json({ ok: false, error: "missing runId" }, { status: 400 });

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const kind = String((body as any).kind ?? "").trim();
  const payload = (body as any).payload;
  if (!kind) return NextResponse.json({ ok: false, error: "missing kind" }, { status: 400 });

  try {
    const actorUserId = await getDaaAdminActorUserIdFromRequestV1(req);
    const { eventId, createdAt } = await appendDaaRunAuditEventV0({ runId, kind, payload, actorUserId });
    return NextResponse.json({ ok: true, eventId, createdAt });
  } catch (e: any) {
    const msg = String(e?.message ?? e ?? "error");
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
