import { getDaaTradeTicket, listDaaBrokerOpenTradeTickets, type DaaStoreTradeTicket } from "@/src/daa/store/daaStorePg";

import { CryptoPaperBroker } from "./cryptoPaperBroker";
import { SimBroker } from "./simBroker";
import type { BrokerAdapter, DaaBrokerKind } from "./brokerTypes";

export type ExecutionRouteInput = {
  assetKey?: string | null;
  symbol: string;
  market: string;
  currency?: string | null;
  assetClass?: string | null;
  instrumentType?: string | null;
  marketGroup?: string | null;
};

export type ExecutionRouteDecision = {
  kind: DaaBrokerKind;
  adapter: BrokerAdapter;
  routeReason: string;
  remote: boolean;
};

function normalizeText(value: unknown): string {
  return String(value || "").trim();
}

function normalizeUpper(value: unknown): string {
  return normalizeText(value).toUpperCase();
}

export function isCryptoAsset(input: ExecutionRouteInput): boolean {
  const market = normalizeUpper(input.market);
  const assetClass = normalizeUpper(input.assetClass);
  const instrumentType = normalizeUpper(input.instrumentType);
  const marketGroup = normalizeUpper(input.marketGroup);
  return market === "CRYPTO"
    || assetClass === "CRYPTO"
    || instrumentType === "CRYPTO"
    || marketGroup.includes("CRYPTO");
}

export async function resolveExecutionRoute(input: ExecutionRouteInput): Promise<ExecutionRouteDecision> {
  if (isCryptoAsset(input)) {
    return {
      kind: "crypto_paper",
      adapter: new CryptoPaperBroker(),
      routeReason: "加密资产统一路由到本地 crypto paper venue。",
      remote: false,
    };
  }

  return {
    kind: "sim",
    adapter: new SimBroker(),
    routeReason: "当前系统使用本地模拟执行引擎。",
    remote: false,
  };
}

export async function resolveExecutionRouteForTicket(ticket: DaaStoreTradeTicket): Promise<ExecutionRouteDecision> {
  const kind = ticket.brokerKind;
  if (kind === "crypto_paper") {
    return {
      kind,
      adapter: new CryptoPaperBroker(),
      routeReason: "该 ticket 由 crypto paper venue 承载。",
      remote: false,
    };
  }
  return {
    kind: "sim",
    adapter: new SimBroker(),
    routeReason: "该 ticket 由本地模拟 venue 承载。",
    remote: false,
  };
}

export async function listRouteScopedOpenTickets(input: {
  routeKind: DaaBrokerKind;
  ticketId?: string | null;
}): Promise<DaaStoreTradeTicket[]> {
  if (input.ticketId) {
    const ticket = await getDaaTradeTicket(input.ticketId);
    if (!ticket) return [];
    return [ticket];
  }
  return listDaaBrokerOpenTradeTickets(input.routeKind);
}
