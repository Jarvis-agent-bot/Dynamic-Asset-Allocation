"use client";

import { useEffect, useMemo, useState } from "react";

import {
  clearRebalanceOrderStatusRunV0,
  loadRebalanceOrderStatusRunV0,
  type RebalanceOrderStatusRunV0,
} from "@/src/daa/rebalanceOrderStatusRunStoreV0";

function fmtAgeSeconds(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return `${Math.round(s)}s`;
  return `${Math.round(s / 60)}m`;
}

export function DaaOrderStatusTrackerV0({ pollMs = 1000 }: { pollMs?: number }) {
  const [snap, setSnap] = useState<RebalanceOrderStatusRunV0 | null>(null);
  const [readAt, setReadAt] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const read = () => {
      const next = loadRebalanceOrderStatusRunV0(window.localStorage);
      setSnap(next);
      setReadAt(new Date().toISOString());
    };

    read();

    const id = window.setInterval(read, Math.max(250, pollMs));

    return () => {
      window.clearInterval(id);
    };
  }, [pollMs]);

  const rows = useMemo(() => snap?.orders ?? [], [snap]);

  if (!snap) {
    return (
      <div
        style={{
          marginTop: 8,
          padding: "8px 10px",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 10,
          background: "rgba(0,0,0,0.08)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>Order status (v0)</div>
          <div className="muted" style={{ fontSize: 11 }}>
            Auto-refresh: {Math.round(Math.max(250, pollMs) / 1000)}s
          </div>
        </div>
        <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
          No active run snapshot.
        </div>
      </div>
    );
  }

  const stateColor = snap.state === "running" ? "#d9a300" : snap.state === "error" ? "#b00020" : "#0a7";

  return (
    <div
      style={{
        marginTop: 8,
        padding: "8px 10px",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 10,
        background: "rgba(0,0,0,0.08)",
      }}
      aria-label="Rebalance order status tracker"
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" as const }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>Order status (v0)</div>
          <span
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 999,
              background: stateColor,
              color: "#fff",
            }}
          >
            {snap.state}
          </span>
          <span className="muted" style={{ fontSize: 11 }}>
            phase={snap.phase}
          </span>
          {snap.message ? (
            <span className="muted" style={{ fontSize: 11 }}>
              {snap.message}
            </span>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" as const }}>
          <div className="muted" style={{ fontSize: 11, fontFamily: "ui-monospace, SFMono-Regular" }}>
            updatedAt={snap.updatedAt}
          </div>
          <div className="muted" style={{ fontSize: 11 }}>
            read {fmtAgeSeconds(readAt)} ago
          </div>
          <button
            type="button"
            className="button secondary"
            style={{ padding: "4px 8px" }}
            onClick={() => {
              if (typeof window === "undefined") return;
              clearRebalanceOrderStatusRunV0(window.localStorage);
              setSnap(null);
            }}
          >
            Clear
          </button>
        </div>
      </div>

      {snap.error ? (
        <div style={{ fontSize: 11, marginTop: 6, color: "var(--danger)" }}>error: {snap.error}</div>
      ) : null}

      {rows.length ? (
        <div style={{ overflowX: "auto", marginTop: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr className="muted" style={{ textAlign: "left" }}>
                <th style={{ padding: "6px 6px" }}>#</th>
                <th style={{ padding: "6px 6px" }}>Symbol</th>
                <th style={{ padding: "6px 6px" }}>Side</th>
                <th style={{ padding: "6px 6px" }}>Notional</th>
                <th style={{ padding: "6px 6px" }}>Status</th>
                <th style={{ padding: "6px 6px" }}>Updated</th>
                <th style={{ padding: "6px 6px" }}>Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  <td style={{ padding: "6px 6px", fontFamily: "ui-monospace, SFMono-Regular" }}>{o.id}</td>
                  <td style={{ padding: "6px 6px" }}>{o.symbol}</td>
                  <td style={{ padding: "6px 6px" }}>{o.side}</td>
                  <td style={{ padding: "6px 6px" }}>{Number.isFinite(o.notional) ? o.notional.toFixed(2) : String(o.notional)}</td>
                  <td style={{ padding: "6px 6px" }}>{o.status}</td>
                  <td style={{ padding: "6px 6px", fontFamily: "ui-monospace, SFMono-Regular" }}>{o.updatedAt}</td>
                  <td style={{ padding: "6px 6px" }}>{o.detail ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
          No orders attached to this run yet.
        </div>
      )}
    </div>
  );
}
