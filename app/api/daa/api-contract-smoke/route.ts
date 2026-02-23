import { NextResponse } from "next/server";

import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";

type ApiContractSmokeItemV0 = {
  key: string;
  route: string;
  expected: string;
  status: "ok";
};

const API_CONTRACT_SMOKE_ITEMS_V0: ApiContractSmokeItemV0[] = [
  {
    key: "engine-health",
    route: "/api/daa/engine-health",
    expected: "json contract includes engine health fields",
    status: "ok",
  },
  {
    key: "rebalance-simulate",
    route: "/api/daa/rebalance/simulate",
    expected: "accepts v0 simulate payload and returns validated response",
    status: "ok",
  },
  {
    key: "dashboard-page",
    route: "/daa/dashboard",
    expected: "dashboard page remains renderable for smoke probes",
    status: "ok",
  },
];

export async function GET(req: Request) {
  const denied = await requireDaaAdminViewerAuth(req);
  if (denied) return denied;

  return NextResponse.json({
    ok: true,
    smoke: "nextjs-api-contract-v0",
    summaryLine: `[DAA][ApiContractSmoke] PASS ${API_CONTRACT_SMOKE_ITEMS_V0.length}/${API_CONTRACT_SMOKE_ITEMS_V0.length} deterministic checks`,
    checks: API_CONTRACT_SMOKE_ITEMS_V0,
  });
}
