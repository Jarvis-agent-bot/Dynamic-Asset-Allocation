"use client";

import { useEffect, useMemo, useState } from "react";

import { loadPaperExecutionLog, type PaperExecutionLogEntryV0 } from "@/src/daa/executionLogStore";

import { applyNotionalOrdersToPositionsV0 } from "@/src/daa/portfolioApplyNotionalOrdersV0";

import { LS_LEGACY_HOLDINGS, LS_PORTFOLIO_STATE, loadPortfolioStateV1 } from "../../portfolioStateStore";
import { loadPriceSnapshotV1 } from "../../priceSnapshotStore";
import { WIZARD_DATA_EVENT } from "../../wizardStorage";
import { useDaaWorkflowExportBundleV1 } from "../../useDaaWorkflowExportBundleV1";

const LS_DASHBOARD_ACTIVE_RUN_ID_V0 = "daa.dashboard.activeRunId.v0";

function nowIso() {
  return new Date().toISOString();
}

function pretty(x: unknown) {
  return JSON.stringify(x, null, 2);
}

function safeJsonParse(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, error: "JSON parse failed" };
  }
}

function positionsToLegacyHoldings(positions: Record<string, { qty: number; cost?: number }>) {
  const out: Record<string, { share: number; cost: number }> = {};
  for (const [sym, p] of Object.entries(positions ?? {})) {
    const share = Number((p as any)?.qty ?? NaN);
    if (!Number.isFinite(share) || share <= 0) continue;
    const costRaw = (p as any)?.cost;
    const cost = Number.isFinite(Number(costRaw)) && Number(costRaw) >= 0 ? Number(costRaw) : 0;
    out[sym] = { share, cost };
  }
  return out;
}

type BundleResp = { ok: boolean; bundle?: any; error?: string };

