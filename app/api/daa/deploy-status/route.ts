import { NextResponse } from "next/server";

import { buildDeployStatusPayloadV0 } from "@/src/daa/deployStatusV0";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Keep the payload intentionally small; this is shown in the dashboard.
  // IMPORTANT: do not return secret env var values; only presence/metadata.
  const payload = buildDeployStatusPayloadV0(process.env, new Date().toISOString());

  return NextResponse.json(payload, {
    headers: {
      // Avoid stale build info after redeploys.
      "cache-control": "no-store",
    },
  });
}
