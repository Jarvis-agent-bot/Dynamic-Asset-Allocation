"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useEffect, useMemo, useState } from "react";

import { ArrowDown, ArrowUp, Loader2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { copyTextToClipboard } from "../../copyToClipboard";
import {
  DASHBOARD_MUTED_FIELD_LABEL_CLASS,
  DASHBOARD_NATIVE_SELECT_CLASS,
} from "./dashboardShadcnTokensV0";

type AdminUserV0 = {
  id: "viewer-token" | "editor-token" | "legacy-token";
  role: "viewer" | "editor";
  configured: boolean;
  active: boolean;
  source: "env";
};

type AdminUsersApiV0 = {
  ok: boolean;
  users: AdminUserV0[];
  me: {
    tokenKind: "legacy" | "viewer" | "editor" | "unknown" | "none";
    role: "viewer" | "editor" | null;
  };
};

type SortKey = "id" | "role" | "status" | "me";

type SortDir = "asc" | "desc";

type StatusFilter = "all" | "active" | "inactive" | "missing";

type UiToast = { variant: "success" | "error"; message: string; updatedAtMs: number };

function normalizeStatusFilter(raw: string | null): StatusFilter {
  if (raw === "active") return "active";
  if (raw === "inactive") return "inactive";
  if (raw === "missing") return "missing";
  return "all";
}

function tokenKindForUserId(
  id: AdminUserV0["id"]
): AdminUsersApiV0["me"]["tokenKind"] {
  if (id === "viewer-token") return "viewer";
  if (id === "editor-token") return "editor";
  if (id === "legacy-token") return "legacy";
  return "unknown";
}

function fmtBool(v: boolean): string {
  return v ? "yes" : "no";
}

function fmtStatus(u: AdminUserV0): "active" | "inactive" | "missing" {
  if (!u.configured) return "missing";
  return u.active ? "active" : "inactive";
}

function toNeedle(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase();
}

function sortLabel(key: SortKey): string {
  if (key === "id") return "ID";
  if (key === "role") return "Role";
  if (key === "status") return "Status";
  if (key === "me") return "Me";
  return "Sort";
}

function statusRank(u: AdminUserV0): number {
  // Higher is "better".
  const s = fmtStatus(u);
  if (s === "active") return 2;
  if (s === "inactive") return 1;
  return 0;
}

function compareUsers(
  a: AdminUserV0,
  b: AdminUserV0,
  opts: {
    sortKey: SortKey;
    sortDir: SortDir;
    meTokenKind: AdminUsersApiV0["me"]["tokenKind"];
  }
): number {
  const { sortKey, sortDir, meTokenKind } = opts;
  const dir = sortDir === "asc" ? 1 : -1;

  function cmp(x: number | string, y: number | string): number {
    if (x < y) return -1;
    if (x > y) return 1;
    return 0;
  }

  const aIsMe = tokenKindForUserId(a.id) === meTokenKind;
  const bIsMe = tokenKindForUserId(b.id) === meTokenKind;

  let primary = 0;
  if (sortKey === "id") primary = cmp(a.id, b.id);
  if (sortKey === "role") {
    // Keep editor first by default when sorting desc.
    const aRole = a.role === "editor" ? 1 : 0;
    const bRole = b.role === "editor" ? 1 : 0;
    primary = cmp(aRole, bRole);
  }
  if (sortKey === "status") primary = cmp(statusRank(a), statusRank(b));
  if (sortKey === "me") primary = cmp(aIsMe ? 1 : 0, bIsMe ? 1 : 0);

  if (primary !== 0) return primary * dir;

  // Stable tiebreaker.
  return a.id.localeCompare(b.id);
}

function StatusPill({ status }: { status: ReturnType<typeof fmtStatus> }) {
  const base =
    "inline-flex items-center rounded-full border px-2 py-0.5 text-xs";

  if (status === "active") {
    return (
      <span
        className={`${base} border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300`}
      >
        active
      </span>
    );
  }

  if (status === "inactive") {
    return (
      <span
        className={`${base} border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-200`}
      >
        inactive
      </span>
    );
  }

  return (
    <span className={`${base} border-border bg-muted/40 text-foreground`}>
      missing
    </span>
  );
}

function SortHeaderButton({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="-ml-2 h-8 px-2 font-semibold"
    >
      {label}
      {active ? (
        dir === "asc" ? (
          <ArrowUp className="h-3.5 w-3.5" />
        ) : (
          <ArrowDown className="h-3.5 w-3.5" />
        )
      ) : null}
    </Button>
  );
}

export default function DaaDashboardAdminUsers() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string>("");
  const [data, setData] = useState<AdminUsersApiV0 | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<AdminUserV0["id"] | null>(null);

  const [mutating, setMutating] = useState<AdminUserV0["id"] | null>(null);
  const [mutateError, setMutateError] = useState<string>("");

  const [toast, setToast] = useState<UiToast | null>(null);

  const [query, setQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  async function load() {
    setStatus("loading");
    setError("");

    try {
      const headers: Record<string, string> = { accept: "application/json" };

      const res = await fetch("/api/daa/admin/users", {
        headers,
        cache: "no-store",
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `HTTP ${res.status} ${res.statusText}${text ? ` :: ${text.slice(0, 200)}` : ""}`
        );
      }

      const j = (await res.json()) as AdminUsersApiV0;
      setData(j);
      setStatus("idle");
    } catch (e: any) {
      setStatus("error");
      setError(String(e?.message || e));
    }
  }

  async function setActive(id: AdminUserV0["id"], active: boolean) {
    setMutateError("");

    const label = active ? "activate" : "deactivate";
    const ok = window.confirm(`Are you sure you want to ${label} ${id}?`);
    if (!ok) return;

    setMutating(id);
    try {
      const headers: Record<string, string> = {
        accept: "application/json",
        "content-type": "application/json",
      };

      const res = await fetch("/api/daa/admin/users", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ id, active }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `HTTP ${res.status} ${res.statusText}${text ? ` :: ${text.slice(0, 200)}` : ""}`
        );
      }

      await load();
    } catch (e: any) {
      setMutateError(String(e?.message || e));
    } finally {
      setMutating(null);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  const statusFilterFromUrl = useMemo(
    () => normalizeStatusFilter(searchParams.get("adminUsersStatus")),
    [searchParams]
  );

  useEffect(() => {
    setStatusFilter((cur) =>
      cur === statusFilterFromUrl ? cur : statusFilterFromUrl
    );
  }, [statusFilterFromUrl]);

  const selectedUser = useMemo(() => {
    if (!data || !selectedId) return null;
    return data.users.find((u) => u.id === selectedId) ?? null;
  }, [data, selectedId]);

  const meTokenKind = String(
    data?.me?.tokenKind ?? "none"
  ) as AdminUsersApiV0["me"]["tokenKind"];

  const filteredSortedUsers = useMemo(() => {
    const needle = toNeedle(query);
    const users = (data?.users ?? []).slice();

    const filtered = needle
      ? users.filter((u) => {
          const isMe = tokenKindForUserId(u.id) === meTokenKind;
          const hay = [
            u.id,
            u.role,
            fmtStatus(u),
            u.source,
            tokenKindForUserId(u.id),
            isMe ? "me" : "",
          ]
            .join(" ")
            .toLowerCase();
          return hay.includes(needle);
        })
      : users;

    const filteredByStatus =
      statusFilter === "all"
        ? filtered
        : filtered.filter((u) => fmtStatus(u) === statusFilter);

    filteredByStatus.sort((a, b) =>
      compareUsers(a, b, { sortKey, sortDir, meTokenKind })
    );
    return filteredByStatus;
  }, [data, query, statusFilter, sortKey, sortDir, meTokenKind]);

  const totalUsers = data?.users?.length ?? 0;
  const visibleUsers = filteredSortedUsers.length;

  async function copyUserId(id: AdminUserV0["id"]) {
    try {
      await copyTextToClipboard(id);
      setToast({
        variant: "success",
        message: `Copied user id: ${id}`,
        updatedAtMs: Date.now(),
      });
    } catch (e: any) {
      setToast({
        variant: "error",
        message: `Copy failed: ${String(e?.message || e)}`,
        updatedAtMs: Date.now(),
      });
    }
  }

  function toggleSort(nextKey: SortKey) {
    if (nextKey === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    // Default directions tuned for a small diagnostics table.
    if (nextKey === "id") setSortDir("asc");
    else setSortDir("desc");
  }

  function updateStatusFilter(next: StatusFilter) {
    setStatusFilter(next);

    const sp = new URLSearchParams(Array.from(searchParams.entries()));
    if (next === "all") sp.delete("adminUsersStatus");
    else sp.set("adminUsersStatus", next);

    const qs = sp.toString();
    router.replace(qs ? pathname + "?" + qs : pathname);
  }

  function openDetails(id: AdminUserV0["id"]) {
    setSelectedId(id);
    setDrawerOpen(true);
  }

  const isRefreshing = status === "loading";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Admin Users</CardTitle>
            <CardDescription>
              Diagnostics view of configured admin tokens (viewer/editor/legacy),
              with an enable/disable toggle backed by the store.
            </CardDescription>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => load()}
            disabled={isRefreshing}
          >
            {isRefreshing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Refreshing
              </>
            ) : (
              "Refresh"
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search (id/role/status/source/me)"
              className="h-9 w-[min(360px,92vw)]"
            />

            {query.trim() ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setQuery("")}
              >
                Clear
              </Button>
            ) : null}

            <label className={DASHBOARD_MUTED_FIELD_LABEL_CLASS}>
              Status
              <select
                value={statusFilter}
                onChange={(e) =>
                  updateStatusFilter(normalizeStatusFilter(e.target.value))
                }
                className={DASHBOARD_NATIVE_SELECT_CLASS}
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="missing">Missing</option>
              </select>
            </label>
          </div>

          <div className="text-sm text-muted-foreground">
            Showing {visibleUsers}/{totalUsers} (sort: {sortLabel(sortKey)}
            {" "}
            {sortDir})
          </div>
        </div>

        {mutateError ? (
          <Alert variant="destructive">
            <AlertTitle>Update failed</AlertTitle>
            <AlertDescription>{mutateError}</AlertDescription>
          </Alert>
        ) : null}

        {status === "error" ? (
          <Alert variant="destructive">
            <AlertTitle className="flex items-center justify-between gap-2">
              <span>Failed to load</span>
              <Button type="button" size="sm" variant="outline" onClick={() => void load()}>
                Retry
              </Button>
            </AlertTitle>
            <AlertDescription>{error || "unknown error"}</AlertDescription>
          </Alert>
        ) : null}

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="text-left hover:bg-transparent">
                <TableHead className="w-[220px] px-3 py-2">
                  <SortHeaderButton
                    label="ID"
                    active={sortKey === "id"}
                    dir={sortDir}
                    onClick={() => toggleSort("id")}
                  />
                </TableHead>
                <TableHead className="w-[120px] px-3 py-2">
                  <SortHeaderButton
                    label="Role"
                    active={sortKey === "role"}
                    dir={sortDir}
                    onClick={() => toggleSort("role")}
                  />
                </TableHead>
                <TableHead className="w-[140px] px-3 py-2">
                  <SortHeaderButton
                    label="Status"
                    active={sortKey === "status"}
                    dir={sortDir}
                    onClick={() => toggleSort("status")}
                  />
                </TableHead>
                <TableHead className="w-[80px] px-3 py-2">
                  <SortHeaderButton
                    label="Me"
                    active={sortKey === "me"}
                    dir={sortDir}
                    onClick={() => toggleSort("me")}
                  />
                </TableHead>
                <TableHead className="px-3 py-2 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {filteredSortedUsers.map((u) => {
                const isMe = tokenKindForUserId(u.id) === meTokenKind;
                const statusLabel = fmtStatus(u);

                const canToggle = u.configured;
                const isBusy = mutating === u.id;

                return (
                  <TableRow key={u.id}>
                    <TableCell className="px-3 py-2 font-mono">{u.id}</TableCell>
                    <TableCell className="px-3 py-2">{u.role}</TableCell>
                    <TableCell className="px-3 py-2">
                      <StatusPill status={statusLabel} />
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      {isMe ? (
                        <span className="inline-flex items-center rounded-md border border-border bg-muted/40 px-2 py-0.5 text-xs">
                          me
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      <div className="flex justify-end gap-2">
                        {canToggle ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isBusy}
                            onClick={() => setActive(u.id, !u.active)}
                          >
                            {isBusy
                              ? "Updating..."
                              : u.active
                                ? "Deactivate"
                                : "Activate"}
                          </Button>
                        ) : null}

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void copyUserId(u.id)}
                        >
                          Copy ID
                        </Button>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openDetails(u.id)}
                        >
                          Details
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}

              {!filteredSortedUsers.length ? (
                status === "loading" ? (
                  <>
                    {Array.from({ length: 3 }).map((_, i) => (
                      <TableRow key={`sk_${i}`}>
                        <TableCell className="px-3 py-2">
                          <Skeleton className="h-4 w-[180px]" />
                        </TableCell>
                        <TableCell className="px-3 py-2">
                          <Skeleton className="h-4 w-[80px]" />
                        </TableCell>
                        <TableCell className="px-3 py-2">
                          <Skeleton className="h-4 w-[90px]" />
                        </TableCell>
                        <TableCell className="px-3 py-2">
                          <Skeleton className="h-4 w-[40px]" />
                        </TableCell>
                        <TableCell className="px-3 py-2">
                          <div className="flex justify-end gap-2">
                            <Skeleton className="h-8 w-[96px]" />
                            <Skeleton className="h-8 w-[80px]" />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="px-3 py-3 text-sm text-muted-foreground">
                      No users match the current filters.
                    </TableCell>
                  </TableRow>
                )
              ) : null}
            </TableBody>
          </Table>
        </div>

        <div className="text-sm text-muted-foreground">
          Note: last login is not tracked yet; this view surfaces
          role/configuration status only.
        </div>

        {toast ? (
          <Alert
            role="status"
            aria-live="polite"
            variant={toast.variant === "error" ? "destructive" : "default"}
            className="cursor-pointer"
            onClick={() => setToast(null)}
            title="Click to dismiss"
          >
            <AlertDescription>{toast.message}</AlertDescription>
          </Alert>
        ) : null}

        <Dialog
          open={drawerOpen}
          onOpenChange={(open) => {
            setDrawerOpen(open);
            if (!open) setSelectedId(null);
          }}
        >
          <DialogContent
            className="fixed right-0 top-0 bottom-0 left-auto grid h-[100dvh] w-full max-w-[560px] translate-x-0 translate-y-0 gap-4 overflow-auto rounded-none border-l p-6 sm:rounded-none"
          >
            <DialogHeader className="pr-8">
              <DialogTitle>User details</DialogTitle>
              <DialogDescription>
                Token config status only (last login not tracked yet).
              </DialogDescription>
            </DialogHeader>

            {selectedUser ? (
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-mono text-base font-semibold">
                    {selectedUser.id}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void copyUserId(selectedUser.id)}
                    >
                      Copy ID
                    </Button>

                    {selectedUser.configured ? (
                      <Button
                        type="button"
                        variant={selectedUser.active ? "destructive" : "default"}
                        size="sm"
                        disabled={mutating === selectedUser.id}
                        onClick={() =>
                          void setActive(selectedUser.id, !selectedUser.active)
                        }
                      >
                        {mutating === selectedUser.id
                          ? "Updating..."
                          : selectedUser.active
                            ? "Deactivate"
                            : "Activate"}
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-1">
                  <div>
                    <b>role</b>: {selectedUser.role}
                  </div>
                  <div>
                    <b>configured</b>: {fmtBool(selectedUser.configured)}
                  </div>
                  <div>
                    <b>active</b>: {fmtBool(selectedUser.active)}
                  </div>
                  <div>
                    <b>status</b>: <StatusPill status={fmtStatus(selectedUser)} />
                  </div>
                  <div>
                    <b>source</b>: {selectedUser.source}
                  </div>
                  <div>
                    <b>tokenKind</b>: {tokenKindForUserId(selectedUser.id)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                No user selected.
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