export default function DaaDashboardConfirmExecuted() {
  const { exportBundle } = useDaaWorkflowExportBundleV1();

  const [runId, setRunId] = useState<string>("");
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [runBundle, setRunBundle] = useState<any | null>(null);

  const [noteText, setNoteText] = useState<string>("");

  const [executedMode, setExecutedMode] = useState<"paperLog" | "pasteJson">("paperLog");
  const [executedJsonText, setExecutedJsonText] = useState<string>("{}");
  const [selectedPaperEntryId, setSelectedPaperEntryId] = useState<string>("");

  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);

  useEffect(() => {
    // Bootstrap local UI state from localStorage.
    const storedRunId = typeof window !== "undefined" ? String(window.localStorage.getItem(LS_DASHBOARD_ACTIVE_RUN_ID_V0) ?? "") : "";
    if (storedRunId.trim()) setRunId(storedRunId.trim());

    const log = typeof window !== "undefined" ? loadPaperExecutionLog(window.localStorage) : [];
    const last = log.length ? log[log.length - 1] : null;
    if (last?.id) setSelectedPaperEntryId(last.id);
  }, []);

  const priceSnapshot = useMemo(() => (typeof window === "undefined" ? null : loadPriceSnapshotV1()), [runId]);
  const portfolioState = useMemo(() => (typeof window === "undefined" ? null : loadPortfolioStateV1()), [runId]);

  const paperLog = useMemo(() => (typeof window === "undefined" ? [] : loadPaperExecutionLog(window.localStorage)), [runId]);

  const selectedPaperEntry: PaperExecutionLogEntryV0 | null = useMemo(() => {
    const id = String(selectedPaperEntryId ?? "").trim();
    if (!id) return null;
    return paperLog.find((e) => e.id === id) ?? null;
  }, [paperLog, selectedPaperEntryId]);

  async function apiPost(path: string, body: unknown): Promise<any> {
    const headers: Record<string, string> = {
      accept: "application/json",
      "content-type": "application/json"};

    const res = await fetch(path, {
      method: "POST",
      headers,
      body: JSON.stringify(body)});

    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }

    if (!res.ok) {
      const msg = json?.error ? String(json.error) : `HTTP ${res.status}`;
      throw new Error(msg);
    }

    return json;
  }

  async function refreshRunBundle(nextRunId?: string) {
    const rid = String(nextRunId ?? runId ?? "").trim();
    if (!rid) return;

    setRunError(null);
    setRunStatus("loading");

    try {
      const res = await fetch(`/api/daa/store/v0/run/${encodeURIComponent(rid)}`, { method: "GET", headers: { accept: "application/json" } });
      const payload = (await res.json()) as BundleResp;
      if (!res.ok || !payload?.ok) throw new Error(String(payload?.error ?? `HTTP ${res.status}`));

      setRunBundle(payload.bundle ?? null);
      setRunStatus("ok");
    } catch (e) {
      setRunStatus("error");
      setRunError(e instanceof Error ? e.message : String(e));
    }
  }

  async function createRun() {
    setActionResult(null);

    setActionBusy("create-run");
    try {
      const payload = {
        kind: "daa_dashboard_run_v0",
        status: "created",
        payload: {
          createdAt: nowIso(),
          source: "/daa/dashboard",
          export_bundle: exportBundle,
          price_snapshot: priceSnapshot}};

      const r = await apiPost("/api/daa/store/v0/run", payload);
      const rid = String(r?.runId ?? "").trim();
      if (!rid) throw new Error("missing runId in response");

      setRunId(rid);
      window.localStorage.setItem(LS_DASHBOARD_ACTIVE_RUN_ID_V0, rid);

      setActionResult(`Created run: ${rid}`);
      await refreshRunBundle(rid);
    } catch (e) {
      setActionResult(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(null);
    }
  }

  async function savePortfolioSnapshot() {
    setActionResult(null);

    const rid = String(runId ?? "").trim();
    if (!rid) {
      setActionResult("Missing runId. Create or set one first.");
      return;
    }

    setActionBusy("save-portfolio");
    try {
      const payload = {
        payload: {
          at: nowIso(),
          portfolio_state: portfolioState,
          price_snapshot: priceSnapshot}};

      await apiPost(`/api/daa/store/v0/run/${encodeURIComponent(rid)}/portfolio`, payload);
      setActionResult("Saved portfolio snapshot to SQLite store.");
      await refreshRunBundle();
    } catch (e) {
      setActionResult(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(null);
    }
  }

  async function confirmRun() {
    setActionResult(null);

    const rid = String(runId ?? "").trim();
    if (!rid) {
      setActionResult("Missing runId. Create or set one first.");
      return;
    }

    const recommendation = exportBundle?.recommendation;
    const orders = (recommendation as any)?.orders;
    const ordersCount = Array.isArray(orders) ? orders.length : 0;

    setActionBusy("confirm");
    try {
      const payload = {
        payload: {
          kind: "confirm_v0",
          confirmedAt: nowIso(),
          note: noteText.trim() ? noteText.trim() : undefined,
          // Keep raw recommendation so future audit/history can reconstruct.
          recommendation,
          orders,
          ordersCount,
          price_snapshot: priceSnapshot}};

      await apiPost(`/api/daa/store/v0/run/${encodeURIComponent(rid)}/confirm`, payload);
      setActionResult(`Confirmed (orders: ${ordersCount}). This does NOT execute trades.`);
      await refreshRunBundle();
    } catch (e) {
      setActionResult(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(null);
    }
  }

  async function markExecutedAndUpdatePortfolio() {
    setActionResult(null);

    const rid = String(runId ?? "").trim();
    if (!rid) {
      setActionResult("Missing runId. Create or set one first.");
      return;
    }

    if (!portfolioState) {
      setActionResult("Missing portfolio_state (localStorage). Import or configure it first.");
      return;
    }

    if (!priceSnapshot) {
      setActionResult("Missing price snapshot. Fill it first (used to estimate qty). ");
      return;
    }

    const executedPayload = (() => {
      if (executedMode === "paperLog") {
        if (!selectedPaperEntry) return { ok: false as const, error: "Select a paper execution log entry first." };
        return {
          ok: true as const,
          payload: {
            kind: "executed_v0",
            executedAt: nowIso(),
            mode: "paper",
            paper_entry: selectedPaperEntry,
            note: noteText.trim() ? noteText.trim() : undefined},
          orders: selectedPaperEntry.orders};
      }

      const parsed = safeJsonParse(executedJsonText);
      if (!parsed.ok) return { ok: false as const, error: parsed.error };

      const v: any = parsed.value as any;
      const orders = v?.orders ?? v?.payload?.orders;

      return {
        ok: true as const,
        payload: {
          kind: "executed_v0",
          executedAt: nowIso(),
          mode: "manual",
          note: noteText.trim() ? noteText.trim() : undefined,
          raw: parsed.value},
        orders};
    })();

    if (!executedPayload.ok) {
      setActionResult(executedPayload.error);
      return;
    }

    setActionBusy("executed");
    try {
      await apiPost(`/api/daa/store/v0/run/${encodeURIComponent(rid)}/executed`, { payload: executedPayload.payload });

      // Auto-update local portfolio_state using latest price snapshot.
      const pricesBySymbol: Record<string, number> = {};
      for (const [sym, row] of Object.entries((priceSnapshot as any)?.prices ?? {})) {
        const price = Number((row as any)?.price ?? NaN);
        if (!Number.isFinite(price) || price <= 0) continue;
        pricesBySymbol[String(sym)] = price;
      }

      const positionsQty: Record<string, number> = {};
      const positionsMeta: Record<string, { qty: number; cost?: number }> = {};
      for (const [sym, p] of Object.entries((portfolioState as any)?.positions ?? {})) {
        const qty = Number((p as any)?.qty ?? NaN);
        if (!Number.isFinite(qty) || qty <= 0) continue;
        positionsQty[String(sym)] = qty;
        positionsMeta[String(sym)] = { qty, cost: (p as any)?.cost };
      }

      const applied = applyNotionalOrdersToPositionsV0({
        cash: (portfolioState as any)?.cash,
        positions: positionsQty,
        orders: executedPayload.orders,
        pricesBySymbol});

      // Persist updated portfolio state (and legacy `holdings` for backward compat).
      const nextPositions: Record<string, { qty: number; cost?: number }> = { ...positionsMeta };
      for (const [sym, qty] of Object.entries(applied.positionsAfter)) {
        const prev = nextPositions[sym];
        nextPositions[sym] = prev ? { ...prev, qty } : { qty };
      }
      for (const sym of Object.keys(nextPositions)) {
        if (!(sym in applied.positionsAfter)) delete nextPositions[sym];
      }

      const nextState = {
        ...(portfolioState as any),
        schemaVersion: 1,
        updatedAt: nowIso(),
        cash: applied.cashAfter,
        positions: nextPositions};

      window.localStorage.setItem(LS_PORTFOLIO_STATE, JSON.stringify(nextState));
      window.localStorage.setItem(LS_LEGACY_HOLDINGS, JSON.stringify(positionsToLegacyHoldings(nextPositions)));
      window.dispatchEvent(new CustomEvent(WIZARD_DATA_EVENT));

      const issueText = applied.issues.length ? ` Issues: ${applied.issues.slice(0, 5).join("; ")}` : "";

      setActionResult(`Saved executed payload + updated local portfolio_state.${issueText}`);
      await refreshRunBundle();
    } catch (e) {
      setActionResult(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(null);
    }
  }

  function persistRunId() {
    const rid = String(runId ?? "").trim();
    if (!rid) return;
    try {
      window.localStorage.setItem(LS_DASHBOARD_ACTIVE_RUN_ID_V0, rid);
    } catch {
      // ignore
    }
  }

  const snapshotMeta = useMemo(() => {
    if (!priceSnapshot) return { updatedAt: "", count: 0 };
    const count = Object.keys((priceSnapshot as any)?.prices ?? {}).length;
    return { updatedAt: String((priceSnapshot as any)?.updatedAt ?? ""), count };
  }, [priceSnapshot]);

  const portfolioMeta = useMemo(() => {
    if (!portfolioState) return { updatedAt: "", positionsCount: 0, cash: 0 };
    const positionsCount = Object.keys((portfolioState as any)?.positions ?? {}).length;
    const cash = Number((portfolioState as any)?.cash ?? 0);
    return { updatedAt: String((portfolioState as any)?.updatedAt ?? ""), positionsCount, cash: Number.isFinite(cash) ? cash : 0 };
  }, [portfolioState]);

  const bundleSummary = useMemo(() => {
    const r: any = runBundle as any;
    if (!r || typeof r !== "object") return null;
    const run = r.run;
    return {
      runId: run?.runId,
      createdAt: run?.createdAt,
      kind: run?.kind,
      status: run?.status,
      portfolioAt: r.portfolio?.createdAt ?? null,
      confirmAt: r.confirm?.createdAt ?? null,
      executedAt: r.executed?.createdAt ?? null,
      auditCount: Array.isArray(r.audit) ? r.audit.length : 0};
  }, [runBundle]);

  return (
    <section style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 14 }}>Confirm / Executed（admin flow）</div>
          <div style={{ marginTop: 4, fontSize: 12, color: "#666" }}>
            Goal: persist a DAA run to SQLite, record <b>confirm</b> and <b>executed</b>, then auto-update <code>portfolio_state</code> using the latest price snapshot.
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: "#a8071a" }}>
            Safety: this UI never auto-executes trades; it only records what you confirmed/executed.
          </div>
        </div>
      </div>

      <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>

        <div style={{ border: "1px solid #f0f0f0", borderRadius: 12, padding: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 13 }}>Run (SQLite)</div>

          <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={runId}
              onChange={(e) => setRunId(e.target.value)}
              placeholder="runId (create a new one or paste an existing runId)"
              style={{ flex: "1 1 320px", padding: "8px 10px", border: "1px solid #e5e5e5", borderRadius: 10, fontSize: 12 }}
            />
            <button
              type="button"
              onClick={() => {
                persistRunId();
                void refreshRunBundle();
              }}
              style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e5e5", background: "#fafafa", fontSize: 12 }}
            >
              Load
            </button>
            <button
              type="button"
              onClick={() => void createRun()}
              disabled={actionBusy === "create-run"}
              style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e5e5", background: "#111", color: "#fff", fontSize: 12 }}
              title="Creates a new run in SQLite using the current export bundle + price snapshot"
            >
              {actionBusy === "create-run" ? "Creating..." : "Create new run"}
            </button>
            {runId ? (
              <a href={`/api/daa/store/v0/run/${encodeURIComponent(runId)}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#111" }}>
                Open JSON
              </a>
            ) : null}
          </div>

          <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
            Local inputs: portfolio positions <b>{portfolioMeta.positionsCount}</b> (cash {portfolioMeta.cash.toFixed(2)}), price snapshot prices <b>{snapshotMeta.count}</b>.
          </div>

          {bundleSummary ? (
            <div style={{ marginTop: 8, fontSize: 12, color: "#333" }}>
              Store: kind <b>{String(bundleSummary.kind ?? "")}</b> · status <b>{String(bundleSummary.status ?? "")}</b> · portfolio <b>{bundleSummary.portfolioAt ? "yes" : "no"}</b> · confirm <b>{bundleSummary.confirmAt ? "yes" : "no"}</b> · executed <b>{bundleSummary.executedAt ? "yes" : "no"}</b> · audit <b>{bundleSummary.auditCount}</b>
            </div>
          ) : null}

          {runStatus === "loading" ? <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>Loading run...</div> : null}
          {runError ? <div style={{ marginTop: 6, fontSize: 12, color: "#a8071a" }}>Run error: {runError}</div> : null}
        </div>

        <div style={{ border: "1px solid #f0f0f0", borderRadius: 12, padding: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 13 }}>Confirm</div>
          <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
            Records a confirmation snapshot (recommendation/orders + price snapshot). Does not execute trades.
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => void savePortfolioSnapshot()}
              disabled={actionBusy === "save-portfolio"}
              style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e5e5", background: "#fafafa", fontSize: 12 }}
            >
              {actionBusy === "save-portfolio" ? "Saving..." : "Save portfolio snapshot"}
            </button>
            <button
              type="button"
              onClick={() => void confirmRun()}
              disabled={actionBusy === "confirm"}
              style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e5e5", background: "#111", color: "#fff", fontSize: 12 }}
            >
              {actionBusy === "confirm" ? "Confirming..." : "Confirm (no trade)"}
            </button>
          </div>

          <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
            Snapshot: updatedAt {snapshotMeta.updatedAt || "(none)"} · portfolio updatedAt {portfolioMeta.updatedAt || "(none)"}
          </div>

          <div style={{ marginTop: 8 }}>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Optional note (saved with confirm/executed)"
              rows={2}
              style={{ width: "100%", padding: "8px 10px", border: "1px solid #e5e5e5", borderRadius: 10, fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
            />
          </div>
        </div>

        <div style={{ border: "1px solid #f0f0f0", borderRadius: 12, padding: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 13 }}>Executed + auto-update portfolio_state</div>
          <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
            Records an executed payload, then updates local <code>daa.portfolio.state</code> by estimating qty deltas from notional orders and the latest price snapshot.
          </div>

          <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ fontSize: 12, color: "#333", display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="radio"
                checked={executedMode === "paperLog"}
                onChange={() => setExecutedMode("paperLog")}
              />
              Paper execution log
            </label>
            <label style={{ fontSize: 12, color: "#333", display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="radio"
                checked={executedMode === "pasteJson"}
                onChange={() => setExecutedMode("pasteJson")}
              />
              Paste JSON
            </label>
          </div>

          {executedMode === "paperLog" ? (
            <div style={{ marginTop: 8 }}>
              <select
                value={selectedPaperEntryId}
                onChange={(e) => setSelectedPaperEntryId(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", border: "1px solid #e5e5e5", borderRadius: 10, fontSize: 12 }}
              >
                <option value="">Select a paper execution log entry...</option>
                {paperLog
                  .slice(-20)
                  .reverse()
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.at} :: {e.source} :: orders {e.orders.length}
                    </option>
                  ))}
              </select>
              {selectedPaperEntry ? (
                <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
                  Selected: {selectedPaperEntry.at} · orders {selectedPaperEntry.orders.length}
                </div>
              ) : null}
            </div>
          ) : (
            <div style={{ marginTop: 8 }}>
              <textarea
                value={executedJsonText}
                onChange={(e) => setExecutedJsonText(e.target.value)}
                placeholder="Paste executed payload JSON (should contain orders or payload.orders)"
                rows={6}
                style={{ width: "100%", padding: "8px 10px", border: "1px solid #e5e5e5", borderRadius: 10, fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
              />
            </div>
          )}

          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => void markExecutedAndUpdatePortfolio()}
              disabled={actionBusy === "executed"}
              style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e5e5", background: "#111", color: "#fff", fontSize: 12 }}
            >
              {actionBusy === "executed" ? "Saving..." : "Mark executed + update portfolio"}
            </button>
            <button
              type="button"
              onClick={() => {
                setExecutedJsonText(pretty(runBundle?.executed?.payload ?? {}));
                setExecutedMode("pasteJson");
              }}
              style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e5e5", background: "#fafafa", fontSize: 12 }}
              title="Convenience: copy the stored executed payload into the textarea (if any)"
            >
              Load stored executed JSON
            </button>
          </div>
        </div>

        {actionResult ? (
          <div style={{ border: "1px solid #f0f0f0", borderRadius: 12, padding: 10, fontSize: 12, color: "#333" }}>{actionResult}</div>
        ) : null}
      </div>
    </section>
  );
}
