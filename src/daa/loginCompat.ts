import { normalizeDaaReturnToV0 } from "./urlV0";

function parseSearchParams(search: string): URLSearchParams {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
}

function isLoginPath(pathname: string): boolean {
  return pathname === "/daa/login" || pathname === "/daa/login/" || pathname.startsWith("/daa/login/");
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
  const returnTo = params.get("returnTo");
  return normalizeDaaReturnToV0(returnTo);
}
