import { resolveBrokerRuntimeConfig } from "./brokerConfig";
import { BrokerConnectorClient, type DaaBrokerConnectorSessionState } from "./brokerConnectorClient";
import {
  getDaaBrokerSessionState,
  saveDaaBrokerSessionState,
  type DaaStoreBrokerSessionState,
} from "@/src/daa/store/daaStorePg";

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error || "broker connector unavailable");
}

function mapConnectorSessionState(input: DaaBrokerConnectorSessionState): Parameters<typeof saveDaaBrokerSessionState>[0] {
  return {
    brokerKind: "ibkr_paper",
    status: input.status,
    accountId: input.accountId,
    loginUrl: input.loginUrl,
    message: input.message,
    lastCheckedAt: input.checkedAt,
    lastAuthenticatedAt: input.authenticatedAt,
    lastError: input.lastError,
    sessionMeta: input.sessionMeta,
  };
}

async function buildSimSessionState(): Promise<DaaStoreBrokerSessionState> {
  return saveDaaBrokerSessionState({
    brokerKind: "sim",
    status: "disconnected",
    message: "当前 broker_mode = sim，不需要外部券商会话。",
    lastCheckedAt: new Date().toISOString(),
    sessionMeta: { mode: "sim" },
  });
}

export async function refreshBrokerSessionState(): Promise<DaaStoreBrokerSessionState> {
  const config = await resolveBrokerRuntimeConfig();
  if (config.kind === "sim") {
    return buildSimSessionState();
  }

  try {
    const client = new BrokerConnectorClient(config.ibkr);
    const session = await client.getSessionStatus();
    return saveDaaBrokerSessionState(mapConnectorSessionState(session));
  } catch (error) {
    return saveDaaBrokerSessionState({
      brokerKind: "ibkr_paper",
      status: "connector_down",
      accountId: config.ibkr.accountId,
      message: "Broker Connector 当前不可用。",
      lastCheckedAt: new Date().toISOString(),
      lastError: normalizeErrorMessage(error),
      sessionMeta: { connectorBaseUrl: config.ibkr.connectorBaseUrl },
    });
  }
}

export async function readBrokerSessionState(input: {
  refresh?: boolean;
} = {}): Promise<DaaStoreBrokerSessionState> {
  if (input.refresh !== false) {
    return refreshBrokerSessionState();
  }
  const config = await resolveBrokerRuntimeConfig();
  if (config.kind === "sim") return buildSimSessionState();
  return await getDaaBrokerSessionState("ibkr_paper") || refreshBrokerSessionState();
}

export async function startBrokerSession(): Promise<DaaStoreBrokerSessionState> {
  const config = await resolveBrokerRuntimeConfig();
  if (config.kind === "sim") {
    return buildSimSessionState();
  }

  try {
    const client = new BrokerConnectorClient(config.ibkr);
    const session = await client.startSession();
    return saveDaaBrokerSessionState(mapConnectorSessionState(session));
  } catch (error) {
    return saveDaaBrokerSessionState({
      brokerKind: "ibkr_paper",
      status: "connector_down",
      accountId: config.ibkr.accountId,
      message: "无法发起 Broker 登录。",
      lastCheckedAt: new Date().toISOString(),
      lastError: normalizeErrorMessage(error),
      sessionMeta: { connectorBaseUrl: config.ibkr.connectorBaseUrl },
    });
  }
}

export async function logoutBrokerSession(): Promise<DaaStoreBrokerSessionState> {
  const config = await resolveBrokerRuntimeConfig();
  if (config.kind === "sim") {
    return buildSimSessionState();
  }

  try {
    const client = new BrokerConnectorClient(config.ibkr);
    const session = await client.logoutSession();
    return saveDaaBrokerSessionState(mapConnectorSessionState(session));
  } catch (error) {
    return saveDaaBrokerSessionState({
      brokerKind: "ibkr_paper",
      status: "connector_down",
      accountId: config.ibkr.accountId,
      message: "Broker Connector 当前不可用，无法执行退出连接。",
      lastCheckedAt: new Date().toISOString(),
      lastError: normalizeErrorMessage(error),
      sessionMeta: { connectorBaseUrl: config.ibkr.connectorBaseUrl },
    });
  }
}
