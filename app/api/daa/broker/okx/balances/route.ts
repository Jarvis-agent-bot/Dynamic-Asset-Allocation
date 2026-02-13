import { NextResponse } from "next/server";

import { buildOkxRestAuthHeaders } from "@/src/broker/okxRestAuth";

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

function mustBeLocalhost(req: Request) {
  const url = new URL(req.url);
  const h = url.hostname;
  // Account/balance is sensitive. Keep this endpoint localhost-only unless/until we add auth.
  if (h !== "127.0.0.1" && h !== "localhost" && h !== "::1") {
    throw new Error(`forbidden host: ${h}`);
  }
  return url;
}

function mustGetEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`missing env: ${name}`);
  return v.trim();
}

function getEnv(name: string): string | undefined {
  const v = process.env[name];
  const t = v ? v.trim() : "";
  return t ? t : undefined;
}

function toNum(x: unknown): number | null {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

type OkxBalanceDetail = {
  ccy: string;
  eq: number | null;
  availEq: number | null;
  cashBal: number | null;
  frozenBal: number | null;
  uTime: string | null;
};

function normalizeOkxBalancePayload(payload: any): { ok: boolean; code?: string; msg?: string; details: OkxBalanceDetail[]; account?: any } {
  if (!payload || typeof payload !== "object") return { ok: false, details: [] };

  const code = payload.code === undefined ? undefined : String(payload.code);
  const msg = payload.msg === undefined ? undefined : String(payload.msg);

  if (code && code !== "0") {
    return { ok: false, code, msg, details: [] };
  }

  const acc = Array.isArray(payload.data) ? payload.data[0] : null;
  const detailsRaw = acc && Array.isArray(acc.details) ? acc.details : [];

  const details: OkxBalanceDetail[] = detailsRaw
    .filter(Boolean)
    .map((d: any) => ({
      ccy: String(d?.ccy ?? "").trim(),
      eq: toNum(d?.eq),
      availEq: toNum(d?.availEq),
      cashBal: toNum(d?.cashBal),
      frozenBal: toNum(d?.frozenBal),
      uTime: d?.uTime === undefined ? null : String(d.uTime),
    }))
    .filter((d: OkxBalanceDetail) => d.ccy);

  details.sort((a, b) => a.ccy.localeCompare(b.ccy));

  const account = acc
    ? {
        uTime: acc?.uTime === undefined ? null : String(acc.uTime),
        totalEq: toNum(acc?.totalEq),
      }
    : undefined;

  return { ok: true, details, account, code, msg };
}

// OKX account balances via REST API (signed).
// This is intended for sandbox/demo connectivity checks.
// Example (localhost-only):
//   curl 'http://127.0.0.1:3000/api/daa/broker/okx/balances?ccy=USDT,BTC'
export async function GET(req: Request) {
  try {
    const url = mustBeLocalhost(req);

    const apiKey = mustGetEnv("OKX_API_KEY");
    const apiSecret = mustGetEnv("OKX_API_SECRET");
    const passphrase = mustGetEnv("OKX_API_PASSPHRASE");

    const simulatedTrading = getEnv("OKX_SIMULATED_TRADING") ?? "1";

    const ccy = url.searchParams.get("ccy")?.trim() || "";
    const raw = url.searchParams.get("raw")?.trim() === "1";

    const upstreamUrl = new URL("https://www.okx.com/api/v5/account/balance");
    if (ccy) upstreamUrl.searchParams.set("ccy", ccy);

    // The signature MUST use the request path + query, not the full URL.
    const requestPathWithQuery = upstreamUrl.pathname + upstreamUrl.search;
    const timestamp = new Date().toISOString();

    const headers: Record<string, string> = {
      ...buildOkxRestAuthHeaders({
        creds: { apiKey, apiSecret, passphrase },
        timestamp,
        method: "GET",
        requestPathWithQuery,
      }),
      // OKX demo/sandbox flag (a.k.a. simulated trading).
      "x-simulated-trading": simulatedTrading,
    };

    const r = await fetch(upstreamUrl, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    const text = await r.text();

    let payload: any;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }

    if (!r.ok) {
      // Don't echo auth headers; OKX should not return them, but keep responses minimal.
      return json(
        {
          error: "okx upstream error",
          status: r.status,
          code: payload?.code,
          msg: payload?.msg,
          body: typeof payload === "object" ? undefined : String(text).slice(0, 800),
        },
        { status: 502 },
      );
    }

    const normalized = normalizeOkxBalancePayload(payload);
    if (!normalized.ok) {
      return json(
        {
          error: "okx error response",
          status: r.status,
          code: normalized.code,
          msg: normalized.msg,
        },
        { status: 502 },
      );
    }

    return json({
      ok: true,
      source: "okx",
      simulatedTrading,
      at: timestamp,
      ccy: ccy || null,
      account: normalized.account,
      details: normalized.details,
      raw: raw ? payload : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isForbidden = msg.startsWith("forbidden host:");
    return json(
      {
        error: isForbidden ? "forbidden" : "okx balances fetch failed",
        message: msg,
      },
      { status: isForbidden ? 403 : 500 },
    );
  }
}
