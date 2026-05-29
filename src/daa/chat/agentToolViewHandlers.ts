import { buildAssistantBrainStatusText } from "./assistantBrain";
import { formatBriefingTextExcerpt } from "@/src/daa/agent/cognitivePrompts";
import { marketRegimeActionLabelZh } from "@/src/daa/modules/marketContext/marketContextLabels";
import { formatMoney, formatPct } from "./agentContext";
import type { DaaAgentToolContext, DaaAgentToolExecutor, DaaAgentToolResult } from "./agentToolTypes";
import type { DaaChatPendingAction } from "./chatTypes";

export function buildAssistantHelpText(): string {
  return [
    "你可以直接这样问我：",
    "1. 大脑状态 / 你现在能做什么 / 当前接入什么模型",
    "2. 切到顾问模式 / 切到操作员模式 / 切到自动驾驶模式",
    "3. 组合状态 / 风险状态 / 市场状态 / 最近一次调仓",
    "4. 运行一轮 Agent 调查 / 初始化论点 / 查看 Agent 日报",
    "5. 生成调仓建议 / 执行调仓",
    "6. 买入 QQQ 10股 / 卖出 AAPL 5股（本地模拟）",
    "7. 活跃论点 / Agent 日报 / 论点复核",
    "8. 执行类命令会先进入待确认，回复“确认”才真正执行",
    "9. 如果要放弃待确认动作，直接回复“取消”",
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
    .map((item) => `${item.label}: ${marketRegimeActionLabelZh(item.regime)}（压力 ${Math.round(item.riskOffScorePct)}/100）`)
    .join("\n");
  const budgets = (context?.assetBudgets || [])
    .slice(0, 6)
    .map((item) => `${item.label}: 预算系数 ${Math.round(item.budgetScale * 100)}%，${item.reasons[0] || "暂无具体原因"}`)
    .join("\n");
  const dataHealth = readModel.bootstrap.marketDataHealth;
  return [
    "当前市场状态：",
    budgets ? `资产预算：\n${budgets}` : "资产预算：暂无。",
    scopes ? `市场压力：\n${scopes}` : "市场压力：暂无快照。",
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

  handlers.set("brain_status", async () => ({
    text: await buildAssistantBrainStatusText(input),
    intentKind: "brain_status",
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

  // ── Cognitive Agent 查询 ──

  handlers.set("thesis_status", async () => {
    try {
      const { getActiveTheses } = await import("@/src/daa/agent/store/thesisStore");
      const theses = await getActiveTheses();
      if (theses.length === 0) {
        return { text: "Agent 尚未初始化论点。请先在 Today 页面点击「初始化论点」。", intentKind: "thesis_status", pendingAction: input.currentPendingAction };
      }
      const convictionEmoji: Record<string, string> = { high: "🟢", medium: "🟡", low: "🔴", uncertain: "⚪" };
      const lines = theses.slice(0, 10).map(t => {
        const daysSince = Math.floor((Date.now() - new Date(t.updatedAt).getTime()) / 86400000);
        return `${convictionEmoji[t.conviction] ?? "⚪"} ${t.title} (${t.conviction}) — ${t.assetKeys.join(",")} — ${daysSince}天前更新`;
      });
      return {
        text: `当前 ${theses.length} 个活跃论点：\n${lines.join("\n")}`,
        intentKind: "thesis_status",
        pendingAction: input.currentPendingAction,
      };
    } catch {
      return { text: "查询论点状态失败，请稍后重试。", intentKind: "thesis_status", pendingAction: input.currentPendingAction };
    }
  });

  handlers.set("agent_briefing", async () => {
    try {
      const { getLatestRun } = await import("@/src/daa/agent/store/agentRunStore");
      const run = await getLatestRun();
      if (!run?.briefing) {
        return { text: "暂无 Agent 日报。请先运行一次 Agent 调查。", intentKind: "agent_briefing", pendingAction: input.currentPendingAction };
      }
      const b = run.briefing;
      const parts: string[] = [`Agent 日报 (${new Date(run.createdAt).toLocaleString("zh-CN")})\n`];
      if (b.surprises.length > 0) {
        parts.push("⚡ 需要复核的变化:");
        for (const s of b.surprises.slice(0, 3)) parts.push(`  [${s.severityScore}/10] ${s.title}: ${s.description}`);
      } else {
        parts.push("⚡ 没有发现会改变当前判断的新信号。");
      }
      if (b.cognitionGaps.length > 0) {
        parts.push("\n🔍 论点复核:");
        for (const g of b.cognitionGaps.slice(0, 3)) {
          parts.push(`  ${g.assetKey} — ${g.uncertaintyReason}`);
          if (g.suggestedInvestigation) parts.push(`    ↳ ${g.suggestedInvestigation}`);
        }
      }
      if (b.autopilotCoverage) {
        const c = b.autopilotCoverage;
        parts.push("\n🧭 自动驾驶覆盖:");
        parts.push(`  持仓复核 ${c.holdingAssets} 个 | 观察候选 ${c.watchlistCandidates} 个 | 已设目标 ${c.watchlistTargetedAssets} 个 | 大脑目标计划 ${c.acceptedBrainPlanIntents}/${c.brainPlanIntents} 条`);
      }
      if (b.mindChangeConditions.length > 0) {
        parts.push("\n🔄 改变判断的条件:");
        for (const m of b.mindChangeConditions.slice(0, 3)) parts.push(`  "${m.thesisTitle}" (${m.currentConviction}): ${m.conditions.slice(0, 2).join("; ")}`);
      }
      const overlay = b.strategyOverlay ?? null;
      const intents = overlay?.targetAllocationPlan?.intents ?? [];
      if (overlay?.regimeOverride || intents.length > 0 || b.cognitionGaps.length > 0) {
        parts.push("\n🤖 策略建议:");
        if (overlay?.regimeOverride) {
          parts.push(`  Regime: ${overlay.regimeOverride.ruleBasedRegime} → ${overlay.regimeOverride.suggestedRegime} (${overlay.regimeOverride.confidence}%)`);
        }
        if (intents.length > 0) {
          parts.push(`  目标权重: ${intents.slice(0, 4).map(i => `${i.symbol || i.assetKey}→${i.proposedTargetWeightPct.toFixed(1)}% (${i.confidence.toFixed(0)}%)`).join(", ")}`);
          if (overlay?.targetAllocationPlan?.reasoning) parts.push(`  理由: ${formatBriefingTextExcerpt(overlay.targetAllocationPlan.reasoning, 220)}`);
        } else if (b.cognitionGaps.length > 0 || (b.autopilotCoverage?.watchlistCandidates ?? 0) > 0) {
          parts.push("  本轮未形成高置信度目标权重计划；执行层不会仅因观察态论点或观察列表存在而直接调仓。");
        }
      }
      parts.push(`\n📊 论点更新: ${b.thesesUpdated} | 记忆: ${b.memoriesCreated}`);
      return { text: parts.join("\n"), intentKind: "agent_briefing", pendingAction: input.currentPendingAction };
    } catch {
      return { text: "查询 Agent 日报失败，请稍后重试。", intentKind: "agent_briefing", pendingAction: input.currentPendingAction };
    }
  });

  return handlers;
}
