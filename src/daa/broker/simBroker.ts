import {
  createDaaTradeTicket,
  executeDaaTradeTickets,
  getDaaAccountState,
  listDaaPositions,
  listDaaTradeTickets,
  type DaaStoreTradeTicket,
} from "@/src/daa/store/daaStorePg";
import { normalizeText } from "@/src/daa/utils/normalize";

import type {
  BrokerAdapter,
  DaaBrokerAccountSummary,
  DaaBrokerOrder,
  DaaBrokerPlaceOrderInput,
  DaaBrokerPlaceOrderResult,
  DaaBrokerPosition,
  DaaBrokerPreviewOrderInput,
  DaaBrokerPreviewOrderResult,
} from "./brokerTypes";

function mapTicketToOrder(ticket: DaaStoreTradeTicket): DaaBrokerOrder {
  return {
    broker: "sim",
    accountId: "sim",
    orderId: ticket.ticketId,
    symbol: ticket.symbol,
    market: ticket.market,
    currency: ticket.instrumentCurrency,
    side: ticket.side,
    qty: ticket.qty,
    filledQty: ticket.status === "executed" ? ticket.qty : 0,
    orderType: ticket.pricingMode === "market" ? "MKT" : "LMT",
    referencePrice: ticket.price,
    limitPrice: ticket.pricingMode === "manual" ? ticket.price : null,
    avgFillPrice: ticket.status === "executed" ? ticket.price : null,
    status: ticket.status,
    submittedAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    raw: {
      ticketId: ticket.ticketId,
      rejectCode: ticket.rejectCode,
      rejectMessage: ticket.rejectMessage,
    },
  };
}

export class SimBroker implements BrokerAdapter {
  readonly kind = "sim" as const;
  readonly remote = false as const;

  async getAccountSummary(): Promise<DaaBrokerAccountSummary> {
    const account = await getDaaAccountState();
    return {
      broker: this.kind,
      accountId: "sim",
      accountAlias: "Local Simulation",
      baseCurrency: account.baseCurrency,
      cash: account.cash,
      investableCash: account.investableCash,
      frozenCash: account.frozenCash,
      totalEquity: account.totalEquity,
      buyingPower: null,
      netLiquidation: account.totalEquity,
      updatedAt: account.updatedAt,
    };
  }

  async getPositions(): Promise<DaaBrokerPosition[]> {
    const positions = await listDaaPositions();
    return positions.map((item) => ({
      broker: this.kind,
      accountId: "sim",
      assetKey: item.assetKey,
      symbol: item.symbol,
      market: item.market,
      currency: item.currency,
      qty: item.qty,
      price: item.price,
      costBasis: item.costBasis,
      lastPrice: item.price,
      marketValue: item.qty * item.price,
      brokerConid: null,
      updatedAt: item.updatedAt,
    }));
  }

  async previewOrder(input: DaaBrokerPreviewOrderInput): Promise<DaaBrokerPreviewOrderResult> {
    const warnings: string[] = [];
    if (input.orderType === "LMT" && !(Number(input.limitPrice) > 0)) {
      warnings.push("限价单缺少 limitPrice");
    }
    return {
      broker: this.kind,
      accountId: "sim",
      canPlace: warnings.length === 0,
      orderType: input.orderType,
      estimatedNotional: input.qty * (input.orderType === "LMT" ? Number(input.limitPrice || input.referencePrice) : input.referencePrice),
      warnings,
    };
  }

  async placeOrder(input: DaaBrokerPlaceOrderInput): Promise<DaaBrokerPlaceOrderResult> {
    const item = await createDaaTradeTicket({
      source: "manual",
      assetKey: input.assetKey,
      side: input.side,
      symbol: input.symbol,
      market: input.market,
      instrumentCurrency: input.currency,
      qty: input.qty,
      price: input.orderType === "LMT" ? Number(input.limitPrice || input.referencePrice) : input.referencePrice,
      fee: 0,
      pricingMode: input.orderType === "MKT" ? "market" : "manual",
      reasonTags: input.tags,
      reasonText: input.reasonText || undefined,
      createdBy: input.createdBy || "admin",
    });
    const executed = await executeDaaTradeTickets({ ticketIds: [item.ticketId] });
    const result = executed.results[0];
    const latest = executed.tickets.find((ticket) => ticket.ticketId === item.ticketId) || item;
    return {
      accepted: result?.status === "executed",
      order: mapTicketToOrder(latest),
      messages: [result?.status === "executed" ? "模拟盘执行成功" : (result?.rejectMessage || "模拟盘执行失败")],
      warnings: result?.status === "executed" ? [] : [result?.rejectMessage || "模拟盘执行失败"],
    };
  }

  async getOrder(orderId: string): Promise<DaaBrokerOrder | null> {
    const rows = await listDaaTradeTickets({ limit: 200 });
    const matched = rows.find((item) => item.ticketId === normalizeText(orderId));
    return matched ? mapTicketToOrder(matched) : null;
  }

  async listOrders(): Promise<DaaBrokerOrder[]> {
    const rows = await listDaaTradeTickets({ limit: 200 });
    return rows.map((item) => mapTicketToOrder(item));
  }
}
