"use client";

import Link from "next/link";
import { AlertCircle, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { appendNoticeParam, normalizeDaaReturnTo } from "@/src/daa/url";
import { fetchDaaAuthSession, type DaaAuthMePayload } from "@/app/daa/_components/daaAuthSessionClient";
import { DAA_BRAND_NAME } from "@/src/daa/brand";

type Props = {
  returnTo: string;
  error?: string;
  notice?: string;
};

type SessionModel =
  | { kind: "checking" }
  | { kind: "signedOut" }
  | { kind: "signedIn"; me: DaaAuthMePayload };

function parseApiError(json: any, fallback: string): string {
  const message = typeof json?.error?.message === "string" ? json.error.message.trim() : "";
  if (message) return message;
  const fallbackError = typeof json?.error === "string" ? json.error.trim() : "";
  if (fallbackError) return fallbackError;
  const detail = typeof json?.error?.details?.message === "string" ? json.error.details.message.trim() : "";
  if (detail) return detail;
  return fallback;
}

function mapLoginError(message: string): string {
  const code = String(message || "").trim();
  if (code === "invalid_credentials") return "用户名/邮箱或密码错误。";
  if (code === "auth_backend_unavailable") return "认证服务不可用，请稍后重试。";
  if (code === "Invalid login credentials") return "用户名/邮箱或密码错误。";
  return code || "登录失败，请重试。";
}

export default function DaaLoginClient({ returnTo, error, notice }: Props) {
  const emailRef = useRef<HTMLInputElement | null>(null);
  const passRef = useRef<HTMLInputElement | null>(null);

  const safeReturnTo = useMemo(() => normalizeDaaReturnTo(returnTo), [returnTo]);

  const [session, setSession] = useState<SessionModel>({ kind: "checking" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [redirectingToDashboard, setRedirectingToDashboard] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const n = String(notice || "").trim();
    if (!n) return;
    if (n === "session_expired") toast.error("会话已过期，请重新登录。");
    if (n === "signed_out") toast.success("已退出登录。");
    if (n === "signed_in") toast.success("登录成功。");
  }, [notice]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const result = await fetchDaaAuthSession({ silent: true });
      if (cancelled) return;
      if (result.kind === "signedIn") { setSession({ kind: "signedIn", me: result.me }); return; }
      setSession({ kind: "signedOut" });
    }
    void run();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (session.kind === "signedOut") {
      emailRef.current?.focus();
    }
  }, [session.kind]);

  useEffect(() => {
    const msg = String(error || "").trim();
    if (!msg) return;
    setAuthError(mapLoginError(msg));
  }, [error]);

  useEffect(() => {
    if (session.kind !== "signedIn") return;
    setRedirectingToDashboard(true);
    const timer = window.setTimeout(() => { window.location.assign(safeReturnTo); }, 60);
    return () => window.clearTimeout(timer);
  }, [safeReturnTo, session.kind]);

  async function login() {
    if (busy || session.kind === "checking") return;
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password.trim()) {
      setAuthError("请填写有效的用户名/邮箱和密码。");
      if (!trimmedEmail) emailRef.current?.focus();
      else passRef.current?.focus();
      return;
    }
    setBusy(true);
    setAuthError(null);
    try {
      const res = await fetch("/api/daa/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ email: trimmedEmail, password, returnTo: safeReturnTo }),
      });
      const text = await res.text().catch(() => "");
      let json: any = null;
      try { json = JSON.parse(text); } catch { json = null; }
      if (!res.ok || !json?.ok) { setAuthError(mapLoginError(parseApiError(json, `HTTP ${res.status}`))); return; }
      const redirectTo = normalizeDaaReturnTo(typeof json?.data?.redirectTo === "string" ? json.data.redirectTo : appendNoticeParam(safeReturnTo, "signed_in"));
      window.location.href = redirectTo;
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try {
      const res = await fetch("/api/daa/auth/logout", { method: "POST", headers: { accept: "application/json" } });
      const text = await res.text();
      let json: any = null;
      try { json = JSON.parse(text); } catch { json = null; }
      if (!res.ok || !json?.ok) throw new Error(parseApiError(json, `HTTP ${res.status}`));
      window.location.href = appendNoticeParam("/daa/login", "signed_out");
    } catch (e) {
      toast.error(`退出失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /* -- Already signed in -- */
  if (session.kind === "signedIn") {
    const roles = session.me.account.roles?.filter(Boolean).join(", ") || "(no roles)";
    return (
      <div
        className="flex min-h-svh items-center justify-center px-4"
        style={{ background: "var(--bg)" }}
      >
        <div
          className="w-full max-w-sm rounded-xl border p-6 space-y-4"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <div>
            <div className="text-base font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              已登录
            </div>
            <div className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
              当前用户：<span className="font-medium" style={{ color: "var(--text)" }}>{session.me.account.username}</span>（{roles}）
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => window.location.assign(safeReturnTo)}
              className="w-full rounded-md py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ background: "var(--primary)", color: "var(--bg)" }}
            >
              {redirectingToDashboard ? "正在进入..." : "进入资产首页"}
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="w-full py-2 text-sm transition-opacity hover:opacity-70"
              style={{ color: "var(--faint)" }}
            >
              退出登录
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* -- Login form -- */
  return (
    <div className="flex min-h-svh" style={{ background: "var(--bg)" }}>

      {/* LEFT — hero panel */}
      <div
        className="relative hidden overflow-hidden lg:flex lg:w-[52%] lg:flex-col lg:justify-between lg:p-14"
        style={{ background: "var(--surface)" }}
      >
        {/* Glow effects */}
        <div
          className="pointer-events-none absolute"
          style={{
            top: "-200px", left: "-200px", width: "600px", height: "600px",
            background: "radial-gradient(circle, rgba(56,189,248,0.10) 0%, transparent 70%)",
          }}
        />
        <div
          className="pointer-events-none absolute"
          style={{
            bottom: "-100px", right: "-100px", width: "400px", height: "400px",
            background: "radial-gradient(circle, rgba(246,173,85,0.07) 0%, transparent 70%)",
          }}
        />
        {/* Dot grid */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(56,189,248,0.06) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />

        {/* Brand */}
        <div className="relative z-10 flex items-center gap-3">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-md text-sm font-bold text-white"
            style={{
              background: "linear-gradient(135deg, #38BDF8, #818CF8)",
              fontFamily: "var(--font-mono)",
            }}
          >
            D
          </div>
          <span
            className="text-lg font-semibold tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {DAA_BRAND_NAME}
          </span>
        </div>

        {/* Hero copy */}
        <div className="relative z-10 space-y-5">
          <div
            className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest"
            style={{ color: "var(--amber)" }}
          >
            <span className="inline-block h-px w-6" style={{ background: "var(--amber)" }} />
            动态资产配置系统
          </div>
          <h1
            className="text-5xl leading-[1.05] tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            智能<em className="not-italic" style={{ color: "var(--primary)" }}>配置，</em>
            <br />
            精准<em className="not-italic" style={{ color: "var(--primary)" }}>决策。</em>
          </h1>
          <p className="max-w-sm text-[15px] leading-relaxed" style={{ color: "var(--muted)" }}>
            基于多信号融合与量化模型，实现资产组合的动态再平衡与风险管理。
          </p>
        </div>

        {/* Stats */}
        <div
          className="relative z-10 flex gap-10 pt-8"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          {[
            { value: "¥2.34M", label: "资产规模" },
            { value: "+18.6%", label: "年化收益" },
            { value: "0.92", label: "夏普比率" },
          ].map((s) => (
            <div key={s.label}>
              <div
                className="text-xl font-medium tracking-tight"
                style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}
              >
                {s.value}
              </div>
              <div
                className="mt-0.5 text-[11px] font-semibold uppercase tracking-widest"
                style={{ color: "var(--faint)" }}
              >
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT — form */}
      <div
        className="relative flex flex-1 items-center justify-center px-6 py-12 lg:px-16"
        style={{ background: "var(--bg)" }}
      >
        {/* Subtle dot grid */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(56,189,248,0.04) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />

        <div className="relative z-10 w-full max-w-[360px] space-y-7">

          {/* Mobile brand */}
          <div className="flex items-center gap-2.5 lg:hidden">
            <div
              className="flex h-7 w-7 items-center justify-center rounded text-xs font-bold text-white"
              style={{ background: "linear-gradient(135deg, #38BDF8, #818CF8)", fontFamily: "var(--font-mono)" }}
            >
              D
            </div>
            <span className="text-base font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              {DAA_BRAND_NAME}
            </span>
          </div>

          {/* Heading */}
          <div>
            <h2
              className="text-2xl font-semibold tracking-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              欢迎回来
            </h2>
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
              登录以访问您的投资组合管理中心
            </p>
          </div>

          {/* Form */}
          <form
            className="space-y-4"
            onSubmit={(e) => { e.preventDefault(); void login(); }}
          >
            {session.kind === "checking" && (
              <div
                className="inline-flex items-center gap-2 text-xs"
                style={{ color: "var(--faint)" }}
                role="status"
                aria-live="polite"
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                正在检查会话...
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="daa-login-email"
                className="block text-[11px] font-semibold uppercase tracking-widest"
                style={{ color: "var(--faint)" }}
              >
                用户名或邮箱
              </label>
              <input
                id="daa-login-email"
                ref={emailRef}
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="username"
                placeholder="admin 或 you@example.com"
                value={email}
                disabled={busy || session.kind === "checking"}
                onChange={(e) => { setEmail(e.target.value); setAuthError(null); }}
                className="w-full rounded-md border px-3.5 py-2.5 text-sm outline-none transition-all disabled:opacity-50"
                style={{
                  background: "var(--elevated)",
                  borderColor: "var(--border-strong)",
                  color: "var(--text)",
                }}
                onFocus={(e) => { e.target.style.borderColor = "var(--primary)"; e.target.style.boxShadow = "0 0 0 3px rgba(56,189,248,0.12)"; }}
                onBlur={(e) => { e.target.style.borderColor = "var(--border-strong)"; e.target.style.boxShadow = "none"; }}
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="daa-login-password"
                className="block text-[11px] font-semibold uppercase tracking-widest"
                style={{ color: "var(--faint)" }}
              >
                密码
              </label>
              <input
                id="daa-login-password"
                ref={passRef}
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                disabled={busy || session.kind === "checking"}
                onChange={(e) => { setPassword(e.target.value); setAuthError(null); }}
                className="w-full rounded-md border px-3.5 py-2.5 text-sm outline-none transition-all disabled:opacity-50"
                style={{
                  background: "var(--elevated)",
                  borderColor: "var(--border-strong)",
                  color: "var(--text)",
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.06em",
                }}
                onFocus={(e) => { e.target.style.borderColor = "var(--primary)"; e.target.style.boxShadow = "0 0 0 3px rgba(56,189,248,0.12)"; }}
                onBlur={(e) => { e.target.style.borderColor = "var(--border-strong)"; e.target.style.boxShadow = "none"; }}
              />
            </div>

            {authError && (
              <div
                className="flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm"
                style={{
                  background: "rgba(248,113,113,0.08)",
                  borderColor: "rgba(248,113,113,0.25)",
                  color: "var(--danger)",
                }}
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={busy || session.kind === "checking"}
              className="w-full rounded-md py-2.5 text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: "var(--primary)", color: "var(--bg)" }}
            >
              {busy ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  登录中...
                </span>
              ) : (
                "登录系统 →"
              )}
            </button>
          </form>

          {/* System info */}
          <div
            className="rounded-md border p-3.5 space-y-2"
            style={{ background: "var(--elevated)", borderColor: "var(--border)" }}
          >
            <div
              className="text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: "var(--faint)" }}
            >
              认证说明
            </div>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              使用 DAA 本地认证登录。测试环境支持用户名或邮箱；账号需要先在当前数据环境中存在，系统不会自动补默认账号。
            </p>
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-between pt-2 text-[11px]"
            style={{ color: "var(--faint)", borderTop: "1px solid var(--border)" }}
          >
            <span>DAA 控制台 v2.0</span>
            <Link href="/support" className="hover:underline">
              需要帮助？
            </Link>
          </div>

        </div>
      </div>
    </div>
  );
}
