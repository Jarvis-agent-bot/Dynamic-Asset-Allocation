import { getDaaDashboardCompatRedirect } from "./dashboardCompat";

const DUMMY_ORIGIN_V0 = "https://daa.local";

/**
 * Normalize a potentially-untrusted returnTo into a safe, canonical DAA dashboard path.
 *
 * - Only allow relative `/daa*` paths (avoid open redirects).
 * - Map legacy `/daa*` routes into `/daa/dashboard` (single-source-of-truth).
 */
export function normalizeDaaReturnToV0(raw: unknown): string {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return "/daa/dashboard";
  if (!v.startsWith("/")) return "/daa/dashboard";
  if (v.startsWith("//")) return "/daa/dashboard";

  // Keep post-login redirects inside the DAA surface.
  if (!v.startsWith("/daa")) return "/daa/dashboard";

  // Avoid redirect loops back into login.
  if (v.startsWith("/daa/login")) return "/daa/dashboard";

  try {
    // Use a dummy origin so URL can parse relative paths in Node + browsers.
    const u = new URL(v, DUMMY_ORIGIN_V0);

    const compat = getDaaDashboardCompatRedirect(u.pathname, u.search);
    if (compat) return `${compat}${u.hash || ""}`;

    // Canonicalize `/daa/dashboard/settings` (and tolerate `/daa/dashboard/settings/`).
    if (u.pathname === "/daa/dashboard/settings" || u.pathname === "/daa/dashboard/settings/") {
      const qs = u.searchParams.toString();
      return `/daa/dashboard/settings${qs ? `?${qs}` : ""}${u.hash || ""}`;
    }

    // Canonicalize `/daa/dashboard` (and tolerate `/daa/dashboard/`).
    if (u.pathname === "/daa/dashboard" || u.pathname === "/daa/dashboard/") {
      const qs = u.searchParams.toString();
      return `/daa/dashboard${qs ? `?${qs}` : ""}${u.hash || ""}`;
    }
  } catch {
    // Ignore parse errors; fall back to dashboard.
  }

  return "/daa/dashboard";
}

/**
 * Append/overwrite a `notice` query param for client-side redirects.
 *
 * Input is expected to be a relative path (e.g. "/daa/dashboard?tab=wizard").
 * Returns a relative path (pathname + search + hash).
 */
export function appendNoticeParamV0(path: string, notice: string): string {
  const p = String(path || "").trim();
  const n = String(notice || "").trim();
  if (!p) return "/daa/dashboard";

  // Use a dummy origin so URL can parse relative paths in Node + browsers.
  const u = new URL(p, DUMMY_ORIGIN_V0);
  if (n) u.searchParams.set("notice", n);

  return `${u.pathname}${u.search}${u.hash}`;
}
