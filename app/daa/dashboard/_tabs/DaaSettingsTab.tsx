"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";

type Me = {
  account: { accountId: string; username: string; roles: string[]; status: string };
  session: {
    sessionId: string;
    createdAt: string;
    expiresAt: string;
    revokedAt: string | null;
    lastSeenAt: string | null;
  };
};

function formatRoles(roles: string[]): string {
  const xs = Array.isArray(roles) ? roles.filter(Boolean) : [];
  if (xs.length === 0) return "(no roles)";
  return xs.join(", ");
}

async function copyToClipboard(label: string, value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`Copied ${label}.`);
  } catch (e) {
    toast.error(`Copy failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export default function DaaSettingsTab({ me, returnTo }: { me: Me; returnTo: string }) {
  const [logoutBusy, setLogoutBusy] = useState(false);

  const roles = useMemo(() => formatRoles(me.account.roles), [me.account.roles]);

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

      // Best-effort fallback.
      window.location.reload();
    } finally {
      setLogoutBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Table>
            <TableBody>
              <TableRow>
                <TableCell className="w-[160px] text-muted-foreground">Username</TableCell>
                <TableCell className="font-medium">{me.account.username}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="w-[160px] text-muted-foreground">Account ID</TableCell>
                <TableCell className="flex flex-wrap items-center gap-2">
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">{me.account.accountId}</code>
                  <Button type="button" size="sm" variant="outline" onClick={() => void copyToClipboard("account id", me.account.accountId)}>
                    Copy
                  </Button>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="w-[160px] text-muted-foreground">Roles</TableCell>
                <TableCell>
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">{roles}</code>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="w-[160px] text-muted-foreground">Status</TableCell>
                <TableCell>
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">{me.account.status}</code>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void copyToClipboard("username", me.account.username)}>
              Copy username
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void copyToClipboard("roles", roles)}>
              Copy roles
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Session</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Table>
            <TableBody>
              <TableRow>
                <TableCell className="w-[160px] text-muted-foreground">Session ID</TableCell>
                <TableCell className="flex flex-wrap items-center gap-2">
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">{me.session.sessionId}</code>
                  <Button type="button" size="sm" variant="outline" onClick={() => void copyToClipboard("session id", me.session.sessionId)}>
                    Copy
                  </Button>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="w-[160px] text-muted-foreground">Created</TableCell>
                <TableCell>{me.session.createdAt}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="w-[160px] text-muted-foreground">Expires</TableCell>
                <TableCell>{me.session.expiresAt}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="w-[160px] text-muted-foreground">Last seen</TableCell>
                <TableCell>{me.session.lastSeenAt ?? "-"}</TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void logout()} disabled={logoutBusy}>
              {logoutBusy ? "Signing out..." : "Sign out"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Security</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Login is username/password only. Use <code className="rounded bg-muted px-1 py-0.5">/daa/login</code> with your assigned account credentials.
            </li>
            <li>Sessions are stored in this browser. If you're on a shared device, sign out when you're done.</li>
            <li>In non-production with zero accounts, default bootstrap can initialize <code className="rounded bg-muted px-1 py-0.5">admin / admin123</code>.</li>
          </ul>
        </CardContent>
      </Card>

      <Card className="border-muted-foreground/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Safety</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              The canonical entry is <code className="rounded bg-muted px-1 py-0.5">/daa/dashboard</code>; legacy <code className="rounded bg-muted px-1 py-0.5">/daa*</code> routes redirect here.
            </li>
            <li>
              The UI may produce <code className="rounded bg-muted px-1 py-0.5">ai_orders_draft</code> only; never auto-execute trades.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
