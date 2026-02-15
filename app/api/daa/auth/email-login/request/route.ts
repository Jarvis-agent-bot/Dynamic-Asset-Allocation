import { NextResponse } from "next/server";

import {
  createDaaAuthEmailLoginTokenV0,
  findLastDaaAuthEmailLoginTokenCreatedAtV0,
} from "@/src/daa/auth/daaAuthEmailLoginStoreV0";
import { getClientIpFromRequestV0, getUserAgentFromRequestV0 } from "@/src/daa/auth/daaAuthRequestV0";
import { getDaaAuthAccountByUsernameV0 } from "@/src/daa/auth/daaAuthStoreV0";
import { sendEmailV0 } from "@/src/daa/email/sendEmailV0";
import { normalizeDaaReturnToV0 } from "@/src/daa/urlV0";

export const runtime = "nodejs";

function normalizeEmailLoose(raw: unknown): string {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!v) return "";
  if (v.length > 254) return "";
  if (/\s/.test(v)) return "";

  const at = v.indexOf("@");
  if (at <= 0 || at !== v.lastIndexOf("@")) return "";

  const domain = v.slice(at + 1);
  if (!domain || domain.startsWith(".") || domain.endsWith(".")) return "";
  if (!domain.includes(".")) return "";

  return v;
}

// returnTo normalization is shared via src/daa/urlV0.ts

function getOriginFromRequestV0(req: Request): string | null {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  const proto = req.headers.get("x-forwarded-proto") || "https";
  if (!host) return null;
  return `${proto}://${host}`;
}

export async function POST(req: Request) {
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const email = normalizeEmailLoose(body?.email);
  const returnTo = normalizeDaaReturnToV0(body?.returnTo);

  // Cooldown is a practical anti-spam limiter, even if the endpoint is hidden behind the login UI.
  const cooldownSeconds = 30;

  // Always return ok to avoid leaking whether an account exists.
  if (!email) {
    return NextResponse.json({ ok: true, cooldownSeconds });
  }

  const account = await getDaaAuthAccountByUsernameV0(email).catch(() => null);
  if (!account || account.status !== "active") {
    return NextResponse.json({ ok: true, cooldownSeconds });
  }

  // Best-effort cooldown per account.
  try {
    const last = await findLastDaaAuthEmailLoginTokenCreatedAtV0({ accountId: account.accountId });
    if (last) {
      const lastMs = Date.parse(last);
      const nowMs = Date.now();
      if (Number.isFinite(lastMs) && nowMs - lastMs < cooldownSeconds * 1000) {
        return NextResponse.json({ ok: true, cooldownSeconds });
      }
    }
  } catch {
    // Ignore and continue.
  }

  const ua = getUserAgentFromRequestV0(req) || null;
  const ip = getClientIpFromRequestV0(req) || null;

  const ttlMinutes = 15;
  const { token } = await createDaaAuthEmailLoginTokenV0({ accountId: account.accountId, ttlMinutes, userAgent: ua, ip });

  const origin = getOriginFromRequestV0(req) || process.env.DAA_PUBLIC_ORIGIN || null;
  const loginUrl = origin
    ? new URL(`/api/daa/auth/email-login/consume?token=${encodeURIComponent(token)}&returnTo=${encodeURIComponent(returnTo)}`, origin).toString()
    : null;

  if (loginUrl) {
    // Best-effort email delivery; failure should not block UI.
    await sendEmailV0({
      to: account.username,
      subject: "Your DAA sign-in link",
      text: `Use this link to sign in to DAA (expires in ${ttlMinutes} minutes):\n\n${loginUrl}\n\nIf you did not request this, you can ignore this email.`,
    }).catch(() => null);
  }

  const debug = process.env.DAA_EMAIL_LOGIN_DEBUG === "1";
  if (debug && loginUrl) {
    return NextResponse.json({ ok: true, cooldownSeconds, debugLoginUrl: loginUrl });
  }

  return NextResponse.json({ ok: true, cooldownSeconds });
}
