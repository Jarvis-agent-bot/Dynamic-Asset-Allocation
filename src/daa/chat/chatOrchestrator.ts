import { resolveSecret } from "@/src/daa/config/secretsManager";
import { callLlm, resolveLlmConfig } from "@/src/daa/llm/llmClient";
import { buildWorkbenchReadModel } from "@/src/daa/modules/read/workbenchReadService";
import { previewManualTrade, executeManualTrade, ManualTradeServiceError } from "@/src/daa/modules/workbench/manualTradeService";
import { executeWorkbenchRebalanceCycle, generateWorkbenchRebalanceCycle } from "@/src/daa/modules/workbench/workbenchRebalanceCycleService";

import {
  appendChatMessage,
  appendChatToolCall,
  getChatSessionMemory,
  getOrCreateChatSession,
  listChatMessages,
  saveChatSessionMemory,
} from "./chatRepo";
import { assistantIntentKind, parseAssistantIntent, type DaaAssistantIntent } from "./intentParser";
import type { DaaChatChannel, DaaChatIntentKind, DaaChatPendingAction, DaaChatSessionMemory } from "./chatTypes";

const PENDING_ACTION_TTL_MS = 10 * 60 * 1000;
const SUMMARY_TEXT_LIMIT = 1200;
const SUMMARY_LINE_LIMIT = 8;

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatMoney(value: number | null | undefined, currency: string): string {
  const amount = Number(value || 0);
  return `${amount.toFixed(2)} ${currency}`;
}

function formatPct(value: number | null | undefined): string {
  const amount = Number(value || 0);
  return `${amount.toFixed(2)}%`;
}

function buildRecentConversation(messages: Awaited<ReturnType<typeof listChatMessages>>): string {
  return messages
    .slice(-8)
    .map((item) => `${item.role === "assistant" ? "助手" : item.role === "system" ? "系统" : "用户"}: ${item.body}`)
    .join("\n");
}

function toIsoFromNow(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function describePendingAction(action: DaaChatPendingAction | null): string {
  if (!action) return "无";
  if (action.kind === "trade") {
    const amount = action.qty != null
      ? `${Number(action.qty).toFixed(6)} 股`
      : `${Number(action.notional || 0).toFixed(2)} USD`;
    return `${action.side === "BUY" ? "买入" : "卖出"} ${action.symbol} ${amount}`;
  }
  return `执行调仓周期 ${action.cycleId.slice(0, 8)}`;
}

function parsePendingAction(value: unknown): DaaChatPendingAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const kind = normalizeText(record.kind);
  const createdAt = normalizeText(record.createdAt);
  const expiresAt = normalizeText(record.expiresAt);

  if (kind === "trade") {
    const symbol = normalizeText(record.symbol).toUpperCase();
    if (!symbol || !createdAt || !expiresAt) return null;
    const side = normalizeText(record.side).toUpperCase() === "SELL" ? "SELL" : "BUY";
    const qty = record.qty == null ? null : Number(record.qty);
    const notional = record.notional == null ? null : Number(record.notional);
    return {
      kind,
      side,
      symbol,
      qty: Number.isFinite(qty) ? qty : null,
      notional: Number.isFinite(notional) ? notional : null,
      createdAt,
      expiresAt,
    };
  }

  if (kind === "rebalance_execute") {
    const cycleId = normalizeText(record.cycleId);
    if (!cycleId || !createdAt || !expiresAt) return null;
    return {
      kind,
      cycleId,
      executeMode: "all",
      createdAt,
      expiresAt,
    };
  }

  return null;
}

function isPendingActionExpired(action: DaaChatPendingAction | null): boolean {
  if (!action) return true;
  const expiresAt = Date.parse(action.expiresAt);
  if (!Number.isFinite(expiresAt)) return true;
  return expiresAt <= Date.now();
}

function buildSessionSummary(input: {
  previousSummary: string;
  userText: string;
  assistantText: string;
  intentKind: DaaChatIntentKind;
  pendingAction: DaaChatPendingAction | null;
}): string {
  const previousLines = normalizeText(input.previousSummary)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-Math.max(0, SUMMARY_LINE_LIMIT - 2));
  const nextLines = [
    `${toIsoFromNow()} | ${input.intentKind} | 用户: ${normalizeText(input.userText).slice(0, 80)}`,
    `助手: ${normalizeText(input.assistantText).slice(0, 180)} | 待确认: ${describePendingAction(input.pendingAction)}`,
  ];
  return [...previousLines, ...nextLines].join("\n").slice(-SUMMARY_TEXT_LIMIT);
}

