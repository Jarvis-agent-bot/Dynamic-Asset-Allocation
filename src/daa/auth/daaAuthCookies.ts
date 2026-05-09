import type { NextResponse } from "next/server";

const DAA_AUTH_SESSION_COOKIE = "daa_auth_session";
export const DAA_AUTH_SESSION_TTL_DAYS = 30;

function isProduction(): boolean {
  return (process.env.NODE_ENV || "").toLowerCase() === "production";
}

function parseCookieHeader(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

export function getDaaAuthSessionTokenFromCookieHeader(header: string | null): string {
  return (parseCookieHeader(header)[DAA_AUTH_SESSION_COOKIE] || "").trim();
}

export function hasDaaAuthSessionCookie(header: string | null): boolean {
  return Boolean(getDaaAuthSessionTokenFromCookieHeader(header));
}

export function setDaaAuthSessionCookie(response: NextResponse, token: string, expiresAt: string): void {
  const expires = new Date(expiresAt);
  response.cookies.set({
    name: DAA_AUTH_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    expires: Number.isFinite(expires.getTime()) ? expires : undefined,
    maxAge: DAA_AUTH_SESSION_TTL_DAYS * 24 * 60 * 60,
  });
}

export function clearDaaAuthSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: DAA_AUTH_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  });
}
