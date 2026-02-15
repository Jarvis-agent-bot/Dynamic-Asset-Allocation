"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ChevronDown, LogOut, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

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

export default function DaaUserMenuDialog() {
  const [model, setModel] = useState<Model>({ kind: "loading" });
  const [rev, setRev] = useState(0);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [returnTo, setReturnTo] = useState("/daa/dashboard");
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    // Only used for a nicer sign-in redirect. Fall back to /daa/dashboard.
    try {
      setReturnTo(`${window.location.pathname}${window.location.search}`);
    } catch {
      setReturnTo("/daa/dashboard");
    }

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
  }, [rev]);

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
    return <Skeleton className="h-8 w-[140px] rounded-md" />;
  }

  if (model.kind === "signedOut") {
    return (
      <Button asChild size="sm" variant="secondary">
        <Link href={`/daa/login?returnTo=${encodeURIComponent(returnTo)}`}>Sign in</Link>
      </Button>
    );
  }

  if (model.kind === "error") {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          setModel({ kind: "loading" });
          setRev((x) => x + 1);
        }}
      >
        Session
      </Button>
    );
  }

  const username = model.me.account.username;
  const roles = formatRoles(model.me.account.roles);
  const expiresAt = model.me.session.expiresAt;

  return (
    <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="sm" variant="outline">
            <span className="max-w-[160px] truncate">{username}</span>
            <ChevronDown className="ml-1 h-4 w-4 opacity-70" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-[220px]">
          <DropdownMenuLabel className="max-w-[200px] truncate">{username}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setProfileOpen(true)}>
            <User className="mr-2 h-4 w-4" />
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem disabled={logoutBusy} onSelect={() => void logout()} className="text-destructive">
            <LogOut className="mr-2 h-4 w-4" />
            {logoutBusy ? "Logging out..." : "Logout"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Account</DialogTitle>
          <DialogDescription>Signed in as {username}</DialogDescription>
        </DialogHeader>

        <div className="space-y-1 text-sm">
          <div>
            <span className="text-muted-foreground">Roles:</span> {roles}
          </div>
          <div>
            <span className="text-muted-foreground">Session expires:</span> {expiresAt}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setProfileOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