function buildContextDigest(readModel: Awaited<ReturnType<typeof buildWorkbenchReadModel>>): string {
  const topHoldings = (readModel.allocationSummary.topHoldings || [])
    .slice(0, 4)
    .map((item) => `${item.symbol} ${formatMoney(item.value, readModel.bootstrap.baseCurrency)} / ${formatPct(item.weightPct)}`)
    .join("；");
  const topSignals = (readModel.signals || []).slice(0, 4).map((item) => item.text).join("；");
  const marketScopes = (readModel.bootstrap.marketContext?.scopes || [])
    .slice(0, 3)
    .map((item) => `${item.label}:${item.regime}`)
    .join("；");
  const latestCycle = readModel.bootstrap.latestCycle;
  return [
    `基准币: ${readModel.bootstrap.baseCurrency}`,
    `总权益: ${formatMoney(readModel.allocationSummary.totalEquity, readModel.bootstrap.baseCurrency)}`,
    `持仓: ${topHoldings || "暂无"}`,
    `可用现金: ${formatMoney(readModel.allocationSummary.investableCash, readModel.bootstrap.baseCurrency)}`,
    `市场状态: ${marketScopes || "暂无"}`,
    `数据健康: ${readModel.bootstrap.marketDataHealth?.message || "未知"}`,
    `最新周期: ${latestCycle ? `${latestCycle.cycleId.slice(0, 8)} / ${latestCycle.status} / ${latestCycle.triggerSource}` : "暂无"}`,
    `重要信号: ${topSignals || "暂无"}`,
  ].join("\n");
}

async function answerWithLlm(input: {
  question: string;
  readModel: Awaited<ReturnType<typeof buildWorkbenchReadModel>>;
  recentMessages: Awaited<ReturnType<typeof listChatMessages>>;
  sessionMemory: DaaChatSessionMemory | null;
}): Promise<string | null> {
  try {
    const config = await resolveLlmConfig();
    if (!config.enabled || !config.apiKey || !config.endpoint || !config.model) return null;
    const pendingAction = parsePendingAction(input.sessionMemory?.metaJson?.pendingAction);
    const prompt = [
      "你是 DAA 的私有交易助手，只能基于给定上下文回答，不要虚构订单或不存在的数据。",
      "回答要求：中文、直接、可操作；如果上下文不足，要明确说不足。",
      "",
      "系统上下文：",
      buildContextDigest(input.readModel),
      "",
      "会话记忆：",
      normalizeText(input.sessionMemory?.summaryText) || "暂无",
      `待确认动作：${describePendingAction(pendingAction)}`,
      "",
      "最近对话：",
      buildRecentConversation(input.recentMessages) || "暂无",
      "",
      `当前问题：${input.question}`,
    ].join("\n");
    const response = await callLlm(config, prompt);
    const text = normalizeText(response.text);
    return text || null;
  } catch {
    return null;
  }
}

function formatPortfolioStatus(readModel: Awaited<ReturnType<typeof buildWorkbenchReadModel>>): string {
  const allocation = readModel.allocationSummary;
  const topHoldings = allocation.topHoldings
    .slice(0, 4)
    .map((item) => `${item.symbol} ${formatPct(item.weightPct)}`)
    .join("，");
  return [
    "当前组合状态：",
    `总权益 ${formatMoney(allocation.totalEquity, readModel.bootstrap.baseCurrency)}，持仓市值 ${formatMoney(allocation.holdingValue, readModel.bootstrap.baseCurrency)}，可投资现金 ${formatMoney(allocation.investableCash, readModel.bootstrap.baseCurrency)}。`,
    `持仓数 ${allocation.holdingCount}，观察资产 ${allocation.watchlistCount}。`,
    topHoldings ? `主要暴露：${topHoldings}。` : "当前还没有形成主要持仓。",
  ].join("\n");
}

