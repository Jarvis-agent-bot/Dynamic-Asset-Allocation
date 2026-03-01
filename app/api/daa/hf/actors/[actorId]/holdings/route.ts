import { NextResponse } from "next/server";

import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";
import { listActorHoldingsV1 } from "@/src/daa/hf/hfServiceV1";

export const runtime = "nodejs";

function parseCsvList(raw: string | null): string[] | undefined {
  if (!raw) return undefined;
  const values = raw
    .split(",")
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
}

export async function GET(
  req: Request,
  context: { params: { actorId: string } },
) {
  const denied = await requireDaaAdminViewerAuth(req);
  if (denied) return denied;

  const actorId = String(context.params.actorId || "").trim();
  if (!actorId) {
    return NextResponse.json({ ok: false, error: "missing_actor_id" }, { status: 400 });
  }

  const url = new URL(req.url);
  const marketScope = parseCsvList(url.searchParams.get("markets"));
  const holdings = listActorHoldingsV1(actorId, { marketScope });

  return NextResponse.json({
    ok: true,
    actorId,
    marketScope: marketScope ?? null,
    count: holdings.length,
    holdings,
  });
}
