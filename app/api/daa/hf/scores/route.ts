import { NextResponse } from "next/server";

import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { getLatestHumanSignalBatchV1 } from "@/src/daa/hf/hfServiceV1";

export const runtime = "nodejs";

function parseCsvList(raw: string | null): string[] | undefined {
  if (!raw) return undefined;
  const values = raw
    .split(",")
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
}

export async function GET(req: Request) {
  const denied = await requireDaaAdminViewerAuth(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const marketScope = parseCsvList(url.searchParams.get("markets"));
  const symbols = parseCsvList(url.searchParams.get("symbols"));
  const fundCodes = parseCsvList(url.searchParams.get("fundCodes"));

  const batch = await getLatestHumanSignalBatchV1({
    marketScope,
    symbols,
    fundCodes,
  });

  return NextResponse.json({ ok: true, ...batch });
}
