/**
 * Execution venue: 本地执行路由 + sim/crypto_paper broker adapter.
 *
 * 合并自原 src/daa/broker/ 目录，只保留当前系统实际使用的部分。
 */

import {
  createDaaTradeTicket,
  executeDaaTradeTickets,
  getDaaAccountState,
  getDaaTradeTicket,
  listDaaPositions,
  listDaaTradeTickets,
  type DaaStoreTradeTicket,
} from "@/src/daa/store/daaStorePg";
import { normalizeText, normalizeUpper } from "@/src/daa/utils/normalize";

/* ---------- types ---------- */

import type { TradeTicketSide, TradeTicket } from "@/src/daa/modules/trade/tradeTypes";

export type DaaBrokerKind = "sim" | "crypto_paper";
type DaaBrokerOrderType = "MKT" | "LMT";

type DaaBrokerAccountSummary = {
  broker: DaaBrokerKind;
  accountId: string;
  accountAlias: string | null;
  baseCurrency: string;
  cash: number;
  investableCash: number;
  frozenCash: number;
  totalEquity: number | null;
  buyingPower: number | null;
  netLiquidation: number | null;
  updatedAt: string;
};

type DaaBrokerPosition = {
  broker: DaaBrokerKind;
  accountId: string;
  assetKey: string;
  symbol: string;
  market: string;
  currency: string;
  qty: number;
  price: number;
  costBasis: number | null;
  lastPrice: number | null;
  marketValue: number | null;
  brokerConid: string | null;
  updatedAt: string;
};

type DaaBrokerOrder = {
  broker: DaaBrokerKind;
  accountId: string;
  orderId: string;
  symbol: string;
  market: string;
  currency: string;
  side: TradeTicketSide;
  qty: number;
  filledQty: number | null;
  orderType: DaaBrokerOrderType;
  referencePrice: number | null;
  limitPrice: number | null;
  avgFillPrice: number | null;
  status: string;
  submittedAt: string | null;
  updatedAt: string;
  raw: Record<string, unknown> | null;
};

type DaaBrokerPreviewOrderInput = {
  accountId?: string | null;
  assetKey: string;
  symbol: string;
  market: string;
  currency: string;
  side: TradeTicketSide;
  qty: number;
  orderType: DaaBrokerOrderType;
  referencePrice: number;
  limitPrice?: number | null;
};

type DaaBrokerPreviewOrderResult = {
  broker: DaaBrokerKind;
  accountId: string;
  canPlace: boolean;
  orderType: DaaBrokerOrderType;
  estimatedNotional: number;
  warnings: string[];
};

type DaaBrokerPlaceOrderInput = DaaBrokerPreviewOrderInput & {
  reasonText?: string | null;
  timeInForce?: "DAY" | "GTC";
  tags?: string[];
  createdBy?: string;
};

type DaaBrokerPlaceOrderResult = {
  accepted: boolean;
  order: DaaBrokerOrder;
  messages: string[];
  warnings: string[];
};

type DaaBrokerExecutionMeta = {
  kind: DaaBrokerKind;
  accountId: string;
  accepted: boolean;
  remoteStatus: string;
  remoteOrderId: string;
  routeReason?: string;
  messages: string[];
  warnings: string[];
};

export type DaaBrokerBackedExecutionResult = {
  item: TradeTicket;
  result: {
    ticketId: string;
    status: TradeTicket["status"];
    rejectCode?: string;
    rejectMessage?: string;
  };
  summary: {
    executed: number;
    rejected: number;
    total: number;
  };
  logs: TradeTicket[];
  baseCurrency: string;
  notionalInBase: number;
  feeInBase: number;
  source: "manual" | "decision";
  side: TradeTicketSide;
  symbol: string;
  broker: DaaBrokerExecutionMeta | null;
};

interface BrokerAdapter {
  readonly kind: DaaBrokerKind;
  readonly remote?: boolean;
  getAccountSummary(accountId?: string | null): Promise<DaaBrokerAccountSummary>;
  getPositions(accountId?: string | null): Promise<DaaBrokerPosition[]>;
  previewOrder(input: DaaBrokerPreviewOrderInput): Promise<DaaBrokerPreviewOrderResult>;
  placeOrder(input: DaaBrokerPlaceOrderInput): Promise<DaaBrokerPlaceOrderResult>;
  getOrder(orderId: string, accountId?: string | null): Promise<DaaBrokerOrder | null>;
  listOrders(input?: { accountId?: string | null; limit?: number }): Promise<DaaBrokerOrder[]>;
}

/* ---------- SimBroker ---------- */

function mapSimTicketToOrder(ticket: DaaStoreTradeTicket): DaaBrokerOrder {
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

class SimBroker implements BrokerAdapter {
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
      order: mapSimTicketToOrder(latest),
      messages: [result?.status === "executed" ? "模拟盘执行成功" : (result?.rejectMessage || "模拟盘执行失败")],
      warnings: result?.status === "executed" ? [] : [result?.rejectMessage || "模拟盘执行失败"],
    };
  }

  async getOrder(orderId: string): Promise<DaaBrokerOrder | null> {
    const rows = await listDaaTradeTickets({ limit: 200 });
    const matched = rows.find((item) => item.ticketId === normalizeText(orderId));
    return matched ? mapSimTicketToOrder(matched) : null;
  }

  async listOrders(): Promise<DaaBrokerOrder[]> {
    const rows = await listDaaTradeTickets({ limit: 200 });
    return rows.map((item) => mapSimTicketToOrder(item));
  }
}

/* ---------- CryptoPaperBroker ---------- */

function mapCryptoTicketToOrder(ticket: DaaStoreTradeTicket): DaaBrokerOrder {
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

class CryptoPaperBroker implements BrokerAdapter {
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
    return matched ? mapCryptoTicketToOrder(matched) : null;
  }

  async listOrders(): Promise<DaaBrokerOrder[]> {
    const rows = await listDaaTradeTickets({ limit: 300 });
    return rows
      .filter((item) => item.brokerKind === this.kind)
      .map((item) => mapCryptoTicketToOrder(item));
  }
}

/* ---------- execution routing ---------- */

type ExecutionRouteInput = {
  assetKey?: string | null;
  symbol: string;
  market: string;
  currency?: string | null;
  assetClass?: string | null;
  instrumentType?: string | null;
  marketGroup?: string | null;
};

type ExecutionRouteDecision = {
  kind: DaaBrokerKind;
  adapter: BrokerAdapter;
  routeReason: string;
  remote: boolean;
};

function isCryptoAsset(input: ExecutionRouteInput): boolean {
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

async function resolveExecutionRouteForTicket(ticket: DaaStoreTradeTicket): Promise<ExecutionRouteDecision> {
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

/* ---------- broker order sync ---------- */

type BrokerOrderSyncScope = "open" | "recent" | "ticket";

type BrokerOrderSyncResult = {
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

/* ---------- broker order status mapping ---------- */

import type { TradeTicketStatus } from "@/src/daa/modules/trade/tradeTypes";

function normalizeBrokerStatus(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

export function mapBrokerOrderStatusToTradeTicketStatus(statusRaw: string | null | undefined): TradeTicketStatus {
  const status = normalizeBrokerStatus(statusRaw);
  if (!status) return "submitted";

  if (status === "pendingsubmit" || status === "presubmitted" || status === "submitted") return "submitted";
  if (status === "partiallyfilled") return "partially_filled";
  if (status === "filled" || status === "executed") return "executed";
  if (status === "cancelled" || status === "apicancelled") return "canceled";
  if (status === "inactive" || status === "rejected") return "rejected";
  return "submitted";
}
