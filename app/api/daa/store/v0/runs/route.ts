import { NextResponse } from "next/server";

import { requireDaaAdminViewerAuth } from "../../../../../../src/daa/adminAuth";

import { buildDaaAuditExecutorProtocolV0 } from "../../../../../../src/daa/auditExecutorProtocolV0";
import { listDaaRunsV0 } from "../../../../../../src/daa/storeV0";

export const runtime = "nodejs";

function isIsoDateTimeV0(value: string): boolean {
  if (!value) return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

function normalizeSortV0(value: string | null): "created_desc" | "created_asc" {
  const s = String(value ?? "").trim().toLowerCase();
  return s === "created_asc" ? "created_asc" : "created_desc";
}

function normalizeStatusV0(value: string | null): string | undefined {
  const s = String(value ?? "").trim().toLowerCase();
  if (!s) return undefined;

  if (s === "all") return undefined;
  if (s === "created" || s === "done" || s === "error" || s === "running") return s;

  return s;
}

export async function GET(req: Request) {
  const denied = await requireDaaAdminViewerAuth(req);
  if (denied) return denied;

  const url = new URL(req.url);

  const limitRaw = url.searchParams.get("limit");
  const limitNum = limitRaw === null ? NaN : Number(limitRaw);
  const limit = Number.isFinite(limitNum) ? Math.max(1, Math.min(200, Math.trunc(limitNum))) : 50;

  const beforeCreatedAt = String(url.searchParams.get("beforeCreatedAt") ?? "").trim() || undefined;
  const beforeRunId = String(url.searchParams.get("beforeRunId") ?? "").trim() || undefined;

  // Optional filters for the dashboard audit list.
  const fromCreatedAt = String(url.searchParams.get("fromCreatedAt") ?? "").trim() || undefined;
  const toCreatedAt = String(url.searchParams.get("toCreatedAt") ?? "").trim() || undefined;
  const actor = String(url.searchParams.get("actor") ?? "").trim() || undefined;
  const status = normalizeStatusV0(url.searchParams.get("status"));
  const source = String(url.searchParams.get("source") ?? "").trim() || undefined;
  const q = String(url.searchParams.get("q") ?? "").trim() || undefined;

  const sort = normalizeSortV0(url.searchParams.get("sort"));

  if (fromCreatedAt && !isIsoDateTimeV0(fromCreatedAt)) {
    return NextResponse.json({ ok: false, error: "invalid fromCreatedAt" }, { status: 400 });
  }
  if (toCreatedAt && !isIsoDateTimeV0(toCreatedAt)) {
    return NextResponse.json({ ok: false, error: "invalid toCreatedAt" }, { status: 400 });
  }
  if (fromCreatedAt && toCreatedAt && Date.parse(fromCreatedAt) > Date.parse(toCreatedAt)) {
    return NextResponse.json({ ok: false, error: "fromCreatedAt must be <= toCreatedAt" }, { status: 400 });
  }

  try {
    const runs = await listDaaRunsV0({ limit, beforeCreatedAt, beforeRunId, fromCreatedAt, toCreatedAt, actor, status, source, q, sort });
    const runsWithProtocol = runs.map((run) => ({
      ...run,
      protocol: buildDaaAuditExecutorProtocolV0({
        runId: run.runId,
        kind: run.kind,
        status: run.status,
        hasPortfolio: run.hasPortfolio,
        hasConfirm: run.hasConfirm,
        hasExecuted: run.hasExecuted,
        auditCount: run.auditCount,
      }),
    }));
    return NextResponse.json({ ok: true, runs: runsWithProtocol });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e ?? "error") }, { status: 500 });
  }
}
