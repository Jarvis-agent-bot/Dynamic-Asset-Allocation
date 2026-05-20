import { NextResponse } from "next/server";

import { getDaaAuthContextFromRequest } from "./auth/daaAuthRequest";
import { enterDaaAccountScopeForAuthAccount } from "./account/accountScope";

type DaaAdminRole = "viewer" | "editor";

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "unauthorized" },
    { status: 401, headers: { "www-authenticate": "Bearer" } },
  );
}

function authUnavailable() {
  return NextResponse.json(
    { ok: false, error: "auth_unavailable" },
    { status: 503 },
  );
}

function roleSatisfied(required: DaaAdminRole, rolesRaw: unknown): boolean {
  const roles = Array.isArray(rolesRaw) ? (rolesRaw as unknown[]) : [];
  const hasViewer = roles.includes("viewer");
  const hasEditor = roles.includes("editor");
  if (required === "viewer") return hasViewer || hasEditor;
  return hasEditor;
}

/**
 * DAA admin auth for /api/daa/* routes:
 * - Cookie-backed account sessions only
 * - Roles are derived from the Postgres-backed auth account/session
 */
async function requireDaaAdminRole(req: Request, role: DaaAdminRole): Promise<NextResponse | null> {
  let ctx: Awaited<ReturnType<typeof getDaaAuthContextFromRequest>>;
  try {
    ctx = await getDaaAuthContextFromRequest(req, { touch: false });
  } catch {
    return authUnavailable();
  }
  if (!ctx) return unauthorized();
  if (!roleSatisfied(role, ctx.account.roles)) return unauthorized();
  await enterDaaAccountScopeForAuthAccount(ctx.account.accountId);
  return null;
}

export async function requireDaaAdminViewerAuth(req: Request): Promise<NextResponse | null> {
  return requireDaaAdminRole(req, "viewer");
}

export async function requireDaaAdminEditorAuth(req: Request): Promise<NextResponse | null> {
  return requireDaaAdminRole(req, "editor");
}
