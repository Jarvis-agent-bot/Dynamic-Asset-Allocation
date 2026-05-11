import { logSwallowed } from "@/src/daa/utils/logSwallowed";

const DUMMY_ORIGIN_ = "https://daa.local";
const DEFAULT_DASHBOARD_RETURN_TO_ = "/daa/dashboard";

/**
 * Normalize a potentially-untrusted returnTo into a safe, canonical DAA dashboard path.
 *
 * - Only allow relative `/daa*` paths (avoid open redirects).
 * - 仅允许 DAA 资产首页体系路径，其他路径回落到默认首页入口。
 */
export function normalizeDaaReturnTo(raw: unknown): string {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return DEFAULT_DASHBOARD_RETURN_TO_;
  if (!v.startsWith("/")) return DEFAULT_DASHBOARD_RETURN_TO_;
  if (v.startsWith("//")) return DEFAULT_DASHBOARD_RETURN_TO_;

  try {
    // Use a dummy origin so URL can parse relative paths in Node + browsers.
    const u = new URL(v, DUMMY_ORIGIN_);

    // Keep post-login redirects inside the DAA surface.
    if (!u.pathname.startsWith("/daa")) return DEFAULT_DASHBOARD_RETURN_TO_;

    // Avoid redirect loops back into login.
    if (u.pathname === "/daa/login" || u.pathname.startsWith("/daa/login/")) {
      return DEFAULT_DASHBOARD_RETURN_TO_;
    }

    if (u.pathname === "/daa" || u.pathname === "/daa/") {
      return `${DEFAULT_DASHBOARD_RETURN_TO_}${u.hash || ""}`;
    }

    // Canonicalize `/daa/dashboard` (and tolerate `/daa/dashboard/`).
    if (u.pathname === "/daa/dashboard" || u.pathname === "/daa/dashboard/") {
      return `/daa/dashboard${u.hash || ""}`;
    }

    // 旧 workbench 已不是实际页面，统一落到当前真实路由。
    if (u.pathname === "/daa/dashboard/workbench" || u.pathname.startsWith("/daa/dashboard/workbench/")) {
      const tab = String(u.searchParams.get("tab") || "").trim().toLowerCase();
      if (tab === "rebalance") return `/daa/dashboard/rebalance${u.hash || ""}`;
      if (tab === "watchlist" || tab === "positions" || tab === "analysis") {
        return `/daa/dashboard/portfolio?tab=${tab}${u.hash || ""}`;
      }
      return `/daa/dashboard/portfolio${u.hash || ""}`;
    }

    // Allow deep links inside the authenticated dashboard shell.
    if (u.pathname.startsWith("/daa/dashboard/")) {
      return `${u.pathname}${u.search}${u.hash}`;
    }
  } catch (err) {
    logSwallowed("url.normalizeDaaReturnTo", err);
  }

  return DEFAULT_DASHBOARD_RETURN_TO_;
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
  if (!p) return DEFAULT_DASHBOARD_RETURN_TO_;

  // Use a dummy origin so URL can parse relative paths in Node + browsers.
  const u = new URL(p, DUMMY_ORIGIN_);
  if (n) u.searchParams.set("notice", n);

  return `${u.pathname}${u.search}${u.hash}`;
}
