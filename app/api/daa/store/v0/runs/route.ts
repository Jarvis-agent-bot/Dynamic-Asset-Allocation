import { NextResponse } from "next/server";

import { listDaaRunsV0 } from "@/src/daa/sqlite/daaSqliteStoreV0";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);

  const limitRaw = url.searchParams.get("limit");
  const limitNum = limitRaw === null ? NaN : Number(limitRaw);
  const limit = Number.isFinite(limitNum) ? Math.max(1, Math.min(200, Math.trunc(limitNum))) : 50;

  const beforeCreatedAt = String(url.searchParams.get("beforeCreatedAt") ?? "").trim() || undefined;
  const beforeRunId = String(url.searchParams.get("beforeRunId") ?? "").trim() || undefined;

  try {
    const runs = await listDaaRunsV0({ limit, beforeCreatedAt, beforeRunId });
    return NextResponse.json({ ok: true, runs });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e ?? "error") }, { status: 500 });
  }
}
