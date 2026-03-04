import { NextResponse } from "next/server";

import { getDaaAuthContextFromRequestV0 } from "./auth/daaAuthRequestV0";

export type DaaAdminRole = "viewer" | "editor";

export type DaaAdminTokenKindV0 = "viewer" | "editor" | "unknown" | "none";

function normalizeToken(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function getAdminTokens() {
  const viewer = normalizeToken(process.env.DAA_ADMIN_VIEWER_TOKEN);
  const editor = normalizeToken(process.env.DAA_ADMIN_EDITOR_TOKEN);
  return { viewer, editor };
}

export function getDaaAdminTokensConfiguredV0() {
  const { viewer, editor } = getAdminTokens();
  return { viewer: Boolean(viewer), editor: Boolean(editor) };
}

export function inferDaaAdminTokenKindV0(providedToken: string | null | undefined): DaaAdminTokenKindV0 {
  const t = normalizeToken(providedToken);
  if (!t) return "none";

  const { viewer, editor } = getAdminTokens();
  if (editor && t === editor) return "editor";
  if (viewer && t === viewer) return "viewer";
  return "unknown";
}

export function inferDaaAdminRoleForTokenV0(providedToken: string | null | undefined): DaaAdminRole | null {
  const kind = inferDaaAdminTokenKindV0(providedToken);
  if (kind === "viewer") return "viewer";
  if (kind === "editor") return "editor";
  return null;
}

function parseBearer(req: Request): string {
  const auth = normalizeToken(req.headers.get("authorization"));
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return normalizeToken(m ? m[1] : "");
}

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "unauthorized" },
    { status: 401, headers: { "www-authenticate": "Bearer" } },
  );
}

export type DaaAdminActorUserIdV0 = "viewer-token" | "editor-token" | "unknown-token";

export function inferDaaAdminActorUserIdV0(providedToken: string | null | undefined): DaaAdminActorUserIdV0 {
  const t = normalizeToken(providedToken);
  if (!t) return "unknown-token";

  const { viewer, editor } = getAdminTokens();
  if (viewer && t === viewer) return "viewer-token";
  if (editor && t === editor) return "editor-token";
  return "unknown-token";
}

export function getDaaAdminActorUserIdFromRequestV0(req: Request): DaaAdminActorUserIdV0 {
  return inferDaaAdminActorUserIdV0(parseBearer(req));
}

// Session-based actor id; used by write endpoints so audit logs can attribute actions.
export async function getDaaAdminActorUserIdFromRequestV1(req: Request): Promise<string> {
  const ctx = await getDaaAuthContextFromRequestV0(req);
  if (ctx?.account?.username) return `auth:${ctx.account.username}`;
  if (ctx?.account?.accountId) return `auth:${ctx.account.accountId}`;
  return getDaaAdminActorUserIdFromRequestV0(req);
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
export async function requireDaaAdminRole(req: Request, role: DaaAdminRole): Promise<NextResponse | null> {
  const ctx = await getDaaAuthContextFromRequestV0(req);
  if (!ctx) return unauthorized();
  if (!roleSatisfied(role, ctx.account.roles)) return unauthorized();
  return null;
}

export async function requireDaaAdminViewerAuth(req: Request): Promise<NextResponse | null> {
  return requireDaaAdminRole(req, "viewer");
}

export async function requireDaaAdminEditorAuth(req: Request): Promise<NextResponse | null> {
  return requireDaaAdminRole(req, "editor");
}
