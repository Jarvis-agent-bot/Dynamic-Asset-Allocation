"use client";

import Link from "next/link";
import { AlertCircle, Loader2, ShieldUser } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

function parseApiError(json: any, fallback: string): string {
  const msg = typeof json?.error === "string" ? json.error.trim() : "";
  if (msg) return msg;
  return fallback;
}

function normalizeUsernameLoose(raw: string): string {
  const v = raw.trim().toLowerCase();
  if (!v) return "";
  if (v.length > 64) return "";
  if (/\s/.test(v)) return "";
  if (!/^[a-z0-9._@+\-]+$/.test(v)) return "";
  return v;
}

function mapLoginError(message: string): string {
  const code = String(message || "").trim();
  if (code === "invalid_credentials") return "用户名或密码不正确。";
  return code || "登录失败，请重试。";
}

export default function DaaLoginClient({ returnTo, error, notice }: Props) {
  const userRef = useRef<HTMLInputElement | null>(null);
  const passRef = useRef<HTMLInputElement | null>(null);

  const safeReturnTo = useMemo(() => normalizeDaaReturnToV0(returnTo), [returnTo]);

  const [session, setSession] = useState<SessionModel>({ kind: "checking" });
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [busy, setBusy] = useState(false);
  const [refreshingSession, setRefreshingSession] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const n = String(notice || "").trim();
    if (!n) return;

    if (n === "session_expired") toast.error("Session expired. Please sign in again.");
    if (n === "signed_out") toast.success("Signed out.");
    if (n === "bootstrapped") toast.success("Bootstrap complete. Sign in with username + password.");
    if (n === "signed_in") toast.success("Signed in.");
  }, [notice]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const res = await fetch("/api/daa/auth/me", { method: "GET", cache: "no-store", headers: { accept: "application/json" } });
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
    if (session.kind === "signedOut") {
      if (!username) {
        userRef.current?.focus();
      } else if (!password) {
        passRef.current?.focus();
      } else {
        userRef.current?.focus();
      }
    }
  }, [session.kind, username, password]);

  useEffect(() => {
    const msg = String(error || "").trim();
    if (!msg) return;
    setAuthError(mapLoginError(msg));
  }, [error]);

  async function login() {
    if (busy || session.kind === "checking") return;

    const normalized = normalizeUsernameLoose(username);
    if (!normalized || !password.trim()) {
      setAuthError("请填写有效的用户名和密码。");
      if (!normalized) userRef.current?.focus();
      else passRef.current?.focus();
      return;
    }

    setBusy(true);
    setAuthError(null);

    try {
      const res = await fetch("/api/daa/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ username: normalized, password, returnTo: safeReturnTo }),
      });

      const text = await res.text().catch(() => "");
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }

      if (!res.ok || !json?.ok) {
        setAuthError(mapLoginError(parseApiError(json, `HTTP ${res.status}`)));
        return;
      }

      const redirectTo = normalizeDaaReturnToV0(typeof json?.redirectTo === "string" ? json.redirectTo : appendNoticeParamV0(safeReturnTo, "signed_in"));
      window.location.href = redirectTo;
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }


  async function refreshSession() {
    if (refreshingSession) return;
    setRefreshingSession(true);
    try {
      const res = await fetch("/api/daa/auth/me", { method: "GET", cache: "no-store", headers: { accept: "application/json" } });
      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }

      if (!res.ok) {
        if (res.status === 401) {
          setSession({ kind: "signedOut" });
          toast.error("Session expired. Please sign in again.");
          return;
        }
        throw new Error(parseApiError(json, "HTTP " + res.status));
      }

      if (json?.ok) {
        setSession({ kind: "signedIn", me: json });
        toast.success("Session refreshed.");
        return;
      }

      setSession({ kind: "signedOut" });
      toast.error("Session unavailable. Please sign in again.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshingSession(false);
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
            <Button type="button" className="w-full sm:w-auto" variant="outline" onClick={() => void refreshSession()} disabled={refreshingSession}>
              {refreshingSession ? "Refreshing..." : "Refresh session"}
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
          <CardTitle className="text-xl">Sign in with username + password</CardTitle>
          <CardDescription>DAA test-stage auth is now password-only. Email OTP login has been disabled.</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {session.kind === "checking" ? (
            <div className="inline-flex items-center gap-2 text-xs text-muted-foreground" role="status" aria-live="polite">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking session...
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="daa-login-username">Username</Label>
            <Input
              id="daa-login-username"
              ref={userRef}
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="username"
              placeholder="admin"
              value={username}
              disabled={busy || session.kind === "checking"}
              onChange={(e) => {
                setUsername(e.target.value);
                setAuthError(null);
              }}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="daa-login-password">Password</Label>
            <Input
              id="daa-login-password"
              ref={passRef}
              type="password"
              autoComplete="current-password"
              placeholder="Enter password"
              value={password}
              disabled={busy || session.kind === "checking"}
              onChange={(e) => {
                setPassword(e.target.value);
                setAuthError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void login();
                }
              }}
            />
          </div>

          {authError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{authError}</AlertDescription>
            </Alert>
          ) : null}

          <Button type="button" className="w-full" onClick={() => void login()} disabled={busy || session.kind === "checking"}>
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              <>
                <ShieldUser className="mr-2 h-4 w-4" />
                Sign in
              </>
            )}
          </Button>

          <div className="rounded-md border border-dashed border-muted-foreground/30 p-3 text-xs text-muted-foreground">
            <div className="font-medium text-foreground">Dev/Test default account</div>
            <div className="mt-1">
              In non-production, the first login auto-bootstraps <code className="rounded bg-muted px-1 py-0.5">admin / admin123</code> when no account exists yet.
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
