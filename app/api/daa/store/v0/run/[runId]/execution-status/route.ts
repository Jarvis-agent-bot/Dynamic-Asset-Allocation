import { NextResponse } from "next/server";

import {
  getDaaAdminActorUserIdFromRequestV1,
  requireDaaAdminEditorAuth,
  requireDaaAdminViewerAuth,
} from "../../../../../../../../src/daa/adminAuth";
import { getDaaRunExecutionStatusesV0, setDaaRunExecutionStatusesV0 } from "../../../../../../../../src/daa/storeV0";

export const runtime = "nodejs";

function normalizeStatuses(body: any): Array<{ orderId: string; status: string; reason?: string; code?: string; updatedAt?: string }> {
  const statuses = Array.isArray(body?.statuses) ? body.statuses : [];
  return statuses.filter((x) => x && typeof x === "object");
}

export async function GET(req: Request, ctx: { params: { runId: string } }) {
  const denied = await requireDaaAdminViewerAuth(req);
  if (denied) return denied;

  const runId = String(ctx?.params?.runId ?? "").trim();
  if (!runId) return NextResponse.json({ ok: false, error: "missing runId" }, { status: 400 });

  try {
    const statuses = await getDaaRunExecutionStatusesV0(runId);
    return NextResponse.json({ ok: true, runId, statuses });
  } catch (e: any) {
    const msg = String(e?.message ?? e ?? "error");
    const status = msg === "run not found" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
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

  const statuses = normalizeStatuses(body);
  if (!statuses.length) {
    return NextResponse.json({ ok: false, error: "missing statuses" }, { status: 400 });
  }

  try {
    const actorUserId = await getDaaAdminActorUserIdFromRequestV1(req);
    const r = await setDaaRunExecutionStatusesV0({ runId, statuses, actorUserId });
    return NextResponse.json({ ok: true, runId: r.runId, saved: r.saved, updatedAt: r.updatedAt });
  } catch (e: any) {
    const msg = String(e?.message ?? e ?? "error");
    const status = msg === "run not found" ? 404 : msg === "missing statuses" ? 400 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
