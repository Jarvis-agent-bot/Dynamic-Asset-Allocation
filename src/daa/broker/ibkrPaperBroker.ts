import type { BrokerAdapter, DaaBrokerOrder, DaaBrokerPlaceOrderInput, DaaBrokerPlaceOrderResult, DaaBrokerPreviewOrderInput, DaaBrokerPreviewOrderResult, DaaBrokerAccountSummary, DaaBrokerPosition } from "./brokerTypes";
import { IbkrWebClient } from "./ibkrWebClient";
import type { DaaIbkrPaperRuntimeConfig } from "./brokerConfig";

export class IbkrPaperBroker implements BrokerAdapter {
  readonly kind = "ibkr_paper" as const;
  private readonly client: IbkrWebClient;

  constructor(config: DaaIbkrPaperRuntimeConfig) {
    this.client = new IbkrWebClient(config);
  }

  async getAccountSummary(accountId?: string | null): Promise<DaaBrokerAccountSummary> {
    return this.client.getAccountSummary(accountId);
  }

  async getPositions(accountId?: string | null): Promise<DaaBrokerPosition[]> {
    return this.client.getPositions(accountId);
  }

  async previewOrder(input: DaaBrokerPreviewOrderInput): Promise<DaaBrokerPreviewOrderResult> {
    const warnings: string[] = [];
    if (input.orderType === "LMT" && !(Number(input.limitPrice) > 0)) {
      warnings.push("限价单缺少 limitPrice");
    }
    return {
      broker: this.kind,
      accountId: input.accountId || "",
      canPlace: warnings.length === 0,
      orderType: input.orderType,
      estimatedNotional: input.qty * (input.orderType === "LMT" ? Number(input.limitPrice || input.referencePrice) : input.referencePrice),
      warnings,
    };
  }

  async placeOrder(input: DaaBrokerPlaceOrderInput): Promise<DaaBrokerPlaceOrderResult> {
    return this.client.placeOrder(input);
  }

  async getOrder(orderId: string, accountId?: string | null): Promise<DaaBrokerOrder | null> {
    return this.client.getOrder(orderId, accountId);
  }

  async listOrders(input?: { accountId?: string | null; limit?: number }): Promise<DaaBrokerOrder[]> {
    return this.client.listOrders(input);
  }
}
