import { NextResponse } from "next/server";

import { getDaaAuthContextFromRequestV0 } from "./auth/daaAuthRequestV0";
import { getDaaAdminUserStatusV0 } from "./sqlite/daaAdminUserStatusStoreV0";

export type DaaAdminRole = "viewer" | "editor";

export type DaaAdminTokenKindV0 = "legacy" | "viewer" | "editor" | "unknown" | "none";

export function getDaaAdminTokensConfiguredV0() {
  const legacy = normalizeToken(process.env.DAA_ADMIN_TOKEN);
  const viewer = normalizeToken(process.env.DAA_ADMIN_VIEWER_TOKEN);
  const editor = normalizeToken(process.env.DAA_ADMIN_EDITOR_TOKEN);

  return { legacy: Boolean(legacy), viewer: Boolean(viewer), editor: Boolean(editor) };
}

export function inferDaaAdminTokenKindV0(providedToken: string | null | undefined): DaaAdminTokenKindV0 {
  const t = normalizeToken(providedToken);
  if (!t) return "none";

  const { legacy, viewer, editor } = getAdminTokens();
  if (legacy && t === legacy) return "legacy";
  if (editor && t === editor) return "editor";
  if (viewer && t === viewer) return "viewer";
  return "unknown";
}

export function inferDaaAdminRoleForTokenV0(providedToken: string | null | undefined): DaaAdminRole | null {
  const kind = inferDaaAdminTokenKindV0(providedToken);
  if (kind === "viewer") return "viewer";
  if (kind === "editor" || kind === "legacy") return "editor";
  return null;
}

function normalizeToken(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function unauthorized() {
  // Explicit WWW-Authenticate makes curl/browser errors clearer.
  return NextResponse.json(
    { ok: false, error: "unauthorized" },
    { status: 401, headers: { "www-authenticate": "Bearer" } },
  );
}

function misconfigured(message: string) {
  // Avoid silently running without auth in prod.
  return NextResponse.json({ ok: false, error: message }, { status: 500 });
}

function uniqNonEmpty(xs: string[]): string[] {
  const out: string[] = [];
  for (const x of xs) {
    const t = x.trim();
    if (!t) continue;
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

function getAdminTokens() {
  // v0 legacy token; historically used for all admin endpoints.
  const legacy = normalizeToken(process.env.DAA_ADMIN_TOKEN);

  // Role-based tokens:
  // - viewer: read-only access
  // - editor: write access (and also implicitly has viewer access)
  const viewer = normalizeToken(process.env.DAA_ADMIN_VIEWER_TOKEN);
  const editor = normalizeToken(process.env.DAA_ADMIN_EDITOR_TOKEN);

  return { legacy, viewer, editor };
}

function parseBearer(req: Request): string {
  const auth = normalizeToken(req.headers.get("authorization"));
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return normalizeToken(m ? m[1] : "");
}

export type DaaAdminActorUserIdV0 = "viewer-token" | "editor-token" | "legacy-token" | "unknown-token";

export function inferDaaAdminActorUserIdV0(providedToken: string | null | undefined): DaaAdminActorUserIdV0 {
  const t = normalizeToken(providedToken);
  if (!t) return "unknown-token";

  const { legacy, viewer, editor } = getAdminTokens();
  if (viewer && t === viewer) return "viewer-token";
  if (editor && t === editor) return "editor-token";
  if (legacy && t === legacy) return "legacy-token";
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

function requiredEnvFor(role: DaaAdminRole): string {
  // Keep it explicit to help deployment debugging.
  if (role === "editor") return "DAA_ADMIN_EDITOR_TOKEN (or legacy DAA_ADMIN_TOKEN)";
  return "DAA_ADMIN_VIEWER_TOKEN (or DAA_ADMIN_EDITOR_TOKEN, or legacy DAA_ADMIN_TOKEN)";
}

async function isTokenKindActiveV0(kind: DaaAdminTokenKindV0): Promise<boolean> {
  // Only the configured tokens can be activated/deactivated.
  if (kind === "viewer") {
    try {
      return (await getDaaAdminUserStatusV0("viewer-token")) === "active";
    } catch (e) {
      console.warn("[daa_adminAuth] failed to read viewer-token status; defaulting to active", e);
      return true;
    }
  }
  if (kind === "editor") {
    try {
      return (await getDaaAdminUserStatusV0("editor-token")) === "active";
    } catch (e) {
      console.warn("[daa_adminAuth] failed to read editor-token status; defaulting to active", e);
      return true;
    }
  }
  if (kind === "legacy") {
    try {
      return (await getDaaAdminUserStatusV0("legacy-token")) === "active";
    } catch (e) {
      console.warn("[daa_adminAuth] failed to read legacy-token status; defaulting to active", e);
      return true;
    }
  }

  // unknown/none: not active.
  return false;
}

function roleSatisfied(required: DaaAdminRole, rolesRaw: unknown): boolean {
  const roles = Array.isArray(rolesRaw) ? (rolesRaw as unknown[]) : [];
  const hasViewer = roles.includes("viewer");
  const hasEditor = roles.includes("editor");
  if (required === "viewer") return hasViewer || hasEditor;
  return hasEditor;
}

/**
 * DAA admin auth, supporting:
 * - Cookie-backed account sessions (preferred for dashboard UX)
 * - Legacy bearer tokens (back-compat for scripts/curl)
 */
export async function requireDaaAdminRole(req: Request, role: DaaAdminRole): Promise<NextResponse | null> {
  // 1) Session cookie auth (preferred).
  const ctx = await getDaaAuthContextFromRequestV0(req);
  if (ctx) {
    if (!roleSatisfied(role, ctx.account.roles)) return unauthorized();
    return null;
  }

  // 2) Legacy bearer-token auth (back-compat).
  const { legacy, viewer, editor } = getAdminTokens();

  const viewerAllowed = uniqNonEmpty([viewer, editor, legacy]);
  const editorAllowed = uniqNonEmpty([editor, legacy]);
  const allowed = role === "editor" ? editorAllowed : viewerAllowed;

  if (allowed.length === 0) {
    if (process.env.NODE_ENV === "production") {
      return misconfigured(`server misconfigured: missing ${requiredEnvFor(role)}`);
    }
    return null;
  }

  const provided = parseBearer(req);
  if (!provided) return unauthorized();

  if (!allowed.includes(provided)) return unauthorized();

  const kind = inferDaaAdminTokenKindV0(provided);
  if (!(await isTokenKindActiveV0(kind))) return unauthorized();

  return null;
}

export async function requireDaaAdminViewerAuth(req: Request): Promise<NextResponse | null> {
  return requireDaaAdminRole(req, "viewer");
}

export async function requireDaaAdminEditorAuth(req: Request): Promise<NextResponse | null> {
  return requireDaaAdminRole(req, "editor");
}

// Back-compat alias: historically all admin endpoints were effectively editor-level.
export async function requireDaaAdminAuth(req: Request): Promise<NextResponse | null> {
  return requireDaaAdminEditorAuth(req);
}