function formatRiskStatus(readModel: Awaited<ReturnType<typeof buildWorkbenchReadModel>>): string {
  const cycle = readModel.bootstrap.latestCycle;
  if (!cycle?.riskCheck) {
    return "当前没有可复用的调仓风控结果。可以先生成一轮调仓建议，再查看详细风控。";
  }
  const riskItems = cycle.riskCheck.items
    .filter((item) => item.status !== "pass")
    .slice(0, 5)
    .map((item) => `- ${item.message}`)
    .join("\n");
  return [
    `最近周期 ${cycle.cycleId.slice(0, 8)} 的风控状态：${cycle.riskCheck.overallStatus}。`,
    riskItems || "当前没有 block / warn 级别的风险项。",
  ].join("\n");
}

function formatMarketStatus(readModel: Awaited<ReturnType<typeof buildWorkbenchReadModel>>): string {
  const context = readModel.bootstrap.marketContext;
  const scopes = (context?.scopes || [])
    .slice(0, 4)
    .map((item) => `${item.label}: ${item.regime}（普通买入 ${Math.round(item.buyScale * 100)}%）`)
    .join("\n");
  const dataHealth = readModel.bootstrap.marketDataHealth;
  return [
    "当前市场状态：",
    scopes || "当前没有市场状态层快照。",
    dataHealth
      ? `行情健康：fresh ${dataHealth.freshCount} / stale ${dataHealth.staleCount} / missing ${dataHealth.missingCount}，失败率 ${dataHealth.recentJobFailureRatePct.toFixed(1)}%。`
      : "行情健康：暂无快照。",
  ].join("\n");
}

function formatLatestCycle(readModel: Awaited<ReturnType<typeof buildWorkbenchReadModel>>): string {
  const cycle = readModel.bootstrap.latestCycle;
  if (!cycle) return "当前还没有调仓周期。可以发“生成调仓建议”让我先跑一轮。";
  const proposalCount = cycle.proposals.length;
  const selectedCount = cycle.proposals.filter((item) => item.selected).length;
  return [
    `最近周期 ${cycle.cycleId.slice(0, 8)}：${cycle.status} / ${cycle.triggerSource}`,
    `建议数 ${proposalCount}，已纳入执行 ${selectedCount}。`,
    cycle.executionSummary
      ? `执行结果：成交 ${cycle.executionSummary.ordersExecuted}，已提交 ${cycle.executionSummary.ordersSubmitted ?? 0}，失败 ${cycle.executionSummary.ordersFailed}，总名义 ${formatMoney(cycle.executionSummary.totalNotional, readModel.bootstrap.baseCurrency)}。`
      : "当前还没有执行结果。",
  ].join("\n");
}

function formatHelp(): string {
  return [
    "你可以直接发这些话：",
    "1. 组合状态 / 当前持仓",
    "2. 风险状态 / 市场状态 / 最近一次调仓",
    "3. 生成调仓建议",
    "4. 执行调仓",
    "5. 买入 QQQ 10股",
    "6. 卖出 AAPL 5股",
    "7. 执行类命令会先进入待确认，回复“确认”才真正执行",
    "8. 如果要放弃待确认动作，直接回复“取消”",
  ].join("\n");
}

function formatTradeConfirmationText(input: {
  side: "BUY" | "SELL";
  symbol: string;
  preview: Awaited<ReturnType<typeof previewManualTrade>>;
}): string {
  const previewWarnings = input.preview.warnings.slice(0, 3).map((item) => `- ${item}`).join("\n");
  return [
    `${input.side === "BUY" ? "买入" : "卖出"} ${input.symbol} 已进入待确认。`,
    `预估数量 ${input.preview.qty.toFixed(6)}，价格 ${input.preview.price.toFixed(4)} ${input.preview.currency}，名义 ${formatMoney(input.preview.notionalInBase, input.preview.baseCurrency)}。`,
    previewWarnings ? `执行前提醒：\n${previewWarnings}` : "",
    "回复“确认”继续执行，回复“取消”放弃本次动作。",
  ].filter(Boolean).join("\n");
}

