"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { appendNoticeParam, normalizeDaaReturnTo } from "@/src/daa/url";
import { fetchDaaAuthSession, type DaaAuthMePayload } from "@/app/daa/_components/daaAuthSessionClient";
import { DAA_BRAND_ICON_PATH, DAA_BRAND_NAME } from "@/src/daa/brand";
import { logSwallowed } from "@/src/daa/utils/logSwallowed";
import packageJson from "@/package.json";

type Props = {
  returnTo: string;
  error?: string;
  notice?: string;
};

type SessionModel =
  | { kind: "checking" }
  | { kind: "signedOut" }
  | { kind: "signedIn"; me: DaaAuthMePayload };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readNestedString(value: unknown, path: string[]): string {
  let current: unknown = value;
  for (const key of path) {
    if (!isRecord(current)) return "";
    current = current[key];
  }
  return typeof current === "string" ? current.trim() : "";
}

function parseJsonText(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (err) {
    logSwallowed("DaaLoginClient.parseJson", err);
    return null;
  }
}

function isOkApiPayload(value: unknown): boolean {
  return isRecord(value) && value.ok === true;
}

function readRedirectTo(value: unknown): string | undefined {
  const redirectTo = readNestedString(value, ["data", "redirectTo"]);
  return redirectTo || undefined;
}

function parseApiError(json: unknown, fallback: string): string {
  const message = readNestedString(json, ["error", "message"]);
  if (message) return message;
  const fallbackError = readNestedString(json, ["error"]);
  if (fallbackError) return fallbackError;
  const detail = readNestedString(json, ["error", "details", "message"]);
  if (detail) return detail;
  return fallback;
}

