import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "email_login_disabled",
      hint: "use /api/daa/auth/login with username + password",
    },
    { status: 410 },
  );
}
