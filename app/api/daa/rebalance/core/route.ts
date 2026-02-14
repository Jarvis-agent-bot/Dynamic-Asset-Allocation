import { NextResponse } from "next/server";

import { rebalanceCore } from "@/src/core/rebalanceCore";
import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { isRebalanceCoreRequest, type RebalanceCoreRequest } from "@/src/daa/rebalanceCoreContracts";
import { readJsonBody } from "@/src/daa/requestJson";

export async function POST(req: Request) {
  const denied = requireDaaAdminViewerAuth(req);
  if (denied) return denied;

  const parsed = await readJsonBody<RebalanceCoreRequest>(req);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  if (!isRebalanceCoreRequest(parsed.value)) {
    return NextResponse.json(
      {
        error: "invalid request shape",
        expected: "{ holdings, prices, targetWeights, account?, constraints? }",
      },
      { status: 400 },
    );
  }

  // Pure, deterministic core logic. It returns warnings instead of throwing on bad inputs.
  const out = rebalanceCore(parsed.value);

  return NextResponse.json(out);
}
