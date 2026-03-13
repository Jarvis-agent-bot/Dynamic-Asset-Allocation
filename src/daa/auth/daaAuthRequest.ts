import { DAA_AUTH_SESSION_COOKIE_ } from "./daaAuthConstants";
import type { DaaAuthAccount, DaaAuthSession } from "./daaAuthStore";
import { getDaaAuthAccountBySessionToken } from "./daaAuthStore";

function normalizeHeaderValue(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function parseCookieHeader(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = typeof header === "string" ? header : "";

  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;

    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) continue;

    // Best-effort decode; ignore errors.
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }

  return out;
}

export function getDaaAuthSessionTokenFromRequest(req: Request): string {
  const header = normalizeHeaderValue(req.headers.get("cookie"));
  if (!header) return "";
  const cookies = parseCookieHeader(header);
  return normalizeHeaderValue(cookies[DAA_AUTH_SESSION_COOKIE_]);
}

export function getClientIpFromRequest(req: Request): string {
  // Standard reverse-proxy header; can be a CSV list.
  const xff = normalizeHeaderValue(req.headers.get("x-forwarded-for"));
  if (xff) return xff.split(",")[0]!.trim();
  return "";
}

export function getUserAgentFromRequest(req: Request): string {
  return normalizeHeaderValue(req.headers.get("user-agent"));
}

export async function getDaaAuthContextFromRequest(
  req: Request,
  opts: {
    touch?: boolean;
  } = {},
): Promise<
  | {
      token: string;
      account: DaaAuthAccount;
      session: DaaAuthSession;
    }
  | null
> {
  const token = getDaaAuthSessionTokenFromRequest(req);
  if (!token) return null;

  const found = await getDaaAuthAccountBySessionToken({ token, touch: opts.touch !== false });
  if (!found) return null;

  return { token, account: found.account, session: found.session };
}
