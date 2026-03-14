import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { resolveSecret } from "@/src/daa/config/secretsManager";

function normalizeToken(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function parseBearer(req: Request): string {
  const raw = normalizeToken(req.headers.get("authorization"));
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return normalizeToken(m ? m[1] : "");
}

export async function requireCronAuth(req: Request): Promise<NextResponse | null> {
  const expected = await resolveSecret("cron_token");

  if (!expected) {
    if ((process.env.NODE_ENV || "").toLowerCase() !== "production") return null;
    return NextResponse.json({ ok: false, error: "missing_cron_secret" }, { status: 500 });
  }

  const provided = normalizeToken(req.headers.get("x-daa-cron-token")) || parseBearer(req);
  if (provided) {
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    const maxLen = Math.max(a.length, b.length);
    const paddedA = Buffer.alloc(maxLen);
    const paddedB = Buffer.alloc(maxLen);
    a.copy(paddedA);
    b.copy(paddedB);
    if (a.length === b.length && timingSafeEqual(paddedA, paddedB)) return null;
  }

  return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
}
