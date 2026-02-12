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

function safeJsonParse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

// Kept in sync with app/daa/wizardStorage.ts (but defined here so src/daa stays standalone).
const LS_REBALANCE_REQUEST = "daa.wizard.rebalanceRequest";
const LS_REBALANCE_RESPONSE = "daa.wizard.rebalanceResponse";

const PAPER_RUN_NOTE = "ui:market/funds:paper-run";

export function buildLatestRebalanceRunReportV1(storage: Pick<Storage, "getItem"> | null | undefined): RebalanceRunReportV1 {
  const notes: string[] = [];

  const rebalanceLog = loadRebalanceLog(storage);
  const paperOnly = rebalanceLog.filter((e) => e.note === PAPER_RUN_NOTE);
  const rebalanceLogEntry = pickLatestByAt(paperOnly.length ? paperOnly : rebalanceLog);

  const executionLog = loadPaperExecutionLog(storage);
  const execPaperOnly = executionLog.filter((e) => e.note === PAPER_RUN_NOTE);
  const paperExecutionLogEntry = pickLatestByAt(execPaperOnly.length ? execPaperOnly : executionLog);

  // Prefer request/response attached to the rebalance log entry (it should be the source of truth for the run).
  const request = rebalanceLogEntry?.request !== undefined ? rebalanceLogEntry.request : safeJsonParse(storage?.getItem(LS_REBALANCE_REQUEST) ?? null);
  const response = rebalanceLogEntry?.response !== undefined ? rebalanceLogEntry.response : safeJsonParse(storage?.getItem(LS_REBALANCE_RESPONSE) ?? null);

  if (!rebalanceLogEntry) notes.push("missing rebalanceLog entry (no prior runs recorded)");
  if (!paperExecutionLogEntry) notes.push("missing paperExecutionLog entry (orders may not have been recorded)");
  if (request == null) notes.push(`missing ${LS_REBALANCE_REQUEST}`);
  if (response == null) notes.push(`missing ${LS_REBALANCE_RESPONSE}`);

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
