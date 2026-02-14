import { NextResponse } from "next/server";

import { getDaaRunBundleV0 } from "@/src/daa/sqlite/daaSqliteStoreV0";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: { runId: string } }) {
  const runId = String(ctx?.params?.runId ?? "").trim();
  if (!runId) return NextResponse.json({ ok: false, error: "missing runId" }, { status: 400 });

  try {
    const bundle = await getDaaRunBundleV0(runId);
    return NextResponse.json({ ok: true, bundle });
  } catch (e: any) {
    const msg = String(e?.message ?? e ?? "error");
    const status = msg === "run not found" ? 404 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
