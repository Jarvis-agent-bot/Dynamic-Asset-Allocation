import { NextResponse } from "next/server";

import {
  createDaaAuthEmailLoginTokenV0,
  findLastDaaAuthEmailLoginTokenCreatedAtV0,
  revokeDaaAuthEmailLoginTokenV0,
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

function isResendChannelReadyV0(): boolean {
  const key = typeof process.env.RESEND_API_KEY === "string" ? process.env.RESEND_API_KEY.trim() : "";
  const from = normalizeEmailLoose(process.env.DAA_AUTH_EMAIL_FROM);
  return Boolean(key && from);
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
  const resendChannelReady = isResendChannelReadyV0();

  // Always return ok to avoid leaking whether an account exists.
  if (!email) {
    return NextResponse.json({ ok: true, cooldownSeconds, resendChannelReady });
  }

  const account = await getDaaAuthAccountByUsernameV0(email).catch(() => null);
  if (!account || account.status !== "active") {
    return NextResponse.json({ ok: true, cooldownSeconds, resendChannelReady });
  }

  // Best-effort cooldown per account.
  try {
    const last = await findLastDaaAuthEmailLoginTokenCreatedAtV0({ accountId: account.accountId });
    if (last) {
      const lastMs = Date.parse(last);
      const nowMs = Date.now();
      if (Number.isFinite(lastMs) && nowMs - lastMs < cooldownSeconds * 1000) {
        const retryAfterSeconds = Math.max(1, Math.ceil((cooldownSeconds * 1000 - (nowMs - lastMs)) / 1000));
        return NextResponse.json({ ok: true, cooldownSeconds, resendChannelReady, cooldownActive: true, retryAfterSeconds });
      }
    }
  } catch {
    // Ignore and continue.
  }

  const ua = getUserAgentFromRequestV0(req) || null;
  const ip = getClientIpFromRequestV0(req) || null;

  const ttlMinutes = 15;
  const { token: code, row: tokenRow } = await createDaaAuthEmailLoginTokenV0({ accountId: account.accountId, ttlMinutes, userAgent: ua, ip });

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

  // Best-effort email delivery via Resend; failure should not block UI.
  const delivery = await sendEmailV0({
    to: account.username,
    subject: "Your DAA verification code",
    text:
      `Your one-time DAA verification code is:\n\n${code}\n\n` +
      `This code expires in ${ttlMinutes} minutes and can only be used once.\n\n` +
      `If you did not request this, you can ignore this email.`,
  }).catch((error) => ({ ok: false as const, skipped: false, error: String(error) }));

  // Invalidate token on send failure so a user cannot consume a code that never reached their inbox.
  const tokenRevokedOnDeliveryFailure = delivery.ok
    ? false
    : (await revokeDaaAuthEmailLoginTokenV0({ tokenId: tokenRow.tokenId }).catch(() => ({ ok: false as const }))).ok;

  await appendDaaAuthAuditEventV0({
    kind: opts.mode === "resend" ? "auth.email_otp.resend_sent" : "auth.email_otp.sent",
    actorUserId: account.accountId,
    accountId: account.accountId,
    payload: {
      provider: "resend",
      deliveryOk: delivery.ok,
      providerMessageId: delivery.ok ? delivery.providerMessageId : undefined,
      skipped: delivery.ok ? undefined : Boolean(delivery.skipped),
      error: delivery.ok ? undefined : delivery.error,
      tokenRevokedOnDeliveryFailure: delivery.ok ? undefined : tokenRevokedOnDeliveryFailure,
      ip,
      userAgent: ua,
    },
  }).catch(() => null);

  const debug = process.env.DAA_EMAIL_LOGIN_DEBUG === "1";
  if (debug) {
    return NextResponse.json({ ok: true, cooldownSeconds, resendChannelReady, debugCode: code, delivery });
  }

  return NextResponse.json({ ok: true, cooldownSeconds, resendChannelReady });
}
