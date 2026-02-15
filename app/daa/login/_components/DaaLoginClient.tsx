"use client";

import Link from "next/link";
import { AlertCircle, Loader2, Mail } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { formatRateLimitedMessageV0, parseRetryAfterSecondsV0 } from "@/src/daa/auth/uiRateLimitV0";

import { appendNoticeParamV0, normalizeDaaReturnToV0 } from "@/src/daa/urlV0";

type Props = {
  returnTo: string;
  error?: string;
  notice?: string;
};

type PasswordFormErrors = {
  email?: string;
  password?: string;
  form?: string;
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

type EmailLinkModel =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; email: string; requestedAtMs: number; cooldownSeconds: number };

const LS_DAA_LAST_EMAIL_LOGIN_EMAIL_V0 = "daa.emailLogin.lastEmail.v0";
const LS_DAA_EMAIL_LOGIN_TAB_V0 = "daa.emailLogin.tab.v0";
const LS_DAA_EMAIL_LINK_SENT_V0 = "daa.emailLogin.sent.v0";

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

// returnTo normalization is shared via src/daa/urlV0.ts

function parseApiError(json: any, fallback: string): string {
  const msg = typeof json?.error === "string" ? json.error.trim() : "";
  if (msg) return msg;
  return fallback;
}

function formatSeconds(s: number): string {
  if (!Number.isFinite(s)) return "0s";
  const ss = Math.max(0, Math.floor(s));
  return `${ss}s`;
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
  const yahoo = "https://mail.yahoo.com/d/folders/1";
  const proton = "https://mail.proton.me/u/0/inbox";
  const qq = "https://mail.qq.com/";
  const netease163 = "https://mail.163.com/";
  const netease126 = "https://mail.126.com/";
  const neteaseYeah = "https://mail.yeah.net/";

  if (domain === "gmail.com" || domain === "googlemail.com") push("Gmail", gmail);
  if (domain === "outlook.com" || domain === "hotmail.com" || domain === "live.com") push("Outlook", outlook);
  if (domain === "icloud.com" || domain === "me.com" || domain === "mac.com") push("iCloud", icloud);
  if (domain === "yahoo.com" || domain === "ymail.com") push("Yahoo", yahoo);
  if (domain === "proton.me" || domain === "protonmail.com") push("Proton", proton);
  if (domain === "qq.com" || domain === "foxmail.com") push("QQ Mail", qq);
  if (domain === "163.com") push("163 Mail", netease163);
  if (domain === "126.com") push("126 Mail", netease126);
  if (domain === "yeah.net") push("yeah.net Mail", neteaseYeah);

  // Common fallbacks (still deduped by href)
  push("Gmail", gmail);
  push("Outlook", outlook);
  push("iCloud", icloud);

  return links;
}

