"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { formatRateLimitedMessageV0, parseRetryAfterSecondsV0 } from "@/src/daa/auth/uiRateLimitV0";

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

function normalizeReturnTo(raw: string): string {
  const v = raw.trim();
  if (!v) return "/daa/dashboard";
  if (!v.startsWith("/")) return "/daa/dashboard";
  if (v.startsWith("//")) return "/daa/dashboard";

  // Keep post-login redirects inside the DAA surface.
  if (!v.startsWith("/daa")) return "/daa/dashboard";

  return v;
}

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

  const safeReturnTo = useMemo(() => normalizeReturnTo(returnTo), [returnTo]);

  useEffect(() => {
    const n = String(notice || "").trim();
    if (!n) return;

    if (n === "session_expired") {
      toast.error("Session expired. Please sign in again.");
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

  const [tab, setTab] = useState<"email" | "password">(error === "email-link-invalid" ? "email" : "password");

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
    // When a magic link is expired/invalid, we often bounce back to /daa/login.
    // Prefill the last email so retrying is 1-click.
    if (username.trim()) return;
    try {
      const last = window.localStorage.getItem(LS_DAA_LAST_EMAIL_LOGIN_EMAIL_V0) || "";
      const normalized = normalizeEmailLoose(last);
      if (normalized) setUsername(normalized);
    } catch {
      // Ignore storage errors (private mode / blocked storage).
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
      window.location.href = safeReturnTo;
    } catch (e) {
      setPasswordErrors({ form: e instanceof Error ? e.message : String(e) });
    } finally {
      setPasswordBusy(false);
    }
  }

  async function requestEmailLink() {
    if (emailDisabled) return;

    setEmailLinkError(null);

    const email = normalizeEmailLoose(username);
    if (!email) {
      setTouched((prev) => ({ ...prev, email: true }));
      return;
    }

    try {
      window.localStorage.setItem(LS_DAA_LAST_EMAIL_LOGIN_EMAIL_V0, email);
    } catch {
      // Ignore storage errors.
    }

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

      const cooldownSeconds = typeof json?.cooldownSeconds === "number" && Number.isFinite(json.cooldownSeconds) ? Math.max(0, Math.floor(json.cooldownSeconds)) : 30;
      setEmailLink({ kind: "sent", email, requestedAtMs: Date.now(), cooldownSeconds });
    } catch (e) {
      setEmailLinkError(e instanceof Error ? e.message : String(e));
      setEmailLink({ kind: "idle" });
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
      {error === "email-link-invalid" ? (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <div className="font-medium">This sign-in link is invalid or has expired.</div>
          <div className="mt-1 text-xs text-destructive/90">Request a new link to continue.</div>
          <div className="mt-2">
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
              Send a new sign-in link
            </Button>
          </div>
        </div>
      ) : null}

      {session.kind === "error" ? (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          Couldn't verify your session. You can still try signing in. ({session.message})
        </div>
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
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      setEmailLinkError(null);
                      setEmailLink((prev) => (prev.kind === "sent" ? { kind: "idle" } : prev));
                    }}
                    autoComplete="email"
                    placeholder="you@example.com"
                    disabled={emailDisabled}
                    onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
                    aria-invalid={emailInvalidEmailLink || undefined}
                    aria-describedby={emailInvalidEmailLink ? emailLinkEmailHelpId : undefined}
                  />
                  {emailInvalidEmailLink ? (
                    <div id={emailLinkEmailHelpId} className="text-xs text-destructive">
                      {emailHelpText}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">We'll send you a single-use sign-in link.</div>
                  )}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button
                    type="submit"
                    className="w-full sm:w-auto"
                    disabled={emailDisabled || !emailLinkFormValid || emailLink.kind === "sent"}
                  >
                    {emailLink.kind === "sending" ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Sending...
                      </span>
                    ) : emailLink.kind === "sent" ? (
                      "Link sent"
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
                  <div className="rounded-md border bg-muted/20 p-3 text-sm">
                    <div className="font-medium">Check your inbox</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      If <span className="font-medium">{emailLink.email}</span> is registered, you'll receive a sign-in link within a minute. It expires in about 15 minutes.
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      Tip: look for an email with subject <span className="font-medium">Your DAA sign-in link</span>.
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
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
                    <div className="mt-2 text-xs text-muted-foreground">Check your spam or promotions folder if you don't see it.</div>
                  </div>
                ) : null}

                {emailLinkError ? (
                  <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                    Couldn't send a sign-in link: {emailLinkError}
                  </div>
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
                    type="email"
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      setEmailLink((prev) => (prev.kind === "sent" ? { kind: "idle" } : prev));
                      setPasswordErrors((prev) => ({ ...prev, email: undefined, form: undefined }));
                    }}
                    autoComplete="email"
                    placeholder="you@example.com"
                    disabled={passwordDisabled}
                    onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
                    aria-invalid={Boolean(mergedPasswordErrors.email) || undefined}
                    aria-describedby={mergedPasswordErrors.email ? passwordEmailHelpId : undefined}
                  />
                  {mergedPasswordErrors.email ? (
                    <div id={passwordEmailHelpId} className="text-xs text-destructive">
                      {mergedPasswordErrors.email}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">Your username is your email address.</div>
                  )}
                </div>

                <div className="grid gap-2">
                  <label htmlFor={passwordId} className="text-sm font-medium">
                    Password
                  </label>
                  <Input
                    id={passwordId}
                    type="password"
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
                    aria-describedby={mergedPasswordErrors.password ? passwordHelpId : undefined}
                  />
                  {mergedPasswordErrors.password ? (
                    <div id={passwordHelpId} className="text-xs text-destructive">
                      {mergedPasswordErrors.password}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">Passwords are case-sensitive.</div>
                  )}
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
                  <div
                    id={formErrorId}
                    role="alert"
                    className="grid gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                  >
                    <div>Couldn't sign you in: {mergedPasswordErrors.form}</div>
                    <div className="text-xs text-muted-foreground">Double-check your email/password or ask an admin to resend/reset your credentials.</div>
                  </div>
                ) : null}
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
