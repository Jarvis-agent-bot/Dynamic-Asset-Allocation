import { NextResponse } from "next/server";

import { getDaaAdminActorUserIdFromRequestV1, requireDaaAdminEditorAuth, requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { createDaaRunV0, listDaaRunsV0 } from "@/src/daa/storeV0";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = await requireDaaAdminViewerAuth(req);
  if (denied) return denied;

  const url = new URL(req.url);

  const limitRaw = url.searchParams.get("limit");
  const limitNum = limitRaw === null ? NaN : Number(limitRaw);
  const limit = Number.isFinite(limitNum) ? Math.max(1, Math.min(200, Math.trunc(limitNum))) : 50;

  const beforeCreatedAt = String(url.searchParams.get("beforeCreatedAt") ?? "").trim() || undefined;
  const beforeRunId = String(url.searchParams.get("beforeRunId") ?? "").trim() || undefined;

  const fromCreatedAt = String(url.searchParams.get("fromCreatedAt") ?? "").trim() || undefined;
  const toCreatedAt = String(url.searchParams.get("toCreatedAt") ?? "").trim() || undefined;
  const actor = String(url.searchParams.get("actor") ?? "").trim() || undefined;
  const status = String(url.searchParams.get("status") ?? "").trim() || undefined;
  const source = String(url.searchParams.get("source") ?? "").trim() || undefined;
  const q = String(url.searchParams.get("q") ?? "").trim() || undefined;

  const sortRaw = String(url.searchParams.get("sort") ?? "").trim().toLowerCase();
  const sort = sortRaw === "created_asc" || sortRaw === "created_desc" ? sortRaw : undefined;

  try {
    const runs = await listDaaRunsV0({
      limit,
      beforeCreatedAt,
      beforeRunId,
      fromCreatedAt,
      toCreatedAt,
      actor,
      status,
      source,
      q,
      sort,
    });
    return NextResponse.json({ ok: true, runs });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e ?? "error") }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const denied = await requireDaaAdminEditorAuth(req);
  if (denied) return denied;

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
  const status = (body as any).status === undefined ? undefined : String((body as any).status);
  const payload = (body as any).payload;

  if (!kind) return NextResponse.json({ ok: false, error: "missing kind" }, { status: 400 });

  try {
    const actorUserId = await getDaaAdminActorUserIdFromRequestV1(req);
    const { runId, createdAt } = await createDaaRunV0({ kind, status, payload, actorUserId });
    return NextResponse.json({ ok: true, runId, createdAt });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e ?? "error") }, { status: 500 });
  }
}
