"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { useEffect, useMemo, useState } from "react";

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

import DaaSettingsTab from "../../_tabs/DaaSettingsTab";

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

function LoadingState() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Loading</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">Loading settings…</CardContent>
    </Card>
  );
}

function SignedOutState({ returnTo }: { returnTo: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Signed out</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        <div className="text-sm text-muted-foreground">Your session expired. Sign in again to continue.</div>
        <Button asChild size="sm">
          <Link href={`/daa/login?returnTo=${encodeURIComponent(returnTo)}`}>Sign in</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Error</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm text-muted-foreground">Failed to load settings: {message}</div>
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}

export default function DaaDashboardSettingsPageClient() {
  const searchParams = useSearchParams();

  // Preserve any query string so login can bounce back to the same place.
  const returnTo = useMemo(() => {
    if (typeof window === "undefined") return "/daa/dashboard/settings";
    return `${window.location.pathname}${window.location.search}`;
  }, [searchParams]);

  const [auth, setAuth] = useState<AuthModel>({ kind: "loading" });
  const [authRev, setAuthRev] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/daa/auth/me", {
          method: "GET",
          headers: { accept: "application/json" },
          cache: "no-store",
        });

        if (cancelled) return;

        if (res.status === 401) {
          setAuth({ kind: "signedOut" });
          return;
        }

        const text = await res.text();
        let json: any = null;
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
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
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [authRev]);

  return (
    <div className="space-y-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/daa/dashboard">DAA</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Settings</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader title="Settings" description="Account and session details for DAA. Canonical entry remains /daa/dashboard." />

      {auth.kind === "loading" ? (
        <LoadingState />
      ) : auth.kind === "signedOut" ? (
        <SignedOutState returnTo={returnTo} />
      ) : auth.kind === "error" ? (
        <ErrorState message={auth.message} onRetry={() => setAuthRev((x) => x + 1)} />
      ) : (
        <DaaSettingsTab me={auth.me} returnTo={returnTo} />
      )}
    </div>
  );
}
