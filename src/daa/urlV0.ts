const DUMMY_ORIGIN_V0 = "https://daa.local";
const DEFAULT_DASHBOARD_RETURN_TO_V0 = "/daa/dashboard";

/**
 * Normalize a potentially-untrusted returnTo into a safe, canonical DAA dashboard path.
 *
 * - Only allow relative `/daa*` paths (avoid open redirects).
 * - 仅允许 DAA 资产首页体系路径，其他路径回落到默认首页入口。
 */
export function normalizeDaaReturnToV0(raw: unknown): string {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return DEFAULT_DASHBOARD_RETURN_TO_V0;
  if (!v.startsWith("/")) return DEFAULT_DASHBOARD_RETURN_TO_V0;
  if (v.startsWith("//")) return DEFAULT_DASHBOARD_RETURN_TO_V0;

  try {
    // Use a dummy origin so URL can parse relative paths in Node + browsers.
    const u = new URL(v, DUMMY_ORIGIN_V0);

    // Keep post-login redirects inside the DAA surface.
    if (!u.pathname.startsWith("/daa")) return DEFAULT_DASHBOARD_RETURN_TO_V0;

    // Avoid redirect loops back into login.
    if (u.pathname === "/daa/login" || u.pathname.startsWith("/daa/login/")) {
      return DEFAULT_DASHBOARD_RETURN_TO_V0;
    }

    if (u.pathname === "/daa" || u.pathname === "/daa/") {
      return `${DEFAULT_DASHBOARD_RETURN_TO_V0}${u.hash || ""}`;
    }

    // Canonicalize `/daa/dashboard` (and tolerate `/daa/dashboard/`).
    if (u.pathname === "/daa/dashboard" || u.pathname === "/daa/dashboard/") {
      u.searchParams.delete("tab");
      const qs = u.searchParams.toString();
      return `/daa/dashboard${qs ? `?${qs}` : ""}${u.hash || ""}`;
    }

    // Allow deep links inside the authenticated dashboard shell.
    if (u.pathname.startsWith("/daa/dashboard/")) {
      return `${u.pathname}${u.search}${u.hash}`;
    }
  } catch {
    // Ignore parse errors; fall back to dashboard.
  }

  return DEFAULT_DASHBOARD_RETURN_TO_V0;
}

/**
 * Append/overwrite a `notice` query param for client-side redirects.
 *
 * Input is expected to be a relative path (e.g. "/daa/dashboard").
 * Returns a relative path (pathname + search + hash).
 */
export function appendNoticeParamV0(path: string, notice: string): string {
  const p = String(path || "").trim();
  const n = String(notice || "").trim();
  if (!p) return DEFAULT_DASHBOARD_RETURN_TO_V0;

  // Use a dummy origin so URL can parse relative paths in Node + browsers.
  const u = new URL(p, DUMMY_ORIGIN_V0);
  if (n) u.searchParams.set("notice", n);

  return `${u.pathname}${u.search}${u.hash}`;
}
