"use client";

import { useEffect, useMemo, useState } from "react";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import {
  loadPaperExecutionLog,
  type PaperExecutionLogEntryV0,
} from "@/src/daa/executionLogStore";

import { applyNotionalOrdersToPositionsV0 } from "@/src/daa/portfolioApplyNotionalOrdersV0";

import {
  LS_LEGACY_HOLDINGS,
  LS_PORTFOLIO_STATE,
  loadPortfolioStateV1,
} from "../../portfolioStateStore";
import { loadPriceSnapshotV1 } from "../../priceSnapshotStore";
import { WIZARD_DATA_EVENT } from "../../wizardStorage";
import { useDaaWorkflowExportBundleV1 } from "../../useDaaWorkflowExportBundleV1";

const LS_DASHBOARD_ACTIVE_RUN_ID_V0 = "daa.dashboard.activeRunId.v0";

type UiNotice = { variant: "info" | "success" | "error"; message: string };

type BundleResp = { ok: boolean; bundle?: any; error?: string };

function nowIso() {
  return new Date().toISOString();
}

function pretty(x: unknown) {
  return JSON.stringify(x, null, 2);
}

function safeJsonParse(text: string):
  | { ok: true; value: unknown }
  | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, error: "JSON parse failed" };
  }
}

function positionsToLegacyHoldings(
  positions: Record<string, { qty: number; cost?: number }>
) {
  const out: Record<string, { share: number; cost: number }> = {};
  for (const [sym, p] of Object.entries(positions ?? {})) {
    const share = Number((p as any)?.qty ?? NaN);
    if (!Number.isFinite(share) || share <= 0) continue;
    const costRaw = (p as any)?.cost;
    const cost =
      Number.isFinite(Number(costRaw)) && Number(costRaw) >= 0
        ? Number(costRaw)
        : 0;
    out[sym] = { share, cost };
  }
  return out;
}

function Notice({ notice }: { notice: UiNotice }) {
  const base = "rounded-md border px-3 py-2 text-sm";
  if (notice.variant === "error") {
    return (
      <div
        className={`${base} border-destructive/30 bg-destructive/5 text-destructive`}
      >
        {notice.message}
      </div>
    );
  }
  if (notice.variant === "success") {
    return (
      <div
        className={`${base} border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300`}
      >
        {notice.message}
      </div>
    );
  }

  return (
    <div className={`${base} border-border bg-muted/40 text-foreground`}>
      {notice.message}
    </div>
  );
}

