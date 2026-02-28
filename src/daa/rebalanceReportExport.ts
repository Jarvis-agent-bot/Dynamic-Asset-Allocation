import { loadPaperExecutionLog, type PaperExecutionLogEntryV0 } from "./executionLogStore";
import { loadRebalanceLog, type RebalanceLogEntryV0 } from "./rebalanceLogStore";

export const REBALANCE_RUN_REPORT_SCHEMA_VERSION = 1 as const;

export type RebalanceRunReportV1 = {
  schemaVersion: 1;
  kind: "rebalance_run_report";
  exportedAt: string;
  // The last known run payload (best-effort). "request"/"response" come from the rebalance log entry when possible.
  run: {
    rebalanceLogEntry: RebalanceLogEntryV0 | null;
    paperExecutionLogEntry: PaperExecutionLogEntryV0 | null;
    request: unknown;
    response: unknown;
  };
  notes: string[];
};

function nowIso() {
  return new Date().toISOString();
}

function isoMs(x: string): number {
  const ms = Date.parse(x);
  return Number.isFinite(ms) ? ms : Number.NaN;
}

function pickLatestByAt<T extends { at: string }>(entries: T[]): T | null {
  let best: T | null = null;
  let bestMs = Number.NEGATIVE_INFINITY;

  for (const e of entries) {
    if (!e || typeof e !== "object") continue;
    const ms = isoMs(String((e as any).at ?? ""));
    if (!Number.isFinite(ms)) continue;
    if (ms > bestMs) {
      best = e;
      bestMs = ms;
    }
  }

  return best;
}

const PAPER_RUN_NOTE = "ui:unified-core:paper-run";

export function buildLatestRebalanceRunReportV1(storage: Pick<Storage, "getItem"> | null | undefined): RebalanceRunReportV1 {
  const notes: string[] = [];

  const rebalanceLog = loadRebalanceLog(storage);
  const paperOnly = rebalanceLog.filter((e) => e.note === PAPER_RUN_NOTE);
  const rebalanceLogEntry = pickLatestByAt(paperOnly.length ? paperOnly : rebalanceLog);

  const executionLog = loadPaperExecutionLog(storage);
  const execPaperOnly = executionLog.filter((e) => e.note === PAPER_RUN_NOTE);
  const execCandidates = execPaperOnly.length ? execPaperOnly : executionLog;

  // When available, use runId to pair the plan (rebalanceLog) with its execution snapshot.
  const runId = rebalanceLogEntry?.runId;
  const paperExecutionLogEntryByRunId = runId ? pickLatestByAt(execCandidates.filter((e) => e.runId === runId)) : null;
  const paperExecutionLogEntry = paperExecutionLogEntryByRunId ?? pickLatestByAt(execCandidates);

  if (runId && !paperExecutionLogEntryByRunId) notes.push(`missing paperExecutionLog entry for runId=${runId}`);

  // 统一控制台下 request/response 以 rebalanceLog 为唯一来源。
  const request = rebalanceLogEntry?.request !== undefined ? rebalanceLogEntry.request : null;
  const response = rebalanceLogEntry?.response !== undefined ? rebalanceLogEntry.response : null;

  if (!rebalanceLogEntry) notes.push("missing rebalanceLog entry (no prior runs recorded)");
  if (!paperExecutionLogEntry) notes.push("missing paperExecutionLog entry (orders may not have been recorded)");
  if (request == null) notes.push("missing request in rebalanceLog");
  if (response == null) notes.push("missing response in rebalanceLog");

  return {
    schemaVersion: REBALANCE_RUN_REPORT_SCHEMA_VERSION,
    kind: "rebalance_run_report",
    exportedAt: nowIso(),
    run: {
      rebalanceLogEntry,
      paperExecutionLogEntry,
      request,
      response,
    },
    notes,
  };
}
