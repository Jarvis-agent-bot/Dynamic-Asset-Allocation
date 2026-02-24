import { NextResponse } from "next/server";

import { requireDaaAdminViewerAuth } from "@/src/daa/adminAuth";

type FixtureSmokeKindV0 = "fixture" | "smoke";

function isProdNodeEnvV0(): boolean {
  return String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
}

function isProdBypassEnabledV0(): boolean {
  const raw = String(process.env.DAA_ENABLE_FIXTURE_SMOKE_ROUTES || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function denyForKindV0(kind: FixtureSmokeKindV0): NextResponse {
  if (kind === "fixture") {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
}

export async function requireDaaFixtureSmokeGateV0(req: Request, kind: FixtureSmokeKindV0): Promise<NextResponse | null> {
  const denied = await requireDaaAdminViewerAuth(req);
  if (!denied) return null;

  if (!isProdNodeEnvV0()) return null;
  if (isProdBypassEnabledV0()) return null;

  return denyForKindV0(kind);
}
