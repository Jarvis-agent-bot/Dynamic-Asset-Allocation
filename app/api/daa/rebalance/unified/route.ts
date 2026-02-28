import { NextResponse } from "next/server";

import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import {
  buildDaaUnifiedPlanV1,
  DAA_UNIFIED_SAMPLE_REQUEST_V1,
  isDaaUnifiedRequestV1,
  type DaaUnifiedRequestV1,
} from "@/src/daa/unifiedRebalanceV1";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = await requireDaaAdminViewerAuth(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const withDemo = url.searchParams.get("demo") === "1";

  if (!withDemo) {
    return NextResponse.json({
      ok: true,
      message: "POST JSON 到该接口可获取统一再平衡方案。追加 ?demo=1 可返回示例输入/输出。",
    });
  }

  return NextResponse.json({
    ok: true,
    request: DAA_UNIFIED_SAMPLE_REQUEST_V1,
    response: buildDaaUnifiedPlanV1(DAA_UNIFIED_SAMPLE_REQUEST_V1),
  });
}

export async function POST(req: Request) {
  const denied = await requireDaaAdminViewerAuth(req);
  if (denied) return denied;

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  if (!isDaaUnifiedRequestV1(body)) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_request",
        expected: {
          targetWeights: "Record<string, number>",
          positions: "Array<{ symbol, qty, price, market?, currency?, tags?, liquidityNotional24h? }>",
          analysts: "Array<{ analystId, accuracyPct, riskControlPct, disciplinePct, transparencyPct, stance?, styleCluster? }>",
          assetViews: "Array<{ symbol, analystId, convictionPct, thesisDriftPct, momentumRegime? }>",
        },
      },
      { status: 400 },
    );
  }

  const request = body as DaaUnifiedRequestV1;
  const plan = buildDaaUnifiedPlanV1(request);
  return NextResponse.json(plan);
}
