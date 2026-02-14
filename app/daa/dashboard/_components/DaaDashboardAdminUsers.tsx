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

function tokenKindForUserId(id: AdminUserV0["id"]): AdminUsersApiV0["me"]["tokenKind"] {
  if (id === "viewer-token") return "viewer";
  if (id === "editor-token") return "editor";
  if (id === "legacy-token") return "legacy";
  return "unknown";
}

function fmtBool(v: boolean): string {
  return v ? "yes" : "no";
}

export default function DaaDashboardAdminUsers() {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string>("");
  const [data, setData] = useState<AdminUsersApiV0 | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<AdminUserV0["id"] | null>(null);

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

      {status === "error" ? (
        <div style={{ marginTop: 10, padding: 10, border: "1px solid #f0c5c5", background: "#fff6f6", borderRadius: 10, fontSize: 12, color: "#7a1f1f" }}>
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
          <div>ID</div>
          <div>Role</div>
          <div>Status</div>
          <div>Me</div>
          <div />
        </div>

        {(data?.users ?? []).map((u) => {
          const isMe = tokenKindForUserId(u.id) === meTokenKind;
          const statusLabel = u.configured ? "configured" : "missing";
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
                <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, border: `1px solid ${statusBorder}`, background: statusBg, color: statusText }}>
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

        {!data?.users?.length ? <div style={{ padding: 10, fontSize: 12, color: "#666" }}>{status === "loading" ? "Loading..." : "No users."}</div> : null}
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
