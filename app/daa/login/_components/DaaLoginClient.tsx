"use client";

import Link from "next/link";
import { AlertCircle, Loader2, Mail, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ClipboardEvent } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { formatRateLimitedMessageV0, parseRetryAfterSecondsV0 } from "@/src/daa/auth/uiRateLimitV0";
import { applyEmailPasteNormalizationV0 } from "@/src/daa/emailPasteV0";
import { appendNoticeParamV0, normalizeDaaReturnToV0 } from "@/src/daa/urlV0";

type Props = {
  returnTo: string;
  error?: string;
  notice?: string;
};

type MeResponse =
  | {
      ok: true;
      account: { accountId: string; username: string; roles: string[]; status: string };
      session: { sessionId: string; createdAt: string; expiresAt: string; revokedAt: string | null; lastSeenAt: string | null };
    }
  | { ok: false; error: string };

type SessionModel =
  | { kind: "checking" }
  | { kind: "signedOut" }
  | { kind: "signedIn"; me: Extract<MeResponse, { ok: true }> }
  | { kind: "error"; message: string };

type OtpModel =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; email: string; requestedAtMs: number; cooldownSeconds: number; cooldownActive?: boolean };

const LS_DAA_LAST_EMAIL_LOGIN_EMAIL_V0 = "daa.emailLogin.lastEmail.v0";
const LS_DAA_EMAIL_OTP_SENT_V0 = "daa.emailOtp.sent.v0";

