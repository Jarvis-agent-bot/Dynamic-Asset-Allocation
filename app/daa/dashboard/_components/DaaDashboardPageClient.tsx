"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";

import { DaaUnifiedInputBootstrap } from "../../_components/DaaUnifiedInputBootstrap";
import DaaConsoleTab from "../_tabs/DaaConsoleTab";

type MeResponse =
  | {
      ok: true;
      account: { accountId: string; username: string; roles: string[]; status: string };
      session: {
        sessionId: string;
        createdAt: string;
        expiresAt: string;
        revokedAt: string | null;
        lastSeenAt: string | null;
      };
    }
  | { ok: false; error: string };

type AuthModel =
  | { kind: "loading" }
  | { kind: "signedOut" }
  | { kind: "error"; message: string }
  | { kind: "signedIn"; me: Extract<MeResponse, { ok: true }> };

function DaaDashboardHeader() {
  return (
    <div className="space-y-3">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/daa/dashboard">DAA</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>统一控制台</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader title="DAA 控制台" description={<>控制台轻编排：配置 → 采集 → 运行 → 执行。</>} />
    </div>
  );
}

function SignedOutState({ returnTo }: { returnTo: string }) {
  return (
    <Card className="border-muted-foreground/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">需要登录</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm text-muted-foreground">当前会话不可用，请先登录。</div>
        <Button asChild>
          <Link href={`/daa/login?returnTo=${encodeURIComponent(returnTo)}`}>去登录</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function LoadingState() {
  return (
    <Card className="border-muted-foreground/20" role="status" aria-live="polite" aria-busy="true">
      <CardContent className="space-y-3 py-6">
        <span className="sr-only">Loading DAA dashboard session</span>
        <Skeleton className="h-5 w-[220px]" />
        <Skeleton className="h-4 w-[420px]" />
        <Skeleton className="h-9 w-[120px]" />
      </CardContent>
    </Card>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="border-destructive/20" role="alert" aria-live="assertive">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">会话检查失败</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm text-muted-foreground">{message}</div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onRetry}>
            重试
          </Button>
          <Button asChild type="button" variant="secondary">
            <Link href="/daa/login?returnTo=%2Fdaa%2Fdashboard">重新登录</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DaaDashboardPageClient() {
  const searchParams = useSearchParams();
  const notice = searchParams.get("notice");

  useEffect(() => {
    const n = String(notice || "").trim();
    if (n === "signed_in") {
      toast.success("登录成功");
    }

    try {
      const url = new URL(window.location.href);
      let changed = false;

      if (url.searchParams.has("notice")) {
        url.searchParams.delete("notice");
        changed = true;
      }

      // 兼容旧链接：tab 参数不再参与页面分流。
      if (url.searchParams.has("tab")) {
        url.searchParams.delete("tab");
        changed = true;
      }

      if (changed) {
        const next = `${url.pathname}${url.search}${url.hash}`;
        window.history.replaceState({}, "", next);
      }
    } catch {
      // Ignore URL parsing / history errors.
    }
  }, [notice]);

  const [auth, setAuth] = useState<AuthModel>({ kind: "loading" });
  const [authRev, setAuthRev] = useState(0);

  const authRefreshInFlightRef = useRef(false);
  const lastAuthRefreshAtRef = useRef(0);

  useEffect(() => {
    function requestRefresh() {
      const now = Date.now();
      if (authRefreshInFlightRef.current) return;
      if (now - lastAuthRefreshAtRef.current < 2500) return;

      lastAuthRefreshAtRef.current = now;
      authRefreshInFlightRef.current = true;
      setAuthRev((x) => x + 1);
    }

    function onFocus() {
      requestRefresh();
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") requestRefresh();
    }

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const returnTo = useMemo(() => {
    if (typeof window === "undefined") return "/daa/dashboard";
    return `${window.location.pathname}${window.location.search}`;
  }, [authRev]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      authRefreshInFlightRef.current = true;
      lastAuthRefreshAtRef.current = Date.now();

      try {
        const res = await fetch("/api/daa/auth/me", {
          method: "GET",
          headers: { accept: "application/json" },
          cache: "no-store",
        });

        const text = await res.text();
        let json: any = null;
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }

        if (cancelled) return;

        if (res.status === 401) {
          setAuth({ kind: "signedOut" });
          return;
        }

        if (!res.ok) {
          setAuth({ kind: "error", message: String(json?.error ?? `HTTP ${res.status}`) });
          return;
        }

        const payload = json as MeResponse;
        if (!payload?.ok) {
          setAuth({ kind: "signedOut" });
          return;
        }

        setAuth({ kind: "signedIn", me: payload });
      } catch (e) {
        if (cancelled) return;
        setAuth({ kind: "error", message: e instanceof Error ? e.message : String(e) });
      } finally {
        authRefreshInFlightRef.current = false;
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [authRev]);

  const header = <DaaDashboardHeader />;

  if (auth.kind === "loading") {
    return (
      <div className="space-y-4">
        <DaaUnifiedInputBootstrap />
        {header}
        <LoadingState />
      </div>
    );
  }

  if (auth.kind === "signedOut") {
    return (
      <div className="space-y-4">
        <DaaUnifiedInputBootstrap />
        {header}
        <SignedOutState returnTo={returnTo} />
      </div>
    );
  }

  if (auth.kind === "error") {
    return (
      <div className="space-y-4">
        <DaaUnifiedInputBootstrap />
        {header}
        <ErrorState message={auth.message} onRetry={() => setAuthRev((x) => x + 1)} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DaaUnifiedInputBootstrap />
      {header}
      <DaaConsoleTab />
    </div>
  );
}
