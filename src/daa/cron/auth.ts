import { NextResponse } from "next/server";

function normalizeToken(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function parseBearer(req: Request): string {
  const raw = normalizeToken(req.headers.get("authorization"));
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return normalizeToken(m ? m[1] : "");
}

export function requireCronAuth(req: Request): NextResponse | null {
  const expected = normalizeToken(process.env.DAA_CRON_TOKEN || process.env.CRON_SECRET);

  if (!expected) {
    if ((process.env.NODE_ENV || "").toLowerCase() !== "production") return null;
    return NextResponse.json({ ok: false, error: "missing_cron_secret" }, { status: 500 });
  }

  const provided = normalizeToken(req.headers.get("x-daa-cron-token")) || parseBearer(req);
  if (provided && provided === expected) return null;

  return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
}
