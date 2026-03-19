import { resolveSecret } from "@/src/daa/config/secretsManager";

import type { DaaBrokerKind } from "./brokerTypes";

export type DaaIbkrPaperRuntimeConfig = {
  baseUrl: string;
  accountId: string | null;
  sessionCookie: string | null;
  oauthToken: string | null;
  csrfToken: string | null;
};

export type DaaBrokerRuntimeConfig =
  | { kind: "sim" }
  | {
    kind: "ibkr_paper";
    ibkr: DaaIbkrPaperRuntimeConfig;
  };

function normalizeText(value: string | null | undefined): string {
  return String(value || "").trim();
}

function normalizeBrokerKind(value: string): DaaBrokerKind {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "ibkr" || normalized === "ibkr_paper") return "ibkr_paper";
  return "sim";
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

async function readSecret(key: Parameters<typeof resolveSecret>[0]): Promise<string> {
  return normalizeText(await resolveSecret(key));
}

export async function resolveBrokerRuntimeConfig(): Promise<DaaBrokerRuntimeConfig> {
  const kind = normalizeBrokerKind(await readSecret("broker_mode"));
  if (kind === "sim") {
    return { kind: "sim" };
  }

  return {
    kind: "ibkr_paper",
    ibkr: {
      baseUrl: normalizeBaseUrl(await readSecret("ibkr_web_api_base_url") || "https://api.ibkr.com/v1/api"),
      accountId: normalizeText(await readSecret("ibkr_account_id")) || null,
      sessionCookie: normalizeText(await readSecret("ibkr_web_api_session_cookie")) || null,
      oauthToken: normalizeText(await readSecret("ibkr_web_api_oauth_token")) || null,
      csrfToken: normalizeText(await readSecret("ibkr_web_api_csrf_token")) || null,
    },
  };
}
