import type { DaaBrokerConnectorRuntimeConfig } from "./brokerConfig";
import type {
  DaaBrokerAccountSummary,
  DaaBrokerOrder,
  DaaBrokerPlaceOrderInput,
  DaaBrokerPlaceOrderResult,
  DaaBrokerPosition,
} from "./brokerTypes";

export type DaaBrokerConnectorSessionState = {
  broker: "ibkr_paper";
  status: "disconnected" | "pending_login" | "authenticated" | "expiring" | "reauth_required" | "connector_down";
  accountId: string | null;
  loginUrl: string | null;
  message: string | null;
  checkedAt: string | null;
  authenticatedAt: string | null;
  lastError: string | null;
  sessionMeta: Record<string, unknown> | null;
};

function normalizeBaseUrl(value: string): string {
  return String(value || "").trim().replace(/\/+$/, "");
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error || "broker connector request failed");
}

export class BrokerConnectorClient {
  private readonly baseUrl: string;
  private readonly config: DaaBrokerConnectorRuntimeConfig;

  constructor(config: DaaBrokerConnectorRuntimeConfig) {
    this.config = config;
    this.baseUrl = normalizeBaseUrl(config.connectorBaseUrl);
  }

  private buildHeaders(init?: HeadersInit): Headers {
    const headers = new Headers(init || {});
    headers.set("accept", "application/json");
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    if (this.config.sharedSecret) headers.set("x-daa-broker-secret", this.config.sharedSecret);
    return headers;
  }

  private async requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.baseUrl) {
      throw new Error("broker connector base url 未配置");
    }
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: this.buildHeaders(init.headers),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error?: string }).error || `connector_http_${response.status}`)
        : `connector_http_${response.status}`;
      throw new Error(message);
    }
    return payload as T;
  }

  async getSessionStatus(): Promise<DaaBrokerConnectorSessionState> {
    const payload = await this.requestJson<{ session: DaaBrokerConnectorSessionState }>("/session/status", { method: "GET" });
    return payload.session;
  }

  async startSession(): Promise<DaaBrokerConnectorSessionState> {
    const payload = await this.requestJson<{ session: DaaBrokerConnectorSessionState }>("/session/start", {
      method: "POST",
      body: JSON.stringify({
        accountId: this.config.accountId,
      }),
    });
    return payload.session;
  }

  async logoutSession(): Promise<DaaBrokerConnectorSessionState> {
    const payload = await this.requestJson<{ session: DaaBrokerConnectorSessionState }>("/session/logout", {
      method: "POST",
      body: JSON.stringify({}),
    });
    return payload.session;
  }

  async getAccountSummary(accountId?: string | null): Promise<DaaBrokerAccountSummary> {
    const payload = await this.requestJson<{ account: DaaBrokerAccountSummary }>(
      `/account/summary${accountId || this.config.accountId ? `?accountId=${encodeURIComponent(String(accountId || this.config.accountId || ""))}` : ""}`,
      { method: "GET" },
    );
    return payload.account;
  }

  async getPositions(accountId?: string | null): Promise<DaaBrokerPosition[]> {
    const payload = await this.requestJson<{ positions: DaaBrokerPosition[] }>(
      `/positions${accountId || this.config.accountId ? `?accountId=${encodeURIComponent(String(accountId || this.config.accountId || ""))}` : ""}`,
      { method: "GET" },
    );
    return Array.isArray(payload.positions) ? payload.positions : [];
  }

  async placeOrder(input: DaaBrokerPlaceOrderInput): Promise<DaaBrokerPlaceOrderResult> {
    const payload = await this.requestJson<{ result: DaaBrokerPlaceOrderResult }>("/orders/submit", {
      method: "POST",
      body: JSON.stringify({
        ...input,
        accountId: input.accountId || this.config.accountId || null,
      }),
    });
    return payload.result;
  }

  async getOrder(orderId: string, accountId?: string | null): Promise<DaaBrokerOrder | null> {
    try {
      const payload = await this.requestJson<{ order: DaaBrokerOrder | null }>(
        `/orders/${encodeURIComponent(orderId)}${accountId || this.config.accountId ? `?accountId=${encodeURIComponent(String(accountId || this.config.accountId || ""))}` : ""}`,
        { method: "GET" },
      );
      return payload.order ?? null;
    } catch (error) {
      const message = toErrorMessage(error);
      if (message.includes("404") || message.includes("order_not_found")) return null;
      throw error;
    }
  }

  async listOrders(input: {
    accountId?: string | null;
    limit?: number;
    scope?: "open" | "recent" | "all";
  } = {}): Promise<DaaBrokerOrder[]> {
    const search = new URLSearchParams();
    if (input.accountId || this.config.accountId) search.set("accountId", String(input.accountId || this.config.accountId || ""));
    if (input.limit) search.set("limit", String(input.limit));
    if (input.scope && input.scope !== "all") search.set("scope", input.scope);
    const payload = await this.requestJson<{ orders: DaaBrokerOrder[] }>(
      `/orders${search.size ? `?${search.toString()}` : ""}`,
      { method: "GET" },
    );
    return Array.isArray(payload.orders) ? payload.orders : [];
  }
}
