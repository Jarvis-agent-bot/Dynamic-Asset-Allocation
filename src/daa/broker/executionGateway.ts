import { getDaaTradeTicket, listDaaBrokerOpenTradeTickets, type DaaStoreTradeTicket } from "@/src/daa/store/daaStorePg";

import { resolveBrokerRuntimeConfig } from "./brokerConfig";
import { CryptoPaperBroker } from "./cryptoPaperBroker";
import { IbkrPaperBroker } from "./ibkrPaperBroker";
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

export function isIbkrSupportedAsset(input: ExecutionRouteInput): boolean {
  const market = normalizeUpper(input.market);
  const assetClass = normalizeUpper(input.assetClass);
  const instrumentType = normalizeUpper(input.instrumentType);

  if (isCryptoAsset(input)) return false;
  if (market && !["US", "HK", "CN", "GLOBAL"].includes(market)) return false;
  if (assetClass && ["OTHER", "CASH", "INDEX"].includes(assetClass)) return false;
  if (instrumentType && ["OTHER", "CASH", "INDEX"].includes(instrumentType)) return false;
  return true;
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

  const brokerConfig = await resolveBrokerRuntimeConfig();
  if (brokerConfig.kind === "ibkr_paper" && isIbkrSupportedAsset(input)) {
    return {
      kind: "ibkr_paper",
      adapter: new IbkrPaperBroker(brokerConfig.ibkr),
      routeReason: "股票 / ETF / 债券 / 商品资产优先走 IBKR 模拟盘。",
      remote: true,
    };
  }

  return {
    kind: "sim",
    adapter: new SimBroker(),
    routeReason: brokerConfig.kind === "ibkr_paper"
      ? "当前资产不在 IBKR 覆盖范围内，回落到本地模拟 venue。"
      : "当前系统未启用外部券商，回落到本地模拟 venue。",
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
  if (kind === "ibkr_paper") {
    const brokerConfig = await resolveBrokerRuntimeConfig();
    if (brokerConfig.kind === "ibkr_paper") {
      return {
        kind,
        adapter: new IbkrPaperBroker(brokerConfig.ibkr),
        routeReason: "该 ticket 由 IBKR 模拟盘承载。",
        remote: true,
      };
    }
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
