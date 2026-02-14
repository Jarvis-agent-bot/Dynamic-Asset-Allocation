import { NextResponse } from "next/server";

import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { setDaaRunConfirmV0 } from "@/src/daa/sqlite/daaSqliteStoreV0";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: { runId: string } }) {
  const denied = requireDaaAdminEditorAuth(req);
  if (denied) return denied;

  const runId = String(ctx?.params?.runId ?? "").trim();
  if (!runId) return NextResponse.json({ ok: false, error: "missing runId" }, { status: 400 });

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  try {
    await setDaaRunConfirmV0({ runId, payload: (body as any).payload ?? body });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const msg = String(e?.message ?? e ?? "error");
    const status = msg === "run not found" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
