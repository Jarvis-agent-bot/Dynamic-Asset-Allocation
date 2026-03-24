import { appendAgentLearningEvent } from "@/src/daa/agent/agentLearningRepo";
import { executeTradeViaGateway, previewTradeViaGateway } from "@/src/daa/gateway";
import type { ExecuteManualTradeResult, PreviewManualTradeResult } from "@/src/daa/modules/workbench/manualTradeService";

import { appendChatToolCall } from "./chatRepo";
import { formatMoney, PENDING_ACTION_TTL_MS, toIsoFromNow } from "./agentContext";
import type { DaaAgentToolContext, DaaAgentToolResult } from "./agentToolTypes";
import { buildAssistantFallbackReply } from "./agentToolViewHandlers";
import type { DaaChatPendingAction } from "./chatTypes";

function formatTradeConfirmationText(input: {
  side: "BUY" | "SELL";
  symbol: string;
  preview: PreviewManualTradeResult;
}): string {
  const previewWarnings = input.preview.warnings.slice(0, 3).map((item) => `- ${item}`).join("\n");
  return [
    `${input.side === "BUY" ? "买入" : "卖出"} ${input.symbol} 已进入待确认。`,
    `预估数量 ${input.preview.qty.toFixed(6)}，价格 ${input.preview.price.toFixed(4)} ${input.preview.currency}，名义 ${formatMoney(input.preview.notionalInBase, input.preview.baseCurrency)}。`,
    previewWarnings ? `执行前提醒：\n${previewWarnings}` : "",
    "回复“确认”继续执行，回复“取消”放弃本次动作。",
  ].filter(Boolean).join("\n");
}

function formatTradeReceipt(input: {
  side: "BUY" | "SELL";
  symbol: string;
  qty: number;
  preview: PreviewManualTradeResult;
  execution: ExecuteManualTradeResult;
}): string {
  const previewWarnings = input.preview.warnings.slice(0, 3).map((item) => `- ${item}`).join("\n");
  const brokerText = input.execution.result.status === "executed"
    ? "已在本地模拟账本成交。"
    : "订单已提交，等待后续状态更新。";
  return [
    `${input.side === "BUY" ? "买入" : "卖出"} ${input.symbol} ${brokerText}`,
    `数量 ${input.qty.toFixed(6)}，价格 ${input.preview.price.toFixed(4)} ${input.preview.currency}，名义 ${formatMoney(input.preview.notionalInBase, input.preview.baseCurrency)}。`,
    `结果：${input.execution.result.status}，工单 ${input.execution.item.ticketId.slice(0, 8)}。`,
    previewWarnings ? `执行前提醒：\n${previewWarnings}` : "",
  ].filter(Boolean).join("\n");
}

async function appendTradeLearning(input: {
  sessionId: string;
  side: "BUY" | "SELL";
  symbol: string;
  qty: number;
  preview: PreviewManualTradeResult;
  execution: ExecuteManualTradeResult;
}) {
  await appendAgentLearningEvent({
    eventType: "trade_execution",
    sessionId: input.sessionId,
    symbol: input.symbol,
    title: `${input.side === "BUY" ? "买入" : "卖出"} ${input.symbol}`,
    summary: [
      `结果 ${input.execution.result.status}`,
      `数量 ${input.qty.toFixed(6)}`,
      `价格 ${input.preview.price.toFixed(4)} ${input.preview.currency}`,
      `名义 ${formatMoney(input.preview.notionalInBase, input.preview.baseCurrency)}`,
      `工单 ${input.execution.item.ticketId.slice(0, 8)}`,
    ].join(" | "),
    contextJson: {
      side: input.side,
      symbol: input.symbol,
      qty: input.qty,
      price: input.preview.price,
      baseCurrency: input.preview.baseCurrency,
      notionalInBase: input.preview.notionalInBase,
      status: input.execution.result.status,
      ticketId: input.execution.item.ticketId,
    },
  });
}

