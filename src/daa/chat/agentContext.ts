import { buildBrainBoundaryText, describeBrainModeSummary } from "@/src/daa/brain/brainPolicy";
import { normalizeSystemConfig, type DaaSystemConfig } from "@/src/daa/config/systemConfig";
import { resolveLlmConfig, type LlmRuntimeConfig, type LlmTaskType } from "@/src/daa/llm/llmClient";
import { getDaaSystemConfig } from "@/src/daa/store/daaStorePg";
import { buildAgentLearningDigest } from "@/src/daa/agent/agentLearningRepo";
import { buildWorkbenchReadModel } from "@/src/daa/modules/read/workbenchReadService";
import { normalizeText } from "@/src/daa/utils/normalize";

import { getChatSessionMemory, listChatMessages, saveChatSessionMemory } from "./chatRepo";
import type { DaaChatIntentKind, DaaChatPendingAction, DaaChatSessionMemory } from "./chatTypes";

export const PENDING_ACTION_TTL_MS = 10 * 60 * 1000;

const SUMMARY_TEXT_LIMIT = 1200;
const SUMMARY_LINE_LIMIT = 8;

export type DaaAssistantRuntimeContext = {
  systemConfig: DaaSystemConfig;
  systemConfigVersion: number;
  readModel: Awaited<ReturnType<typeof buildWorkbenchReadModel>>;
  recentMessages: Awaited<ReturnType<typeof listChatMessages>>;
  sessionMemory: DaaChatSessionMemory | null;
  learningDigest: string;
  systemDigest: string;
  storedPendingAction: DaaChatPendingAction | null;
};

type AssistantLlmRouteSummary = Pick<LlmRuntimeConfig, "enabled" | "provider" | "model" | "endpoint"> & {
  taskType: LlmTaskType;
};

export function formatMoney(value: number | null | undefined, currency: string): string {
  const amount = Number(value || 0);
  return `${amount.toFixed(2)} ${currency}`;
}

export function formatPct(value: number | null | undefined): string {
  const amount = Number(value || 0);
  return `${amount.toFixed(2)}%`;
}

export function buildRecentConversation(messages: Awaited<ReturnType<typeof listChatMessages>>): string {
  return messages
    .slice(-8)
    .map((item) => `${item.role === "assistant" ? "助手" : item.role === "system" ? "系统" : "用户"}: ${item.body}`)
    .join("\n");
}

