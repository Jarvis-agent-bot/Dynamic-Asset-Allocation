import { getDaaAuthSessionTokenFromCookieHeader } from "./daaAuthCookies";
import { getDaaAuthAccountBySessionToken, type DaaAuthAccount, type DaaAuthSession } from "./daaAuthStore";

export function getClientIpFromRequest(req: Request): string {
  const xff = (req.headers.get("x-forwarded-for") || "").trim();
  if (xff) return xff.split(",")[0]!.trim();
  return "";
}

export function getUserAgentFromRequest(req: Request): string {
  return (req.headers.get("user-agent") || "").trim();
}

export async function getDaaAuthContextFromRequest(
  req: Request,
  opts: { touch?: boolean } = {},
): Promise<{
  token: string;
  account: DaaAuthAccount;
  session: DaaAuthSession;
} | null> {
  const token = getDaaAuthSessionTokenFromCookieHeader(req.headers.get("cookie"));
  if (!token) return null;

  const found = await getDaaAuthAccountBySessionToken({
    token,
    touch: opts.touch,
  });
  if (!found) return null;

  return { token, account: found.account, session: found.session };
}
