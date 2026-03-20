import { resolveSecret } from "@/src/daa/config/secretsManager";

import type { DaaBrokerKind } from "./brokerTypes";

export type DaaBrokerConnectorRuntimeConfig = {
  connectorBaseUrl: string;
  sharedSecret: string | null;
  accountId: string | null;
};

export type DaaIbkrWebClientConfig = {
  baseUrl: string;
  accountId: string | null;
  sessionCookie: string | null;
  oauthToken: string | null;
  csrfToken: string | null;
};

export type DaaIbkrPaperRuntimeConfig = DaaBrokerConnectorRuntimeConfig | DaaIbkrWebClientConfig;

export type DaaBrokerRuntimeConfig =
  | { kind: "sim" }
  | {
    kind: "ibkr_paper";
    ibkr: DaaBrokerConnectorRuntimeConfig;
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

export function isBrokerConnectorRuntimeConfig(value: DaaIbkrPaperRuntimeConfig): value is DaaBrokerConnectorRuntimeConfig {
  return "connectorBaseUrl" in value;
}

export async function resolveBrokerRuntimeConfig(): Promise<DaaBrokerRuntimeConfig> {
  const kind = normalizeBrokerKind(await readSecret("broker_mode"));
  if (kind === "sim") {
    return { kind: "sim" };
  }

  return {
    kind: "ibkr_paper",
    ibkr: {
      connectorBaseUrl: normalizeBaseUrl(await readSecret("broker_connector_base_url") || "http://127.0.0.1:8787"),
      sharedSecret: normalizeText(await readSecret("broker_connector_shared_secret")) || null,
      accountId: normalizeText(await readSecret("ibkr_account_id")) || null,
    },
  };
}