function mapLoginError(message: string): string {
  const code = String(message || "").trim();
  if (code === "invalid_credentials") return "账号或密码错误。";
  if (code === "auth_backend_unavailable") return "认证服务不可用，请稍后重试。";
  if (code === "Invalid login credentials") return "账号或密码错误。";
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
  const [redirectingToWorkbench, setRedirectingToWorkbench] = useState(false);
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
    setRedirectingToWorkbench(true);
    const timer = window.setTimeout(() => { window.location.assign(safeReturnTo); }, 60);
    return () => window.clearTimeout(timer);
  }, [safeReturnTo, session.kind]);

  async function login() {
    if (busy || session.kind === "checking") return;
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password.trim()) {
      setAuthError("请填写有效的账号和密码。");
      if (!trimmedEmail) emailRef.current?.focus();
      else passRef.current?.focus();
      return;
    }
    setBusy(true);
    setAuthError(null);
    try {
      const response = await fetch("/api/daa/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ username: trimmedEmail, password, returnTo: safeReturnTo }),
      });
      const text = await response.text().catch(() => "");
      const json = parseJsonText(text);
      if (!response.ok || !isOkApiPayload(json)) { setAuthError(mapLoginError(parseApiError(json, `HTTP ${response.status}`))); return; }
      const redirectTo = normalizeDaaReturnTo(readRedirectTo(json) ?? appendNoticeParam(safeReturnTo, "signed_in"));
      window.location.href = redirectTo;
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try {
      const response = await fetch("/api/daa/auth/logout", { method: "POST", headers: { accept: "application/json" } });
      const text = await response.text();
      const json = parseJsonText(text);
      if (!response.ok || !isOkApiPayload(json)) throw new Error(parseApiError(json, `HTTP ${response.status}`));
      window.location.href = appendNoticeParam("/daa/login", "signed_out");
    } catch (error) {
      toast.error(`退出失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (session.kind === "signedIn") {
    const roles = session.me.account.roles?.filter(Boolean).join(", ") || "(no roles)";
    return (
      <div className="flex min-h-svh items-center justify-center bg-[var(--bg)] px-4 text-[var(--text)]">
        <div className="w-full max-w-sm space-y-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-6">
          <div>
            <div className="text-base font-semibold">
              已登录
            </div>
            <div className="mt-1 text-sm text-[var(--muted)]">
              当前用户：<span className="font-medium text-[var(--text)]">{session.me.account.username}</span>（{roles}）
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => window.location.assign(safeReturnTo)}
              className="w-full rounded-[var(--radius-sm)] bg-[var(--primary)] py-2.5 text-sm font-semibold text-[var(--bg)] transition-opacity hover:opacity-90"
            >
              {redirectingToWorkbench ? "正在进入..." : "进入资产首页"}
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="w-full py-2 text-sm text-[var(--faint)] transition-opacity hover:opacity-70"
            >
              退出登录
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh bg-[var(--bg)] text-[var(--text)]">
      <div className="relative hidden overflow-hidden border-r border-[var(--border)] bg-[var(--surface)] lg:flex lg:w-[46%] lg:flex-col lg:justify-between lg:p-10 xl:p-12">
        <div className="relative z-10 flex items-center gap-3">
          <img
            src={DAA_BRAND_ICON_PATH}
            alt=""
            aria-hidden="true"
            className="h-8 w-8 rounded-[var(--radius-sm)] object-cover"
          />
          <span className="text-base font-semibold">
            {DAA_BRAND_NAME}
          </span>
        </div>

        <div className="relative z-10 space-y-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-normal text-[var(--amber)]">
            <span className="inline-block h-px w-6 bg-[var(--amber)]" />
            投研工作台入口
          </div>
          <h1 className="max-w-md text-[32px] font-semibold leading-tight text-[var(--text)]">
            先复核组合状态，再进入调仓执行。
          </h1>
          <p className="max-w-md text-sm leading-6 text-[var(--muted)]">
            查看组合状态、复核判断，并执行经过风控校验的本地模拟调仓。
          </p>
        </div>

        <div className="relative z-10 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]">
          {[
            { label: "会话认证", value: "本地账号", detail: "HttpOnly 会话" },
            { label: "执行校验", value: "风控前置", detail: "下单前复核" },
            { label: "组合动作", value: "人工确认", detail: "复核后执行" },
          ].map((row, index) => (
            <div
              key={row.label}
              className={index === 0 ? "grid grid-cols-[108px_1fr] gap-3 px-3.5 py-3" : "grid grid-cols-[108px_1fr] gap-3 border-t border-[var(--border)] px-3.5 py-3"}
            >
              <div className="text-[11px] font-semibold uppercase tracking-normal text-[var(--faint)]">
                {row.label}
              </div>
              <div className="min-w-0">
                <div className="font-[var(--font-mono)] text-sm text-[var(--text)]">{row.value}</div>
                <div className="mt-0.5 text-xs text-[var(--muted)]">{row.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="relative flex flex-1 items-start justify-center bg-[var(--bg)] px-6 pt-8 pb-6 lg:px-16 lg:pt-24">
        <div className="relative z-10 w-full max-w-[380px] space-y-5">
          <div className="flex items-center gap-2.5 lg:hidden">
            <img
              src={DAA_BRAND_ICON_PATH}
              alt=""
              aria-hidden="true"
              className="h-7 w-7 rounded-[var(--radius-sm)] object-cover"
            />
            <span className="text-base font-semibold">
              {DAA_BRAND_NAME}
            </span>
          </div>

          <div>
            <h2 className="text-xl font-semibold">
              登录工作台
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              进入组合复核、再平衡与交易记录。
            </p>
          </div>

          <form
            className="space-y-3.5"
            onSubmit={(event) => { event.preventDefault(); void login(); }}
          >
            {session.kind === "checking" && (
              <div
                className="inline-flex items-center gap-2 text-xs text-[var(--faint)]"
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
                className="block text-[11px] font-semibold uppercase tracking-normal text-[var(--faint)]"
              >
                账号 / 邮箱
              </label>
              <input
                id="daa-login-email"
                ref={emailRef}
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="username"
                placeholder="admin@example.com"
                value={email}
                disabled={busy || session.kind === "checking"}
                onChange={(event) => { setEmail(event.target.value); setAuthError(null); }}
                className="min-h-11 w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--elevated)] px-3.5 py-2.5 text-sm text-[var(--text)] outline-none transition-[border-color,box-shadow] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-bg)] disabled:opacity-50"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="daa-login-password"
                className="block text-[11px] font-semibold uppercase tracking-normal text-[var(--faint)]"
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
                onChange={(event) => { setPassword(event.target.value); setAuthError(null); }}
                className="min-h-11 w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--elevated)] px-3.5 py-2.5 font-[var(--font-mono)] text-sm tracking-normal text-[var(--text)] outline-none transition-[border-color,box-shadow] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary-bg)] disabled:opacity-50"
              />
            </div>

            {authError && (
              <div className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2.5 text-sm text-[var(--danger)]">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={busy || session.kind === "checking"}
              className="min-h-11 w-full rounded-[var(--radius-sm)] bg-[var(--primary)] py-2.5 text-sm font-semibold text-[var(--bg)] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  登录中...
                </span>
              ) : (
                "登录工作台"
              )}
            </button>
          </form>

          <div className="space-y-1.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--elevated)] p-3">
            <div className="text-[10px] font-semibold uppercase tracking-normal text-[var(--faint)]">
              认证说明
            </div>
            <p className="text-xs leading-5 text-[var(--muted)]">
              使用本地 DAA 账号登录。密码仅用于本次认证，服务端保存 scrypt 哈希与 HttpOnly 会话。
            </p>
          </div>

          <div className="flex items-center border-t border-[var(--border)] pt-2 text-[11px] text-[var(--faint)]">
            <span>{DAA_BRAND_NAME} v{packageJson.version}</span>
          </div>

        </div>
      </div>
    </div>
  );
}