function normalizeEmailLoose(raw: string): string {
  const v = raw.trim().toLowerCase();
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

function normalizeEmailDraftV0(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed.slice(0, 254).toLowerCase();
}

function parseApiError(json: any, fallback: string): string {
  const msg = typeof json?.error === "string" ? json.error.trim() : "";
  if (msg) return msg;
  return fallback;
}

function formatSeconds(s: number): string {
  if (!Number.isFinite(s)) return "0:00";
  const ss = Math.max(0, Math.floor(s));
  const m = Math.floor(ss / 60);
  const r = ss % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function formatClockTimeV0(iso: unknown): string | null {
  const d = typeof iso === "string" ? new Date(iso) : null;
  if (!d || !Number.isFinite(d.getTime())) return null;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function isBrowserOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  const n: any = navigator;
  return typeof n.onLine === "boolean" ? Boolean(n.onLine) : true;
}

function isLikelyFetchNetworkFailure(message: string): boolean {
  const m = (message || "").toLowerCase();
  if (m.includes("failed to fetch")) return true;
  if (m.includes("networkerror")) return true;
  if (m.includes("load failed")) return true;
  if (m.includes("connection") && m.includes("refused")) return true;
  return false;
}

function formatNetworkFailureMessage(e: unknown, action: string): string {
  if (!isBrowserOnline()) {
    return `You appear to be offline. Connect to the internet, then try again to ${action}.`;
  }

  const msg = e instanceof Error ? e.message : String(e);
  if (isLikelyFetchNetworkFailure(msg)) {
    return `Network error: could not reach the server. Please check your connection (Wi-Fi/VPN/captive portal) and try again to ${action}.`;
  }

  return msg || `Something went wrong. Please try again to ${action}.`;
}

type MailboxLink = { label: string; href: string };

function buildMailboxLinks(email: string): MailboxLink[] {
  const v = email.trim().toLowerCase();
  const at = v.lastIndexOf("@");
  const domain = at >= 0 ? v.slice(at + 1) : "";

  const links: MailboxLink[] = [];
  const push = (label: string, href: string) => {
    if (!label || !href) return;
    if (links.some((x) => x.href === href)) return;
    links.push({ label, href });
  };

  const gmail = "https://mail.google.com/mail/u/0/#inbox";
  const outlook = "https://outlook.live.com/mail/0/inbox";
  const icloud = "https://www.icloud.com/mail/";
  const qq = "https://mail.qq.com/";

  if (domain === "gmail.com" || domain === "googlemail.com") push("Gmail", gmail);
  if (domain === "outlook.com" || domain === "hotmail.com" || domain === "live.com") push("Outlook", outlook);
  if (domain === "icloud.com" || domain === "me.com" || domain === "mac.com") push("iCloud", icloud);
  if (domain === "qq.com" || domain === "foxmail.com") push("QQ Mail", qq);

  push("Gmail", gmail);
  push("Outlook", outlook);
  push("iCloud", icloud);
  return links;
}

export default function DaaLoginClient({ returnTo, error, notice }: Props) {
  const emailId = useId();
  const codeId = useId();
  const emailHelpId = useId();

  const emailRef = useRef<HTMLInputElement | null>(null);
  const codeRef = useRef<HTMLInputElement | null>(null);

  const safeReturnTo = useMemo(() => normalizeDaaReturnToV0(returnTo), [returnTo]);

  useEffect(() => {
    const n = String(notice || "").trim();
    if (!n) return;

    if (n === "session_expired") toast.error("Session expired. Please sign in again.");
    if (n === "signed_out") toast.success("Signed out.");
    if (n === "bootstrapped") toast.success("Bootstrap complete. Sign in with your email verification code.");
    if (n === "signed_in") toast.success("Signed in.");
  }, [notice]);

  const [session, setSession] = useState<SessionModel>({ kind: "checking" });
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [otp, setOtp] = useState<OtpModel>({ kind: "idle" });
  const [otpError, setOtpError] = useState<string | null>(null);
  const [emailChannelNotice, setEmailChannelNotice] = useState<string | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [online, setOnline] = useState(true);

  const normalizedEmail = normalizeEmailLoose(username);
  const codeTrimmed = code.trim();
  const checkingSession = session.kind === "checking";
  const offline = !online;

  const cooldownRemainingSeconds = useMemo(() => {
    if (otp.kind !== "sent") return 0;
    const elapsed = Math.floor((Date.now() - otp.requestedAtMs) / 1000);
    return Math.max(0, otp.cooldownSeconds - elapsed);
  }, [otp]);

  const canResend = otp.kind === "sent" && cooldownRemainingSeconds <= 0;
  const otpBusy = otp.kind === "sending";

  useEffect(() => {
    setOnline(isBrowserOnline());
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const res = await fetch("/api/daa/auth/me", { method: "GET", headers: { accept: "application/json" } });
        const text = await res.text();
        let json: any = null;
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }

        if (cancelled) return;

        if (!res.ok) {
          if (res.status === 401) {
            setSession({ kind: "signedOut" });
            return;
          }
          setSession({ kind: "error", message: parseApiError(json, `HTTP ${res.status}`) });
          return;
        }

        if (json?.ok) {
          setSession({ kind: "signedIn", me: json });
        } else {
          setSession({ kind: "signedOut" });
        }
      } catch (e) {
        if (cancelled) return;
        setSession({ kind: "error", message: e instanceof Error ? e.message : String(e) });
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LS_DAA_LAST_EMAIL_LOGIN_EMAIL_V0);
      if (saved && !username) setUsername(normalizeEmailDraftV0(saved));

      const sentRaw = window.localStorage.getItem(LS_DAA_EMAIL_OTP_SENT_V0);
      if (sentRaw) {
        const sent = JSON.parse(sentRaw || "{}");
        const email = typeof sent?.email === "string" ? normalizeEmailDraftV0(sent.email) : "";
        const requestedAtMs = Number(sent?.requestedAtMs);
        const cooldownSeconds = Number(sent?.cooldownSeconds);
        if (email && Number.isFinite(requestedAtMs) && Number.isFinite(cooldownSeconds)) {
          setOtp({
            kind: "sent",
            email,
            requestedAtMs,
            cooldownSeconds: Math.max(0, Math.floor(cooldownSeconds)),
            cooldownActive: sent?.cooldownActive === true,
          });
        }
      }
    } catch {
      // Ignore storage errors.
    }
  }, []);

  useEffect(() => {
    if (session.kind !== "signedOut") return;
    if (otp.kind === "sent") {
      if (!codeTrimmed) emailRef.current?.focus();
      else codeRef.current?.focus();
      return;
    }
    emailRef.current?.focus();
  }, [session.kind, otp.kind, codeTrimmed]);

  const handleEmailPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const out = applyEmailPasteNormalizationV0({
      value: input.value,
      selectionStart: input.selectionStart ?? input.value.length,
      selectionEnd: input.selectionEnd ?? input.value.length,
      pastedText: e.clipboardData?.getData("text") ?? "",
    });

    if (!out || out.nextValue === input.value) return;
    e.preventDefault();
    setUsername(out.nextValue);
    queueMicrotask(() => {
      const node = emailRef.current;
      if (!node) return;
      const caret = Number.isFinite(out.nextCaret) ? out.nextCaret : out.nextValue.length;
      node.setSelectionRange(caret, caret);
    });
  };

  async function requestOtp() {
    if (otpBusy || verifyBusy || checkingSession) return;

    const email = normalizedEmail;
    if (!email) {
      setOtpError("Enter a valid email address.");
      emailRef.current?.focus();
      return;
    }

    try {
      window.localStorage.setItem(LS_DAA_LAST_EMAIL_LOGIN_EMAIL_V0, email);
    } catch {
      // ignore
    }

    if (!isBrowserOnline()) {
      setOtpError("You appear to be offline. Connect to the internet, then try again.");
      return;
    }

    setOtpError(null);
    setEmailChannelNotice(null);
    setOtp({ kind: "sending" });

    try {
      const endpoint = otp.kind === "sent" ? "/api/daa/auth/email-login/resend" : "/api/daa/auth/email-login/request";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ email, returnTo: safeReturnTo }),
      });

      const text = await res.text().catch(() => "");
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }

      if (!res.ok) {
        if (res.status === 429) {
          const retryAfterSeconds = parseRetryAfterSecondsV0(res.headers.get("retry-after"));
          setOtpError(formatRateLimitedMessageV0({ action: "send a verification code", retryAfterSeconds }));
        } else {
          setOtpError(parseApiError(json, `HTTP ${res.status}`));
        }
        setOtp({ kind: "idle" });
        return;
      }

      const cooldownSeconds =
        typeof json?.cooldownSeconds === "number" && Number.isFinite(json.cooldownSeconds) ? Math.max(0, Math.floor(json.cooldownSeconds)) : 30;
      const resendChannelReady = json?.resendChannelReady !== false;
      if (!resendChannelReady) {
        setEmailChannelNotice("Email delivery channel is not configured. Request was accepted, but verification emails may not arrive yet.");
      }
      const cooldownActive = json?.cooldownActive === true;
      if (cooldownActive) {
        const retryAfterSeconds = Number.isFinite(Number(json?.retryAfterSeconds)) ? Math.max(1, Math.floor(Number(json.retryAfterSeconds))) : null;
        const cooldownUntilLabel = formatClockTimeV0(json?.cooldownUntilIso);
        setEmailChannelNotice(retryAfterSeconds
          ? `A code was just sent. Please wait ${formatSeconds(retryAfterSeconds)} before requesting another email${cooldownUntilLabel ? ` (after ${cooldownUntilLabel})` : ""}.`
          : "A code was just sent. Please wait for cooldown before requesting another email.");
      }
      const requestedAtMs = Date.now();
      const next = { kind: "sent", email, requestedAtMs, cooldownSeconds, cooldownActive } as const;
      setOtp(next);
      setCode("");
      if (cooldownActive) {
        toast("A code was already sent recently. Cooldown is still active.");
      } else {
        toast.success("If an account exists for that email, we sent a verification code.");
      }
      try {
        window.localStorage.setItem(LS_DAA_EMAIL_OTP_SENT_V0, JSON.stringify(next));
      } catch {
        // ignore
      }
      codeRef.current?.focus();
    } catch (e) {
      setOtpError(formatNetworkFailureMessage(e, "send a verification code"));
      setOtp({ kind: "idle" });
    }
  }

  async function verifyOtp() {
    if (verifyBusy || otpBusy || checkingSession) return;

    const email = normalizedEmail;
    if (!email) {
      setOtpError("Enter a valid email address.");
      emailRef.current?.focus();
      return;
    }
    if (!codeTrimmed) {
      setOtpError("Enter the verification code from your email.");
      codeRef.current?.focus();
      return;
    }

    setVerifyBusy(true);
    setOtpError(null);
    try {
      const res = await fetch("/api/daa/auth/email-login/verify", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ email, code: codeTrimmed, returnTo: safeReturnTo }),
      });

      const text = await res.text().catch(() => "");
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }

      if (!res.ok || !json?.ok) {
        if (res.status === 429) {
          const retryAfterSeconds = parseRetryAfterSecondsV0(res.headers.get("retry-after"));
          setOtpError(formatRateLimitedMessageV0({ action: "verify your code", retryAfterSeconds }));
        } else {
          setOtpError(parseApiError(json, "Invalid or expired verification code."));
        }
        return;
      }

      const redirectTo = normalizeDaaReturnToV0(typeof json?.redirectTo === "string" ? json.redirectTo : appendNoticeParamV0(safeReturnTo, "signed_in"));
      window.location.href = redirectTo;
    } catch (e) {
      setOtpError(formatNetworkFailureMessage(e, "verify your code"));
    } finally {
      setVerifyBusy(false);
    }
  }

  async function logout() {
    try {
      const res = await fetch("/api/daa/auth/logout", { method: "POST", headers: { accept: "application/json" } });
      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      if (!res.ok || !json?.ok) throw new Error(parseApiError(json, `HTTP ${res.status}`));
      window.location.href = appendNoticeParamV0("/daa/login", "signed_out");
    } catch (e) {
      toast.error(`Sign-out failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  useEffect(() => {
    const err = String(error || "").trim();
    if (!err) return;
    const map: Record<string, string> = {
      "email-link-invalid": "Verification code is invalid.",
      "email-link-expired": "Verification code expired. Request a new one.",
      "email-link-used": "Verification code already used. Request a new one.",
      "otp-invalid": "Verification code is invalid.",
      "otp-expired": "Verification code expired. Request a new one.",
      "otp-used": "Verification code already used. Request a new one.",
    };
    setOtpError(map[err] || err);
  }, [error]);

  const mailboxLinks = useMemo(() => (otp.kind === "sent" ? buildMailboxLinks(otp.email) : []), [otp]);

  if (session.kind === "signedIn") {
    const roles = session.me.account.roles?.filter(Boolean).join(", ") || "(no roles)";
    return (
      <div className="mx-auto w-full max-w-md space-y-4 sm:space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">You are already signed in</CardTitle>
            <CardDescription>
              Signed in as <span className="font-medium">{session.me.account.username}</span> ({roles}).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button asChild className="w-full sm:w-auto">
              <Link href={safeReturnTo}>Continue to dashboard</Link>
            </Button>
            <Button type="button" className="w-full sm:w-auto" variant="outline" onClick={() => void logout()}>
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-4 sm:space-y-6">
      {offline ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <div>
            <AlertTitle>You are offline.</AlertTitle>
            <AlertDescription>Connect to the internet, then retry. Sign-in requests are disabled while offline.</AlertDescription>
          </div>
        </Alert>
      ) : null}

      {session.kind === "error" ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <div>
            <AlertTitle>Couldn&apos;t verify your session.</AlertTitle>
            <AlertDescription>You can still try signing in. ({session.message})</AlertDescription>
          </div>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Sign in with email code</CardTitle>
          <CardDescription>
            We&apos;ll send a one-time verification code to your email, then sign you in to <code className="rounded bg-muted px-1 py-0.5">/daa/dashboard</code>.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {checkingSession ? (
            <div className="inline-flex items-center gap-2 text-xs text-muted-foreground" role="status" aria-live="polite">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking session...
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor={emailId}>Email</Label>
            <div className="relative">
              <Input
                id={emailId}
                ref={emailRef}
                type="email"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setOtpError(null);
                  setEmailChannelNotice(null);
                }}
                onPaste={handleEmailPaste}
                onBlur={() => {
                  const next = normalizeEmailDraftV0(username);
                  if (next && next !== username) setUsername(next);
                }}
                autoComplete="email"
                inputMode="email"
                placeholder="you@example.com"
                disabled={otpBusy || verifyBusy || offline}
                aria-describedby={emailHelpId}
                className="pr-10"
              />
              {username.trim() ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setUsername("");
                    setCode("");
                    setOtp({ kind: "idle" });
                    setOtpError(null);
                    try {
                      window.localStorage.removeItem(LS_DAA_EMAIL_OTP_SENT_V0);
                    } catch {
                      // ignore
                    }
                    emailRef.current?.focus();
                  }}
                  aria-label="Clear email"
                  title="Clear email"
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
            <div id={emailHelpId} className="text-xs text-muted-foreground">
              Use your admin email. We only send codes for active accounts.
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor={codeId}>Verification code</Label>
            <Input
              id={codeId}
              ref={codeRef}
              type="text"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.trimStart());
                setOtpError(null);
              }}
              placeholder="Enter code from email"
              autoComplete="one-time-code"
              disabled={verifyBusy || otpBusy || offline}
            />
            <div className="text-xs text-muted-foreground">Code expires in about 15 minutes and can be used once.</div>
          </div>

          {otpError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{otpError}</AlertDescription>
            </Alert>
          ) : null}

          {emailChannelNotice ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Email delivery notice</AlertTitle>
              <AlertDescription>{emailChannelNotice}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" onClick={() => void requestOtp()} disabled={offline || checkingSession || verifyBusy || (otp.kind === "sent" && !canResend)}>
              {otpBusy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : otp.kind === "sent" ? (
                canResend ? "Resend code" : `Resend in ${formatSeconds(cooldownRemainingSeconds)}`
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                  Send code
                </>
              )}
            </Button>

            <Button type="button" onClick={() => void verifyOtp()} disabled={offline || checkingSession || verifyBusy || otpBusy || !normalizedEmail || !codeTrimmed}>
              {verifyBusy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Verify and sign in"
              )}
            </Button>
          </div>

          {otp.kind === "sent" ? (
            <div className="rounded-md border border-dashed border-muted-foreground/30 p-3 text-xs text-muted-foreground">
              <div className="font-medium text-foreground">Check your inbox</div>
              <div className="mt-1">
                {otp.cooldownActive
                  ? <>A code was already sent recently to <span className="font-medium text-foreground">{otp.email}</span>. Wait for cooldown, then resend if needed.</>
                  : <>We sent a code to <span className="font-medium text-foreground">{otp.email}</span>.</>}
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>Check spam/promotions if it doesn&apos;t arrive in 1 minute.</li>
                <li>Do not forward or share the verification code.</li>
              </ul>
              {mailboxLinks.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {mailboxLinks.map((x) => (
                    <a
                      key={x.href}
                      href={x.href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center rounded border px-2 py-0.5 text-[11px] text-foreground hover:bg-muted"
                    >
                      Open {x.label}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-md border border-dashed border-muted-foreground/30 p-3 text-xs text-muted-foreground">
            <div className="font-medium text-foreground">Fresh deployment?</div>
            <div className="mt-1">
              Bootstrap the first admin via <code className="rounded bg-muted px-1 py-0.5">/api/daa/auth/bootstrap</code> (requires env <code className="rounded bg-muted px-1 py-0.5">DAA_AUTH_BOOTSTRAP_TOKEN</code> and header <code className="rounded bg-muted px-1 py-0.5">x-daa-bootstrap-token</code>).
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            Need help? <Link className="underline underline-offset-2" href="/support">Support</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
