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
    // 仅在内存数据库模式（开发/测试）下跳过认证
    if (process.env.DAA_PG_MEM === "1") return null;
    // 所有其他环境（包括 staging/preview）均要求 cron_token
    console.warn("[cronAuth] cron_token 未配置，拒绝未认证的 cron 请求。请设置 cron_token secret。");
    return NextResponse.json({ ok: false, error: "missing_cron_secret" }, { status: 500 });
  }

  const provided = normalizeToken(req.headers.get("x-daa-cron-token")) || parseBearer(req);
  if (provided) {
    // SHA-256 比较：固定 32 字节长度，完全消除 length 泄露
    const { createHash } = await import("node:crypto");
    const hashA = createHash("sha256").update(provided).digest();
    const hashB = createHash("sha256").update(expected).digest();
    if (timingSafeEqual(hashA, hashB)) return null;
  }

  return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
}
