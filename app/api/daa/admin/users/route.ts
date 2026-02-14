import { NextResponse } from "next/server";

import {
  getDaaAdminTokensConfiguredV0,
  inferDaaAdminRoleForTokenV0,
  inferDaaAdminTokenKindV0,
  requireDaaAdminEditorAuth,
  requireDaaAdminViewerAuth,
  type DaaAdminRole,
} from "@/src/daa/adminAuth";

import { getDaaAdminUserStatusMapV0, setDaaAdminUserActiveV0 } from "@/src/daa/sqlite/daaAdminUserStatusStoreV0";

type AdminUserIdV0 = "viewer-token" | "editor-token" | "legacy-token";

type AdminUserV0 = {
  id: AdminUserIdV0;
  role: DaaAdminRole;
  configured: boolean;
  active: boolean;
  source: "env";
};

function parseBearerToken(authHeader: string | null): string {
  const raw = typeof authHeader === "string" ? authHeader.trim() : "";
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return typeof m?.[1] === "string" ? m[1].trim() : "";
}

function isAdminUserIdV0(x: unknown): x is AdminUserIdV0 {
  return x === "viewer-token" || x === "editor-token" || x === "legacy-token";
}

// Read-only diagnostics endpoint for the dashboard.
// It intentionally does NOT expose any token material.
export async function GET(req: Request) {
  const denied = await requireDaaAdminViewerAuth(req);
  if (denied) return denied;

  const configured = getDaaAdminTokensConfiguredV0();

  const providedToken = parseBearerToken(req.headers.get("authorization"));
  const me = {
    tokenKind: inferDaaAdminTokenKindV0(providedToken),
    role: inferDaaAdminRoleForTokenV0(providedToken),
  };

  const base = [
    { id: "viewer-token", role: "viewer", configured: configured.viewer, source: "env" },
    { id: "editor-token", role: "editor", configured: configured.editor, source: "env" },
    // Legacy token historically grants editor-level access.
    { id: "legacy-token", role: "editor", configured: configured.legacy, source: "env" },
  ] satisfies Array<Omit<AdminUserV0, "active">>;

  const statuses = await getDaaAdminUserStatusMapV0(base.map((u) => u.id));

  const users: AdminUserV0[] = base.map((u) => ({
    ...u,
    active: (statuses[u.id] ?? "active") === "active",
  }));

  return NextResponse.json({ ok: true, users, me });
}

export async function PATCH(req: Request) {
  const denied = await requireDaaAdminEditorAuth(req);
  if (denied) return denied;

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const id = body?.id;
  const active = Boolean(body?.active);

  if (!isAdminUserIdV0(id)) {
    return NextResponse.json({ ok: false, error: "invalid id" }, { status: 400 });
  }

  try {
    const res = await setDaaAdminUserActiveV0({ userId: id, active });
    return NextResponse.json(res);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e ?? "error") }, { status: 500 });
  }
}
