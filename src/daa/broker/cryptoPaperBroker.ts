import { listDaaTradeTickets, type DaaStoreTradeTicket } from "@/src/daa/store/daaStorePg";
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
    broker: "crypto_paper",
    accountId: ticket.brokerAccountId || "crypto_paper",
    orderId: ticket.brokerOrderId || ticket.ticketId,
    symbol: ticket.symbol,
    market: ticket.market,
    currency: ticket.instrumentCurrency,
    side: ticket.side,
    qty: ticket.qty,
    filledQty: ticket.filledQty ?? (ticket.status === "executed" ? ticket.qty : 0),
    orderType: ticket.pricingMode === "market" ? "MKT" : "LMT",
    referencePrice: ticket.price,
    limitPrice: ticket.pricingMode === "manual" ? ticket.price : null,
    avgFillPrice: ticket.avgFillPrice ?? (ticket.status === "executed" ? ticket.price : null),
    status: ticket.brokerStatus || ticket.status,
    submittedAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    raw: ticket.brokerRaw || {
      ticketId: ticket.ticketId,
      rejectCode: ticket.rejectCode,
      rejectMessage: ticket.rejectMessage,
    },
  };
}

export class CryptoPaperBroker implements BrokerAdapter {
  readonly kind = "crypto_paper" as const;
  readonly remote = false as const;

  async getAccountSummary(): Promise<DaaBrokerAccountSummary> {
    return {
      broker: this.kind,
      accountId: "crypto_paper",
      accountAlias: "Crypto Paper Venue",
      baseCurrency: "USD",
      cash: 0,
      investableCash: 0,
      frozenCash: 0,
      totalEquity: null,
      buyingPower: null,
      netLiquidation: null,
      updatedAt: new Date().toISOString(),
    };
  }

  async getPositions(): Promise<DaaBrokerPosition[]> {
    return [];
  }

  async previewOrder(input: DaaBrokerPreviewOrderInput): Promise<DaaBrokerPreviewOrderResult> {
    const warnings: string[] = [];
    if (input.orderType === "LMT" && !(Number(input.limitPrice) > 0)) {
      warnings.push("限价单缺少 limitPrice");
    }
    return {
      broker: this.kind,
      accountId: "crypto_paper",
      canPlace: warnings.length === 0,
      orderType: input.orderType,
      estimatedNotional: input.qty * (input.orderType === "LMT" ? Number(input.limitPrice || input.referencePrice) : input.referencePrice),
      warnings,
    };
  }

  async placeOrder(_input: DaaBrokerPlaceOrderInput): Promise<DaaBrokerPlaceOrderResult> {
    throw new Error("crypto_paper 下单由本地执行服务直接落库，不通过远端 adapter 发单。");
  }

  async getOrder(orderId: string): Promise<DaaBrokerOrder | null> {
    const rows = await listDaaTradeTickets({ limit: 300 });
    const matched = rows.find((item) => {
      if (item.brokerKind !== this.kind) return false;
      return item.brokerOrderId === normalizeText(orderId) || item.ticketId === normalizeText(orderId);
    });
    return matched ? mapTicketToOrder(matched) : null;
  }

  async listOrders(): Promise<DaaBrokerOrder[]> {
    const rows = await listDaaTradeTickets({ limit: 300 });
    return rows
      .filter((item) => item.brokerKind === this.kind)
      .map((item) => mapTicketToOrder(item));
  }
}
