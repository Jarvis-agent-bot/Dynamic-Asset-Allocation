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
  | { kind: "signedIn"; me: Extract<MeResponse, { ok: true }> };

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
  if (code === "invalid_credentials") return "账号或密码错误。";
  if (code === "auth_backend_unavailable") return "认证服务不可用，请稍后重试。";
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
  const [redirectingToConsole, setRedirectingToConsole] = useState(false);
  const [refreshingSession, setRefreshingSession] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const n = String(notice || "").trim();
    if (!n) return;

    if (n === "session_expired") toast.error("会话已过期，请重新登录。");
    if (n === "signed_out") toast.success("已退出登录。");
    if (n === "bootstrapped") toast.success("默认账号已初始化，请登录。");
    if (n === "signed_in") toast.success("登录成功。");
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
          // 登录页不阻断：后端短暂异常时仍允许用户直接提交账号密码。
          setSession({ kind: "signedOut" });
          return;
        }

        if (json?.ok) {
          setSession({ kind: "signedIn", me: json });
        } else {
          setSession({ kind: "signedOut" });
        }
      } catch (e) {
        if (cancelled) return;
        setSession({ kind: "signedOut" });
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

  useEffect(() => {
    if (session.kind !== "signedIn") return;
    setRedirectingToConsole(true);
    const timer = window.setTimeout(() => {
      window.location.assign(safeReturnTo);
    }, 60);

    return () => window.clearTimeout(timer);
  }, [safeReturnTo, session.kind]);

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
          toast.error("会话已过期，请重新登录。");
          return;
        }
        throw new Error(parseApiError(json, "HTTP " + res.status));
      }

      if (json?.ok) {
        setSession({ kind: "signedIn", me: json });
        toast.success("会话已刷新。");
        return;
      }

      setSession({ kind: "signedOut" });
      toast.error("会话不可用，请重新登录。");
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
      toast.error(`退出失败：${e instanceof Error ? e.message : String(e)}`);
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
              当前已登录：<span className="font-medium">{session.me.account.username}</span>（{roles}）
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button type="button" className="w-full sm:w-auto" onClick={() => window.location.assign(safeReturnTo)}>
              {redirectingToConsole ? "正在进入控制台..." : "进入控制台"}
            </Button>
            <Button type="button" className="w-full sm:w-auto" variant="secondary" onClick={() => void refreshSession()} disabled={refreshingSession}>
              {refreshingSession ? "刷新中..." : "刷新会话"}
            </Button>
            <Button type="button" className="w-full sm:w-auto" variant="ghost" onClick={() => void logout()}>
              退出登录
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-4 sm:space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">账号密码登录</CardTitle>
          <CardDescription>使用 DAA 管理员账号登录。当前仅保留账号密码模式。</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {session.kind === "checking" ? (
            <div className="inline-flex items-center gap-2 text-xs text-muted-foreground" role="status" aria-live="polite">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在检查会话...
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="daa-login-username">账号</Label>
            <Input
              id="daa-login-username"
              ref={userRef}
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="username"
              placeholder="请输入账号"
              className="border-slate-300 bg-white focus-visible:ring-sky-500"
              value={username}
              disabled={busy || session.kind === "checking"}
              onChange={(e) => {
                setUsername(e.target.value);
                setAuthError(null);
              }}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="daa-login-password">密码</Label>
            <Input
              id="daa-login-password"
              ref={passRef}
              type="password"
              autoComplete="current-password"
              placeholder="请输入密码"
              className="border-slate-300 bg-white focus-visible:ring-sky-500"
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
                登录中...
              </>
            ) : (
              <>
                <ShieldUser className="mr-2 h-4 w-4" />
                登录
              </>
            )}
          </Button>

          <Alert>
            <AlertTitle>本地默认账号</AlertTitle>
            <AlertDescription>
              在非生产环境，首次会自动初始化 <code className="rounded bg-muted px-1 py-0.5">admin / admin123</code>。
            </AlertDescription>
          </Alert>

          <Alert>
            <AlertTitle>需要帮助？</AlertTitle>
            <AlertDescription>
              <Link className="underline underline-offset-2" href="/support">联系支持</Link>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
