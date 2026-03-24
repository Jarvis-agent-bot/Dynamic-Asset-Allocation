import { formatMoney, formatPct } from "./agentContext";
import type { DaaAgentToolContext, DaaAgentToolExecutor, DaaAgentToolResult } from "./agentToolTypes";
import type { DaaChatPendingAction } from "./chatTypes";

export function buildAssistantHelpText(): string {
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

function formatPortfolioStatus(readModel: DaaAgentToolContext["readModel"]): string {
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

function formatRiskStatus(readModel: DaaAgentToolContext["readModel"]): string {
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

function formatMarketStatus(readModel: DaaAgentToolContext["readModel"]): string {
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

function formatLatestCycle(readModel: DaaAgentToolContext["readModel"]): string {
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

export function buildAssistantFallbackReply(currentPendingAction: DaaChatPendingAction | null): DaaAgentToolResult {
  return {
    text: buildAssistantHelpText(),
    intentKind: "help",
    pendingAction: currentPendingAction,
  };
}

export function createAssistantQueryHandlers(input: DaaAgentToolContext): Map<DaaAgentToolContext["intent"]["kind"], DaaAgentToolExecutor> {
  const handlers = new Map<DaaAgentToolContext["intent"]["kind"], DaaAgentToolExecutor>();

  handlers.set("help", async () => ({
    text: buildAssistantHelpText(),
    intentKind: "help",
    pendingAction: input.currentPendingAction,
  }));

  handlers.set("portfolio_status", async () => ({
    text: formatPortfolioStatus(input.readModel),
    intentKind: "portfolio_status",
    pendingAction: input.currentPendingAction,
  }));

  handlers.set("risk_status", async () => ({
    text: formatRiskStatus(input.readModel),
    intentKind: "risk_status",
    pendingAction: input.currentPendingAction,
  }));

  handlers.set("market_status", async () => ({
    text: formatMarketStatus(input.readModel),
    intentKind: "market_status",
    pendingAction: input.currentPendingAction,
  }));

  handlers.set("latest_cycle", async () => ({
    text: formatLatestCycle(input.readModel),
    intentKind: "latest_cycle",
    pendingAction: input.currentPendingAction,
  }));

  return handlers;
}
