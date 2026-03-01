import { NextResponse } from "next/server";

import { ensureDaaStoreSchemaPgV1 } from "@/src/daa/store/daaStorePgV1";

export const runtime = "nodejs";

export async function GET() {
  try {
    await ensureDaaStoreSchemaPgV1();

    return NextResponse.json({
      ok: true,
      service: "daa-engine",
      version: "next-v1",
      runtime: "nextjs",
      store: "postgres-compatible",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({
      ok: false,
      error: "engine_health_failed",
      message,
    }, { status: 500 });
  }
}
