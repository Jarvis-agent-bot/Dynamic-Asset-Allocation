"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type MeResponse =
  | {
      ok: true;
      account: { accountId: string; username: string; roles: string[]; status: string };
      session: { sessionId: string; createdAt: string; expiresAt: string; revokedAt: string | null; lastSeenAt: string | null };
    }
  | { ok: false; error: string };

type Model =
  | { kind: "loading" }
  | { kind: "signedOut" }
  | { kind: "error"; message: string }
  | { kind: "signedIn"; me: Extract<MeResponse, { ok: true }> };

function formatRoles(roles: string[]): string {
  const xs = Array.isArray(roles) ? roles.filter(Boolean) : [];
  if (xs.length === 0) return "(no roles)";
  return xs.join(", ");
}

export default function DaaSessionBanner() {
  const [model, setModel] = useState<Model>({ kind: "loading" });
  const [rev, setRev] = useState(0);
  const [logoutBusy, setLogoutBusy] = useState(false);

  const returnTo = useMemo(() => {
    if (typeof window === "undefined") return "/daa/dashboard";
    return `${window.location.pathname}${window.location.search}`;
  }, [rev]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const res = await fetch("/api/daa/auth/me", {
          method: "GET",
          headers: { accept: "application/json" },
        });

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
            setModel({ kind: "signedOut" });
            return;
          }
          const msg = String(json?.error ?? `HTTP ${res.status}`);
          setModel({ kind: "error", message: msg });
          return;
        }

        const payload = json as MeResponse;
        if (!payload?.ok) {
          setModel({ kind: "signedOut" });
          return;
        }

        setModel({ kind: "signedIn", me: payload });
      } catch (e) {
        if (cancelled) return;
        setModel({ kind: "error", message: e instanceof Error ? e.message : String(e) });
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  async function logout() {
    setLogoutBusy(true);
    try {
      const res = await fetch("/api/daa/auth/logout", {
        method: "POST",
        headers: { accept: "application/json" },
      });

      if (res.ok) {
        window.location.href = `/daa/login?returnTo=${encodeURIComponent(returnTo)}&notice=signed_out`;
        return;
      }

      // Best-effort: if logout fails, fall back to a reload so middleware can
      // re-evaluate session state.
      window.location.reload();
    } finally {
      setLogoutBusy(false);
    }
  }

  if (model.kind === "loading") {
    return (
      <Card className="border-muted-foreground/20">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="space-y-2">
            <Skeleton className="h-4 w-[220px]" />
            <Skeleton className="h-3 w-[320px]" />
          </div>
          <Skeleton className="h-8 w-[120px]" />
        </CardContent>
      </Card>
    );
  }

  const title =
    model.kind === "signedIn"
      ? `Signed in as ${model.me.account.username}`
      : model.kind === "signedOut"
        ? "Signed out"
        : model.kind === "error"
          ? "Session status"
          : "Loading session";

  const detail =
    model.kind === "signedIn"
      ? `roles: ${formatRoles(model.me.account.roles)} · expires: ${model.me.session.expiresAt}`
      : model.kind === "signedOut"
        ? "Sign in to use the dashboard."
        : model.kind === "error"
          ? `Error: ${model.message}`
          : "";

  return (
    <Card className="border-muted-foreground/20">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="space-y-0.5">
          <div className="text-sm font-medium">{title}</div>
          {detail ? <div className="text-xs text-muted-foreground">{detail}</div> : null}
        </div>

        <div className="flex items-center gap-2">
          {model.kind === "signedOut" ? (
            <Button asChild size="sm">
              <Link href={`/daa/login?returnTo=${encodeURIComponent(returnTo)}`}>Sign in</Link>
            </Button>
          ) : null}

          {model.kind === "signedIn" ? (
            <Button type="button" size="sm" variant="outline" onClick={() => void logout()} disabled={logoutBusy}>
              {logoutBusy ? "Signing out..." : "Logout"}
            </Button>
          ) : null}

          {model.kind === "error" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setModel({ kind: "loading" });
                setRev((x) => x + 1);
              }}
            >
              Retry
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
