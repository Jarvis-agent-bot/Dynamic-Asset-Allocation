import { applyDaaBrokerOrderSync, getDaaTradeTicket, listDaaBrokerOpenTradeTickets, type DaaStoreTradeTicket } from "@/src/daa/store/daaStorePg";

import { resolveActiveBrokerAdapter, syncActiveBrokerSnapshotToStore } from "./brokerAdapter";
import { resolveExecutionRouteForTicket } from "./executionGateway";

export type BrokerOrderSyncScope = "open" | "recent" | "ticket";

export type BrokerOrderSyncResult = {
  kind: "sim" | "ibkr_paper" | "crypto_paper";
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
  let broker = await resolveActiveBrokerAdapter();
  if (scope === "ticket" && input.ticketId) {
    const ticket = await getDaaTradeTicket(input.ticketId);
    if (ticket) {
      const route = await resolveExecutionRouteForTicket(ticket);
      broker = route.adapter;
    }
  }

  if (broker.kind === "sim" || broker.kind === "crypto_paper") {
    return {
      kind: broker.kind,
      scope,
      orderCount: 0,
      updatedCount: 0,
      positionCount: 0,
      tickets: [],
    };
  }

  let orders = await broker.listOrders({ limit: Math.max(20, Math.min(200, input.limit ?? 100)) });
  if (scope === "ticket") {
    const ticket = input.ticketId ? await getDaaTradeTicket(input.ticketId) : null;
    if (!ticket?.brokerOrderId) {
      return {
        kind: broker.kind,
        scope,
        orderCount: 0,
        updatedCount: 0,
        positionCount: 0,
        tickets: [],
      };
    }
    const order = await broker.getOrder(ticket.brokerOrderId, ticket.brokerAccountId);
    orders = order ? [order] : [];
  } else if (scope === "open") {
    const openTickets = await listDaaBrokerOpenTradeTickets(broker.kind);
    const openOrderIds = new Set(openTickets.map((ticket) => ticket.brokerOrderId).filter(Boolean));
    orders = orders.filter((order) => openOrderIds.has(order.orderId));
  }

  const updatedTickets: DaaStoreTradeTicket[] = [];
  for (const order of orders) {
    const synced = await applyDaaBrokerOrderSync({
      order: {
        broker: broker.kind,
        accountId: order.accountId,
        orderId: order.orderId,
        status: order.status,
        filledQty: order.filledQty,
        avgFillPrice: order.avgFillPrice,
        updatedAt: order.updatedAt,
        raw: order.raw,
      },
    });
    if (synced) updatedTickets.push(synced);
  }

  let positionCount = 0;
  try {
    const snapshot = await syncActiveBrokerSnapshotToStore();
    positionCount = snapshot.positionCount;
  } catch {
    positionCount = 0;
  }

  return {
    kind: broker.kind,
    scope,
    orderCount: orders.length,
    updatedCount: updatedTickets.length,
    positionCount,
    tickets: updatedTickets,
  };
}
