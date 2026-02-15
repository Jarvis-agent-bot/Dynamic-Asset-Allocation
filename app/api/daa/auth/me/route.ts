import { NextResponse } from "next/server";

import { getDaaAuthContextFromRequestV0 } from "@/src/daa/auth/daaAuthRequestV0";
import { hasAnyDaaAuthAccountsV0 } from "@/src/daa/auth/daaAuthStoreV0";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const ctx = await getDaaAuthContextFromRequestV0(req);
  if (!ctx) {
    const anyAccounts = await hasAnyDaaAuthAccountsV0();
    const error = anyAccounts ? "not_authenticated" : "bootstrap_required";
    return NextResponse.json({ ok: false, error }, { status: 401 });
  }

  const { account, session } = ctx;

  // Intentionally exclude the raw session token.
  return NextResponse.json({
    ok: true,
    account: {
      accountId: account.accountId,
      username: account.username,
      roles: account.roles,
      status: account.status,
    },
    session: {
      sessionId: session.sessionId,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
      lastSeenAt: session.lastSeenAt,
    },
  });
}
