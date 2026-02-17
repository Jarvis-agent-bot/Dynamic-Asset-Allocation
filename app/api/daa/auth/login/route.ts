import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "password login disabled",
      hint: "use /api/daa/auth/email-login/request + /api/daa/auth/email-login/verify",
    },
    { status: 410 },
  );
}
