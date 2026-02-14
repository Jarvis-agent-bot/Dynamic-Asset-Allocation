"use client";

import { useEffect, useMemo, useState } from "react";

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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { applyNotionalOrdersToPositionsV0, normalizeNotionalOrdersV0 } from "@/src/daa/portfolioApplyNotionalOrdersV0";

import { copyTextToClipboard } from "../../copyToClipboard";

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

function shortText(s: unknown, max = 120): string {
  const one = String(s ?? "").replace(/\s+/g, " ").trim();
  if (!one) return "";
  if (one.length <= max) return one;
  if (max <= 3) return one.slice(0, max);
  return one.slice(0, max - 3) + "...";
}

function summarizeAuditPayload(payload: unknown): string {
  if (payload === null || payload === undefined) return "";

  if (Array.isArray(payload)) return "array(" + payload.length + ")";

  if (typeof payload === "object") {
    const keys = Object.keys(payload as any)
      .map((k) => String(k ?? "").trim())
      .filter((k) => k && k !== "payload")
      .slice(0, 6);
    return keys.length ? "keys: " + keys.join(", ") : "object";
  }

  return shortText(payload);
}

export default function DaaDashboardHistoryAudit() {
  const [runs, setRuns] = useState<RunListRow[]>([]);
  const [runsStatus, setRunsStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [runsError, setRunsError] = useState<string | null>(null);

  const [runsPageSize, setRunsPageSize] = useState<number>(20);

  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [bundleStatus, setBundleStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [bundleError, setBundleError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<any | null>(null);

  const [selectedAuditEventId, setSelectedAuditEventId] = useState<string>("");
  const [auditModalOpen, setAuditModalOpen] = useState<boolean>(false);
  const [auditCopyStatus, setAuditCopyStatus] = useState<"idle" | "ok" | "error">("idle");

  const [auditPageSize, setAuditPageSize] = useState<number>(25);
  const [auditPage, setAuditPage] = useState<number>(1);

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
      setSelectedAuditEventId("");
      setAuditModalOpen(false);
      setAuditCopyStatus("idle");
    }

    setRunsError(null);
    setRunsStatus("loading");

    const qs = new URLSearchParams();
    const runLimit = Math.max(1, Math.min(200, Math.floor(runsPageSize || 20)));
    qs.set("limit", String(runLimit));

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

    setSelectedAuditEventId("");
    setAuditModalOpen(false);
    setAuditCopyStatus("idle");

    setAuditPage(1);

    try {
      const headers: Record<string, string> = { accept: "application/json" };
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
  }, [actorFilter, fromIso, toIso, runsPageSize]);

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
      pricesBySymbol});

    return { portfolioState, priceSnapshot, orders, normalizedOrders, applied };
  }, [bundle]);

  const auditEvents = useMemo(() => (Array.isArray(bundle?.audit) ? (bundle.audit as any[]) : []), [bundle]);

  const auditTotal = auditEvents.length;

  const auditPageCount = useMemo(() => {
    const size = Math.max(1, Math.floor(auditPageSize || 25));
    return Math.max(1, Math.ceil(auditTotal / size));
  }, [auditTotal, auditPageSize]);

  useEffect(() => {
    // Clamp after loading a different run or changing page size.
    setAuditPage((p) => Math.min(Math.max(1, p), auditPageCount));
  }, [auditPageCount]);

  const auditPageEvents = useMemo(() => {
    const size = Math.max(1, Math.floor(auditPageSize || 25));
    const page = Math.min(Math.max(1, auditPage), auditPageCount);
    const start = (page - 1) * size;
    return auditEvents.slice(start, start + size);
  }, [auditEvents, auditPage, auditPageCount, auditPageSize]);

  const selectedAuditEvent = useMemo(() => {
    const id = String(selectedAuditEventId ?? "").trim();
    if (!id) return null;
    return auditEvents.find((e) => String((e as any)?.eventId ?? "").trim() === id) ?? null;
  }, [auditEvents, selectedAuditEventId]);

  async function doCopyAudit(text: string) {
    try {
      await copyTextToClipboard(text);
      setAuditCopyStatus("ok");
      window.setTimeout(() => setAuditCopyStatus("idle"), 1200);
    } catch {
      setAuditCopyStatus("error");
      window.setTimeout(() => setAuditCopyStatus("idle"), 2000);
    }
  }

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle>History / Audit (SQLite)</CardTitle>
        <CardDescription>
          Recent runs + audit events. For safety: this page never executes trades; it only shows history and stored payloads.
        </CardDescription>

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Actor
            <select
              value={actorFilter}
              onChange={(e) => setActorFilter(String(e.target.value ?? ""))}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">All</option>
              <option value="dashboard">dashboard</option>
              <option value="market-funds">market-funds</option>
              <option value="unknown">unknown</option>
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Runs page size
            <select
              value={String(runsPageSize)}
              onChange={(e) => {
                const n = Number(String(e.target.value ?? ""));
                setRunsPageSize(Number.isFinite(n) && n > 0 ? n : 20);
              }}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </label>

          <Input
            type="datetime-local"
            value={fromLocal}
            onChange={(e) => setFromLocal(String(e.target.value ?? ""))}
            title="From (local time)"
            className="h-9 w-[min(240px,92vw)]"
          />

          <Input
            type="datetime-local"
            value={toLocal}
            onChange={(e) => setToLocal(String(e.target.value ?? ""))}
            title="To (local time)"
            className="h-9 w-[min(240px,92vw)]"
          />

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setActorFilter("");
              setFromLocal("");
              setToLocal("");
            }}
            disabled={runsStatus === "loading"}
          >
            Clear
          </Button>

          <Button type="button" variant="outline" size="sm" onClick={() => loadRuns("reset")} disabled={runsStatus === "loading"}>
            Refresh
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
              const lines: unknown[][] = [
                ["runId", "createdAt", "kind", "status", "actor", "source", "hasPortfolio", "hasConfirm", "hasExecuted", "auditCount"],
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
          >
            Export CSV
          </Button>

          <Button type="button" variant="outline" size="sm" onClick={() => loadRuns("more")} disabled={runsStatus === "loading" || !cursor}>
            Load more
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {runsError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <b>Runs error</b>: {runsError}
          </div>
        ) : null}

        <div className="space-y-2">
          {runs.length ? (
            runs.map((r) => {
              const selected = selectedRunId === r.runId;
              return (
                <div key={r.runId} className={selected ? "rounded-md border bg-muted/20 p-3" : "rounded-md border p-3"}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">
                        {r.kind} <span className="text-muted-foreground">·</span> {r.status}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {fmtTime(r.createdAt)} <span className="text-muted-foreground">·</span> {r.runId}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        portfolio:{r.hasPortfolio ? "yes" : "no"} <span className="text-muted-foreground">·</span> confirm:{r.hasConfirm ? "yes" : "no"}{" "}
                        <span className="text-muted-foreground">·</span> executed:{r.hasExecuted ? "yes" : "no"} <span className="text-muted-foreground">·</span> audit:{r.auditCount}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        actor:{String(r.actor ?? "")} <span className="text-muted-foreground">·</span> source:{String(r.source ?? "") || "-"}
                      </div>
                    </div>

                    <Button type="button" variant="outline" size="sm" onClick={() => loadBundle(r.runId)} disabled={bundleStatus === "loading" && selected}>
                      {selected ? "Reload details" : "View details"}
                    </Button>
                  </div>

                  {selected ? (
                    <div className="mt-3 space-y-3">
                      {bundleStatus === "loading" ? <div className="text-sm text-muted-foreground">Loading bundle...</div> : null}
                      {bundleError ? (
                        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                          <b>Bundle error</b>: {bundleError}
                        </div>
                      ) : null}

                      {bundle ? (
                        <div className="space-y-4">
                          <div>
                            <div className="text-sm font-semibold">Run</div>
                            <pre className="mt-2 whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs">{pretty(bundle.run)}</pre>
                          </div>

                          <div>
                            <div className="text-sm font-semibold">Portfolio snapshot (stored)</div>
                            <pre className="mt-2 whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs">{pretty(bundle.portfolio)}</pre>
                          </div>

                          <div>
                            <div className="text-sm font-semibold">Confirm (stored)</div>
                            <pre className="mt-2 whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs">{pretty(bundle.confirm)}</pre>
                          </div>

                          <div>
                            <div className="text-sm font-semibold">Executed (stored)</div>
                            <pre className="mt-2 whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs">{pretty(bundle.executed)}</pre>
                          </div>

                          {derived ? (
                            <div>
                              <div className="text-sm font-semibold">Before/After (derived, not executed)</div>
                              <div className="mt-1 text-sm text-muted-foreground">
                                This derives positionsAfter by applying stored/manual orders onto the stored portfolio snapshot using the stored price snapshot.
                              </div>
                              <pre className="mt-2 whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs">{pretty({ orders_normalize_issues: derived.normalizedOrders.issues, applied: derived.applied })}</pre>
                            </div>
                          ) : null}

                          <div>
                            <div className="text-sm font-semibold">Audit events</div>
                            <div className="mt-1 text-sm text-muted-foreground">
                              Click a row to view payload + metadata (read-only). This never executes trades.
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <div className="text-sm text-muted-foreground">
                                Total: <b className="text-foreground">{auditTotal}</b>
                              </div>

                              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                                Page size
                                <select
                                  value={String(auditPageSize)}
                                  onChange={(e) => {
                                    const n = Number(String(e.target.value ?? ""));
                                    setAuditPageSize(Number.isFinite(n) && n > 0 ? n : 25);
                                    setAuditPage(1);
                                  }}
                                  className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                  <option value="10">10</option>
                                  <option value="25">25</option>
                                  <option value="50">50</option>
                                  <option value="100">100</option>
                                </select>
                              </label>

                              <div className="text-sm text-muted-foreground">
                                Page <b className="text-foreground">{auditPage}</b> / <b className="text-foreground">{auditPageCount}</b>
                              </div>

                              <Button type="button" variant="outline" size="sm" onClick={() => setAuditPage((p) => Math.max(1, p - 1))} disabled={auditPageCount <= 1 || auditPage <= 1}>
                                Prev
                              </Button>
                              <Button type="button" variant="outline" size="sm" onClick={() => setAuditPage((p) => Math.min(auditPageCount, p + 1))} disabled={auditPageCount <= 1 || auditPage >= auditPageCount}>
                                Next
                              </Button>
                            </div>

                            {auditEvents.length ? (
                              <div className="mt-2 rounded-md border">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="w-[160px]">Time</TableHead>
                                      <TableHead className="w-[240px]">Kind</TableHead>
                                      <TableHead>Payload</TableHead>
                                      <TableHead className="w-[220px]" />
                                    </TableRow>
                                  </TableHeader>

                                  <TableBody>
                                    {auditPageEvents.map((e: any) => {
                                      const eventId = String(e?.eventId ?? "").trim();
                                      const createdAt = e?.createdAt;
                                      const kind = String(e?.kind ?? "").trim();
                                      const payloadSummary = summarizeAuditPayload(e?.payload);

                                      return (
                                        <TableRow key={eventId || kind + "_" + String(createdAt ?? "")} className="hover:bg-muted/30">
                                          <TableCell className="text-xs text-muted-foreground">{fmtTime(createdAt)}</TableCell>
                                          <TableCell className="font-mono text-xs">{kind || "-"}</TableCell>
                                          <TableCell className="text-xs text-muted-foreground">{payloadSummary || "-"}</TableCell>
                                          <TableCell>
                                            <div className="flex justify-end gap-2">
                                              <Button type="button" variant="outline" size="sm" onClick={() => doCopyAudit(pretty(e))}>
                                                Copy JSON
                                              </Button>
                                              <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => {
                                                  if (!eventId) return;
                                                  setSelectedAuditEventId(eventId);
                                                  setAuditModalOpen(true);
                                                  setAuditCopyStatus("idle");
                                                }}
                                                disabled={!eventId}
                                              >
                                                Details
                                              </Button>
                                            </div>
                                          </TableCell>
                                        </TableRow>
                                      );
                                    })}
                                  </TableBody>
                                </Table>
                              </div>
                            ) : (
                              <pre className="mt-2 whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs">{pretty(bundle.audit)}</pre>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })
          ) : runsStatus === "loading" ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-md border p-3">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-[240px]" />
                    <Skeleton className="h-3 w-[360px]" />
                    <Skeleton className="h-3 w-[280px]" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border bg-muted/20 p-4 text-sm">
              <div className="font-medium">No runs yet</div>
              <div className="mt-1 text-muted-foreground">
                Create the first run in the "Confirm/Executed" section (save snapshot + confirm). This view is read-only and never executes trades.
              </div>
            </div>
          )}
        </div>
      </CardContent>

      <Dialog
        open={auditModalOpen}
        onOpenChange={(open) => {
          setAuditModalOpen(open);
          if (!open) setSelectedAuditEventId("");
        }}
      >
        <DialogContent className="max-w-[980px]">
          <DialogHeader>
            <DialogTitle>Audit event details</DialogTitle>
            <DialogDescription>Read-only view of the stored audit event payload + metadata.</DialogDescription>
          </DialogHeader>

          {selectedAuditEvent ? (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                <div>
                  <b className="text-foreground">kind</b>: <span className="font-mono">{String((selectedAuditEvent as any)?.kind ?? "")}</span>
                </div>
                <div>
                  <b className="text-foreground">createdAt</b>: {fmtTime((selectedAuditEvent as any)?.createdAt)}
                </div>
                <div>
                  <b className="text-foreground">eventId</b>: <span className="font-mono">{String((selectedAuditEvent as any)?.eventId ?? "")}</span>
                </div>
                <div>
                  <b className="text-foreground">runId</b>: <span className="font-mono">{String((selectedAuditEvent as any)?.runId ?? "")}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" onClick={() => doCopyAudit(pretty((selectedAuditEvent as any)?.payload))}>
                  {auditCopyStatus === "ok" ? "Copied" : auditCopyStatus === "error" ? "Copy failed" : "Copy payload JSON"}
                </Button>
                <Button type="button" variant="outline" onClick={() => doCopyAudit(pretty(selectedAuditEvent))}>
                  Copy full event JSON
                </Button>
              </div>

              <div>
                <div className="text-sm font-semibold">Payload</div>
                <pre className="mt-2 max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs">{pretty((selectedAuditEvent as any)?.payload)}</pre>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No audit event selected.</div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
