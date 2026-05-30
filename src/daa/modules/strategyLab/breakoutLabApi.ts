"use client";

import type { BreakoutLabRunParams, BreakoutLabRunResult } from "./breakoutLabService";

type ApiEnvelope<T> = {
  ok?: boolean;
  data?: T;
  error?: { message?: string } | string;
};

export async function runBreakoutBacktest(
  params: BreakoutLabRunParams,
): Promise<BreakoutLabRunResult> {
  const res = await fetch("/api/daa/strategy-lab/breakout/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(params),
  });
  const json = (await res.json()) as ApiEnvelope<BreakoutLabRunResult>;
  if (!res.ok || json.ok === false) {
    const msg = typeof json.error === "string" ? json.error : json.error?.message;
    throw new Error(msg || `请求失败 (${res.status})`);
  }
  return json.data as BreakoutLabRunResult;
}