function formatRebalanceConfirmationText(input: {
  cycleId: string;
  status: string;
  selectedCount: number;
  proposalCount: number;
}): string {
  return [
    `调仓周期 ${input.cycleId.slice(0, 8)} 已进入待确认。`,
    `当前状态 ${input.status}，候选 ${input.proposalCount}，已纳入执行 ${input.selectedCount}。`,
    "回复“确认”继续执行，回复“取消”放弃本次动作。",
  ].join("\n");
}

function buildNoPendingActionReply(): {
  text: string;
  intentKind: DaaChatIntentKind;
  pendingAction: DaaChatPendingAction | null;
} {
  return {
    text: "当前没有待确认动作。你可以先发“执行调仓”或“买入 QQQ 10股”之类的命令。",
    intentKind: "confirm_action",
    pendingAction: null,
  };
}

function buildCancelledReply(): {
  text: string;
  intentKind: DaaChatIntentKind;
  pendingAction: DaaChatPendingAction | null;
} {
  return {
    text: "已取消当前待确认动作。",
    intentKind: "cancel_action",
    pendingAction: null,
  };
}

function formatTradeReceipt(input: {
  side: "BUY" | "SELL";
  symbol: string;
  qty: number;
  preview: Awaited<ReturnType<typeof previewManualTrade>>;
  execution: Awaited<ReturnType<typeof executeManualTrade>>;
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

function buildUnknownReply(input: {
  llmAnswer: string | null;
  pendingAction: DaaChatPendingAction | null;
}): { text: string; intentKind: DaaChatIntentKind; pendingAction: DaaChatPendingAction | null } {
  if (input.llmAnswer) {
    return {
      text: input.llmAnswer,
      intentKind: "llm_answer",
      pendingAction: input.pendingAction,
    };
  }
  return {
    text: `我已经接入了交易助手模式，但这条话我还没有稳定映射到结构化动作。\n\n${formatHelp()}`,
    intentKind: "unknown",
    pendingAction: input.pendingAction,
  };
}

async function resolveTradeReply(input: {
  intent: Extract<DaaAssistantIntent, { kind: "trade" }>;
  readModel: Awaited<ReturnType<typeof buildWorkbenchReadModel>>;
  allowExecution: boolean;
  requireConfirmation: boolean;
  currentPendingAction: DaaChatPendingAction | null;
}) {
  if (!input.allowExecution) {
    return {
      text: "当前会话只允许查询，不允许直接执行交易。",
      intentKind: "trade" as const,
      pendingAction: input.currentPendingAction,
    };
  }

  if (input.intent.qty == null && input.intent.notional == null) {
    return {
      text: `已识别为${input.intent.side === "BUY" ? "买入" : "卖出"} ${input.intent.symbol}，但还缺少数量。\n示例：买入 ${input.intent.symbol} 10股`,
      intentKind: "trade" as const,
      pendingAction: input.currentPendingAction,
    };
  }

  const row = input.readModel.bootstrap.assetUniverse.find((item) => item.symbol.toUpperCase() === input.intent.symbol.toUpperCase());
  if (!row) {
    return {
      text: `${input.intent.symbol} 当前不在资产池里。请先在工作台加入该资产，再从聊天里直接交易。`,
      intentKind: "trade" as const,
      pendingAction: input.currentPendingAction,
    };
  }

  const preview = await previewManualTrade({
    assetKey: row.assetKey,
    side: input.intent.side,
    qty: input.intent.qty,
    notional: input.intent.notional,
  });
  if (!preview.canSubmit) {
    return {
      text: [
        `${input.intent.side === "BUY" ? "买入" : "卖出"} ${row.symbol} 被阻断。`,
        ...preview.warnings.slice(0, 4).map((item) => `- ${item}`),
      ].join("\n"),
      intentKind: "trade" as const,
      pendingAction: null,
    };
  }

  if (input.requireConfirmation) {
    const pendingAction: DaaChatPendingAction = {
      kind: "trade",
      side: input.intent.side,
      symbol: row.symbol,
      qty: preview.qty,
      notional: input.intent.notional,
      createdAt: toIsoFromNow(),
      expiresAt: toIsoFromNow(PENDING_ACTION_TTL_MS),
    };
    return {
      text: formatTradeConfirmationText({
        side: input.intent.side,
        symbol: row.symbol,
        preview,
      }),
      intentKind: "trade" as const,
      pendingAction,
    };
  }

  const execution = await executeManualTrade({
    source: "manual",
    side: input.intent.side,
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
    reasonText: `assistant_trade:${input.intent.rawText}`,
    createdBy: "assistant.chat",
  });
  return {
    text: formatTradeReceipt({
      side: input.intent.side,
      symbol: row.symbol,
      qty: preview.qty,
      preview,
      execution,
    }),
    intentKind: "trade" as const,
    pendingAction: null,
  };
}

async function executePendingTrade(input: {
  pendingAction: Extract<DaaChatPendingAction, { kind: "trade" }>;
  readModel: Awaited<ReturnType<typeof buildWorkbenchReadModel>>;
  sessionId: string;
  userMessageId: string;
}) {
  const row = input.readModel.bootstrap.assetUniverse.find((item) => item.symbol.toUpperCase() === input.pendingAction.symbol.toUpperCase());
  if (!row) {
    return {
      text: `${input.pendingAction.symbol} 当前已经不在资产池里，本次待确认动作已失效。`,
      intentKind: "trade" as const,
      pendingAction: null,
    };
  }

  const preview = await previewManualTrade({
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
      intentKind: "trade" as const,
      pendingAction: null,
    };
  }

  const execution = await executeManualTrade({
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
  });
  await appendChatToolCall({
    sessionId: input.sessionId,
    messageId: input.userMessageId,
    toolName: "executeManualTrade",
    status: "ok",
    resultJson: {
      symbol: row.symbol,
      side: input.pendingAction.side,
      status: execution.result.status,
      ticketId: execution.item.ticketId,
    },
  });
  return {
    text: formatTradeReceipt({
      side: input.pendingAction.side,
      symbol: row.symbol,
      qty: preview.qty,
      preview,
      execution,
    }),
    intentKind: "trade" as const,
    pendingAction: null,
  };
}

async function executePendingRebalance(input: {
  pendingAction: Extract<DaaChatPendingAction, { kind: "rebalance_execute" }>;
  sessionId: string;
  userMessageId: string;
}) {
  const result = await executeWorkbenchRebalanceCycle({
    cycleId: input.pendingAction.cycleId,
    executeMode: input.pendingAction.executeMode,
  });
  await appendChatToolCall({
    sessionId: input.sessionId,
    messageId: input.userMessageId,
    toolName: "executeWorkbenchRebalanceCycle",
    status: "ok",
    resultJson: {
      cycleId: result.cycle.cycleId,
      status: result.cycle.status,
      logCount: result.logs.length,
    },
  });
  return {
    text: `已执行周期 ${result.cycle.cycleId.slice(0, 8)}。当前状态 ${result.cycle.status}，返回订单 ${result.logs.length} 条。`,
    intentKind: "rebalance_execute" as const,
    pendingAction: null,
  };
}

async function resolveIntentReply(input: {
  intent: DaaAssistantIntent;
  readModel: Awaited<ReturnType<typeof buildWorkbenchReadModel>>;
  recentMessages: Awaited<ReturnType<typeof listChatMessages>>;
  sessionMemory: DaaChatSessionMemory | null;
  currentPendingAction: DaaChatPendingAction | null;
  allowExecution: boolean;
  requireConfirmation: boolean;
  sessionId: string;
  userMessageId: string;
}) {
  switch (input.intent.kind) {
    case "help":
      return { text: formatHelp(), intentKind: "help" as const, pendingAction: input.currentPendingAction };
    case "portfolio_status":
      return { text: formatPortfolioStatus(input.readModel), intentKind: "portfolio_status" as const, pendingAction: input.currentPendingAction };
    case "risk_status":
      return { text: formatRiskStatus(input.readModel), intentKind: "risk_status" as const, pendingAction: input.currentPendingAction };
    case "market_status":
      return { text: formatMarketStatus(input.readModel), intentKind: "market_status" as const, pendingAction: input.currentPendingAction };
    case "latest_cycle":
      return { text: formatLatestCycle(input.readModel), intentKind: "latest_cycle" as const, pendingAction: input.currentPendingAction };
    case "rebalance_generate": {
      const result = await generateWorkbenchRebalanceCycle({
        triggerSource: "manual",
        triggerReason: "assistant_chat",
        manual: true,
      });
      await appendChatToolCall({
        sessionId: input.sessionId,
        messageId: input.userMessageId,
        toolName: "generateWorkbenchRebalanceCycle",
        status: "ok",
        resultJson: {
          created: result.created,
          cycleId: result.cycle?.cycleId || null,
          portfolioStatus: result.portfolioStatus,
        },
      });
      return {
        text: result.created
          ? `已生成新调仓周期 ${result.cycle?.cycleId.slice(0, 8)}，当前状态 ${result.cycle?.status}，建议数 ${result.cycle?.proposals.length || 0}。`
          : result.message,
        intentKind: "rebalance_generate" as const,
        pendingAction: input.currentPendingAction,
      };
    }
    case "rebalance_execute": {
      const latestCycle = input.readModel.bootstrap.latestCycle;
      if (!latestCycle) {
        return {
          text: "当前没有可执行的调仓周期。先发“生成调仓建议”生成一轮，再执行。",
          intentKind: "rebalance_execute" as const,
          pendingAction: null,
        };
      }

      if (input.requireConfirmation) {
        const pendingAction: DaaChatPendingAction = {
          kind: "rebalance_execute",
          cycleId: latestCycle.cycleId,
          executeMode: input.intent.executeMode,
          createdAt: toIsoFromNow(),
          expiresAt: toIsoFromNow(PENDING_ACTION_TTL_MS),
        };
        return {
          text: formatRebalanceConfirmationText({
            cycleId: latestCycle.cycleId,
            status: latestCycle.status,
            selectedCount: latestCycle.proposals.filter((item) => item.selected).length,
            proposalCount: latestCycle.proposals.length,
          }),
          intentKind: "rebalance_execute" as const,
          pendingAction,
        };
      }

      const result = await executePendingRebalance({
        pendingAction: {
          kind: "rebalance_execute",
          cycleId: latestCycle.cycleId,
          executeMode: input.intent.executeMode,
          createdAt: toIsoFromNow(),
          expiresAt: toIsoFromNow(PENDING_ACTION_TTL_MS),
        },
        sessionId: input.sessionId,
        userMessageId: input.userMessageId,
      });
      return {
        ...result,
      };
    }
    case "trade":
      return resolveTradeReply({
        intent: input.intent,
        readModel: input.readModel,
        allowExecution: input.allowExecution,
        requireConfirmation: input.requireConfirmation,
        currentPendingAction: input.currentPendingAction,
      });
    case "confirm_action": {
      const pendingAction = input.currentPendingAction;
      if (!pendingAction) return buildNoPendingActionReply();
      if (isPendingActionExpired(pendingAction)) {
        return {
          text: `待确认动作已过期，已自动清除。请重新发起。\n过期动作：${describePendingAction(pendingAction)}`,
          intentKind: "confirm_action" as const,
          pendingAction: null,
        };
      }
      if (!input.allowExecution) {
        return {
          text: "当前会话只允许查询，不允许确认执行动作。",
          intentKind: "confirm_action" as const,
          pendingAction,
        };
      }
      if (pendingAction.kind === "trade") {
        return executePendingTrade({
          pendingAction,
          readModel: input.readModel,
          sessionId: input.sessionId,
          userMessageId: input.userMessageId,
        });
      }
      return executePendingRebalance({
        pendingAction,
        sessionId: input.sessionId,
        userMessageId: input.userMessageId,
      });
    }
    case "cancel_action":
      return input.currentPendingAction
        ? buildCancelledReply()
        : buildNoPendingActionReply();
    case "unknown": {
      const llmAnswer = await answerWithLlm({
        question: input.intent.rawText,
        readModel: input.readModel,
        recentMessages: input.recentMessages,
        sessionMemory: input.sessionMemory,
      });
      return buildUnknownReply({ llmAnswer, pendingAction: input.currentPendingAction });
    }
    default:
      return { text: formatHelp(), intentKind: "help" as const, pendingAction: input.currentPendingAction };
  }
}

export async function runAssistantTurn(input: {
  channel: DaaChatChannel;
  sessionKey: string;
  userText: string;
  title?: string | null;
  participantId?: string | null;
  externalChatId?: string | null;
  externalUserId?: string | null;
  threadId?: string | null;
  externalMessageId?: string | null;
  allowExecution?: boolean;
}) {
  const session = await getOrCreateChatSession({
    channel: input.channel,
    sessionKey: input.sessionKey,
    title: input.title || null,
    participantId: input.participantId || null,
    externalChatId: input.externalChatId || null,
    externalUserId: input.externalUserId || null,
    threadId: input.threadId || null,
  });
  const intent = parseAssistantIntent(input.userText);
  const userMessage = await appendChatMessage({
    sessionId: session.sessionId,
    role: "user",
    body: input.userText,
    intentKind: assistantIntentKind(intent),
    status: "completed",
    externalMessageId: input.externalMessageId || null,
  });

  try {
    const [readModel, recentMessages, sessionMemory] = await Promise.all([
      buildWorkbenchReadModel({ syncPrices: false, autoRiskCycle: false }),
      listChatMessages(session.sessionId, 12),
      getChatSessionMemory(session.sessionId),
    ]);
    const storedPendingAction = parsePendingAction(sessionMemory?.metaJson?.pendingAction);
    const currentPendingAction = (
      intent.kind === "confirm_action" || intent.kind === "cancel_action"
    )
      ? storedPendingAction
      : (storedPendingAction && !isPendingActionExpired(storedPendingAction) ? storedPendingAction : null);
    const reply = await resolveIntentReply({
      intent,
      readModel,
      recentMessages,
      sessionMemory,
      currentPendingAction,
      allowExecution: input.allowExecution === true,
      requireConfirmation: input.allowExecution === true,
      sessionId: session.sessionId,
      userMessageId: userMessage.messageId,
    });
    const assistantMessage = await appendChatMessage({
      sessionId: session.sessionId,
      role: "assistant",
      body: reply.text,
      intentKind: reply.intentKind,
      status: "completed",
    });
    await saveChatSessionMemory({
      sessionId: session.sessionId,
      summaryText: buildSessionSummary({
        previousSummary: sessionMemory?.summaryText || "",
        userText: input.userText,
        assistantText: reply.text,
        intentKind: reply.intentKind,
        pendingAction: reply.pendingAction,
      }),
      metaJson: {
        ...(sessionMemory?.metaJson || {}),
        pendingAction: reply.pendingAction,
      },
    });
    return {
      session,
      intentKind: reply.intentKind,
      userMessage,
      assistantMessage,
      assistantText: reply.text,
    };
  } catch (error) {
    const errorMessage = error instanceof ManualTradeServiceError
      ? error.message
      : error instanceof Error
        ? error.message
        : String(error || "unknown_error");
    await appendChatToolCall({
      sessionId: session.sessionId,
      messageId: userMessage.messageId,
      toolName: "assistant_turn",
      status: "failed",
      errorText: errorMessage,
    });
    const assistantMessage = await appendChatMessage({
      sessionId: session.sessionId,
      role: "assistant",
      body: `这次请求没有完成：${errorMessage}`,
      intentKind: "unknown",
      status: "failed",
    });
    const sessionMemory = await getChatSessionMemory(session.sessionId);
    await saveChatSessionMemory({
      sessionId: session.sessionId,
      summaryText: buildSessionSummary({
        previousSummary: sessionMemory?.summaryText || "",
        userText: input.userText,
        assistantText: assistantMessage.body,
        intentKind: "unknown",
        pendingAction: parsePendingAction(sessionMemory?.metaJson?.pendingAction),
      }),
      metaJson: sessionMemory?.metaJson || {},
    });
    return {
      session,
      intentKind: "unknown" as const,
      userMessage,
      assistantMessage,
      assistantText: assistantMessage.body,
    };
  }
}

function parseAllowlist(raw: string): Set<string> {
  return new Set(
    raw
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

export async function isTelegramSenderAllowed(input: {
  chatId: string;
  userId: string;
}) {
  const [allowlistRaw, configuredChatId] = await Promise.all([
    resolveSecret("telegram_allowlist"),
    resolveSecret("telegram_chat_id"),
  ]);
  const allowlist = parseAllowlist(allowlistRaw);
  if (allowlist.size === 0) {
    return normalizeText(configuredChatId) === input.chatId;
  }
  return allowlist.has(input.chatId) || allowlist.has(input.userId) || allowlist.has(`${input.chatId}:${input.userId}`);
}
