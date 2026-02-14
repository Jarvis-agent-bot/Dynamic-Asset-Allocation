"use client";

import { useEffect, useMemo, useState } from "react";

import { applyNotionalOrdersToPositionsV0, normalizeNotionalOrdersV0 } from "@/src/daa/portfolioApplyNotionalOrdersV0";

import { buildDaaAdminAuthHeadersV0 } from "../../adminTokenStore";

type RunListRow = {
  runId: string;
  createdAt: string;
  kind: string;
  status: string;
  source: string;
  actor: string;
  hasPortfolio: boolean;
  hasConfirm: boolean;
  hasExecuted: boolean;
  auditCount: number;
};

type RunsResp = { ok: boolean; runs?: RunListRow[]; error?: string };

type BundleResp = { ok: boolean; bundle?: any; error?: string };

function pretty(x: unknown) {
  return JSON.stringify(x, null, 2);
}

function fmtTime(iso: unknown) {
  const s = String(iso ?? "").trim();
  if (!s) return "";
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return s;
  return new Date(t).toLocaleString();
}

function csvEscapeCell(x: unknown): string {
  if (x === null || x === undefined) return "";

  const s = typeof x === "string" ? x : String(x);
  // RFC4180-ish: quote if contains comma, quote, CR or LF.
  if (!/[\",\r\n]/.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

function toCsv(lines: unknown[][]): string {
  return lines.map((row) => row.map(csvEscapeCell).join(",")).join("\n") + "\n";
}

function downloadTextAsFile(args: { filename: string; text: string; mime: string }) {
  const blob = new Blob([args.text], { type: args.mime });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = args.filename;
  a.click();

  // Best-effort cleanup; keep URL alive briefly for the download to start.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function toIsoFromDatetimeLocal(s: string): string {
  const raw = String(s ?? "").trim();
  if (!raw) return "";
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toISOString();
}

function extractOrdersFromAny(x: any): unknown {
  if (!x || typeof x !== "object") return null;
  return (x as any).orders ?? (x as any).payload?.orders ?? (x as any).paper_entry?.orders ?? (x as any).raw?.orders ?? null;
}

function extractPortfolioSnapshot(bundle: any): { portfolioState: any; priceSnapshot: any } | null {
  const p = bundle?.portfolio?.payload;
  const portfolioState = p?.portfolio_state;
  const priceSnapshot = p?.price_snapshot;
  if (!portfolioState && !priceSnapshot) return null;
  return { portfolioState, priceSnapshot };
}

function buildPricesBySymbol(priceSnapshot: any): Record<string, number> {
  const out: Record<string, number> = {};
  const prices = priceSnapshot?.prices;
  if (!prices || typeof prices !== "object" || Array.isArray(prices)) return out;
  for (const [symRaw, row] of Object.entries(prices as any)) {
    const sym = String(symRaw ?? "").trim();
    if (!sym) continue;
    const price = Number((row as any)?.price ?? NaN);
    if (!Number.isFinite(price) || price <= 0) continue;
    out[sym] = price;
  }
  return out;
}

function buildPositionsQty(portfolioState: any): { cash: unknown; positionsQty: Record<string, number> } {
  const positionsQty: Record<string, number> = {};
  const positions = portfolioState?.positions;
  if (positions && typeof positions === "object" && !Array.isArray(positions)) {
    for (const [symRaw, p] of Object.entries(positions as any)) {
      const sym = String(symRaw ?? "").trim();
      if (!sym) continue;
      const qty = Number((p as any)?.qty ?? NaN);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      positionsQty[sym] = qty;
    }
  }
  return { cash: portfolioState?.cash, positionsQty };
}

export default function DaaDashboardHistoryAudit() {
  const [runs, setRuns] = useState<RunListRow[]>([]);
  const [runsStatus, setRunsStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [runsError, setRunsError] = useState<string | null>(null);

  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [bundleStatus, setBundleStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [bundleError, setBundleError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<any | null>(null);

  const [actorFilter, setActorFilter] = useState<string>("");
  const [fromLocal, setFromLocal] = useState<string>("");
  const [toLocal, setToLocal] = useState<string>("");

  const fromIso = useMemo(() => toIsoFromDatetimeLocal(fromLocal), [fromLocal]);
  const toIso = useMemo(() => toIsoFromDatetimeLocal(toLocal), [toLocal]);

  const cursor = useMemo(() => {
    const last = runs.length ? runs[runs.length - 1] : null;
    if (!last) return null;
    if (!last.createdAt || !last.runId) return null;
    return { beforeCreatedAt: last.createdAt, beforeRunId: last.runId };
  }, [runs]);

  async function loadRuns(mode: "reset" | "more") {
    if (mode === "reset") {
      setSelectedRunId("");
      setBundle(null);
      setBundleStatus("idle");
      setBundleError(null);
    }

    setRunsError(null);
    setRunsStatus("loading");

    const qs = new URLSearchParams();
    qs.set("limit", "20");

    if (actorFilter) qs.set("actor", actorFilter);
    if (fromIso) qs.set("fromCreatedAt", fromIso);
    if (toIso) qs.set("toCreatedAt", toIso);

    if (mode === "more" && cursor) {
      qs.set("beforeCreatedAt", cursor.beforeCreatedAt);
      qs.set("beforeRunId", cursor.beforeRunId);
    }

    try {
      const res = await fetch(`/api/daa/store/v0/runs?${qs.toString()}`, { method: "GET", headers: { accept: "application/json" } });
      const payload = (await res.json()) as RunsResp;
      if (!res.ok || !payload?.ok) throw new Error(String(payload?.error ?? `HTTP ${res.status}`));

      const next = Array.isArray(payload.runs) ? payload.runs : [];
      setRuns((prev) => (mode === "reset" ? next : [...prev, ...next]));
      setRunsStatus("ok");
    } catch (e) {
      setRunsStatus("error");
      setRunsError(e instanceof Error ? e.message : String(e));
    }
  }

  async function loadBundle(runIdRaw: string) {
    const rid = String(runIdRaw ?? "").trim();
    if (!rid) return;

    setSelectedRunId(rid);
    setBundle(null);
    setBundleError(null);
    setBundleStatus("loading");

    try {
      // Optional auth header; read endpoints currently allow unauthenticated access.
      const headers: Record<string, string> = { accept: "application/json", ...buildDaaAdminAuthHeadersV0() };
      const res = await fetch(`/api/daa/store/v0/run/${encodeURIComponent(rid)}`, { method: "GET", headers });
      const payload = (await res.json()) as BundleResp;
      if (!res.ok || !payload?.ok) throw new Error(String(payload?.error ?? `HTTP ${res.status}`));

      setBundle(payload.bundle ?? null);
      setBundleStatus("ok");
    } catch (e) {
      setBundleStatus("error");
      setBundleError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    void loadRuns("reset");
  }, [actorFilter, fromIso, toIso]);

  const derived = useMemo(() => {
    if (!bundle) return null;

    const snapshot = extractPortfolioSnapshot(bundle);
    const portfolioState = snapshot?.portfolioState;
    const priceSnapshot = snapshot?.priceSnapshot;

    const { cash, positionsQty } = buildPositionsQty(portfolioState);
    const pricesBySymbol = buildPricesBySymbol(priceSnapshot);

    const confirmPayload = bundle?.confirm?.payload;
    const executedPayload = bundle?.executed?.payload;

    const orders =
      extractOrdersFromAny(executedPayload) ??
      extractOrdersFromAny(confirmPayload) ??
      extractOrdersFromAny(bundle?.audit?.find?.((e: any) => String(e?.kind ?? "") === "ai_orders_draft")?.payload);

    const normalizedOrders = normalizeNotionalOrdersV0(orders);

    const applied = applyNotionalOrdersToPositionsV0({
      cash,
      positions: positionsQty,
      orders,
      pricesBySymbol,
    });

    return { portfolioState, priceSnapshot, orders, normalizedOrders, applied };
  }, [bundle]);

  return (
    <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 800 }}>History / Audit (SQLite)</div>
          <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
            Recent runs + audit events. For safety: this page never executes trades; it only shows history and stored payloads.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select
            value={actorFilter}
            onChange={(e) => setActorFilter(String(e.target.value ?? ""))}
            style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #e5e5e5", background: "#fff", fontSize: 12 }}
          >
            <option value="">All actors</option>
            <option value="dashboard">dashboard</option>
            <option value="market-funds">market-funds</option>
            <option value="unknown">unknown</option>
          </select>

          <input
            type="datetime-local"
            value={fromLocal}
            onChange={(e) => setFromLocal(String(e.target.value ?? ""))}
            title="From (local time)"
            style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #e5e5e5", background: "#fff", fontSize: 12 }}
          />

          <input
            type="datetime-local"
            value={toLocal}
            onChange={(e) => setToLocal(String(e.target.value ?? ""))}
            title="To (local time)"
            style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #e5e5e5", background: "#fff", fontSize: 12 }}
          />

          <button
            type="button"
            onClick={() => {
              setActorFilter("");
              setFromLocal("");
              setToLocal("");
            }}
            disabled={runsStatus === "loading"}
            style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #e5e5e5", background: "#fff", fontSize: 12 }}
          >
            Clear
          </button>

          <button
            type="button"
            onClick={() => loadRuns("reset")}
            disabled={runsStatus === "loading"}
            style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #e5e5e5", background: "#fafafa", fontSize: 12 }}
          >
            Refresh
          </button>

          <button
            type="button"
            onClick={() => {
              const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
              const lines: unknown[][] = [
                [
                  "runId",
                  "createdAt",
                  "kind",
                  "status",
                  "actor",
                  "source",
                  "hasPortfolio",
                  "hasConfirm",
                  "hasExecuted",
                  "auditCount",
                ],
              ];

              for (const r of runs) {
                lines.push([
                  r.runId,
                  r.createdAt,
                  r.kind,
                  r.status,
                  r.actor,
                  r.source,
                  r.hasPortfolio ? "yes" : "no",
                  r.hasConfirm ? "yes" : "no",
                  r.hasExecuted ? "yes" : "no",
                  r.auditCount,
                ]);
              }

              const csv = toCsv(lines);
              downloadTextAsFile({
                filename: `daa-audit-log-${stamp}.csv`,
                text: csv,
                mime: "text/csv",
              });
            }}
            disabled={runsStatus === "loading" || !runs.length}
            style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #e5e5e5", background: "#fafafa", fontSize: 12 }}
          >
            Export CSV
          </button>

          <button
            type="button"
            onClick={() => loadRuns("more")}
            disabled={runsStatus === "loading" || !cursor}
            style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #e5e5e5", background: "#fafafa", fontSize: 12 }}
          >
            Load more
          </button>
        </div>
      </div>

      {runsError ? <div style={{ marginTop: 10, color: "#a00", fontSize: 12 }}>Runs error: {runsError}</div> : null}

      <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
        {runs.length ? (
          runs.map((r) => {
            const selected = selectedRunId === r.runId;
            return (
              <div key={r.runId} style={{ border: "1px solid #f0f0f0", borderRadius: 12, padding: 10, background: selected ? "#fafcff" : "#fff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>
                      {r.kind} <span style={{ color: "#aaa" }}>·</span> {r.status}
                    </div>
                    <div style={{ fontSize: 12, color: "#666", marginTop: 3 }}>
                      {fmtTime(r.createdAt)} <span style={{ color: "#bbb" }}>·</span> {r.runId}
                    </div>
                    <div style={{ fontSize: 12, color: "#666", marginTop: 3 }}>
                      portfolio:{r.hasPortfolio ? "yes" : "no"} <span style={{ color: "#bbb" }}>·</span> confirm:{r.hasConfirm ? "yes" : "no"} <span style={{ color: "#bbb" }}>·</span> executed:{r.hasExecuted ? "yes" : "no"} <span style={{ color: "#bbb" }}>·</span> audit:{r.auditCount}
                    </div>
                    <div style={{ fontSize: 12, color: "#666", marginTop: 3 }}>
                      actor:{String(r.actor ?? "")} <span style={{ color: "#bbb" }}>·</span> source:{String(r.source ?? "") || "-"}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button
                      type="button"
                      onClick={() => loadBundle(r.runId)}
                      disabled={bundleStatus === "loading" && selected}
                      style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #e5e5e5", background: "#fafafa", fontSize: 12 }}
                    >
                      {selected ? "Reload details" : "View details"}
                    </button>
                  </div>
                </div>

                {selected ? (
                  <div style={{ marginTop: 10 }}>
                    {bundleStatus === "loading" ? <div style={{ fontSize: 12, color: "#666" }}>Loading bundle...</div> : null}
                    {bundleError ? <div style={{ fontSize: 12, color: "#a00" }}>Bundle error: {bundleError}</div> : null}

                    {bundle ? (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 12 }}>Run</div>
                          <pre style={{ marginTop: 6, whiteSpace: "pre-wrap", background: "#fafafa", border: "1px solid #eee", borderRadius: 10, padding: 10, fontSize: 12 }}>
                            {pretty(bundle.run)}
                          </pre>
                        </div>

                        <div>
                          <div style={{ fontWeight: 800, fontSize: 12 }}>Portfolio snapshot (stored)</div>
                          <pre style={{ marginTop: 6, whiteSpace: "pre-wrap", background: "#fafafa", border: "1px solid #eee", borderRadius: 10, padding: 10, fontSize: 12 }}>
                            {pretty(bundle.portfolio)}
                          </pre>
                        </div>

                        <div>
                          <div style={{ fontWeight: 800, fontSize: 12 }}>Confirm (stored)</div>
                          <pre style={{ marginTop: 6, whiteSpace: "pre-wrap", background: "#fafafa", border: "1px solid #eee", borderRadius: 10, padding: 10, fontSize: 12 }}>
                            {pretty(bundle.confirm)}
                          </pre>
                        </div>

                        <div>
                          <div style={{ fontWeight: 800, fontSize: 12 }}>Executed (stored)</div>
                          <pre style={{ marginTop: 6, whiteSpace: "pre-wrap", background: "#fafafa", border: "1px solid #eee", borderRadius: 10, padding: 10, fontSize: 12 }}>
                            {pretty(bundle.executed)}
                          </pre>
                        </div>

                        {derived ? (
                          <div>
                            <div style={{ fontWeight: 800, fontSize: 12 }}>Before/After (derived, not executed)</div>
                            <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                              This derives positionsAfter by applying stored/manual orders onto the stored portfolio snapshot using the stored price snapshot.
                            </div>
                            <pre style={{ marginTop: 6, whiteSpace: "pre-wrap", background: "#fafafa", border: "1px solid #eee", borderRadius: 10, padding: 10, fontSize: 12 }}>
                              {pretty({
                                orders_normalize_issues: derived.normalizedOrders.issues,
                                applied: derived.applied,
                              })}
                            </pre>
                          </div>
                        ) : null}

                        <div>
                          <div style={{ fontWeight: 800, fontSize: 12 }}>Audit events</div>
                          <pre style={{ marginTop: 6, whiteSpace: "pre-wrap", background: "#fafafa", border: "1px solid #eee", borderRadius: 10, padding: 10, fontSize: 12 }}>
                            {pretty(bundle.audit)}
                          </pre>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })
        ) : (
          <div style={{ fontSize: 12, color: "#666" }}>{runsStatus === "loading" ? "Loading..." : "No runs yet."}</div>
        )}
      </div>
    </div>
  );
}
