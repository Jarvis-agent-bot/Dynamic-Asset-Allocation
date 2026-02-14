import { NextResponse } from "next/server";

import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { createDaaAuthAccountV0 } from "@/src/daa/auth/daaAuthStoreV0";

export const runtime = "nodejs";

export async function POST(req: Request) {
  // Admin-only: use legacy bearer tokens or an existing session.
  const denied = await requireDaaAdminEditorAuth(req);
  if (denied) return denied;

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const username = typeof body?.username === "string" ? body.username : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const roles = Array.isArray(body?.roles) ? body.roles : undefined;

  try {
    const account = await createDaaAuthAccountV0({ username, password, roles });
    return NextResponse.json({ ok: true, account: { accountId: account.accountId, username: account.username, roles: account.roles } });
  } catch (e: any) {
    const msg = String(e?.message ?? e ?? "error");
    const status = /unique/i.test(msg) ? 409 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