export default function DaaDashboardConfirmExecuted() {
  const { exportBundle } = useDaaWorkflowExportBundleV1();

  const [runId, setRunId] = useState<string>("");
  const [runStatus, setRunStatus] = useState<"loading" | "ok" | "error" | null>(
    null
  );
  const [runError, setRunError] = useState<string | null>(null);
  const [runBundle, setRunBundle] = useState<any | null>(null);

  const [noteText, setNoteText] = useState<string>("");

  const [executedMode, setExecutedMode] = useState<"paperLog" | "pasteJson">(
    "paperLog"
  );
  const [executedJsonText, setExecutedJsonText] = useState<string>("{}");
  const [selectedPaperEntryId, setSelectedPaperEntryId] = useState<string>("");

  const [actionBusy, setActionBusy] = useState<
    "create-run" | "save-portfolio" | "confirm" | "executed" | null
  >(null);
  const [notice, setNotice] = useState<UiNotice | null>(null);

  useEffect(() => {
    // Bootstrap local UI state from localStorage.
    const storedRunId =
      typeof window !== "undefined"
        ? String(window.localStorage.getItem(LS_DASHBOARD_ACTIVE_RUN_ID_V0) ?? "")
        : "";
    if (storedRunId.trim()) setRunId(storedRunId.trim());

    const log =
      typeof window !== "undefined"
        ? loadPaperExecutionLog(window.localStorage)
        : [];
    const last = log.length ? log[log.length - 1] : null;
    if (last?.id) setSelectedPaperEntryId(last.id);
  }, []);

  const priceSnapshot = useMemo(
    () => (typeof window === "undefined" ? null : loadPriceSnapshotV1()),
    [runId]
  );
  const portfolioState = useMemo(
    () => (typeof window === "undefined" ? null : loadPortfolioStateV1()),
    [runId]
  );

  const paperLog = useMemo(
    () =>
      typeof window === "undefined"
        ? []
        : loadPaperExecutionLog(window.localStorage),
    [runId]
  );

  const selectedPaperEntry: PaperExecutionLogEntryV0 | null = useMemo(() => {
    const id = String(selectedPaperEntryId ?? "").trim();
    if (!id) return null;
    return paperLog.find((e) => e.id === id) ?? null;
  }, [paperLog, selectedPaperEntryId]);

  async function apiPost(path: string, body: unknown): Promise<any> {
    const headers: Record<string, string> = {
      accept: "application/json",
      "content-type": "application/json",
    };

    const res = await fetch(path, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

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
      const res = await fetch(`/api/daa/store/v0/run/${encodeURIComponent(rid)}`, {
        method: "GET",
        headers: { accept: "application/json" },
      });
      const payload = (await res.json()) as BundleResp;
      if (!res.ok || !payload?.ok)
        throw new Error(String(payload?.error ?? `HTTP ${res.status}`));

      setRunBundle(payload.bundle ?? null);
      setRunStatus("ok");
    } catch (e) {
      setRunStatus("error");
      setRunError(e instanceof Error ? e.message : String(e));
    }
  }

  async function createRun() {
    setNotice(null);

    setActionBusy("create-run");
    try {
      const payload = {
        kind: "daa_dashboard_run_v0",
        status: "created",
        payload: {
          createdAt: nowIso(),
          source: "/daa/dashboard",
          export_bundle: exportBundle,
          price_snapshot: priceSnapshot,
        },
      };

      const r = await apiPost("/api/daa/store/v0/run", payload);
      const rid = String(r?.runId ?? "").trim();
      if (!rid) throw new Error("missing runId in response");

      setRunId(rid);
      window.localStorage.setItem(LS_DASHBOARD_ACTIVE_RUN_ID_V0, rid);

      setNotice({ variant: "success", message: `Created run: ${rid}` });
      await refreshRunBundle(rid);
    } catch (e) {
      setNotice({
        variant: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setActionBusy(null);
    }
  }

  async function savePortfolioSnapshot() {
    setNotice(null);

    const rid = String(runId ?? "").trim();
    if (!rid) {
      setNotice({
        variant: "error",
        message: "Missing runId. Create or set one first.",
      });
      return;
    }

    setActionBusy("save-portfolio");
    try {
      const payload = {
        payload: {
          at: nowIso(),
          portfolio_state: portfolioState,
          price_snapshot: priceSnapshot,
        },
      };

      await apiPost(
        `/api/daa/store/v0/run/${encodeURIComponent(rid)}/portfolio`,
        payload
      );
      setNotice({
        variant: "success",
        message: "Saved portfolio snapshot to SQLite store.",
      });
      await refreshRunBundle();
    } catch (e) {
      setNotice({
        variant: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setActionBusy(null);
    }
  }

  async function confirmRun() {
    setNotice(null);

    const rid = String(runId ?? "").trim();
    if (!rid) {
      setNotice({
        variant: "error",
        message: "Missing runId. Create or set one first.",
      });
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
          price_snapshot: priceSnapshot,
        },
      };

      await apiPost(
        `/api/daa/store/v0/run/${encodeURIComponent(rid)}/confirm`,
        payload
      );
      setNotice({
        variant: "success",
        message: `Confirmed (orders: ${ordersCount}). This does NOT execute trades.`,
      });
      await refreshRunBundle();
    } catch (e) {
      setNotice({
        variant: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setActionBusy(null);
    }
  }

  async function markExecutedAndUpdatePortfolio() {
    setNotice(null);

    const rid = String(runId ?? "").trim();
    if (!rid) {
      setNotice({
        variant: "error",
        message: "Missing runId. Create or set one first.",
      });
      return;
    }

    if (!portfolioState) {
      setNotice({
        variant: "error",
        message:
          "Missing portfolio_state (localStorage). Import or configure it first.",
      });
      return;
    }

    if (!priceSnapshot) {
      setNotice({
        variant: "error",
        message: "Missing price snapshot. Fill it first (used to estimate qty).",
      });
      return;
    }

    const executedPayload = (() => {
      if (executedMode === "paperLog") {
        if (!selectedPaperEntry) {
          return {
            ok: false as const,
            error: "Select a paper execution log entry first.",
          };
        }
        return {
          ok: true as const,
          payload: {
            kind: "executed_v0",
            executedAt: nowIso(),
            mode: "paper",
            paper_entry: selectedPaperEntry,
            note: noteText.trim() ? noteText.trim() : undefined,
          },
          orders: selectedPaperEntry.orders,
        };
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
          raw: parsed.value,
        },
        orders,
      };
    })();

    if (!executedPayload.ok) {
      setNotice({ variant: "error", message: executedPayload.error });
      return;
    }

    setActionBusy("executed");
    try {
      await apiPost(`/api/daa/store/v0/run/${encodeURIComponent(rid)}/executed`, {
        payload: executedPayload.payload,
      });

      // Auto-update local portfolio_state using latest price snapshot.
      const pricesBySymbol: Record<string, number> = {};
      for (const [sym, row] of Object.entries(
        (priceSnapshot as any)?.prices ?? {}
      )) {
        const price = Number((row as any)?.price ?? NaN);
        if (!Number.isFinite(price) || price <= 0) continue;
        pricesBySymbol[String(sym)] = price;
      }

      const positionsQty: Record<string, number> = {};
      const positionsMeta: Record<string, { qty: number; cost?: number }> = {};
      for (const [sym, p] of Object.entries(
        (portfolioState as any)?.positions ?? {}
      )) {
        const qty = Number((p as any)?.qty ?? NaN);
        if (!Number.isFinite(qty) || qty <= 0) continue;
        positionsQty[String(sym)] = qty;
        positionsMeta[String(sym)] = { qty, cost: (p as any)?.cost };
      }

      const applied = applyNotionalOrdersToPositionsV0({
        cash: (portfolioState as any)?.cash,
        positions: positionsQty,
        orders: executedPayload.orders,
        pricesBySymbol,
      });

      // Persist updated portfolio state (and legacy `holdings` for backward compat).
      const nextPositions: Record<string, { qty: number; cost?: number }> = {
        ...positionsMeta,
      };
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
        positions: nextPositions,
      };

      window.localStorage.setItem(LS_PORTFOLIO_STATE, JSON.stringify(nextState));
      window.localStorage.setItem(
        LS_LEGACY_HOLDINGS,
        JSON.stringify(positionsToLegacyHoldings(nextPositions))
      );
      window.dispatchEvent(new CustomEvent(WIZARD_DATA_EVENT));

      const issueText = applied.issues.length
        ? ` Issues: ${applied.issues.slice(0, 5).join("; ")}`
        : "";

      setNotice({
        variant: "success",
        message: `Saved executed payload + updated local portfolio_state.${issueText}`,
      });
      await refreshRunBundle();
    } catch (e) {
      setNotice({
        variant: "error",
        message: e instanceof Error ? e.message : String(e),
      });
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
    const positionsCount = Object.keys((portfolioState as any)?.positions ?? {})
      .length;
    const cash = Number((portfolioState as any)?.cash ?? 0);
    return {
      updatedAt: String((portfolioState as any)?.updatedAt ?? ""),
      positionsCount,
      cash: Number.isFinite(cash) ? cash : 0,
    };
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
      auditCount: Array.isArray(r.audit) ? r.audit.length : 0,
    };
  }, [runBundle]);

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div>
          <CardTitle className="text-base">
            Confirm / Executed (admin flow)
          </CardTitle>
          <CardDescription className="mt-2">
            Persist a DAA run to SQLite, record{" "}
            <span className="font-medium">confirm</span> and{" "}
            <span className="font-medium">executed</span>, then auto-update{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              portfolio_state
            </code>{" "}
            using the latest price snapshot.
          </CardDescription>
        </div>

        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          Safety: this UI never auto-executes trades; it only records what you
          confirmed/executed.
        </div>
      </CardHeader>

      <CardContent className="grid gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Run (SQLite)</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-2">
              <div className="text-sm font-medium">Run ID</div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  value={runId}
                  onChange={(e) => setRunId(e.target.value)}
                  placeholder="runId (create a new one or paste an existing runId)"
                />

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      persistRunId();
                      void refreshRunBundle();
                    }}
                  >
                    Load
                  </Button>

                  <Button
                    type="button"
                    onClick={() => void createRun()}
                    disabled={actionBusy === "create-run"}
                    title="Creates a new run in SQLite using the current export bundle + price snapshot"
                  >
                    {actionBusy === "create-run" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    {actionBusy === "create-run" ? "Creating..." : "Create new run"}
                  </Button>

                  {runId ? (
                    <Button asChild type="button" variant="secondary">
                      <a
                        href={`/api/daa/store/v0/run/${encodeURIComponent(runId)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open JSON
                      </a>
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="text-sm text-muted-foreground">
              Local inputs: portfolio positions{" "}
              <span className="font-medium">{portfolioMeta.positionsCount}</span>
              {" "}(cash {portfolioMeta.cash.toFixed(2)}), price snapshot prices{" "}
              <span className="font-medium">{snapshotMeta.count}</span>.
            </div>

            {bundleSummary ? (
              <div className="text-sm">
                Store: kind{" "}
                <span className="font-medium">{String(bundleSummary.kind ?? "")}</span>
                <span className="text-muted-foreground"> | </span>
                status{" "}
                <span className="font-medium">{String(bundleSummary.status ?? "")}</span>
                <span className="text-muted-foreground"> | </span>
                portfolio{" "}
                <span className="font-medium">
                  {bundleSummary.portfolioAt ? "yes" : "no"}
                </span>
                <span className="text-muted-foreground"> | </span>
                confirm{" "}
                <span className="font-medium">
                  {bundleSummary.confirmAt ? "yes" : "no"}
                </span>
                <span className="text-muted-foreground"> | </span>
                executed{" "}
                <span className="font-medium">
                  {bundleSummary.executedAt ? "yes" : "no"}
                </span>
                <span className="text-muted-foreground"> | </span>
                audit <span className="font-medium">{bundleSummary.auditCount}</span>
              </div>
            ) : null}

            {runStatus === "loading" ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading run...
              </div>
            ) : null}

            {runError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                Run error: {runError}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Confirm</CardTitle>
            <CardDescription>
              Records a confirmation snapshot (recommendation/orders + price
              snapshot). Does not execute trades.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void savePortfolioSnapshot()}
                disabled={actionBusy === "save-portfolio"}
              >
                {actionBusy === "save-portfolio" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {actionBusy === "save-portfolio"
                  ? "Saving..."
                  : "Save portfolio snapshot"}
              </Button>

              <Button
                type="button"
                onClick={() => void confirmRun()}
                disabled={actionBusy === "confirm"}
              >
                {actionBusy === "confirm" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {actionBusy === "confirm" ? "Confirming..." : "Confirm (no trade)"}
              </Button>
            </div>

            <div className="text-sm text-muted-foreground">
              Snapshot updatedAt{" "}
              <span className="font-medium">{snapshotMeta.updatedAt || "(none)"}</span>
              <span className="text-muted-foreground"> | </span>
              Portfolio updatedAt{" "}
              <span className="font-medium">{portfolioMeta.updatedAt || "(none)"}</span>
            </div>

            <div className="grid gap-2">
              <div className="text-sm font-medium">Note (optional)</div>
              <Textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Saved with confirm/executed"
                rows={2}
                className="font-mono"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              Executed + auto-update portfolio_state
            </CardTitle>
            <CardDescription>
              Records an executed payload, then updates local{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                daa.portfolio.state
              </code>{" "}
              by estimating qty deltas from notional orders and the latest price
              snapshot.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Tabs
              value={executedMode}
              onValueChange={(v) => setExecutedMode(v as any)}
            >
              <TabsList>
                <TabsTrigger value="paperLog">Paper execution log</TabsTrigger>
                <TabsTrigger value="pasteJson">Paste JSON</TabsTrigger>
              </TabsList>

              <TabsContent value="paperLog" className="mt-3">
                <div className="grid gap-2">
                  <div className="text-sm font-medium">Paper entry</div>
                  <select
                    value={selectedPaperEntryId}
                    onChange={(e) => setSelectedPaperEntryId(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                    <div className="text-sm text-muted-foreground">
                      Selected{" "}
                      <span className="font-medium">{selectedPaperEntry.at}</span>
                      <span className="text-muted-foreground"> | </span>
                      orders{" "}
                      <span className="font-medium">
                        {selectedPaperEntry.orders.length}
                      </span>
                    </div>
                  ) : null}
                </div>
              </TabsContent>

              <TabsContent value="pasteJson" className="mt-3">
                <div className="grid gap-2">
                  <div className="text-sm font-medium">Executed JSON</div>
                  <Textarea
                    value={executedJsonText}
                    onChange={(e) => setExecutedJsonText(e.target.value)}
                    placeholder="Paste executed payload JSON (should contain orders or payload.orders)"
                    rows={6}
                    className="font-mono"
                  />
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void markExecutedAndUpdatePortfolio()}
                disabled={actionBusy === "executed"}
              >
                {actionBusy === "executed" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {actionBusy === "executed"
                  ? "Saving..."
                  : "Mark executed + update portfolio"}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setExecutedJsonText(pretty(runBundle?.executed?.payload ?? {}));
                  setExecutedMode("pasteJson");
                }}
                title="Convenience: copy the stored executed payload into the textarea (if any)"
              >
                Load stored executed JSON
              </Button>
            </div>
          </CardContent>
        </Card>

        {notice ? <Notice notice={notice} /> : null}
      </CardContent>
    </Card>
  );
}
