"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2, LogOut, RefreshCcw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { SectionCard } from "@/app/daa/dashboard/settings/_components/SettingsFormPrimitives";
import {
  getBrokerSessionState,
  logoutBrokerSession,
  startBrokerSession,
  syncBrokerOrdersNow,
  type StoreBrokerOrderSyncResult,
  type StoreBrokerSessionState,
} from "@/src/daa/modules/store/storeApi";

function toneClass(status: StoreBrokerSessionState["status"]): string {
  if (status === "authenticated") return "bg-emerald-500/10 text-emerald-400";
  if (status === "pending_login" || status === "expiring") return "bg-amber-500/10 text-amber-400";
  if (status === "connector_down" || status === "reauth_required") return "bg-rose-500/10 text-rose-400";
  return "bg-zinc-500/10 text-zinc-400";
}

function statusLabel(status: StoreBrokerSessionState["status"]): string {
  if (status === "authenticated") return "已连接";
  if (status === "pending_login") return "等待登录";
  if (status === "expiring") return "会话将过期";
  if (status === "reauth_required") return "需要重新认证";
  if (status === "connector_down") return "Connector 不可用";
  return "未连接";
}

export function SettingsBrokerSessionCard() {
  const [session, setSession] = useState<StoreBrokerSessionState | null>(null);
  const [syncResult, setSyncResult] = useState<StoreBrokerOrderSyncResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"" | "refresh" | "start" | "logout" | "sync">("");

  const load = useCallback(async () => {
    setBusy("refresh");
    try {
      const next = await getBrokerSessionState();
      setSession(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载 Broker 会话失败");
    } finally {
      setLoading(false);
      setBusy("");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleStart = useCallback(async () => {
    setBusy("start");
    try {
      const next = await startBrokerSession();
      setSession(next);
      if (next.loginUrl) {
        window.open(next.loginUrl, "_blank", "noopener,noreferrer");
      }
      toast.success(next.loginUrl ? "已打开 Broker 登录页" : "已发起 Broker 登录");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "发起 Broker 登录失败");
    } finally {
      setBusy("");
    }
  }, []);

  const handleLogout = useCallback(async () => {
    setBusy("logout");
    try {
      const next = await logoutBrokerSession();
      setSession(next);
      toast.success("已请求断开 Broker 连接");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "断开 Broker 连接失败");
    } finally {
      setBusy("");
    }
  }, []);

  const handleSync = useCallback(async () => {
    setBusy("sync");
    try {
      const result = await syncBrokerOrdersNow({ scope: "open" });
      setSyncResult(result);
      toast.success(`已同步 ${result.updatedCount} 笔订单，刷新 ${result.positionCount} 个持仓快照`);
      const next = await getBrokerSessionState();
      setSession(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "订单同步失败");
    } finally {
      setBusy("");
    }
  }, []);

  return (
    <SectionCard
      title="Broker 会话"
      description="通过浏览器跳转登录，不保存 IBKR 用户名和密码；这里只看会话状态、登录入口和订单同步。"
    >
      {loading && !session ? (
        <div className="py-6 text-sm text-[var(--muted)]">加载 Broker 会话状态…</div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${toneClass(session?.status || "disconnected")}`}>
                {statusLabel(session?.status || "disconnected")}
              </span>
              <span className="text-xs text-[var(--faint)]">
                账户 {session?.accountId || "-"}
              </span>
              <span className="text-xs text-[var(--faint)]">
                更新时间 {session?.updatedAt || "-"}
              </span>
            </div>
            <div className="mt-3 text-sm leading-6 text-[var(--muted)]">
              {session?.message || "当前还没有检测到 Broker Connector 会话。"}
            </div>
            {session?.lastError ? (
              <div className="mt-2 text-xs leading-5 text-rose-400">
                最近错误：{session.lastError}
              </div>
            ) : null}
            {session?.loginUrl ? (
              <div className="mt-2 text-xs leading-5 text-[var(--faint)]">
                登录入口：{session.loginUrl}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={Boolean(busy)}
              className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] transition-colors hover:text-[var(--text)] disabled:opacity-50"
            >
              <RefreshCcw className={`h-3.5 w-3.5 ${busy === "refresh" ? "animate-spin" : ""}`} />
              刷新状态
            </button>
            <button
              type="button"
              onClick={() => void handleStart()}
              disabled={Boolean(busy)}
              className="inline-flex items-center gap-2 rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-medium text-[var(--bg)] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Link2 className="h-3.5 w-3.5" />
              开始登录
            </button>
            <button
              type="button"
              onClick={() => void handleSync()}
              disabled={Boolean(busy)}
              className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] transition-colors hover:text-[var(--text)] disabled:opacity-50"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              立即同步订单
            </button>
            <button
              type="button"
              onClick={() => void handleLogout()}
              disabled={Boolean(busy)}
              className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] transition-colors hover:text-rose-400 disabled:opacity-50"
            >
              <LogOut className="h-3.5 w-3.5" />
              退出连接
            </button>
          </div>

          {syncResult ? (
            <div className="rounded-lg border border-dashed border-[var(--border)] px-3 py-2.5 text-xs leading-5 text-[var(--faint)]">
              最近一次同步：范围 {syncResult.scope}，扫描 {syncResult.orderCount} 笔远端订单，更新 {syncResult.updatedCount} 笔本地 ticket，持仓快照 {syncResult.positionCount} 项。
            </div>
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}
