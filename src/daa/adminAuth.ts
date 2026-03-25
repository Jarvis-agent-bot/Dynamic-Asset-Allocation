import { createHash, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { getDaaAuthContextFromRequest } from "./auth/daaAuthRequest";

export type DaaAdminRole = "viewer" | "editor";

export type DaaAdminTokenKind = "viewer" | "editor" | "unknown" | "none";

function normalizeToken(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";

}

/** SHA-256 时序安全比较 — 固定 32 字节，无长度泄露 */
function timingSafeCompare(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

function getAdminTokens() {
  const viewer = normalizeToken(process.env.DAA_ADMIN_VIEWER_TOKEN);
  const editor = normalizeToken(process.env.DAA_ADMIN_EDITOR_TOKEN);
  return { viewer, editor };
}

export function getDaaAdminTokensConfigured() {
  const { viewer, editor } = getAdminTokens();
  return { viewer: Boolean(viewer), editor: Boolean(editor) };
}

export function inferDaaAdminTokenKind(providedToken: string | null | undefined): DaaAdminTokenKind {
  const t = normalizeToken(providedToken);
  if (!t) return "none";

  const { viewer, editor } = getAdminTokens();
  if (editor && timingSafeCompare(t, editor)) return "editor";
  if (viewer && timingSafeCompare(t, viewer)) return "viewer";
  return "unknown";
}

export function inferDaaAdminRoleForToken(providedToken: string | null | undefined): DaaAdminRole | null {
  const kind = inferDaaAdminTokenKind(providedToken);
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

export type DaaAdminActorUserId = "viewer-token" | "editor-token" | "unknown-token";

export function inferDaaAdminActorUserId(providedToken: string | null | undefined): DaaAdminActorUserId {
  const t = normalizeToken(providedToken);
  if (!t) return "unknown-token";

  const { viewer, editor } = getAdminTokens();
  if (viewer && t === viewer) return "viewer-token";
  if (editor && t === editor) return "editor-token";
  return "unknown-token";
}

export function getDaaAdminActorUserIdFromRequestSync(req: Request): DaaAdminActorUserId {
  return inferDaaAdminActorUserId(parseBearer(req));
}

// Session-based actor id; used by write endpoints so audit logs can attribute actions.
export async function getDaaAdminActorUserIdFromRequest(req: Request): Promise<string> {
  const ctx = await getDaaAuthContextFromRequest(req);
  if (ctx?.account?.username) return `auth:${ctx.account.username}`;
  if (ctx?.account?.accountId) return `auth:${ctx.account.accountId}`;
  return getDaaAdminActorUserIdFromRequestSync(req);
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
  const ctx = await getDaaAuthContextFromRequest(req);
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
