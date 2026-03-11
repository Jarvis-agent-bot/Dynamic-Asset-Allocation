"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ChevronDown, Copy, LogOut, Mail, User } from "lucide-react";
import { toast } from "sonner";

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

import { copyTextToClipboard } from "../copyToClipboard";
import { fetchDaaAuthSessionV1, invalidateDaaAuthSessionCacheV1, type DaaAuthMePayloadV1 } from "./daaAuthSessionClientV1";

type Model =
  | { kind: "loading" }
  | { kind: "signedOut" }
  | { kind: "error"; message: string }
  | { kind: "signedIn"; me: DaaAuthMePayloadV1 };

function formatRoles(roles: string[]): string {
  const xs = Array.isArray(roles) ? roles.filter(Boolean) : [];
  if (xs.length === 0) return "未分配角色";
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
      const result = await fetchDaaAuthSessionV1({ silent: true });
      if (cancelled) return;
      if (result.kind === "signedIn") {
        setModel({ kind: "signedIn", me: result.me });
        return;
      }
      if (result.kind === "signedOut") {
        setModel({ kind: "signedOut" });
        return;
      }
      setModel({ kind: "error", message: result.message });
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
        invalidateDaaAuthSessionCacheV1();
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

  async function handleCopy(label: string, text: string) {
    try {
      await copyTextToClipboard(text);
      toast.success(`已复制${label}。`);
    } catch {
      toast.error(`复制${label}失败。`);
    }
  }

  if (model.kind === "loading") {
    return <Skeleton className="h-8 w-[140px] rounded-md" />;
  }

  if (model.kind === "signedOut") {
    return (
      <Button asChild size="sm" variant="secondary">
        <Link href={`/daa/login?returnTo=${encodeURIComponent(returnTo)}`}>登录</Link>
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
        会话
      </Button>
    );
  }

  const username = model.me.account.username;
  const accountId = model.me.account.accountId;
  const email = username;
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
          <DropdownMenuItem onSelect={() => void handleCopy("用户 ID", accountId)}>
            <Copy className="mr-2 h-4 w-4" />
            复制用户 ID
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void handleCopy("邮箱", email)}>
            <Mail className="mr-2 h-4 w-4" />
            复制邮箱
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setProfileOpen(true)}>
            <User className="mr-2 h-4 w-4" />
            账户信息
          </DropdownMenuItem>
          <DropdownMenuItem disabled={logoutBusy} onSelect={() => void logout()} className="text-destructive">
            <LogOut className="mr-2 h-4 w-4" />
            {logoutBusy ? "退出中..." : "退出登录"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>账户</DialogTitle>
          <DialogDescription>当前登录账号：{username}</DialogDescription>
        </DialogHeader>

        <div className="space-y-1 text-sm">
          <div>
            <span className="text-muted-foreground">角色：</span> {roles}
          </div>
          <div>
            <span className="text-muted-foreground">会话到期：</span> {expiresAt}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setProfileOpen(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
