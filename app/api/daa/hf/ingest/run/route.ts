import { NextResponse } from "next/server";

import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { getHumanIngestRuntimeStateV1, runHumanIngestV1 } from "@/src/daa/hf/hfServiceV1";

export const runtime = "nodejs";

type IngestBody = {
  marketScope?: string[];
  reportDates?: string[];
  fundCodes?: string[];
};

function normalizeMarketScope(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const values = input
    .map((x) => String(x || "").trim().toUpperCase())
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
}

function normalizeFundCodes(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const values = input
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
}

export async function GET(req: Request) {
  const denied = await requireDaaAdminViewerAuth(req);
  if (denied) return denied;

  const state = getHumanIngestRuntimeStateV1();

  return NextResponse.json({
    ok: true,
    lastIngestAt: state.lastIngestAt,
    ingestCount: state.ingestCount,
    hasBatch: Boolean(state.latestBatch),
    latestBatchAsOfDate: state.latestBatch?.asOfDate ?? null,
    latestSignalCount: state.latestBatch?.signals.length ?? 0,
  });
}

export async function POST(req: Request) {
  const denied = await requireDaaAdminViewerAuth(req);
  if (denied) return denied;

  let body: IngestBody | null = null;
  try {
    body = (await req.json()) as IngestBody;
  } catch {
    body = null;
  }

  const marketScope = normalizeMarketScope(body?.marketScope);
  const reportDates = Array.isArray(body?.reportDates)
    ? body!.reportDates.map((x) => String(x || "").trim()).filter(Boolean)
    : undefined;
  const fundCodes = normalizeFundCodes(body?.fundCodes);
  const { summary, batch } = await runHumanIngestV1({ marketScope, reportDates, fundCodes });

  return NextResponse.json({
    ok: true,
    summary,
    batch,
  });
}
