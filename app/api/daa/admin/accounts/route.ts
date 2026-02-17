import { NextResponse } from "next/server";

import {
  createDaaAuthAccountV0,
  deleteDaaAuthAccountV0,
  listDaaAuthAccountsV0,
  type DaaAuthRoleV0,
  updateDaaAuthAccountV0,
} from "../../../../../src/daa/auth/daaAuthStoreV0";
import { getDaaAuthContextFromRequestV0 } from "../../../../../src/daa/auth/daaAuthRequestV0";

export const runtime = "nodejs";

type JsonObject = Record<string, unknown>;

async function parseBody(req: Request): Promise<JsonObject> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as JsonObject) : {};
  } catch {
    return {};
  }
}

function parseRoles(raw: unknown): DaaAuthRoleV0[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: DaaAuthRoleV0[] = [];
  for (const v of raw) {
    if (v !== "viewer" && v !== "editor") continue;
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

function parseStatus(raw: unknown): "active" | "inactive" | undefined {
  if (raw === "active" || raw === "inactive") return raw;
  return undefined;
}

async function requireSessionRole(req: Request, role: "viewer" | "editor") {
  const ctx = await getDaaAuthContextFromRequestV0(req);
  if (!ctx) return NextResponse.json({ ok: false, error: "not_authenticated" }, { status: 401 });

  const roles = Array.isArray(ctx.account.roles) ? ctx.account.roles : [];
  const hasEditor = roles.includes("editor");
  const hasViewer = roles.includes("viewer") || hasEditor;

  if ((role === "editor" && !hasEditor) || (role === "viewer" && !hasViewer)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  return null;
}

export async function GET(req: Request) {
  const denied = await requireSessionRole(req, "viewer");
  if (denied) return denied;

  try {
    const accounts = await listDaaAuthAccountsV0();
    return NextResponse.json({ ok: true, accounts });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e ?? "error") }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const denied = await requireSessionRole(req, "editor");
  if (denied) return denied;

  const body = await parseBody(req);
  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : undefined;
  const roles = parseRoles(body.roles);

  try {
    const account = await createDaaAuthAccountV0({ username, password, roles });
    return NextResponse.json({ ok: true, account });
  } catch (e: any) {
    const msg = String(e?.message ?? e ?? "error");
    const status = /unique/i.test(msg) ? 409 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function PATCH(req: Request) {
  const denied = await requireSessionRole(req, "editor");
  if (denied) return denied;

  const body = await parseBody(req);
  const accountId = typeof body.accountId === "string" ? body.accountId : "";
  const roles = parseRoles(body.roles);
  const status = parseStatus(body.status);

  try {
    const result = await updateDaaAuthAccountV0({ accountId, roles, status });
    if (!result.ok) {
      const code = result.error === "not_found" ? 404 : 400;
      return NextResponse.json(result, { status: code });
    }
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e ?? "error") }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const denied = await requireSessionRole(req, "editor");
  if (denied) return denied;

  const body = await parseBody(req);
  const accountId = typeof body.accountId === "string" ? body.accountId : "";

  try {
    const result = await deleteDaaAuthAccountV0({ accountId });
    if (!result.ok) {
      const code = result.error === "not_found" ? 404 : 400;
      return NextResponse.json(result, { status: code });
    }
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e ?? "error") }, { status: 400 });
  }
}
