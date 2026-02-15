import { getDaaDashboardCompatRedirect } from "./dashboardCompat";

function parseSearchParams(search: string): URLSearchParams {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
}

function isLoginPath(pathname: string): boolean {
  return pathname === "/daa/login" || pathname === "/daa/login/" || pathname.startsWith("/daa/login/");
}

function canonicalizeDashboardPath(pathname: string, search: string): string | null {
  if (pathname !== "/daa/dashboard" && pathname !== "/daa/dashboard/") return null;
  const qs = parseSearchParams(search).toString();
  return `/daa/dashboard${qs ? `?${qs}` : ""}`;
}

/**
 * If a DAA auth session exists, hitting `/daa/login` should bounce users back into the canonical entry:
 * `/daa/dashboard` (optionally preserving a safe `returnTo` deep-link).
 */
export function getDaaLoginAuthedRedirect(args: {
  pathname: string;
  search: string;
  hasSession: boolean;
}): string | null {
  const { pathname, search, hasSession } = args;
  if (!hasSession) return null;
  if (!isLoginPath(pathname)) return null;

  const params = parseSearchParams(search);
  const returnTo = String(params.get("returnTo") || "").trim();

  // Avoid open redirects: only allow same-origin, DAA-scoped paths.
  if (returnTo.startsWith("/daa") && !returnTo.startsWith("/daa/login")) {
    try {
      const u = new URL(returnTo, "http://local");
      const compat = getDaaDashboardCompatRedirect(u.pathname, u.search);
      if (compat) return compat;

      const canonical = canonicalizeDashboardPath(u.pathname, u.search);
      if (canonical) return canonical;
    } catch {
      // Ignore parse errors; fall back to dashboard.
    }
  }

  return "/daa/dashboard";
}
