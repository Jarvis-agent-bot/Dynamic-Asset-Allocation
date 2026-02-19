import { NextResponse } from "next/server";

import { getDaaAdminActorUserIdFromRequestV1, requireDaaAdminEditorAuth } from "../../../../../../../../src/daa/adminAuth";
import { appendDaaRunAuditEventV0 } from "../../../../../../../../src/daa/storeV0";

export const runtime = "nodejs";

function normalizeTagsV0(input: unknown): string[] {
  const raw = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? String(input)
          .split(",")
          .map((x) => x.trim())
      : [];

  const out: string[] = [];
  const seen = new Set<string>();

  for (const v of raw) {
    const tag = String(v ?? "").trim();
    if (!tag) continue;

    const key = tag.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(tag);

    if (out.length >= 20) break;
  }

  return out;
}

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

  const notes = String((body as any).notes ?? "").trim();
  const tags = normalizeTagsV0((body as any).tags);

  if (!notes && tags.length === 0) {
    return NextResponse.json({ ok: false, error: "notes or tags required" }, { status: 400 });
  }

  try {
    const actorUserId = await getDaaAdminActorUserIdFromRequestV1(req);
    const { eventId, createdAt } = await appendDaaRunAuditEventV0({
      runId,
      kind: "run_annotation_v0",
      payload: { notes, tags },
      actorUserId,
    });

    return NextResponse.json({ ok: true, eventId, createdAt });
  } catch (e: any) {
    const msg = String(e?.message ?? e ?? "error");
    const status = msg === "run not found" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
