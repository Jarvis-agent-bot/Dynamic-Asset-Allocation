import { NextResponse } from "next/server";

import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { buildTargetedDecisionTransparencyV0 } from "@/src/daa/targetedDecisionTransparencyV0";

type DecisionTraceRowV0 = {
  id: string;
  label: string;
  currentPct: number;
  targetPct: number;
  deltaPct: number;
};

const TRACE_ROWS_V0: DecisionTraceRowV0[] = [
  { id: "AAA", label: "Alpha Core", currentPct: 0.22, targetPct: 0.18, deltaPct: 0.04 },
  { id: "BBB", label: "Beta Value", currentPct: 0.11, targetPct: 0.16, deltaPct: -0.05 },
  { id: "CCC", label: "Cash Proxy", currentPct: 0.07, targetPct: 0.06, deltaPct: 0.01 },
];

function parseSliceSymbolV0(raw: string): string | null {
  const v = String(raw || "").trim().toUpperCase();
  if (!v) return null;
  if (!/^[A-Z0-9._-]{1,24}$/.test(v)) return null;
  return v;
}

export async function GET(req: Request) {
  const denied = await requireDaaAdminViewerAuth(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const requestedSlice = parseSliceSymbolV0(url.searchParams.get("slice") || "") || TRACE_ROWS_V0[0]?.id || "AAA";

  const selectedRow = TRACE_ROWS_V0.find((r) => r.id === requestedSlice) || TRACE_ROWS_V0[0];
  const detail = buildTargetedDecisionTransparencyV0({
    rebalanceTableRows: selectedRow ? [selectedRow] : [],
    driftThresholdPct: 0.02,
    cashBlocked: false,
    liquidityBlocked: false,
    hasBlockingViolation: false,
    resolvePrice: (symbol: string) => ({ price: symbol === "BBB" ? 98.2 : 102.4, source: "pm-bridge-smoke" }),
  });

  if (!detail) {
    return NextResponse.json({ ok: false, error: "decision trace unavailable" }, { status: 404 });
  }

  const payload = {
    ok: true,
    exportedAt: new Date().toISOString(),
    slice: requestedSlice,
    trace: detail,
  };

  return NextResponse.json(payload, {
    status: 200,
    headers: {
      "content-disposition": `attachment; filename="decision-trace-${requestedSlice.toLowerCase()}.json"`,
      "cache-control": "no-store",
    },
  });
}