export function toIsoFromNow(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

export function describePendingAction(action: DaaChatPendingAction | null): string {
  if (!action) return "无";
  if (action.kind === "trade") {
    const amount = action.qty != null
      ? `${Number(action.qty).toFixed(6)} 股`
      : `${Number(action.notional || 0).toFixed(2)} USD`;
    return `${action.side === "BUY" ? "买入" : "卖出"} ${action.symbol} ${amount}`;
  }
  return `执行调仓周期 ${action.cycleId.slice(0, 8)}`;
}

export function parsePendingAction(value: unknown): DaaChatPendingAction | null {
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

export function isPendingActionExpired(action: DaaChatPendingAction | null): boolean {
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

export function buildContextDigest(readModel: Awaited<ReturnType<typeof buildWorkbenchReadModel>>): string {
  const topHoldings = (readModel.allocationSummary.topHoldings || [])
    .slice(0, 4)
    .map((item) => `${item.symbol} ${formatMoney(item.value, readModel.bootstrap.baseCurrency)} / ${formatPct(item.weightPct)}`)
    .join("；");
  const topSignals = (readModel.signals || []).slice(0, 4).map((item) => item.text).join("；");
  const marketScopes = (readModel.bootstrap.marketContext?.scopes || [])
    .slice(0, 5)
    .map((item) => `${item.label}:${item.regime}(buyScale=${item.buyScale})`)
    .join("；");
  // 展示 top 8 市场指标的具体数值
  const marketIndicators = (readModel.bootstrap.marketContext?.indicators || [])
    .slice(0, 8)
    .map((item) => {
      const val = item.rawValue != null ? `${item.rawValue}${item.unit || ""}` : "N/A";
      const pct = item.percentile252 != null ? `${item.percentile252.toFixed(0)}%位` : "";
      return `${item.label} ${val}${pct ? ` (${pct})` : ""}`;
    })
    .join("；");
  const latestCycle = readModel.bootstrap.latestCycle;
  return [
    `基准币: ${readModel.bootstrap.baseCurrency}`,
    `总权益: ${formatMoney(readModel.allocationSummary.totalEquity, readModel.bootstrap.baseCurrency)}`,
    `持仓: ${topHoldings || "暂无"}`,
    `可用现金: ${formatMoney(readModel.allocationSummary.investableCash, readModel.bootstrap.baseCurrency)}`,
    `市场态势: ${readModel.bootstrap.marketContext?.regime || "未知"}`,
    `市场区域: ${marketScopes || "暂无"}`,
    `市场指标: ${marketIndicators || "暂无"}`,
    `数据健康: ${readModel.bootstrap.marketDataHealth?.message || "未知"}`,
    `最新周期: ${latestCycle ? `${latestCycle.cycleId.slice(0, 8)} / ${latestCycle.status} / ${latestCycle.triggerSource}` : "暂无"}`,
    `重要信号: ${topSignals || "暂无"}`,
  ].join("\n");
}

function taskTypeLabel(taskType: LlmTaskType): string {
  if (taskType === "decision") return "决策执行";
  if (taskType === "research") return "深度研究";
  return "分析解读";
}

function simplifyEndpointHost(endpoint: string): string {
  const normalized = normalizeText(endpoint);
  if (!normalized) return "未配置";
  try {
    return new URL(normalized).host || normalized;
  } catch {
    return normalized
      .replace(/^https?:\/\//i, "")
      .split("/")[0]
      || normalized;
  }
}

export function buildAssistantSystemDigest(input: {
  llmRoutes: AssistantLlmRouteSummary[];
  brain?: DaaSystemConfig["brain"];
  cognitiveAgent?: DaaSystemConfig["cognitiveAgent"];
}): string {
  const summarizedConfig = normalizeSystemConfig({
    brain: input.brain,
    cognitiveAgent: input.cognitiveAgent,
  });
  const llmSummary = input.llmRoutes
    .map((route) => {
      const state = route.enabled ? "启用" : "关闭";
      return `${taskTypeLabel(route.taskType)}：${state} / ${route.provider} / ${route.model} / ${simplifyEndpointHost(route.endpoint)}`;
    })
    .join("；");

  const cognitiveSummary = input.cognitiveAgent?.enabled
    ? `已启用（频率 ${input.cognitiveAgent.schedule}，最多调查 ${input.cognitiveAgent.maxInvestigationTargets} 个论点，参数覆盖 ${input.cognitiveAgent.agentOverlayEnabled ? "开启" : "关闭"}，主动触发再平衡 ${input.cognitiveAgent.agentTriggerEnabled ? "开启" : "关闭"}）`
    : "未启用";

  return [
    "执行边界：仅支持本地模拟，可生成建议、进入待确认并执行模拟调仓或模拟买卖；不支持真实券商下单。",
    "可读上下文：组合快照、市场状态、最近周期、会话记忆、复盘学习摘要、活跃论点、Agent 日报。",
    "权限边界：不返回敏感密钥明文、不直接改系统设置、不跳过确认直接成交。",
    `大脑模式：${describeBrainModeSummary(summarizedConfig)}`,
    `大脑动作边界：${buildBrainBoundaryText(summarizedConfig)}`,
    `当前 LLM 路由：${llmSummary || "暂无"}`,
    `认知 Agent：${cognitiveSummary}`,
  ].join("\n");
}

export async function loadAssistantRuntimeContext(sessionId: string): Promise<DaaAssistantRuntimeContext> {
  const emptyRoute: LlmRuntimeConfig = {
    enabled: false,
    enabledInDecision: false,
    provider: "unavailable",
    model: "未配置",
    endpoint: "",
    apiKey: "",
    timeoutMs: 15000,
  };
  const [readModel, recentMessages, sessionMemory, learningDigest, system, analysisRoute, decisionRoute, researchRoute] = await Promise.all([
    buildWorkbenchReadModel({ syncPrices: false, autoRiskCycle: false }),
    listChatMessages(sessionId, 12),
    getChatSessionMemory(sessionId),
    buildAgentLearningDigest(8),
    getDaaSystemConfig().catch(() => ({
      version: 1,
      updatedAt: new Date().toISOString(),
      config: normalizeSystemConfig({}),
    })),
    resolveLlmConfig("analysis").catch(() => emptyRoute),
    resolveLlmConfig("decision").catch(() => emptyRoute),
    resolveLlmConfig("research").catch(() => emptyRoute),
  ]);
  const systemDigest = buildAssistantSystemDigest({
    llmRoutes: [
      { taskType: "analysis", ...analysisRoute },
      { taskType: "decision", ...decisionRoute },
      { taskType: "research", ...researchRoute },
    ],
    brain: system.config.brain,
    cognitiveAgent: system.config.cognitiveAgent,
  });
  return {
    systemConfig: system.config,
    systemConfigVersion: system.version,
    readModel,
    recentMessages,
    sessionMemory,
    learningDigest,
    systemDigest,
    storedPendingAction: parsePendingAction(sessionMemory?.metaJson?.pendingAction),
  };
}

export function resolveCurrentPendingAction(input: {
  intentKind: DaaChatIntentKind;
  storedPendingAction: DaaChatPendingAction | null;
}): DaaChatPendingAction | null {
  if (input.intentKind === "confirm_action" || input.intentKind === "cancel_action") {
    return input.storedPendingAction;
  }
  return input.storedPendingAction && !isPendingActionExpired(input.storedPendingAction)
    ? input.storedPendingAction
    : null;
}

export async function saveAssistantSessionSnapshot(input: {
  sessionId: string;
  sessionMemory: DaaChatSessionMemory | null;
  userText: string;
  assistantText: string;
  intentKind: DaaChatIntentKind;
  pendingAction: DaaChatPendingAction | null;
}) {
  await saveChatSessionMemory({
    sessionId: input.sessionId,
    summaryText: buildSessionSummary({
      previousSummary: input.sessionMemory?.summaryText || "",
      userText: input.userText,
      assistantText: input.assistantText,
      intentKind: input.intentKind,
      pendingAction: input.pendingAction,
    }),
    metaJson: {
      ...(input.sessionMemory?.metaJson || {}),
      pendingAction: input.pendingAction,
    },
  });
}
