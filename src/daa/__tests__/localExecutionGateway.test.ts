import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  executeManualTradeMock,
  previewManualTradeMock,
  executeWorkbenchRebalanceCycleMock,
  getDaaSystemConfigMock,
  sendTelegramByEnvMock,
  sendFeishuByEnvMock,
} = vi.hoisted(() => ({
  executeManualTradeMock: vi.fn(),
  previewManualTradeMock: vi.fn(),
  executeWorkbenchRebalanceCycleMock: vi.fn(),
  getDaaSystemConfigMock: vi.fn(),
  sendTelegramByEnvMock: vi.fn(async () => true),
  sendFeishuByEnvMock: vi.fn(async () => true),
}));

vi.mock("@/src/daa/modules/workbench/manualTradeService", () => ({
  executeManualTrade: executeManualTradeMock,
  previewManualTrade: previewManualTradeMock,
}));

vi.mock("@/src/daa/modules/workbench/workbenchRebalanceCycleService", () => ({
  executeWorkbenchRebalanceCycle: executeWorkbenchRebalanceCycleMock,
}));

vi.mock("@/src/daa/store/daaStorePg", () => ({
  getDaaSystemConfig: getDaaSystemConfigMock,
}));

vi.mock("@/src/daa/notify/telegram", () => ({
  sendTelegramByEnv: sendTelegramByEnvMock,
}));

vi.mock("@/src/daa/notify/feishu", () => ({
  sendFeishuByEnv: sendFeishuByEnvMock,
}));

import {
  executeRebalanceViaGateway,
  executeTradeViaGateway,
  getLocalExecutionGatewayStatus,
  previewTradeViaGateway,
} from "@/src/daa/gateway";

describe("local-execution-gateway", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDaaSystemConfigMock.mockResolvedValue({
      config: {
        strategy: {
          account: { baseCurrency: "USD" },
        },
        notification: {
          telegram: { enabled: true, onTradeExecuted: true },
          feishu: { enabled: true, onTradeExecuted: true },
        },
      },
    });
  });

  it("返回本地执行网关状态", async () => {
    const status = await getLocalExecutionGatewayStatus();

    expect(status).toMatchObject({
      mode: "local",
      ready: true,
      supportsRemoteBridge: false,
      venues: ["sim", "crypto_paper"],
    });
  });

  it("交易执行成功后会统一扇出通知", async () => {
    const execution = {
      item: {
        ticketId: "ticket-1",
        cycleId: null,
        qty: 2,
        brokerKind: "sim",
        brokerAccountId: "local",
      },
      result: { ticketId: "ticket-1", status: "executed" },
      summary: { executed: 1, rejected: 0, total: 1 },
      logs: [{
        ticketId: "ticket-1",
        symbol: "AAPL",
        side: "BUY",
        qty: 2,
        price: 100,
        instrumentCurrency: "USD",
        status: "executed",
        brokerKind: "sim",
        brokerAccountId: "local",
      }],
      baseCurrency: "USD",
      notionalInBase: 200,
      feeInBase: 0,
      source: "manual",
      side: "BUY",
      symbol: "AAPL",
      broker: {
        kind: "sim",
        accountId: "local",
        accepted: true,
        remoteStatus: "executed",
        remoteOrderId: "ticket-1",
        routeReason: "当前系统使用本地模拟执行引擎。",
        messages: [],
        warnings: [],
      },
    };
    executeManualTradeMock.mockResolvedValue(execution);

    const result = await executeTradeViaGateway({
      request: {
        source: "manual",
        side: "BUY",
        assetKey: "US::AAPL",
        symbol: "AAPL",
        market: "US",
        currency: "USD",
        qty: 2,
        price: 100,
      },
    });

    expect(result).toBe(execution);
    expect(sendTelegramByEnvMock).toHaveBeenCalledTimes(1);
    expect(sendFeishuByEnvMock).toHaveBeenCalledTimes(1);
  });

  it("silent 模式不会扇出交易通知", async () => {
    executeManualTradeMock.mockResolvedValue({
      item: {
        ticketId: "ticket-2",
        cycleId: null,
        qty: 1,
        brokerKind: "sim",
        brokerAccountId: "local",
      },
      result: { ticketId: "ticket-2", status: "executed" },
      summary: { executed: 1, rejected: 0, total: 1 },
      logs: [],
      baseCurrency: "USD",
      notionalInBase: 100,
      feeInBase: 0,
      source: "manual",
      side: "BUY",
      symbol: "AAPL",
      broker: null,
    });

    await executeTradeViaGateway({
      request: {
        source: "manual",
        side: "BUY",
        assetKey: "US::AAPL",
        symbol: "AAPL",
        market: "US",
        currency: "USD",
        qty: 1,
        price: 100,
      },
      notifyMode: "silent",
    });

    expect(sendTelegramByEnvMock).not.toHaveBeenCalled();
    expect(sendFeishuByEnvMock).not.toHaveBeenCalled();
  });

  it("再平衡执行也会走统一通知扇出", async () => {
    executeWorkbenchRebalanceCycleMock.mockResolvedValue({
      cycle: {
        cycleId: "cycle-1",
        executedOrders: ["ticket-3"],
        executionSummary: {
          ordersExecuted: 1,
          ordersSubmitted: 0,
          ordersFailed: 0,
          totalNotional: 300,
          newMaxDriftPct: 1.2,
        },
      },
      logs: [{
        ticketId: "ticket-3",
        qty: 3,
        price: 100,
        status: "executed",
      }],
    });

    await executeRebalanceViaGateway({
      cycleId: "cycle-1",
      executeMode: "all",
    });

    expect(sendTelegramByEnvMock).toHaveBeenCalledTimes(1);
    expect(sendFeishuByEnvMock).toHaveBeenCalledTimes(1);
  });

  it("预览调用会透传到底层服务", async () => {
    previewManualTradeMock.mockResolvedValue({ assetKey: "US::AAPL", canSubmit: true });

    const result = await previewTradeViaGateway({
      assetKey: "US::AAPL",
      side: "BUY",
      qty: 1,
    });

    expect(result).toEqual({ assetKey: "US::AAPL", canSubmit: true });
    expect(previewManualTradeMock).toHaveBeenCalledWith({
      assetKey: "US::AAPL",
      side: "BUY",
      qty: 1,
    });
  });
});
