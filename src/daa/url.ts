import { logSwallowed } from "@/src/daa/utils/logSwallowed";

const DAA_URL_DUMMY_ORIGIN = "https://daa.local";
const DEFAULT_WORKBENCH_RETURN_TO = "/daa/dashboard";
const WORKBENCH_ROUTE_PREFIXES = [
  "/daa/dashboard/portfolio",
  "/daa/dashboard/rebalance",
  "/daa/dashboard/settings",
  "/daa/dashboard/strategy-lab",
  "/daa/dashboard/today",
  "/daa/dashboard/trades",
] as const;

function isAllowedWorkbenchPath(pathname: string): boolean {
  return WORKBENCH_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Normalize a potentially-untrusted returnTo into a safe, canonical DAA workbench route path.
 *
 * - Only allow relative `/daa*` paths (avoid open redirects).
 * - 仅允许 DAA 资产首页体系路径，其他路径回落到默认首页入口。
 */
export function normalizeDaaReturnTo(raw: unknown): string {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return DEFAULT_WORKBENCH_RETURN_TO;
  if (!v.startsWith("/")) return DEFAULT_WORKBENCH_RETURN_TO;
  if (v.startsWith("//")) return DEFAULT_WORKBENCH_RETURN_TO;

  try {
    // Use a dummy origin so URL can parse relative paths in Node + browsers.
    const u = new URL(v, DAA_URL_DUMMY_ORIGIN);

    // Keep post-login redirects inside the DAA surface.
    if (!u.pathname.startsWith("/daa")) return DEFAULT_WORKBENCH_RETURN_TO;

    // Avoid redirect loops back into login.
    if (u.pathname === "/daa/login" || u.pathname.startsWith("/daa/login/")) {
      return DEFAULT_WORKBENCH_RETURN_TO;
    }

    if (u.pathname === "/daa" || u.pathname === "/daa/") {
      return `${DEFAULT_WORKBENCH_RETURN_TO}${u.hash || ""}`;
    }

    // Canonicalize `/daa/dashboard` (and tolerate `/daa/dashboard/`).
    if (u.pathname === "/daa/dashboard" || u.pathname === "/daa/dashboard/") {
      return `/daa/dashboard${u.hash || ""}`;
    }

    // Allow known deep links inside the authenticated workbench shell.
    if (isAllowedWorkbenchPath(u.pathname)) {
      return `${u.pathname}${u.search}${u.hash}`;
    }
  } catch (err) {
    logSwallowed("url.normalizeDaaReturnTo", err);
  }

  return DEFAULT_WORKBENCH_RETURN_TO;
}

/**
 * Append/overwrite a `notice` query param for client-side redirects.
 *
 * Input is expected to be a relative path (e.g. "/daa/dashboard").
 * Returns a relative path (pathname + search + hash).
 */
export function appendNoticeParam(path: string, notice: string): string {
  const p = String(path || "").trim();
  const n = String(notice || "").trim();
  if (!p) return DEFAULT_WORKBENCH_RETURN_TO;

  // Use a dummy origin so URL can parse relative paths in Node + browsers.
  const u = new URL(p, DAA_URL_DUMMY_ORIGIN);
  if (n) u.searchParams.set("notice", n);

  return `${u.pathname}${u.search}${u.hash}`;
}
