import { NextResponse } from "next/server";

import {
  createDaaAuthEmailLoginTokenV0,
  findLastDaaAuthEmailLoginTokenCreatedAtV0,
} from "@/src/daa/auth/daaAuthEmailLoginStoreV0";
import { getClientIpFromRequestV0, getUserAgentFromRequestV0 } from "@/src/daa/auth/daaAuthRequestV0";
import { appendDaaAuthAuditEventV0, getDaaAuthAccountByUsernameV0 } from "@/src/daa/auth/daaAuthStoreV0";
import { sendEmailV0 } from "@/src/daa/email/sendEmailV0";
import { normalizeDaaReturnToV0 } from "@/src/daa/urlV0";

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

export async function postEmailLoginLinkV0(req: Request, opts: { mode: "request" | "resend" }) {
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
  const { token: code } = await createDaaAuthEmailLoginTokenV0({ accountId: account.accountId, ttlMinutes, userAgent: ua, ip });

  await appendDaaAuthAuditEventV0({
    kind: opts.mode === "resend" ? "auth.email_otp.resend_requested" : "auth.email_otp.requested",
    actorUserId: account.accountId,
    accountId: account.accountId,
    payload: {
      ttlMinutes,
      returnTo,
      ip,
      userAgent: ua,
    },
  }).catch(() => null);

  // Best-effort email delivery; failure should not block UI.
  await sendEmailV0({
    to: account.username,
    subject: "Your DAA verification code",
    text:
      `Your one-time DAA verification code is:\n\n${code}\n\n` +
      `This code expires in ${ttlMinutes} minutes and can only be used once.\n\n` +
      `If you did not request this, you can ignore this email.`,
  }).catch(() => null);

  const debug = process.env.DAA_EMAIL_LOGIN_DEBUG === "1";
  if (debug) {
    return NextResponse.json({ ok: true, cooldownSeconds, debugCode: code });
  }

  return NextResponse.json({ ok: true, cooldownSeconds });
}
