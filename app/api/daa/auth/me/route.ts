import { NextResponse } from "next/server";

import { getDaaAuthContextFromRequestV0 } from "@/src/daa/auth/daaAuthRequestV0";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const ctx = await getDaaAuthContextFromRequestV0(req);
  if (!ctx) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  return NextResponse.json({ ok: true, account: { accountId: ctx.account.accountId, username: ctx.account.username, roles: ctx.account.roles } });
}
