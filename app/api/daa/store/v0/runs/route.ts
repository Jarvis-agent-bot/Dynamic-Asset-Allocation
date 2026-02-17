import { NextResponse } from "next/server";

import { requireDaaAdminViewerAuth } from "../../../../../../src/daa/adminAuth";

import { listDaaRunsV0 } from "../../../../../../src/daa/storeV0";

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

  // Optional filters for the dashboard audit list.
  const fromCreatedAt = String(url.searchParams.get("fromCreatedAt") ?? "").trim() || undefined;
  const toCreatedAt = String(url.searchParams.get("toCreatedAt") ?? "").trim() || undefined;
  const actor = String(url.searchParams.get("actor") ?? "").trim() || undefined;
  const status = String(url.searchParams.get("status") ?? "").trim() || undefined;
  const source = String(url.searchParams.get("source") ?? "").trim() || undefined;

  try {
    const runs = await listDaaRunsV0({ limit, beforeCreatedAt, beforeRunId, fromCreatedAt, toCreatedAt, actor, status, source });
    return NextResponse.json({ ok: true, runs });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e ?? "error") }, { status: 500 });
  }
}
