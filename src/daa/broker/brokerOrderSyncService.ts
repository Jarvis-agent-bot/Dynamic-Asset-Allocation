import { getDaaTradeTicket, type DaaStoreTradeTicket } from "@/src/daa/store/daaStorePg";

import { resolveExecutionRouteForTicket } from "./executionRouting";
import { SimBroker } from "./simBroker";
import type { BrokerAdapter } from "./brokerTypes";

export type BrokerOrderSyncScope = "open" | "recent" | "ticket";

export type BrokerOrderSyncResult = {
  kind: "sim" | "crypto_paper";
  scope: BrokerOrderSyncScope;
  orderCount: number;
  updatedCount: number;
  positionCount: number;
  tickets: DaaStoreTradeTicket[];
};

export async function syncBrokerOrders(input: {
  scope?: BrokerOrderSyncScope;
  ticketId?: string | null;
  limit?: number;
} = {}): Promise<BrokerOrderSyncResult> {
  const scope = input.scope ?? (input.ticketId ? "ticket" : "open");
  let broker: BrokerAdapter = new SimBroker();
  if (scope === "ticket" && input.ticketId) {
    const ticket = await getDaaTradeTicket(input.ticketId);
    if (ticket) {
      const route = await resolveExecutionRouteForTicket(ticket);
      broker = route.adapter;
    }
  }

  return {
    kind: broker.kind,
    scope,
    orderCount: 0,
    updatedCount: 0,
    positionCount: 0,
    tickets: [],
  };
}
