import { DAA_AUTH_SESSION_COOKIE_V0 } from "./daaAuthConstantsV0";
import type { DaaAuthAccountV0, DaaAuthSessionV0 } from "./daaAuthStoreV0";
import { getDaaAuthAccountBySessionTokenV0 } from "./daaAuthStoreV0";

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

export function getDaaAuthSessionTokenFromRequestV0(req: Request): string {
  const header = normalizeHeaderValue(req.headers.get("cookie"));
  if (!header) return "";
  const cookies = parseCookieHeader(header);
  return normalizeHeaderValue(cookies[DAA_AUTH_SESSION_COOKIE_V0]);
}

export function getClientIpFromRequestV0(req: Request): string {
  // Standard reverse-proxy header; can be a CSV list.
  const xff = normalizeHeaderValue(req.headers.get("x-forwarded-for"));
  if (xff) return xff.split(",")[0]!.trim();
  return "";
}

export function getUserAgentFromRequestV0(req: Request): string {
  return normalizeHeaderValue(req.headers.get("user-agent"));
}

export async function getDaaAuthContextFromRequestV0(req: Request): Promise<
  | {
      token: string;
      account: DaaAuthAccountV0;
      session: DaaAuthSessionV0;
    }
  | null
> {
  const token = getDaaAuthSessionTokenFromRequestV0(req);
  if (!token) return null;

  const found = await getDaaAuthAccountBySessionTokenV0({ token, touch: true });
  if (!found) return null;

  return { token, account: found.account, session: found.session };
}
