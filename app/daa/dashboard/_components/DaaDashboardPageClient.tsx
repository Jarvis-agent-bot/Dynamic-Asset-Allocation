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
import DaaSettingsTab from "../_tabs/DaaSettingsTab";
import DaaUnifiedArchitectureTab from "../_tabs/DaaUnifiedArchitectureTab";

type Tab = "unified-core" | "settings";

function normalizeTab(raw: string | null): Tab {
  if (raw === "unified-core") return "unified-core";
  if (raw === "settings") return "settings";
  return "unified-core";
}

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

function DaaDashboardHeader({ tab }: { tab: Tab }) {
  const title = tab === "unified-core" ? "控制台" : "Settings";

  const desc =
    tab === "unified-core" ? (
      <>DAA 一体化控制台：再平衡算法 + 人因评价 + 风控执行。</>
    ) : (
      <>账号、会话与权限信息。</>
    );

  return (
    <div className="space-y-3">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/daa/dashboard?tab=unified-core">DAA</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader
        title={title}
        description={desc}
        actions={
          <>
            {tab !== "unified-core" ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/daa/dashboard?tab=unified-core">控制台</Link>
              </Button>
            ) : null}
            {tab !== "settings" ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/daa/dashboard?tab=settings">Settings</Link>
              </Button>
            ) : null}
          </>
        }
      />
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
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/daa/login?returnTo=${encodeURIComponent(returnTo)}`}>去登录</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/daa/login?returnTo=%2Fdaa%2Fdashboard%3Ftab%3Dunified-core">登录页</Link>
          </Button>
        </div>
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
        <div className="flex gap-2">
          <Skeleton className="h-9 w-[120px]" />
          <Skeleton className="h-9 w-[120px]" />
        </div>
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
            <Link href="/daa/login?returnTo=%2Fdaa%2Fdashboard%3Ftab%3Dunified-core">重新登录</Link>
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
    if (!n) return;

    if (n === "signed_in") {
      toast.success("Signed in.");
    }

    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("notice");
      window.history.replaceState({}, "", url.toString());
    } catch {
      // Ignore URL parsing / history errors.
    }
  }, [notice]);

  const tab = normalizeTab(searchParams.get("tab"));
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
    if (typeof window === "undefined") return "/daa/dashboard?tab=unified-core";
    return `${window.location.pathname}${window.location.search}`;
  }, [tab, authRev]);

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

  const header = <DaaDashboardHeader tab={tab} />;

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

  const content = tab === "settings" ? <DaaSettingsTab me={auth.me} returnTo={returnTo} /> : <DaaUnifiedArchitectureTab />;

  return (
    <div className="space-y-4">
      <DaaUnifiedInputBootstrap />
      {header}
      {content}
    </div>
  );
}
