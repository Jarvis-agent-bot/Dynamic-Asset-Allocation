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
import { BrokerConnectorClient } from "./brokerConnectorClient";
import { isBrokerConnectorRuntimeConfig, type DaaIbkrPaperRuntimeConfig } from "./brokerConfig";
import { IbkrWebClient } from "./ibkrWebClient";

export class IbkrPaperBroker implements BrokerAdapter {
  readonly kind = "ibkr_paper" as const;
  readonly remote = true as const;
  private readonly connectorClient: BrokerConnectorClient | null;
  private readonly webClient: IbkrWebClient | null;

  constructor(config: DaaIbkrPaperRuntimeConfig) {
    if (isBrokerConnectorRuntimeConfig(config)) {
      this.connectorClient = new BrokerConnectorClient(config);
      this.webClient = null;
      return;
    }

    this.connectorClient = null;
    this.webClient = new IbkrWebClient(config);
  }

  private get client(): BrokerConnectorClient | IbkrWebClient {
    return this.connectorClient || this.webClient!;
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
    if (this.connectorClient) {
      return this.connectorClient.listOrders({ ...input, scope: "all" });
    }
    return this.webClient!.listOrders(input);
  }
}
