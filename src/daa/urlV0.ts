const DUMMY_ORIGIN_V0 = "https://daa.local";

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
