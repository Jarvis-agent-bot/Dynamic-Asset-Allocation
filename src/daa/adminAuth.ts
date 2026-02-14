import { NextResponse } from "next/server";

export type DaaAdminRole = "viewer" | "editor";

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

function requiredEnvFor(role: DaaAdminRole): string {
  // Keep it explicit to help deployment debugging.
  if (role === "editor") return "DAA_ADMIN_EDITOR_TOKEN (or legacy DAA_ADMIN_TOKEN)";
  return "DAA_ADMIN_VIEWER_TOKEN (or DAA_ADMIN_EDITOR_TOKEN, or legacy DAA_ADMIN_TOKEN)";
}

/**
 * Bearer auth for DAA admin-only endpoints, with viewer/editor roles.
 *
 * Behavior:
 * - If no relevant token is configured: allow in dev/test; return 500 in production.
 * - If configured: require `Authorization: Bearer <token>`.
 *
 * Role rules:
 * - viewer endpoints accept: viewer token OR editor token OR legacy token.
 * - editor endpoints accept: editor token OR legacy token.
 */
export function requireDaaAdminRole(req: Request, role: DaaAdminRole): NextResponse | null {
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
  return null;
}

export function requireDaaAdminViewerAuth(req: Request): NextResponse | null {
  return requireDaaAdminRole(req, "viewer");
}

export function requireDaaAdminEditorAuth(req: Request): NextResponse | null {
  return requireDaaAdminRole(req, "editor");
}

// Back-compat alias: historically all admin endpoints were effectively editor-level.
export function requireDaaAdminAuth(req: Request): NextResponse | null {
  return requireDaaAdminEditorAuth(req);
}
