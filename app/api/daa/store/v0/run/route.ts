import { NextResponse } from "next/server";

import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { createDaaRunV0 } from "@/src/daa/sqlite/daaSqliteStoreV0";

export const runtime = "nodejs";

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
    const { runId, createdAt } = await createDaaRunV0({ kind, status, payload });
    return NextResponse.json({ ok: true, runId, createdAt });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e ?? "error") }, { status: 500 });
  }
}