export default function DaaLoginClient({ returnTo, error, notice }: Props) {
  const emailLinkEmailId = useId();
  const passwordEmailId = useId();
  const passwordId = useId();

  const emailLinkEmailHelpId = useId();
  const passwordEmailHelpId = useId();
  const passwordHelpId = useId();
  const formErrorId = useId();

  const emailLinkEmailRef = useRef<HTMLInputElement | null>(null);
  const passwordEmailRef = useRef<HTMLInputElement | null>(null);

  const emailLinkRequestInFlightRef = useRef(false);

  // Focus the first relevant input after the session check completes and when switching tabs.
  // (React's autoFocus only runs on mount, so this keeps keyboard flow predictable.)
  const passwordRef = useRef<HTMLInputElement | null>(null);

  const safeReturnTo = useMemo(() => normalizeDaaReturnToV0(returnTo), [returnTo]);

  useEffect(() => {
    const n = String(notice || "").trim();
    if (!n) return;

    if (n === "session_expired") {
      let redirectToastRecent = false;
      try {
        const at = Number(sessionStorage.getItem("daa_notice_session_expired_at_v0") || "0");
        if (at && Date.now() - at < 5000) redirectToastRecent = true;
        sessionStorage.removeItem("daa_notice_session_expired_at_v0");
      } catch {
        // Ignore storage errors (private mode / quota).
      }

      if (!redirectToastRecent) {
        toast.error("Session expired. Please sign in again.");
      }
    }

    if (n === "signed_out") {
      toast.success("Signed out.");
    }

    // Avoid repeating the toast on refresh.
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("notice");
      window.history.replaceState({}, "", url.toString());
    } catch {
      // Ignore URL parsing / history errors.
    }
  }, [notice]);

  const [session, setSession] = useState<SessionModel>({ kind: "checking" });

  const emailLinkErrorCode =
    error === "email-link-invalid" || error === "email-link-expired" || error === "email-link-used" ? error : "";

  const [tab, setTab] = useState<"email" | "password">(emailLinkErrorCode ? "email" : "password");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const normalizedEmail = useMemo(() => normalizeEmailLoose(username), [username]);
  const passwordTrimmed = password.trim();

  // Password form state
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<PasswordFormErrors>({});
  const [passwordSubmitAttempted, setPasswordSubmitAttempted] = useState(false);
  const [touched, setTouched] = useState({ email: false, password: false });

  // Email-link form state
  const [emailLink, setEmailLink] = useState<EmailLinkModel>({ kind: "idle" });
  const [emailLinkError, setEmailLinkError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const passwordClientErrors = useMemo<PasswordFormErrors>(() => {
    const e: PasswordFormErrors = {};
    const showEmail = passwordSubmitAttempted || touched.email;
    const showPassword = passwordSubmitAttempted || touched.password;

    if (showEmail && !normalizedEmail) {
      e.email = username.trim()
        ? "Enter a valid email address (for example, you@example.com)."
        : "Enter your email address (for example, you@example.com).";
    }
    if (showPassword && !passwordTrimmed) e.password = "Enter your password.";

    return e;
  }, [normalizedEmail, passwordTrimmed, passwordSubmitAttempted, touched.email, touched.password, username]);

  const mergedPasswordErrors = useMemo<PasswordFormErrors>(
    () => ({ ...passwordErrors, ...passwordClientErrors }),
    [passwordErrors, passwordClientErrors]
  );

  const passwordFormValid = Boolean(normalizedEmail) && Boolean(passwordTrimmed);
  const emailLinkFormValid = Boolean(normalizedEmail);

  const [logoutBusy, setLogoutBusy] = useState(false);

  const checkingSession = session.kind === "checking";
  const passwordDisabled = passwordBusy || checkingSession;
  const emailDisabled = emailLink.kind === "sending" || checkingSession;

  const passwordSubmitDisabled = passwordDisabled || !passwordFormValid;

  useEffect(() => {
    if (checkingSession) return;

    // Don't steal focus if the user is already interacting with a control.
    const ae = typeof document === "undefined" ? null : document.activeElement;
    if (
      ae &&
      ae !== document.body &&
      (ae instanceof HTMLInputElement || ae instanceof HTMLTextAreaElement || ae instanceof HTMLButtonElement || ae instanceof HTMLSelectElement)
    ) {
      return;
    }

    const target =
      tab === "email"
        ? emailLinkEmailRef.current
        : normalizedEmail
          ? passwordRef.current || passwordEmailRef.current
          : passwordEmailRef.current;
    if (!target) return;

    target.focus();
    try {
      if (target.value) target.setSelectionRange(0, target.value.length);
    } catch {
      // Ignore selection errors (e.g. unsupported input types).
    }
  }, [checkingSession, normalizedEmail, tab]);

  const resendRemainingSeconds = useMemo(() => {
    if (emailLink.kind !== "sent") return 0;
    const elapsed = Math.floor((nowMs - emailLink.requestedAtMs) / 1000);
    return Math.max(0, emailLink.cooldownSeconds - elapsed);
  }, [emailLink, nowMs]);

  const mailboxLinks = useMemo(() => {
    if (emailLink.kind !== "sent") return [];
    return buildMailboxLinks(emailLink.email);
  }, [emailLink]);

  useEffect(() => {
    // Restore last typed email + selected tab, and keep the "link sent" panel stable across refresh.
    // This avoids the common annoyance where users refresh after requesting a link and lose context.
    try {
      const lastEmail = (window.localStorage.getItem(LS_DAA_LAST_EMAIL_LOGIN_EMAIL_V0) || "").trim();
      if (lastEmail) {
        setUsername((prev) => (prev.trim() ? prev : lastEmail.slice(0, 254)));
      }
    } catch {
      // Ignore storage errors.
    }

    if (!emailLinkErrorCode) {
      try {
        const lastTab = (window.localStorage.getItem(LS_DAA_EMAIL_LOGIN_TAB_V0) || "").trim();
        if (lastTab === "email" || lastTab === "password") setTab(lastTab);
      } catch {
        // Ignore storage errors.
      }
    }

    try {
      const raw = window.localStorage.getItem(LS_DAA_EMAIL_LINK_SENT_V0) || "";
      if (!raw) return;

      const parsed = JSON.parse(raw);
      const email = normalizeEmailLoose(String(parsed?.email || ""));
      const requestedAtMs = typeof parsed?.requestedAtMs === "number" ? parsed.requestedAtMs : NaN;
      const cooldownSeconds = typeof parsed?.cooldownSeconds === "number" ? parsed.cooldownSeconds : NaN;

      const ageMs = Date.now() - requestedAtMs;
      const maxAgeMs = 15 * 60 * 1000;

      if (email && Number.isFinite(requestedAtMs) && Number.isFinite(cooldownSeconds) && ageMs >= 0 && ageMs < maxAgeMs) {
        setUsername((prev) => (prev.trim() ? prev : email));
        setEmailLink({
          kind: "sent",
          email,
          requestedAtMs,
          cooldownSeconds: Math.max(0, Math.floor(cooldownSeconds)),
        });
      } else {
        window.localStorage.removeItem(LS_DAA_EMAIL_LINK_SENT_V0);
      }
    } catch {
      // Ignore storage / parse errors.
    }
  }, [emailLinkErrorCode]);

  useEffect(() => {
    const draft = username.trim();
    if (!draft) return;
    try {
      window.localStorage.setItem(LS_DAA_LAST_EMAIL_LOGIN_EMAIL_V0, draft.slice(0, 254));
    } catch {
      // Ignore storage errors.
    }
  }, [username]);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch("/api/daa/auth/me", {
          method: "GET",
          headers: { accept: "application/json" },
          cache: "no-store",
        });

        if (cancelled) return;

        if (!res.ok) {
          if (res.status === 401) {
            setSession({ kind: "signedOut" });
            return;
          }
          const text = await res.text().catch(() => "");
          let json: any = null;
          try {
            json = JSON.parse(text);
          } catch {
            json = null;
          }
          setSession({ kind: "error", message: parseApiError(json, `HTTP ${res.status}`) });
          return;
        }

        const payload = (await res.json()) as MeResponse;
        if (!payload?.ok) {
          setSession({ kind: "signedOut" });
          return;
        }

        setSession({ kind: "signedIn", me: payload });
      } catch (e) {
        if (cancelled) return;
        setSession({ kind: "error", message: e instanceof Error ? e.message : String(e) });
      }
    }

    void check();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (emailLink.kind !== "sent") return;
    const t = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [emailLink.kind]);

  async function logout() {
    setLogoutBusy(true);
    try {
      await fetch("/api/daa/auth/logout", { method: "POST", headers: { accept: "application/json" } });
    } finally {
      setLogoutBusy(false);
      // Ensure middleware re-evaluates session state.
      window.location.reload();
    }
  }

  async function submitPassword() {
    if (passwordDisabled) return;

    setPasswordSubmitAttempted(true);

    const email = normalizeEmailLoose(username);
    const pwd = password;

    // Gate network requests behind a valid form (also covers pressing Enter).
    if (!email || !pwd.trim()) {
      // Clear generic form errors so field-level validation has priority.
      setPasswordErrors((prev) => ({ ...prev, form: undefined }));

      // Keep keyboard flow predictable: focus the first missing/invalid field.
      if (!email) {
        setTouched((prev) => ({ ...prev, email: true }));
        passwordEmailRef.current?.focus();
        return;
      }

      setTouched((prev) => ({ ...prev, password: true }));
      passwordRef.current?.focus();
      return;
    }

    setPasswordBusy(true);
    setPasswordErrors({});

    try {
      const res = await fetch("/api/daa/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ username: email, password: pwd }),
      });

      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }

      if (!json || typeof json.ok !== "boolean") {
        setPasswordErrors({ form: "Unexpected response from the server. Please try again." });
        return;
      }

      if (!res.ok || !json.ok) {
        const msg = parseApiError(json, `HTTP ${res.status}`);

        // Invalid credentials is the most common case; keep it inline.
        if (res.status === 401) {
          setPasswordErrors({ password: "Email or password is incorrect." });
          setPassword("");
          passwordRef.current?.focus();
          return;
        }

        if (res.status === 429) {
          const retryAfterSeconds = parseRetryAfterSecondsV0(res.headers.get("retry-after"));
          setPasswordErrors({ form: formatRateLimitedMessageV0({ action: "sign in", retryAfterSeconds }) });
          return;
        }

        // Avoid overly technical errors for the common cases.
        if (res.status >= 500) {
          setPasswordErrors({ form: "We couldn't sign you in right now. Please try again." });
          return;
        }

        setPasswordErrors({ form: msg });
        return;
      }

      // Cookie is set by the server; redirect into the console.
      window.location.href = appendNoticeParamV0(safeReturnTo, "signed_in");
    } catch (e) {
      setPasswordErrors({ form: e instanceof Error ? e.message : String(e) });
    } finally {
      setPasswordBusy(false);
    }
  }

  async function requestEmailLink() {
    if (emailDisabled) return;
    if (emailLinkRequestInFlightRef.current) return;

    // Prevent Enter-to-submit from bypassing the resend cooldown (the button is disabled, but form submit can still fire).
    if (emailLink.kind === "sent") {
      const elapsed = Math.floor((Date.now() - emailLink.requestedAtMs) / 1000);
      const remaining = Math.max(0, emailLink.cooldownSeconds - elapsed);
      if (remaining > 0) return;
    }

    setEmailLinkError(null);

    const email = normalizeEmailLoose(username);
    if (!email) {
      setTouched((prev) => ({ ...prev, email: true }));
      emailLinkEmailRef.current?.focus();
      return;
    }

    try {
      window.localStorage.setItem(LS_DAA_LAST_EMAIL_LOGIN_EMAIL_V0, email);
    } catch {
      // Ignore storage errors.
    }

    emailLinkRequestInFlightRef.current = true;
    setEmailLink({ kind: "sending" });

    try {
      const res = await fetch("/api/daa/auth/email-login/request", {
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
          setEmailLinkError(formatRateLimitedMessageV0({ action: "send a sign-in link", retryAfterSeconds }));
        } else {
          setEmailLinkError(parseApiError(json, `HTTP ${res.status}`));
        }
        setEmailLink({ kind: "idle" });
        return;
      }

      const cooldownSeconds =
        typeof json?.cooldownSeconds === "number" && Number.isFinite(json.cooldownSeconds) ? Math.max(0, Math.floor(json.cooldownSeconds)) : 30;
      const requestedAtMs = Date.now();
      setEmailLink({ kind: "sent", email, requestedAtMs, cooldownSeconds });
      toast.success("If an account exists for that email, we will send a sign-in link shortly.");
      try {
        window.localStorage.setItem(LS_DAA_EMAIL_LINK_SENT_V0, JSON.stringify({ email, requestedAtMs, cooldownSeconds }));
      } catch {
        // Ignore storage errors.
      }
    } catch (e) {
      setEmailLinkError(e instanceof Error ? e.message : String(e));
      setEmailLink({ kind: "idle" });
    } finally {
      emailLinkRequestInFlightRef.current = false;
    }
  }

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
            <Button type="button" className="w-full sm:w-auto" variant="outline" onClick={() => void logout()} disabled={logoutBusy}>
              {logoutBusy ? "Signing out..." : "Sign out"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const emailInvalidEmailLink = touched.email && !normalizedEmail;
  const emailHelpText = username.trim()
    ? "Enter a valid email address (for example, you@example.com)."
    : "Enter your email address (for example, you@example.com).";

  return (
    <div className="mx-auto w-full max-w-md space-y-4 sm:space-y-6">
      {emailLinkErrorCode ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <div>
            <AlertTitle>
              {emailLinkErrorCode === "email-link-used"
                ? "This sign-in link has already been used."
                : emailLinkErrorCode === "email-link-expired"
                  ? "This sign-in link has expired."
                  : "This sign-in link is invalid."}
            </AlertTitle>
            <AlertDescription>
              <div className="text-xs text-destructive/90">Request a new link or sign in with a password to continue.</div>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={emailDisabled}
                  onClick={() => {
                    setTab("email");
                    setEmailLinkError(null);
                    setEmailLink({ kind: "idle" });

                    const normalized = normalizeEmailLoose(username);
                    if (!normalized) {
                      setTouched((prev) => ({ ...prev, email: true }));
                      emailLinkEmailRef.current?.focus();
                      return;
                    }

                    void requestEmailLink();
                  }}
                >
                  Resend sign-in link
                </Button>

                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setTab("password");
                    setPasswordErrors({});
                    setEmailLinkError(null);
                  }}
                >
                  Use password instead
                </Button>
              </div>
            </AlertDescription>
          </div>
        </Alert>
      ) : null}

      {session.kind === "error" ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <div>
            <AlertTitle>Couldn't verify your session.</AlertTitle>
            <AlertDescription>You can still try signing in. ({session.message})</AlertDescription>
          </div>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Sign in</CardTitle>
          <CardDescription>
            Choose a sign-in method to access <code className="rounded bg-muted px-1 py-0.5">/daa/dashboard</code>.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Tabs
            value={tab}
            onValueChange={(v) => {
              const vv = v === "email" ? "email" : "password";
              setTab(vv);
              try {
                window.localStorage.setItem(LS_DAA_EMAIL_LOGIN_TAB_V0, vv);
              } catch {
                // Ignore storage errors.
              }
              setPasswordErrors({});
              setEmailLinkError(null);
            }}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="email">Email link</TabsTrigger>
              <TabsTrigger value="password">Password</TabsTrigger>
            </TabsList>

            <TabsContent value="email" className="mt-4">
              <form
                className="grid gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void requestEmailLink();
                }}
                aria-busy={emailDisabled}
              >
                {checkingSession ? (
                  <div className="inline-flex items-center gap-2 text-xs text-muted-foreground" role="status" aria-live="polite">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking session...
                  </div>
                ) : null}

                <div className="grid gap-2">
                  <label htmlFor={emailLinkEmailId} className="text-sm font-medium">
                    Email
                  </label>
                  <Input
                    id={emailLinkEmailId}
                    ref={emailLinkEmailRef}
                    type="email"
                    name="email"
                    inputMode="email"
                    enterKeyHint="send"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      setEmailLinkError(null);
                      setEmailLink((prev) => {
                        if (prev.kind !== "sent") return prev;
                        try {
                          window.localStorage.removeItem(LS_DAA_EMAIL_LINK_SENT_V0);
                        } catch {
                          // Ignore storage errors.
                        }
                        return { kind: "idle" };
                      });
                    }}
                    autoComplete="email"
                    placeholder="you@example.com"
                    disabled={emailDisabled}
                    onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
                    aria-invalid={emailInvalidEmailLink || undefined}
                    aria-describedby={emailLinkEmailHelpId}
                  />
                  <div
                    id={emailLinkEmailHelpId}
                    className={emailInvalidEmailLink ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
                    role={emailInvalidEmailLink ? "alert" : undefined}
                  >
                    {emailInvalidEmailLink ? emailHelpText : "We'll email you a single-use sign-in link (usually within a minute). It expires in about 15 minutes."}
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button
                    type="submit"
                    className="w-full sm:w-auto"
                    disabled={emailDisabled || !emailLinkFormValid || (emailLink.kind === "sent" && resendRemainingSeconds > 0)}
                  >
                    {emailLink.kind === "sending" ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Sending...
                      </span>
                    ) : emailLink.kind === "sent" ? (
                      resendRemainingSeconds > 0 ? `Resend in ${formatSeconds(resendRemainingSeconds)}` : "Resend sign-in link"
                    ) : (
                      "Send sign-in link"
                    )}
                  </Button>

                  {emailLink.kind === "sent" ? (
                    <div className="text-xs text-muted-foreground">
                      Didn't receive it?{" "}
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto p-0 align-baseline"
                        onClick={() => void requestEmailLink()}
                        disabled={emailDisabled || !emailLinkFormValid || resendRemainingSeconds > 0}
                      >
                        {resendRemainingSeconds > 0 ? `Resend in ${formatSeconds(resendRemainingSeconds)}` : "Resend link"}
                      </Button>
                    </div>
                  ) : null}
                </div>

                {emailLink.kind === "sent" ? (
                  <Card className="border-muted/60 bg-muted/10">
                    <CardHeader className="space-y-1 pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Mail className="h-4 w-4" />
                        Check your email
                      </CardTitle>
                      <CardDescription>
                        If <span className="font-medium">{emailLink.email}</span> is registered, we just sent a single-use sign-in link. It expires in about 15 minutes.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-3">
                      <ol className="ml-4 list-decimal space-y-1 text-xs text-muted-foreground">
                        <li>
                          Open the email titled <span className="font-medium">Your DAA sign-in link</span>.
                        </li>
                        <li>Click the sign-in button/link. This browser will refresh and you will be signed in automatically.</li>
                        <li>If you don't see it, check spam/promotions. You can resend after the cooldown, or use a password instead.</li>
                      </ol>

                      {mailboxLinks.length ? (
                        <div className="flex flex-wrap gap-2">
                          {mailboxLinks.map((l) => (
                            <Button
                              key={l.href}
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => window.open(l.href, "_blank", "noopener,noreferrer")}
                            >
                              Open {l.label}
                            </Button>
                          ))}
                        </div>
                      ) : null}

                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setTab("password");
                            setPasswordErrors({});
                            setEmailLinkError(null);
                          }}
                        >
                          Use password instead
                        </Button>

                        <Button
                          type="button"
                          variant="link"
                          size="sm"
                          className="h-auto p-0 text-xs"
                          onClick={() => {
                            setEmailLinkError(null);
                            setEmailLink({ kind: "idle" });
                            try {
                              window.localStorage.removeItem(LS_DAA_EMAIL_LINK_SENT_V0);
                            } catch {
                              // Ignore storage errors.
                            }
                            emailLinkEmailRef.current?.focus();
                          }}
                        >
                          Use a different email
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : null}

                {emailLinkError ? (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <div>
                      <AlertTitle>Couldn't send a sign-in link.</AlertTitle>
                      <AlertDescription>{emailLinkError}</AlertDescription>
                    </div>
                  </Alert>
                ) : null}

                <details className="rounded-md border bg-muted/20 px-3 py-2 text-xs">
                  <summary className="cursor-pointer select-none font-medium">Need access?</summary>
                  <div className="mt-2 grid gap-1 text-muted-foreground">
                    <div>• Ask an admin to grant you an account.</div>
                    <div>
                      • Fresh deployment: bootstrap the first admin via{" "}
                      <code className="rounded bg-muted px-1 py-0.5">/api/daa/auth/bootstrap</code> (requires server env{" "}
                      <code className="rounded bg-muted px-1 py-0.5">DAA_AUTH_BOOTSTRAP_TOKEN</code> and sending{" "}
                      <code className="rounded bg-muted px-1 py-0.5">x-daa-bootstrap-token</code>).
                    </div>
                  </div>
                </details>
              </form>
            </TabsContent>

            <TabsContent value="password" className="mt-4">
              <form
                className="grid gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitPassword();
                }}
                aria-busy={passwordBusy || checkingSession}
                aria-describedby={mergedPasswordErrors.form ? formErrorId : undefined}
              >
                {checkingSession ? (
                  <div className="inline-flex items-center gap-2 text-xs text-muted-foreground" role="status" aria-live="polite">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking session...
                  </div>
                ) : null}

                <div className="grid gap-2">
                  <label htmlFor={passwordEmailId} className="text-sm font-medium">
                    Email
                  </label>
                  <Input
                    id={passwordEmailId}
                    ref={passwordEmailRef}
                    type="email"
                    name="username"
                    inputMode="email"
                    enterKeyHint="next"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      setEmailLink((prev) => (prev.kind === "sent" ? { kind: "idle" } : prev));
                      setPasswordErrors((prev) => ({ ...prev, email: undefined, form: undefined }));
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;

                      // When password is still empty, Enter on the email field should advance focus to password.
                      // If the user already typed a password (then came back), let the form submit normally.
                      if (password.trim()) return;

                      e.preventDefault();

                      const email = normalizeEmailLoose(e.currentTarget.value);
                      if (!email) {
                        setPasswordSubmitAttempted(true);
                        setTouched((prev) => ({ ...prev, email: true }));
                        return;
                      }

                      passwordRef.current?.focus();
                    }}
                    autoComplete="username"
                    placeholder="you@example.com"
                    disabled={passwordDisabled}
                    onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
                    aria-invalid={Boolean(mergedPasswordErrors.email) || undefined}
                    aria-describedby={passwordEmailHelpId}
                  />
                  <div
                    id={passwordEmailHelpId}
                    className={mergedPasswordErrors.email ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
                    role={mergedPasswordErrors.email ? "alert" : undefined}
                  >
                    {mergedPasswordErrors.email ? mergedPasswordErrors.email : "Your username is your email address."}
                  </div>
                </div>

                <div className="grid gap-2">
                  <label htmlFor={passwordId} className="text-sm font-medium">
                    Password
                  </label>
                  <Input
                    id={passwordId}
                    ref={passwordRef}
                    type="password"
                    name="password"
                    enterKeyHint="go"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setPasswordErrors((prev) => ({ ...prev, password: undefined, form: undefined }));
                    }}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    disabled={passwordDisabled}
                    onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
                    aria-invalid={Boolean(mergedPasswordErrors.password) || undefined}
                    aria-describedby={passwordHelpId}
                  />
                  <div
                    id={passwordHelpId}
                    className={mergedPasswordErrors.password ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
                    role={mergedPasswordErrors.password ? "alert" : undefined}
                  >
                    {mergedPasswordErrors.password ? mergedPasswordErrors.password : "Passwords are case-sensitive."}
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={passwordSubmitDisabled}>
                  {checkingSession ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Checking session...
                    </span>
                  ) : passwordBusy ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Signing in...
                    </span>
                  ) : (
                    "Sign in"
                  )}
                </Button>

                <details className="rounded-md border bg-muted/20 px-3 py-2 text-xs">
                  <summary className="cursor-pointer select-none font-medium">Need access?</summary>
                  <div className="mt-2 grid gap-1 text-muted-foreground">
                    <div>• Ask an admin to (re)send your credentials (no self-service reset yet).</div>
                    <div>
                      • Fresh deployment: bootstrap the first admin via{" "}
                      <code className="rounded bg-muted px-1 py-0.5">/api/daa/auth/bootstrap</code> (requires server env{" "}
                      <code className="rounded bg-muted px-1 py-0.5">DAA_AUTH_BOOTSTRAP_TOKEN</code> and sending{" "}
                      <code className="rounded bg-muted px-1 py-0.5">x-daa-bootstrap-token</code>).
                    </div>
                  </div>
                </details>

                {mergedPasswordErrors.form ? (
                  <Alert id={formErrorId} variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <div>
                      <AlertTitle>Couldn't sign you in.</AlertTitle>
                      <AlertDescription>
                        <div>{mergedPasswordErrors.form}</div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          Double-check your email/password or ask an admin to resend/reset your credentials.
                        </div>
                      </AlertDescription>
                    </div>
                  </Alert>
                ) : null}
              </form>
            </TabsContent>
          </Tabs>

          <div className="mt-6 grid gap-2 text-center text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
              <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">
                Terms
              </Link>
              <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
                Privacy
              </Link>
              <Link href="/support" className="underline underline-offset-2 hover:text-foreground">
                Support
              </Link>
            </div>
            <div className="text-[11px]">AI outputs are drafts only; it never executes trades automatically.</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
