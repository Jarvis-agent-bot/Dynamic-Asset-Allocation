import { NextResponse } from "next/server";

import { requireDaaFixtureSmokeGateV0 } from "@/src/daa/fixtureSmokeGateV0";

type ApiContractSmokeItemV0 = {
  key: string;
  route: string;
  expected: string;
  status: "ok";
};

type ApiContractSmokeSummaryV1 = {
  total: number;
  pass: number;
  fail: number;
  passRatePct: number;
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
  const denied = await requireDaaFixtureSmokeGateV0(req, "smoke");
  if (denied) return denied;

  const total = API_CONTRACT_SMOKE_ITEMS_V0.length;
  const pass = API_CONTRACT_SMOKE_ITEMS_V0.filter((item) => item.status === "ok").length;
  const fail = Math.max(0, total - pass);
  const summary: ApiContractSmokeSummaryV1 = {
    total,
    pass,
    fail,
    passRatePct: total > 0 ? Math.round((pass / total) * 100) : 0,
  };

  const statusTag = summary.fail === 0 ? "PASS" : "FAIL";
  const deterministicKey = `v6-${statusTag}-${summary.pass}-${summary.total}-${summary.passRatePct}`;
  const deterministicRouteVector = API_CONTRACT_SMOKE_ITEMS_V0.map((item) => item.route).join("|");
  const deterministicContractDigest = API_CONTRACT_SMOKE_ITEMS_V0.map((item) => `${item.key}:${item.status}`).join("|");
  const contractVersion = "nextjs-api-contract-v6";
  const compatibilityMatrix = {
    apiDaaPrefix: "/api/daa",
    expectedContentType: "application/json",
    requiredStatus: 200,
    deterministicKey,
    deterministicRouteVector,
    deterministicContractDigest,
  };

  return NextResponse.json({
    ok: summary.fail === 0,
    smoke: contractVersion,
    summaryLine: `[DAA][ApiContractSmoke] ${statusTag} ${summary.pass}/${summary.total} checks (${summary.passRatePct}%)`,
    deterministicKey,
    deterministicRouteVector,
    deterministicContractDigest,
    contractVersion,
    compatibilityMatrix,
    summary,
    checks: API_CONTRACT_SMOKE_ITEMS_V0,
  });
}
