"use client";

import { useEffect, useMemo, useState } from "react";

import { buildDaaAdminAuthHeadersV0 } from "../../adminTokenStore";

type AdminUserV0 = {
  id: "viewer-token" | "editor-token" | "legacy-token";
  role: "viewer" | "editor";
  configured: boolean;
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

function tokenKindForUserId(id: AdminUserV0["id"]): AdminUsersApiV0["me"]["tokenKind"] {
  if (id === "viewer-token") return "viewer";
  if (id === "editor-token") return "editor";
  if (id === "legacy-token") return "legacy";
  return "unknown";
}

function fmtBool(v: boolean): string {
  return v ? "yes" : "no";
}

function fmtStatus(u: AdminUserV0): "configured" | "missing" {
  return u.configured ? "configured" : "missing";
}

function toNeedle(raw: string): string {
  return String(raw || "").trim().toLowerCase();
}

function sortIndicator(active: boolean, dir: SortDir): string {
  if (!active) return "";
  return dir === "asc" ? " ^" : " v";
}

function sortLabel(key: SortKey): string {
  if (key === "id") return "ID";
  if (key === "role") return "Role";
  if (key === "status") return "Status";
  if (key === "me") return "Me";
  return "Sort";
}

function compareUsers(a: AdminUserV0, b: AdminUserV0, opts: { sortKey: SortKey; sortDir: SortDir; meTokenKind: AdminUsersApiV0["me"]["tokenKind"] }): number {
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
  if (sortKey === "status") {
    const aStatus = a.configured ? 1 : 0;
    const bStatus = b.configured ? 1 : 0;
    primary = cmp(aStatus, bStatus);
  }
  if (sortKey === "me") {
    const am = aIsMe ? 1 : 0;
    const bm = bIsMe ? 1 : 0;
    primary = cmp(am, bm);
  }

  if (primary !== 0) return primary * dir;

  // Stable tiebreaker.
  return a.id.localeCompare(b.id);
}

export default function DaaDashboardAdminUsers() {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string>("");
  const [data, setData] = useState<AdminUsersApiV0 | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<AdminUserV0["id"] | null>(null);

  const [query, setQuery] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  async function load() {
    setStatus("loading");
    setError("");

    try {
      const headers: Record<string, string> = {
        accept: "application/json",
        ...buildDaaAdminAuthHeadersV0(),
      };

      const res = await fetch("/api/daa/admin/users", { headers, cache: "no-store" });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${res.statusText}${text ? ` :: ${text.slice(0, 200)}` : ""}`);
      }

      const j = (await res.json()) as AdminUsersApiV0;
      setData(j);
      setStatus("idle");
    } catch (e: any) {
      setStatus("error");
      setError(String(e?.message || e));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedUser = useMemo(() => {
    if (!data || !selectedId) return null;
    return data.users.find((u) => u.id === selectedId) ?? null;
  }, [data, selectedId]);

  const meTokenKind = String(data?.me?.tokenKind ?? "none") as AdminUsersApiV0["me"]["tokenKind"];

  const filteredSortedUsers = useMemo(() => {
    const needle = toNeedle(query);
    const users = (data?.users ?? []).slice();

    const filtered = needle
      ? users.filter((u) => {
          const isMe = tokenKindForUserId(u.id) === meTokenKind;
          const hay = [u.id, u.role, fmtStatus(u), u.source, tokenKindForUserId(u.id), isMe ? "me" : ""].join(" ").toLowerCase();
          return hay.includes(needle);
        })
      : users;

    filtered.sort((a, b) => compareUsers(a, b, { sortKey, sortDir, meTokenKind }));
    return filtered;
  }, [data, query, sortKey, sortDir, meTokenKind]);

  const totalUsers = data?.users?.length ?? 0;
  const visibleUsers = filteredSortedUsers.length;

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

  return (
    <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 13 }}>Admin users</div>
          <div style={{ marginTop: 4, fontSize: 12, color: "#666" }}>
            This is a read-only diagnostics view of configured admin tokens (viewer/editor/legacy).
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            onClick={() => load()}
            style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #e5e5e5", background: "#fafafa", fontSize: 12 }}
          >
            {status === "loading" ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search (id/role/status/source/me)"
            style={{
              width: "min(360px, 92vw)",
              padding: "6px 10px",
              borderRadius: 10,
              border: "1px solid #e5e5e5",
              fontSize: 12,
              background: "#fff",
            }}
          />

          {query.trim() ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #e5e5e5", background: "#fafafa", fontSize: 12 }}
            >
              Clear
            </button>
          ) : null}
        </div>

        <div style={{ fontSize: 12, color: "#666" }}>
          Showing {visibleUsers}/{totalUsers} (sort: {sortLabel(sortKey)} {sortDir})
        </div>
      </div>

      {status === "error" ? (
        <div
          style={{
            marginTop: 10,
            padding: 10,
            border: "1px solid #f0c5c5",
            background: "#fff6f6",
            borderRadius: 10,
            fontSize: 12,
            color: "#7a1f1f",
          }}
        >
          <b>Failed to load</b>: {error || "unknown error"}
        </div>
      ) : null}

      <div style={{ marginTop: 10, border: "1px solid #eee", borderRadius: 12, overflow: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "220px 120px 140px 80px 90px",
            gap: 8,
            padding: "8px 10px",
            background: "#fafafa",
            borderBottom: "1px solid #eee",
            fontSize: 12,
            fontWeight: 700,
            color: "#333",
          }}
        >
          <button
            type="button"
            onClick={() => toggleSort("id")}
            style={{
              textAlign: "left",
              padding: 0,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 12,
              color: "#333",
            }}
          >
            ID{sortIndicator(sortKey === "id", sortDir)}
          </button>

          <button
            type="button"
            onClick={() => toggleSort("role")}
            style={{
              textAlign: "left",
              padding: 0,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 12,
              color: "#333",
            }}
          >
            Role{sortIndicator(sortKey === "role", sortDir)}
          </button>

          <button
            type="button"
            onClick={() => toggleSort("status")}
            style={{
              textAlign: "left",
              padding: 0,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 12,
              color: "#333",
            }}
          >
            Status{sortIndicator(sortKey === "status", sortDir)}
          </button>

          <button
            type="button"
            onClick={() => toggleSort("me")}
            style={{
              textAlign: "left",
              padding: 0,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 12,
              color: "#333",
            }}
          >
            Me{sortIndicator(sortKey === "me", sortDir)}
          </button>
          <div />
        </div>

        {filteredSortedUsers.map((u) => {
          const isMe = tokenKindForUserId(u.id) === meTokenKind;
          const statusLabel = fmtStatus(u);
          const statusBg = u.configured ? "#f0fff4" : "#fff6f6";
          const statusBorder = u.configured ? "#c6f6d5" : "#f0c5c5";
          const statusText = u.configured ? "#22543d" : "#7a1f1f";

          return (
            <div
              key={u.id}
              style={{
                display: "grid",
                gridTemplateColumns: "220px 120px 140px 80px 90px",
                gap: 8,
                padding: "8px 10px",
                borderTop: "1px solid #eee",
                fontSize: 12,
                alignItems: "center",
              }}
            >
              <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>{u.id}</div>
              <div>{u.role}</div>
              <div>
                <span
                  style={{
                    display: "inline-block",
                    padding: "2px 8px",
                    borderRadius: 999,
                    border: `1px solid ${statusBorder}`,
                    background: statusBg,
                    color: statusText,
                  }}
                >
                  {statusLabel}
                </span>
              </div>
              <div style={{ color: isMe ? "#111" : "#bbb" }}>{isMe ? "yes" : "-"}</div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(u.id);
                    setDrawerOpen(true);
                  }}
                  style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #e5e5e5", background: "#fafafa", fontSize: 12 }}
                >
                  Details
                </button>
              </div>
            </div>
          );
        })}

        {!filteredSortedUsers.length ? (
          <div style={{ padding: 10, fontSize: 12, color: "#666" }}>{status === "loading" ? "Loading..." : "No users."}</div>
        ) : null}
      </div>

      <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
        Note: last login is not tracked yet; this drawer surfaces role/config/configuration source only.
      </div>

      {drawerOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setDrawerOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            zIndex: 1000,
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <div
            onClick={(ev) => ev.stopPropagation()}
            style={{
              width: "min(560px, 96vw)",
              height: "100vh",
              background: "#fff",
              borderLeft: "1px solid #eee",
              padding: 12,
              overflow: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 900, fontSize: 13 }}>User details</div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #e5e5e5", background: "#fafafa", fontSize: 12 }}
              >
                Close
              </button>
            </div>

            {selectedUser ? (
              <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
                <div style={{ fontSize: 12, color: "#444" }}>
                  <div>
                    <b>id</b>: <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>{selectedUser.id}</span>
                  </div>
                  <div>
                    <b>role</b>: {selectedUser.role}
                  </div>
                  <div>
                    <b>configured</b>: {fmtBool(selectedUser.configured)}
                  </div>
                  <div>
                    <b>status</b>: {selectedUser.configured ? "configured" : "missing"}
                  </div>
                  <div>
                    <b>source</b>: {selectedUser.source}
                  </div>
                  <div>
                    <b>tokenKind</b>: {tokenKindForUserId(selectedUser.id)}
                  </div>
                  <div>
                    <b>last login</b>: <span style={{ color: "#666" }}>N/A (not tracked yet)</span>
                  </div>
                </div>

                <div style={{ fontSize: 12, color: "#666", lineHeight: 1.5 }}>
                  If you want a real "last login" signal, we can add a small server-side write path that records token usage into SQLite (rate-limited) and surface it here.
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>No user selected.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
