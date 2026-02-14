import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import {
  bootstrapCreateFirstDaaAuthAccountV0,
  createDaaAuthAccountV0,
  hasAnyDaaAuthAccountsV0,
} from "@/src/daa/auth/daaAuthStoreV0";

export const runtime = "nodejs";

function normalizeToken(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function parseBearer(req: Request): string {
  const auth = normalizeToken(req.headers.get("authorization"));
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return normalizeToken(m ? m[1] : "");
}

function secureEqual(aRaw: unknown, bRaw: unknown): boolean {
  const a = normalizeToken(aRaw);
  const b = normalizeToken(bRaw);
  if (!a || !b) return false;

  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function misconfigured(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 500 });
}

function unauthorized() {
  return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: { "www-authenticate": "DaaBootstrap" } });
}

export async function POST(req: Request) {
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const username = typeof body?.username === "string" ? body.username : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const roles = Array.isArray(body?.roles) ? body.roles : undefined;

  const anyAccounts = await hasAnyDaaAuthAccountsV0();

  if (anyAccounts) {
    // Admin-only: use legacy bearer tokens or an existing session.
    const denied = await requireDaaAdminEditorAuth(req);
    if (denied) return denied;

    try {
      const account = await createDaaAuthAccountV0({ username, password, roles });
      return NextResponse.json({ ok: true, account: { accountId: account.accountId, username: account.username, roles: account.roles } });
    } catch (e: any) {
      const msg = String(e?.message ?? e ?? "error");
      const status = /unique/i.test(msg) ? 409 : 400;
      return NextResponse.json({ ok: false, error: msg }, { status });
    }
  }

  // First-admin bootstrap (one-time): allowed only when there are no accounts yet.
  const expected = normalizeToken(process.env.DAA_AUTH_BOOTSTRAP_TOKEN);
  if (!expected) {
    return process.env.NODE_ENV === "production"
      ? misconfigured("server misconfigured: missing DAA_AUTH_BOOTSTRAP_TOKEN (required for first-admin bootstrap)")
      : misconfigured("missing DAA_AUTH_BOOTSTRAP_TOKEN (required for first-admin bootstrap)");
  }

  // Allow passing the bootstrap token either via header (preferred), or JSON body.
  const provided =
    normalizeToken(req.headers.get("x-daa-bootstrap-token")) ||
    normalizeToken(body?.bootstrapToken) ||
    parseBearer(req);

  if (!secureEqual(provided, expected)) {
    return unauthorized();
  }

  try {
    const account = await bootstrapCreateFirstDaaAuthAccountV0({ username, password, roles });
    return NextResponse.json({ ok: true, account: { accountId: account.accountId, username: account.username, roles: account.roles }, bootstrapped: true });
  } catch (e: any) {
    const msg = String(e?.message ?? e ?? "error");

    if (/accounts already exist/i.test(msg) || /bootstrap not allowed/i.test(msg)) {
      return NextResponse.json({ ok: false, error: "bootstrap not allowed" }, { status: 409 });
    }

    const status = /unique/i.test(msg) ? 409 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