export async function executeTradeIntent(input: {
  toolContext: DaaAgentToolContext;
}): Promise<DaaAgentToolResult> {
  if (input.toolContext.intent.kind !== "trade") {
    return buildAssistantFallbackReply(input.toolContext.currentPendingAction);
  }

  const intent = input.toolContext.intent;
  if (!input.toolContext.allowExecution) {
    return {
      text: "当前会话只允许查询，不允许直接执行交易。",
      intentKind: "trade",
      pendingAction: input.toolContext.currentPendingAction,
    };
  }
  if (intent.qty == null && intent.notional == null) {
    return {
      text: `已识别为${intent.side === "BUY" ? "买入" : "卖出"} ${intent.symbol}，但还缺少数量。\n示例：买入 ${intent.symbol} 10股`,
      intentKind: "trade",
      pendingAction: input.toolContext.currentPendingAction,
    };
  }

  const row = input.toolContext.readModel.bootstrap.assetUniverse.find((item) => item.symbol.toUpperCase() === intent.symbol.toUpperCase());
  if (!row) {
    return {
      text: `${intent.symbol} 当前不在资产池里。请先在工作台加入该资产，再从聊天里直接交易。`,
      intentKind: "trade",
      pendingAction: input.toolContext.currentPendingAction,
    };
  }

  const preview = await previewTradeViaGateway({
    assetKey: row.assetKey,
    side: intent.side,
    qty: intent.qty,
    notional: intent.notional,
  });
  if (!preview.canSubmit) {
    return {
      text: [
        `${intent.side === "BUY" ? "买入" : "卖出"} ${row.symbol} 被阻断。`,
        ...preview.warnings.slice(0, 4).map((item) => `- ${item}`),
      ].join("\n"),
      intentKind: "trade",
      pendingAction: null,
    };
  }

  if (input.toolContext.requireConfirmation) {
    const pendingAction: DaaChatPendingAction = {
      kind: "trade",
      side: intent.side,
      symbol: row.symbol,
      qty: preview.qty,
      notional: intent.notional,
      createdAt: toIsoFromNow(),
      expiresAt: toIsoFromNow(PENDING_ACTION_TTL_MS),
    };
    return {
      text: formatTradeConfirmationText({
        side: intent.side,
        symbol: row.symbol,
        preview,
      }),
      intentKind: "trade",
      pendingAction,
    };
  }

  const execution = await executeTradeViaGateway({
    request: {
      source: "manual",
      side: intent.side,
      assetKey: row.assetKey,
      symbol: row.symbol,
      market: row.market,
      currency: row.currency,
      qty: preview.qty,
      price: preview.price,
      fee: preview.fee,
      pricingMode: "market",
      priceSource: preview.priceSource,
      priceSnapshotAt: preview.priceSnapshotAt,
      reasonText: `assistant_trade:${intent.rawText}`,
      createdBy: "assistant.chat",
    },
  });
  return {
    text: formatTradeReceipt({
      side: intent.side,
      symbol: row.symbol,
      qty: preview.qty,
      preview,
      execution,
    }),
    intentKind: "trade",
    pendingAction: null,
  };
}

export async function executePendingTradeAction(input: {
  toolContext: DaaAgentToolContext;
  pendingAction: Extract<DaaChatPendingAction, { kind: "trade" }>;
}): Promise<DaaAgentToolResult> {
  const row = input.toolContext.readModel.bootstrap.assetUniverse.find((item) => item.symbol.toUpperCase() === input.pendingAction.symbol.toUpperCase());
  if (!row) {
    return {
      text: `${input.pendingAction.symbol} 当前已经不在资产池里，本次待确认动作已失效。`,
      intentKind: "trade",
      pendingAction: null,
    };
  }

  const preview = await previewTradeViaGateway({
    assetKey: row.assetKey,
    side: input.pendingAction.side,
    qty: input.pendingAction.qty,
    notional: input.pendingAction.notional,
  });
  if (!preview.canSubmit) {
    return {
      text: [
        `${input.pendingAction.side === "BUY" ? "买入" : "卖出"} ${row.symbol} 当前无法继续执行，已取消待确认动作。`,
        ...preview.warnings.slice(0, 4).map((item) => `- ${item}`),
      ].join("\n"),
      intentKind: "trade",
      pendingAction: null,
    };
  }

  const execution = await executeTradeViaGateway({
    request: {
      source: "manual",
      side: input.pendingAction.side,
      assetKey: row.assetKey,
      symbol: row.symbol,
      market: row.market,
      currency: row.currency,
      qty: preview.qty,
      price: preview.price,
      fee: preview.fee,
      pricingMode: "market",
      priceSource: preview.priceSource,
      priceSnapshotAt: preview.priceSnapshotAt,
      reasonText: `assistant_trade_confirm:${input.pendingAction.side}:${row.symbol}`,
      createdBy: "assistant.chat",
    },
  });
  await appendChatToolCall({
    sessionId: input.toolContext.sessionId,
    messageId: input.toolContext.userMessageId,
    toolName: "executeManualTrade",
    status: "ok",
    resultJson: {
      symbol: row.symbol,
      side: input.pendingAction.side,
      status: execution.result.status,
      ticketId: execution.item.ticketId,
    },
  });
  await appendTradeLearning({
    sessionId: input.toolContext.sessionId,
    side: input.pendingAction.side,
    symbol: row.symbol,
    qty: preview.qty,
    preview,
    execution,
  });
  return {
    text: formatTradeReceipt({
      side: input.pendingAction.side,
      symbol: row.symbol,
      qty: preview.qty,
      preview,
      execution,
    }),
    intentKind: "trade",
    pendingAction: null,
  };
}
