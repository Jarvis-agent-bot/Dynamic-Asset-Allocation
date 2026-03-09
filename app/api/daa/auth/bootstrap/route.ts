import { timingSafeEqual } from "node:crypto";

import { requireDaaAdminEditorAuth } from "@/src/daa/adminAuth";
import { failV1, mapDeniedResponseV1, okV1 } from "@/src/daa/api/routeHelpersV1";
import {
  bootstrapCreateFirstDaaAuthAccountV0,
  createDaaAuthAccountV0,
  hasAnyDaaAuthAccountsV0,
} from "@/src/daa/auth/daaAuthStoreV0";

export const runtime = "nodejs";

function normalizeToken(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function parseBearer(req: Request): string {
  const auth = normalizeToken(req.headers.get("authorization"));
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return normalizeToken(m ? m[1] : "");
}

function secureEqual(aRaw: unknown, bRaw: unknown): boolean {
  const a = normalizeToken(aRaw);
  const b = normalizeToken(bRaw);
  if (!a || !b) return false;

  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function misconfigured(message: string) {
  return failV1("INTERNAL_ERROR", message, { status: 500 });
}

function unauthorized() {
  return failV1("UNAUTHORIZED", "unauthorized", {
    status: 401,
    headers: { "www-authenticate": "DaaBootstrap" },
  });
}

export async function POST(req: Request) {
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const username = typeof body?.username === "string" ? body.username : "";
  const password = typeof body?.password === "string" ? body.password : undefined;
  const roles = Array.isArray(body?.roles) ? body.roles : undefined;

  const anyAccounts = await hasAnyDaaAuthAccountsV0();

  if (anyAccounts) {
    const mapped = mapDeniedResponseV1(await requireDaaAdminEditorAuth(req));
    if (mapped) return mapped;

    try {
      const account = await createDaaAuthAccountV0({ username, password, roles });
      return okV1({
        account: {
          accountId: account.accountId,
          username: account.username,
          roles: account.roles,
        },
      });
    } catch (error: any) {
      const msg = String(error?.message ?? error ?? "error");
      const status = /unique/i.test(msg) ? 409 : 400;
      return failV1("VALIDATION_FAILED", msg, { status });
    }
  }

  const expected = normalizeToken(process.env.DAA_AUTH_BOOTSTRAP_TOKEN);
  if (!expected) {
    return process.env.NODE_ENV === "production"
      ? misconfigured("server misconfigured: missing DAA_AUTH_BOOTSTRAP_TOKEN (required for first-admin bootstrap)")
      : misconfigured("missing DAA_AUTH_BOOTSTRAP_TOKEN (required for first-admin bootstrap)");
  }

  const provided =
    normalizeToken(req.headers.get("x-daa-bootstrap-token")) ||
    normalizeToken(body?.bootstrapToken) ||
    parseBearer(req);

  if (!secureEqual(provided, expected)) {
    return unauthorized();
  }

  try {
    const account = await bootstrapCreateFirstDaaAuthAccountV0({ username, password, roles });
    return okV1({
      account: {
        accountId: account.accountId,
        username: account.username,
        roles: account.roles,
      },
      bootstrapped: true,
    });
  } catch (error: any) {
    const msg = String(error?.message ?? error ?? "error");

    if (/accounts already exist/i.test(msg) || /bootstrap not allowed/i.test(msg)) {
      return failV1("VALIDATION_FAILED", "bootstrap not allowed", { status: 409 });
    }

    const status = /unique/i.test(msg) ? 409 : 400;
    return failV1("VALIDATION_FAILED", msg, { status });
  }
}
