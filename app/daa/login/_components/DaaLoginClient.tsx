"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Props = {
  returnTo: string;
};

type FormErrors = {
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

export default function DaaLoginClient({ returnTo }: Props) {
  const usernameId = useId();
  const passwordId = useId();

  const emailHelpId = useId();
  const passwordHelpId = useId();
  const formErrorId = useId();

  const safeReturnTo = useMemo(() => normalizeReturnTo(returnTo), [returnTo]);

  const [session, setSession] = useState<SessionModel>({ kind: "checking" });

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  const [logoutBusy, setLogoutBusy] = useState(false);

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

  async function submit() {
    setBusy(true);
    setErrors({});

    const email = normalizeEmailLoose(username);
    const pwd = password;

    const nextErrors: FormErrors = {};
    if (!email) nextErrors.email = "Enter a valid email address.";
    if (!pwd.trim()) nextErrors.password = "Password is required.";

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setBusy(false);
      return;
    }

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

      if (!res.ok || !json?.ok) {
        const msg = parseApiError(json, `HTTP ${res.status}`);

        // Prefer inline field errors for the common case.
        if (res.status === 401 && msg.toLowerCase().includes("invalid")) {
          setErrors({ password: "Email or password is incorrect." });
          return;
        }

        setErrors({ form: msg });
        return;
      }

      // Cookie is set by the server; redirect into the console.
      window.location.href = safeReturnTo;
    } catch (e) {
      setErrors({ form: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  if (session.kind === "signedIn") {
    const roles = session.me.account.roles?.filter(Boolean).join(", ") || "(no roles)";

    return (
      <div className="mx-auto w-full max-w-md space-y-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">You are already signed in</CardTitle>
            <CardDescription>
              Signed in as <span className="font-medium">{session.me.account.username}</span> ({roles}).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Button asChild>
              <Link href={safeReturnTo}>Continue to dashboard</Link>
            </Button>
            <Button type="button" variant="outline" onClick={() => void logout()} disabled={logoutBusy}>
              {logoutBusy ? "Signing out..." : "Sign out"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-3">
      {session.kind === "error" ? (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          Session check failed: {session.message}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">DAA Login</CardTitle>
          <CardDescription>Sign in to access the /daa/dashboard console.</CardDescription>
        </CardHeader>

        <CardContent>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            aria-busy={busy}
            aria-describedby={errors.form ? formErrorId : undefined}
          >
            <div className="grid gap-2">
              <label htmlFor={usernameId} className="text-sm font-medium">
                Email
              </label>
              <Input
                id={usernameId}
                type="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setErrors((prev) => ({ ...prev, email: undefined, form: undefined }));
                }}
                autoComplete="email"
                placeholder="you@example.com"
                disabled={busy}
                aria-invalid={Boolean(errors.email) || undefined}
                aria-describedby={errors.email ? emailHelpId : undefined}
              />
              {errors.email ? (
                <div id={emailHelpId} className="text-xs text-destructive">
                  {errors.email}
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
                  setErrors((prev) => ({ ...prev, password: undefined, form: undefined }));
                }}
                autoComplete="current-password"
                placeholder="••••••••"
                disabled={busy}
                aria-invalid={Boolean(errors.password) || undefined}
                aria-describedby={errors.password ? passwordHelpId : undefined}
              />
              {errors.password ? (
                <div id={passwordHelpId} className="text-xs text-destructive">
                  {errors.password}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">Passwords are case-sensitive.</div>
              )}
            </div>

            <Button type="submit" disabled={busy}>
              {busy ? (
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
                  • Fresh deployment: bootstrap the first admin via <code className="rounded bg-muted px-1 py-0.5">/api/daa/auth/bootstrap</code> (requires server env{" "}
                  <code className="rounded bg-muted px-1 py-0.5">DAA_AUTH_BOOTSTRAP_TOKEN</code> and sending{" "}
                  <code className="rounded bg-muted px-1 py-0.5">x-daa-bootstrap-token</code>).
                </div>
              </div>
            </details>

            {errors.form ? (
              <div
                id={formErrorId}
                role="alert"
                className="grid gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
              >
                <div>Login failed: {errors.form}</div>
                <div className="text-xs text-muted-foreground">
                  If you keep seeing this, double-check your email/password or ask an admin to resend/reset your credentials.
                </div>
              </div>
            ) : null}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
