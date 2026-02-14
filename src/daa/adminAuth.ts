import { NextResponse } from "next/server";

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

/**
 * Bearer auth for DAA admin-only endpoints.
 *
 * Behavior:
 * - If `DAA_ADMIN_TOKEN` is unset/blank: allow in dev/test; return 500 in production.
 * - If set: require `Authorization: Bearer <token>`.
 */
export function requireDaaAdminAuth(req: Request): NextResponse | null {
  const token = normalizeToken(process.env.DAA_ADMIN_TOKEN);

  if (!token) {
    // Avoid silently running without auth in prod.
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { ok: false, error: "server misconfigured: missing DAA_ADMIN_TOKEN" },
        { status: 500 },
      );
    }
    return null;
  }

  const auth = normalizeToken(req.headers.get("authorization"));
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const provided = normalizeToken(m ? m[1] : "");

  if (!provided) return unauthorized();
  if (provided !== token) return unauthorized();

  return null;
}
